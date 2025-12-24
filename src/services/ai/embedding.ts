/**
 * Embedding generation service
 * Supports Ollama (local) and OpenAI (cloud)
 */

import OpenAI from "openai";
import { ENV } from "../../config";
import type { OllamaEmbedResponse } from "../../types";

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!ENV.keys.openai) throw new Error("OpenAI API key not configured");
    openaiClient = new OpenAI({ apiKey: ENV.keys.openai });
  }
  return openaiClient;
}

// Helper for Ollama API calls
async function ollamaFetch<T>(endpoint: string, body: object): Promise<T> {
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
}

/**
 * Generate embeddings for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
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
}

/**
 * Generate embeddings for multiple texts in batch (faster)
 * Uses concurrency limit for Ollama to avoid overwhelming the server
 */
export async function generateEmbeddingBatch(
  texts: string[],
  concurrency = 10
): Promise<number[][]> {
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
}
