/**
 * High-performance embedding generation service
 *
 * Optimizations:
 * - Batch embeddings: Uses Ollama's /api/embed endpoint (32-64 chunks at once)
 * - Parallel processing: Multiple batches processed concurrently
 * - Reduces HTTP overhead from thousands of calls to dozens
 */

import OpenAI from "openai";
import { ENV } from "../../config";
import type {
  OllamaEmbedResponse,
  OllamaBatchEmbedResponse,
} from "../../types";

// Batch size for Ollama (optimal range: 32-64)
const OLLAMA_BATCH_SIZE = 32;

// Maximum concurrent batch requests
const MAX_CONCURRENT_BATCHES = 4;

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!ENV.keys.openai) throw new Error("OpenAI API key not configured");
    openaiClient = new OpenAI({ apiKey: ENV.keys.openai });
  }
  return openaiClient;
}

/**
 * Helper for Ollama API calls with timeout and retry
 */
async function ollamaFetch<T>(
  endpoint: string,
  body: object,
  retries = 2
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout for large batches

      const res = await fetch(`${ENV.ollama.baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const error = await res.text().catch(() => "Unknown error");
        throw new Error(`Ollama ${endpoint} failed: ${error}`);
      }

      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        // Exponential backoff
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError;
}

/**
 * Generate embedding for a single text
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

  // Ollama: Use batch endpoint even for single text (more efficient)
  const res = await ollamaFetch<OllamaBatchEmbedResponse>("/api/embed", {
    model: ENV.ollama.embedModel,
    input: [text],
  });

  if (!res.embeddings || res.embeddings.length === 0) {
    // Fallback to legacy endpoint
    const legacyRes = await ollamaFetch<OllamaEmbedResponse>(
      "/api/embeddings",
      {
        model: ENV.ollama.embedModel,
        prompt: text,
      }
    );
    return legacyRes.embedding;
  }

  const embedding = res.embeddings[0];
  if (!embedding) {
    throw new Error("No embedding returned from Ollama");
  }
  return embedding;
}

/**
 * Generate embeddings for a batch using Ollama's /api/embed endpoint
 * This is MUCH faster than individual calls
 */
async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    // Use the batch endpoint /api/embed
    const res = await ollamaFetch<OllamaBatchEmbedResponse>("/api/embed", {
      model: ENV.ollama.embedModel,
      input: texts,
    });

    if (res.embeddings && res.embeddings.length === texts.length) {
      return res.embeddings;
    }

    // If response is malformed, fall back to individual calls
    console.warn(
      "[Embedding] Batch response malformed, falling back to individual calls"
    );
    throw new Error("Malformed batch response");
  } catch (error) {
    // Fallback: Process individually (slower but more reliable)
    console.warn("[Embedding] Batch failed, using individual calls:", error);
    const results: number[][] = [];
    for (const text of texts) {
      const res = await ollamaFetch<OllamaEmbedResponse>("/api/embeddings", {
        model: ENV.ollama.embedModel,
        prompt: text,
      });
      results.push(res.embedding);
    }
    return results;
  }
}

/**
 * High-performance batch embedding generation
 *
 * Strategy:
 * 1. Split texts into batches of OLLAMA_BATCH_SIZE
 * 2. Process MAX_CONCURRENT_BATCHES in parallel
 * 3. Use Ollama's /api/embed endpoint for each batch
 *
 * Example: 1000 chunks with batch_size=32, concurrency=4
 * - Creates 32 batches (1000/32)
 * - Processes 4 batches at a time
 * - Only 32 HTTP calls instead of 1000!
 */
export async function generateEmbeddingBatch(
  texts: string[],
  concurrency = MAX_CONCURRENT_BATCHES
): Promise<number[][]> {
  if (texts.length === 0) return [];

  console.log(
    `[Embedding] Processing ${texts.length} texts in batches of ${OLLAMA_BATCH_SIZE}`
  );
  const startTime = performance.now();

  if (ENV.embedProvider === "openai") {
    // OpenAI supports large batch embedding natively (up to 2048 inputs)
    const client = getOpenAIClient();

    // Split into chunks of 2048 for OpenAI's limit
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += 2048) {
      const batch = texts.slice(i, i + 2048);
      const res = await client.embeddings.create({
        model: ENV.openai.embedModel,
        input: batch,
        encoding_format: "float",
      });
      results.push(...res.data.map((d) => d.embedding));
    }
    return results;
  }

  // Ollama: Batch processing with concurrency
  const results: number[][] = new Array(texts.length);
  const batches: { startIdx: number; texts: string[] }[] = [];

  // Create batches
  for (let i = 0; i < texts.length; i += OLLAMA_BATCH_SIZE) {
    batches.push({
      startIdx: i,
      texts: texts.slice(i, i + OLLAMA_BATCH_SIZE),
    });
  }

  console.log(
    `[Embedding] Created ${batches.length} batches, processing ${concurrency} at a time`
  );

  // Process batches with concurrency limit
  const processBatch = async (batch: { startIdx: number; texts: string[] }) => {
    const embeddings = await generateBatchEmbeddings(batch.texts);
    embeddings.forEach((emb, idx) => {
      results[batch.startIdx + idx] = emb;
    });
  };

  // Process in waves of concurrent batches
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency);
    await Promise.all(wave.map(processBatch));

    // Progress logging
    const processed = Math.min(
      (i + concurrency) * OLLAMA_BATCH_SIZE,
      texts.length
    );
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[Embedding] Progress: ${processed}/${texts.length} (${elapsed}s)`
    );
  }

  const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[Embedding] Completed ${texts.length} embeddings in ${totalTime}s (${(
      texts.length / parseFloat(totalTime)
    ).toFixed(0)}/sec)`
  );

  return results;
}
