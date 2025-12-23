import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "../config";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message: { content: string };
}

interface OllamaEmbedResponse {
  embedding: number[];
}

const getOpenAIClient = (() => {
  let client: OpenAI | null = null;
  return () => {
    if (!client) {
      if (!ENV.keys.openai) throw new Error("OpenAI API key not configured");
      client = new OpenAI({ apiKey: ENV.keys.openai });
    }
    return client;
  };
})();

const getAnthropicClient = (() => {
  let client: Anthropic | null = null;
  return () => {
    if (!client) {
      if (!ENV.keys.anthropic)
        throw new Error("Anthropic API key not configured");
      client = new Anthropic({ apiKey: ENV.keys.anthropic });
    }
    return client;
  };
})();

const ollamaFetch = async <T>(endpoint: string, body: object): Promise<T> => {
  const res = await fetch(`${ENV.ollama.baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => "Unknown error");
    throw new Error(`Ollama ${endpoint} failed: ${error}`);
  }

  return res.json() as Promise<T>;
};

const SYSTEM_PROMPT = `You are a knowledgeable assistant that answers questions by synthesizing information from document excerpts.

Your approach:
1. Read all provided excerpts carefully
2. Identify the most relevant information for the question
3. Synthesize a clear, accurate answer
4. Quote specific text when it directly answers the question
5. If information is partial, say what you found and what's missing
6. Be concise but thorough`;

const buildPrompt = (context: string, question: string): string =>
  `DOCUMENTS:
${context}

QUESTION: ${question}

Provide a clear, accurate answer based on the documents above:`;

export const AI = {
  /**
   * Generate embeddings for text
   */
  embed: async (text: string): Promise<number[]> => {
    if (ENV.embedProvider === "openai") {
      const client = getOpenAIClient();
      const res = await client.embeddings.create({
        model: ENV.openai.embedModel,
        input: text,
        encoding_format: "float",
      });
      const embedding = res.data[0]?.embedding;
      if (!embedding) throw new Error("No embedding returned from OpenAI");
      return embedding;
    }

    // Default: Ollama
    const res = await ollamaFetch<OllamaEmbedResponse>("/api/embeddings", {
      model: ENV.ollama.embedModel,
      prompt: text,
    });
    return res.embedding;
  },

  /**
   * Generate embeddings for multiple texts in batch (faster)
   * Uses concurrency limit for Ollama to avoid overwhelming the server
   */
  embedBatch: async (
    texts: string[],
    concurrency = 10
  ): Promise<number[][]> => {
    if (texts.length === 0) return [];

    if (ENV.embedProvider === "openai") {
      // OpenAI supports batch embedding natively
      const client = getOpenAIClient();
      const res = await client.embeddings.create({
        model: ENV.openai.embedModel,
        input: texts,
        encoding_format: "float",
      });
      return res.data.map((d) => d.embedding);
    }

    // Ollama: concurrent requests with limit
    const results: number[][] = new Array(texts.length);

    const processChunk = async (startIdx: number) => {
      const endIdx = Math.min(startIdx + concurrency, texts.length);
      const promises = [];

      for (let i = startIdx; i < endIdx; i++) {
        const idx = i;
        promises.push(
          ollamaFetch<OllamaEmbedResponse>("/api/embeddings", {
            model: ENV.ollama.embedModel,
            prompt: texts[idx],
          }).then((r) => {
            results[idx] = r.embedding;
          })
        );
      }

      await Promise.all(promises);
    };

    // Process in concurrent chunks
    for (let i = 0; i < texts.length; i += concurrency) {
      await processChunk(i);
    }

    return results;
  },

  /**
   * Expand query into multiple search terms for better recall
   */
  expandQuery: (query: string): string[] => {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const expanded = [query]; // Original query

    // Add individual important words
    words.forEach((word) => {
      if (
        word.length > 4 &&
        ![
          "what",
          "when",
          "where",
          "which",
          "about",
          "does",
          "have",
          "this",
          "that",
          "with",
          "from",
        ].includes(word)
      ) {
        expanded.push(word);
      }
    });

    return [...new Set(expanded)];
  },

  /**
   * Re-rank results based on relevance to query - STRICT filtering
   */
  rerank: (
    results: { content: string; score: number }[],
    query: string
  ): { content: string; score: number }[] => {
    // Extract meaningful terms (skip stop words)
    const stopWords = new Set([
      "what",
      "who",
      "where",
      "when",
      "why",
      "how",
      "which",
      "whom",
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "shall",
      "can",
      "this",
      "that",
      "describe",
      "tell",
      "explain",
      "give",
      "show",
      "about",
      "between",
      "and",
      "or",
      "but",
      "for",
      "with",
      "from",
      "into",
    ]);

    const keyTerms = query
      .toLowerCase()
      .replace(/['"():*^~<>{}[\]\\\/.,!?;:]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    if (keyTerms.length === 0) return results;

    if (keyTerms.length === 0) return results;

    const scored = results.map((r) => {
      const contentLower = r.content.toLowerCase();
      // Normalize content to remove accents for matching
      const contentNormalized = contentLower
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      let score = r.score;
      let matchCount = 0;

      // Count how many key terms appear in content
      keyTerms.forEach((term) => {
        // Also normalize the term
        const termNormalized = term
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        // Use word boundary matching to avoid partial matches like "rama" in "Ramayana"
        const regex = new RegExp(`\\b${termNormalized}\\b`, "gi");
        const matches = (contentNormalized.match(regex) || []).length;
        if (matches > 0) {
          matchCount++;
          score += matches * 1.0; // STRONG boost for each occurrence
        }
      });

      // Calculate match ratio - what % of key terms were found
      const matchRatio = matchCount / keyTerms.length;

      // Make match ratio the PRIMARY factor, vector score secondary
      // If matchRatio is 0, score becomes very low
      score = matchRatio * 10 + score * 0.1;

      // Big bonus for exact phrase matches
      if (contentLower.includes(query.toLowerCase())) {
        score += 1.0;
      }

      return { ...r, score, matchCount };
    });

    const filtered = scored.filter((r) => r.matchCount >= 1);

    return filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(({ matchCount, ...rest }) => rest);
  },

  /**
   * Generate chat completion with RAG context
   */
  chat: async (context: string, question: string): Promise<string> => {
    const prompt = buildPrompt(context, question);

    // OpenAI
    if (ENV.chatProvider === "openai") {
      const client = getOpenAIClient();
      const res = await client.chat.completions.create({
        model: ENV.openai.chatModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      });
      return res.choices[0]?.message.content ?? "";
    }

    // Anthropic
    if (ENV.chatProvider === "anthropic") {
      const client = getAnthropicClient();
      const res = await client.messages.create({
        model: ENV.anthropic.chatModel,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = res.content.find((block) => block.type === "text");
      return textBlock?.text ?? "";
    }

    // Default: Ollama
    const res = await ollamaFetch<OllamaChatResponse>("/api/chat", {
      model: ENV.ollama.chatModel,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ] satisfies ChatMessage[],
    });
    return res.message.content;
  },
};
