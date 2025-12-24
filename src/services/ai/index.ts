/**
 * AI service aggregator
 * Provides a unified interface for embeddings, chat, and reranking
 */

export { generateEmbedding, generateEmbeddingBatch } from "./embedding";
export { generateAnswer } from "./chat";
export { rerank } from "../../utils/reranker";
export { expandQuery } from "../../utils/query-processor";

// Legacy compatibility - export as object for existing code
import { generateEmbedding, generateEmbeddingBatch } from "./embedding";
import { generateAnswer } from "./chat";
import { rerank } from "../../utils/reranker";
import { expandQuery } from "../../utils/query-processor";

export const AI = {
  embed: generateEmbedding,
  embedBatch: generateEmbeddingBatch,
  chat: generateAnswer,
  rerank,
  expandQuery,
};
