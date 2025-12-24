/**
 * Chat/LLM service for generating answers from RAG context
 * Supports Ollama (local), OpenAI, and Anthropic
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "../../config";
import type { ChatMessage, OllamaChatResponse } from "../../types";

// Singleton clients
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!ENV.keys.openai) throw new Error("OpenAI API key not configured");
    openaiClient = new OpenAI({ apiKey: ENV.keys.openai });
  }
  return openaiClient;
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!ENV.keys.anthropic) throw new Error("Anthropic API key not configured");
    anthropicClient = new Anthropic({ apiKey: ENV.keys.anthropic });
  }
  return anthropicClient;
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

const SYSTEM_PROMPT = `You are a knowledgeable assistant that answers questions by synthesizing information from document excerpts.

Your approach:
1. Read all provided excerpts carefully
2. Identify the most relevant information for the question
3. Synthesize a clear, accurate answer
4. Quote specific text when it directly answers the question
5. If information is partial, say what you found and what's missing
6. Be concise but thorough`;

function buildPrompt(context: string, question: string): string {
  return `DOCUMENTS:
${context}

QUESTION: ${question}

Provide a clear, accurate answer based on the documents above:`;
}

/**
 * Generate chat completion with RAG context
 */
export async function generateAnswer(context: string, question: string): Promise<string> {
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
    return (textBlock as any)?.text ?? "";
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
}
