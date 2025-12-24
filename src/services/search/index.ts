/**
 * Search service for hybrid and vector queries
 * Uses optimized FTS pre-filtering with vector search
 */

import { db } from "../../db/schema";
import { AI } from "../ai";
import { sanitizeFTSQuery } from "../../utils/query-processor";
import { hybridSearch as ftsHybridSearch } from "../../db/fts-index";
import { knnSearch } from "../../db/vector-index"
import type { SearchResult, SearchMode } from "../../types";

// Prepared statement for chunk retrieval
const getChunkById = db.prepare(`
SELECT content, source as filename FROM chunks WHERE id = ?
`);

// Prepared statement for FTS-only search on chunks
const ftsChunksQuery = db.prepare(`
SELECT chunk_id, bm25(chunks_fts) as rank
FROM chunks_fts
WHERE chunks_fts MATCH ?
ORDER BY rank
LIMIT 30
`);

/**
 * Perform vector search using vec_index table
 */
export async function vectorSearch(query: string): Promise<SearchResult[]> {
  const qVector = await AI.embed(query);
  const results = knnSearch(db, qVector, 30);

  const searchResults: SearchResult[] = [];
  for (const result of results) {
    const chunk = getChunkById.get(result.chunkId) as
      | { content: string; filename: string }
      | undefined;
    if (chunk) {
      searchResults.push({
        content: chunk.content,
        filename: chunk.filename || "unknown",
        distance: result.distance,
      });
    }
  }

  // Apply reranking for relevance filtering
  const reranked = AI.rerank(
    searchResults.map((doc) => ({
      content: doc.content,
      score: 1 - doc.distance,
    })),
    query
  );

  return reranked.slice(0, 10).map((r) => {
    const orig = searchResults.find((v) => v.content === r.content);
    return orig ?? { content: r.content, filename: "unknown", distance: 0.5 };
  });
}

/**
 * Perform full-text search using FTS5 on chunks_fts table
 */
export function ftsSearch(query: string): SearchResult[] {
  const safeQuery = sanitizeFTSQuery(query);
  const ftsResults = ftsChunksQuery.all(safeQuery) as Array<{
    chunk_id: number;
    rank: number;
  }>;

  const searchResults: SearchResult[] = [];
  for (const result of ftsResults) {
    const chunk = getChunkById.get(result.chunk_id) as
      | { content: string; filename: string }
      | undefined;
    if (chunk) {
      searchResults.push({
        content: chunk.content,
        filename: chunk.filename || "unknown",
        distance: 1 - Math.min(1, Math.abs(result.rank) / 10),
      });
    }
  }

  return searchResults;
}

/**
 * Perform hybrid search using FTS pre-filtering + vector search
 * This is more efficient than separate FTS and vector searches
 */
export async function hybridSearch(query: string): Promise<SearchResult[]> {
  const qVector = await AI.embed(query);
  const safeQuery = sanitizeFTSQuery(query);

  // Use optimized hybrid search with FTS pre-filtering
  const results = ftsHybridSearch(db, safeQuery, qVector, 30);

  // If no FTS matches, fall back to pure vector search
  if (results.length === 0) {
    console.log("[Search] No FTS matches, falling back to vector search");
    return vectorSearch(query);
  }

  const searchResults: SearchResult[] = [];
  for (const result of results) {
    const chunk = getChunkById.get(result.chunkId) as
      | { content: string; filename: string }
      | undefined;
    if (chunk) {
      searchResults.push({
        content: chunk.content,
        filename: chunk.filename || "unknown",
        distance: result.distance,
      });
    }
  }

  // Apply reranking for relevance filtering
  const reranked = AI.rerank(
    searchResults.map((doc) => ({
      content: doc.content,
      score: 1 - doc.distance,
    })),
    query
  );

  return reranked.slice(0, 10).map((r) => {
    const orig = searchResults.find((v) => v.content === r.content);
    return orig ?? { content: r.content, filename: "unknown", distance: 0.5 };
  });
}

/**
 * Main search function - routes to appropriate search method
 */
export async function search(
  query: string,
  mode: SearchMode = "hybrid"
): Promise<SearchResult[]> {
  switch (mode) {
    case "vector":
      return vectorSearch(query);
    case "fts":
      return ftsSearch(query);
    case "hybrid":
    default:
      return hybridSearch(query);
  }
}
