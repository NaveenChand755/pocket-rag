/**
 * Advanced result reranking using Reciprocal Rank Fusion (RRF)
 *
 * RRF is a rank aggregation method that combines multiple ranking signals
 * without needing score normalization. It's robust and widely used in
 * hybrid search systems (Elasticsearch, Pinecone, etc.)
 *
 * Formula: RRF(d) = Σ 1 / (k + rank_i(d))
 * where k is a constant (typically 60) and rank_i is the rank in list i
 */

import { extractKeyTerms } from "./query-processor";
import type { RankedResult } from "../types";

// RRF constant (standard value, higher = more weight to lower ranks)
const RRF_K = 60;

// BM25 hyperparameters
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Calculate BM25 score for keyword relevance ranking
 */
function calculateBM25Score(
  content: string,
  queryTerms: string[],
  avgDocLength: number,
  docFrequencies: Map<string, number>,
  totalDocs: number
): number {
  const contentNormalized = content
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const docLength = contentNormalized.split(/\s+/).length;

  let score = 0;

  for (const term of queryTerms) {
    const termNormalized = term
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const regex = new RegExp(`\\b${escapeRegex(termNormalized)}\\b`, "gi");
    const matches = contentNormalized.match(regex);
    const tf = matches ? matches.length : 0;

    if (tf === 0) continue;

    // IDF calculation
    const df = docFrequencies.get(termNormalized) || 1;
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);

    // BM25 term score
    const numerator = tf * (BM25_K1 + 1);
    const denominator =
      tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength));
    score += idf * (numerator / denominator);
  }

  return score;
}

/**
 * Calculate document frequencies for IDF
 */
function calculateDocFrequencies(
  results: RankedResult[],
  queryTerms: string[]
): Map<string, number> {
  const frequencies = new Map<string, number>();

  for (const term of queryTerms) {
    const termNormalized = term
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    let count = 0;

    for (const result of results) {
      const contentNormalized = result.content
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const regex = new RegExp(`\\b${escapeRegex(termNormalized)}\\b`, "gi");
      if (regex.test(contentNormalized)) {
        count++;
      }
    }

    frequencies.set(termNormalized, count);
  }

  return frequencies;
}

/**
 * Reciprocal Rank Fusion (RRF) - combines multiple ranked lists
 *
 * This is the key algorithm that makes hybrid search work well.
 * It doesn't require score normalization and handles different
 * ranking scales gracefully.
 */
function reciprocalRankFusion(
  rankedLists: Map<string, number>[], // content -> rank (0-indexed)
  k: number = RRF_K
): Map<string, number> {
  const rrfScores = new Map<string, number>();

  for (const rankedList of rankedLists) {
    for (const [content, rank] of rankedList) {
      const currentScore = rrfScores.get(content) || 0;
      // RRF formula: 1 / (k + rank + 1)
      // +1 because ranks are 0-indexed
      const rrfContribution = 1 / (k + rank + 1);
      rrfScores.set(content, currentScore + rrfContribution);
    }
  }

  return rrfScores;
}

/**
 * Re-rank results using Reciprocal Rank Fusion (RRF)
 * Combines: Vector similarity ranking + BM25 keyword ranking
 *
 * This gives you the best of both worlds:
 * - Semantic understanding from vector embeddings
 * - Exact keyword matching from BM25
 */
export function rerank(results: RankedResult[], query: string): RankedResult[] {
  if (results.length === 0) return results;

  const queryTerms = extractKeyTerms(query);

  // Create a map for quick content lookup
  const contentMap = new Map<string, RankedResult>();
  results.forEach((r) => contentMap.set(r.content, r));

  // === RANKING LIST 1: Vector Similarity ===
  // Results are already sorted by vector similarity (lower distance = better)
  const vectorRanks = new Map<string, number>();
  const sortedByVector = [...results].sort((a, b) => {
    // If score represents distance (lower = better), sort ascending
    // If score represents similarity (higher = better), sort descending
    return b.score - a.score; // Assuming higher score = better
  });
  sortedByVector.forEach((r, index) => {
    vectorRanks.set(r.content, index);
  });

  // === RANKING LIST 2: BM25 Keyword Relevance ===
  const bm25Ranks = new Map<string, number>();

  if (queryTerms.length > 0) {
    // Calculate corpus statistics
    const avgDocLength =
      results.reduce((sum, r) => sum + r.content.split(/\s+/).length, 0) /
      results.length;
    const docFrequencies = calculateDocFrequencies(results, queryTerms);

    // Score each result with BM25
    const bm25Scored = results.map((r) => ({
      content: r.content,
      bm25: calculateBM25Score(
        r.content,
        queryTerms,
        avgDocLength,
        docFrequencies,
        results.length
      ),
    }));

    // Sort by BM25 score (higher = better)
    bm25Scored.sort((a, b) => b.bm25 - a.bm25);
    bm25Scored.forEach((r, index) => {
      bm25Ranks.set(r.content, index);
    });
  } else {
    // No query terms, use vector ranking for BM25 as well
    sortedByVector.forEach((r, index) => {
      bm25Ranks.set(r.content, index);
    });
  }

  // === RANKING LIST 3: Exact Match Bonus ===
  const exactMatchRanks = new Map<string, number>();
  const queryLower = query.toLowerCase();

  // Docs with exact phrase match get top ranks
  const withExactMatch: RankedResult[] = [];
  const withoutExactMatch: RankedResult[] = [];

  results.forEach((r) => {
    if (r.content.toLowerCase().includes(queryLower)) {
      withExactMatch.push(r);
    } else {
      withoutExactMatch.push(r);
    }
  });

  let rank = 0;
  withExactMatch.forEach((r) => exactMatchRanks.set(r.content, rank++));
  withoutExactMatch.forEach((r) => exactMatchRanks.set(r.content, rank++));

  // === APPLY RRF ===
  const rrfScores = reciprocalRankFusion([
    vectorRanks,
    bm25Ranks,
    exactMatchRanks,
  ]);

  // Build final results with RRF scores
  const finalResults: RankedResult[] = [];
  for (const [content, rrfScore] of rrfScores) {
    const original = contentMap.get(content);
    if (original) {
      finalResults.push({
        ...original,
        score: rrfScore,
      });
    }
  }

  // Sort by RRF score (higher = better) and return top results
  return finalResults.sort((a, b) => b.score - a.score).slice(0, 15);
}
