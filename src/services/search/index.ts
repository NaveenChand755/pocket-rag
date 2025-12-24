/**
 * Search service for hybrid, vector, and FTS queries
 * Implements Reciprocal Rank Fusion (RRF) for hybrid search
 */

import { db } from "../../db/schema";
import { AI } from "../ai";
import { sanitizeFTSQuery } from "../../utils/query-processor";
import type { SearchResult, FTSResult, SearchMode } from "../../types";

// Prepared statements for performance
const vectorSearchQuery = db.prepare(`
SELECT
docs.content,
docs.filename,
vec_distance_cosine(vec_docs.embedding, ?) as distance
FROM vec_docs
JOIN docs ON vec_docs.doc_id = docs.rowid
WHERE vec_docs.embedding MATCH ? AND k = 30
ORDER BY distance
`);

const ftsSearchQuery = db.prepare(`
SELECT
content,
filename,
bm25(docs) as rank
FROM docs
WHERE docs MATCH ?
ORDER BY rank
LIMIT 30
`);

/**
 * Perform vector search using embeddings
 */
export async function vectorSearch(query: string): Promise<SearchResult[]> {
  const qVector = await AI.embed(query);
  const queryBuffer = new Uint8Array(new Float32Array(qVector).buffer);

  const vectorRaw = vectorSearchQuery.all(queryBuffer, queryBuffer) as SearchResult[];

  // Apply reranking for relevance filtering
  const reranked = AI.rerank(
    vectorRaw.map((doc) => ({
      content: doc.content,
      score: 1 - doc.distance,
    })),
    query
  );

  return reranked.slice(0, 10).map((r) => {
    const orig = vectorRaw.find((v) => v.content === r.content);
    return orig ?? { content: r.content, filename: "unknown", distance: 0.5 };
  });
}

/**
 * Perform full-text search using FTS5
 */
export function ftsSearch(query: string): SearchResult[] {
  const safeQuery = sanitizeFTSQuery(query);
  const ftsResults = ftsSearchQuery.all(safeQuery) as FTSResult[];

  return ftsResults.map((r) => ({
    content: r.content,
    filename: r.filename,
    distance: 1 - Math.min(1, Math.abs(r.rank) / 10),
  }));
}

/**
 * Perform hybrid search using Reciprocal Rank Fusion (RRF)
 * Combines vector and FTS results with intelligent scoring
 */
export async function hybridSearch(query: string): Promise<SearchResult[]> {
  const qVector = await AI.embed(query);
  const queryBuffer = new Uint8Array(new Float32Array(qVector).buffer);
  const safeQuery = sanitizeFTSQuery(query);

  let vectorRaw: SearchResult[] = [];
  let ftsRaw: FTSResult[] = [];

  try {
    [vectorRaw, ftsRaw] = await Promise.all([
      Promise.resolve(vectorSearchQuery.all(queryBuffer, queryBuffer) as SearchResult[]),
      Promise.resolve(ftsSearchQuery.all(safeQuery) as FTSResult[]),
    ]);
  } catch (e) {
    // If FTS query fails, fall back to vector only
    console.error("[Search] FTS query failed, using vector only:", e);
    vectorRaw = vectorSearchQuery.all(queryBuffer, queryBuffer) as SearchResult[];
  }

  const k = 60; // Standard RRF constant
  const scores = new Map<
    string,
    { score: number; doc: SearchResult; inBoth: boolean }
  >();

  // Process Vector Results - use actual distance for better ranking
  vectorRaw.forEach((doc, rank) => {
    if (!doc.content) return; // Skip null content

    // RRF score + bonus based on actual vector distance (lower = better)
    const rrf = 1 / (k + rank + 1);
    const distanceBonus = (1 - doc.distance) * 0.1; // 0-0.1 bonus
    const score = rrf + distanceBonus;

    scores.set(doc.content, { score, doc, inBoth: false });
  });

  // Process FTS Results
  ftsRaw.forEach((doc, rank) => {
    if (!doc.content) return; // Skip null content

    const rrf = 1 / (k + rank + 1);
    const existing = scores.get(doc.content);

    if (!existing) {
      // FTS-only matches
      scores.set(doc.content, {
        score: rrf,
        doc: {
          content: doc.content,
          filename: doc.filename,
          distance: 0.5,
        },
        inBoth: false,
      });
    } else {
      // Document in BOTH searches gets 2x boost!
      existing.score = existing.score * 2 + rrf;
      existing.inBoth = true;
    }
  });

  // Sort by combined RRF score (higher = better)
  // Prioritize documents found in both searches
  const sortedResults = Array.from(scores.values())
    .sort((a, b) => {
      // Prioritize docs in both results
      if (a.inBoth && !b.inBoth) return -1;
      if (!a.inBoth && b.inBoth) return 1;
      return b.score - a.score;
    })
    .slice(0, 15); // Get more for re-ranking

  // Re-rank based on query relevance
  const reranked = AI.rerank(
    sortedResults.map((item) => ({
      content: item.doc.content,
      score: item.score,
    })),
    query
  );

  return reranked.slice(0, 8).map((r) => {
    const orig = sortedResults.find((s) => s.doc.content === r.content);
    return (
      orig?.doc ?? {
        content: r.content,
        filename: "unknown",
        distance: 0.5,
      }
    );
  });
}

/**
 * Main search function - routes to appropriate search method
 */
export async function search(query: string, mode: SearchMode = "hybrid"): Promise<SearchResult[]> {
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
