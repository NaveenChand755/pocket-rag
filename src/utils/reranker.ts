/**
 * Result reranking utilities for improving search relevance
 */

import { extractKeyTerms } from "./query-processor";
import type { RankedResult } from "../types";

/**
 * Re-rank results based on relevance to query
 * Uses keyword matching to boost relevance scores
 */
export function rerank(results: RankedResult[], query: string): RankedResult[] {
  const keyTerms = extractKeyTerms(query);

  if (keyTerms.length === 0) return results;

  const scored = results.map((r) => {
    const contentLower = r.content.toLowerCase();

    // Normalize content to remove accents for matching
    const contentNormalized = contentLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let score = r.score;
    let matchCount = 0;

    // Count how many key terms appear in content
    keyTerms.forEach((term) => {
      // Also normalize the term
      const termNormalized = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

  // Allow results with at least partial matches OR strong vector scores
  // Changed from requiring matchCount >= 1 to allowing matchCount >= 0
  // This lets vector search results through even without exact term matches
  const filtered = scored.filter((r) => (r as any).matchCount >= 0);

  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(({ matchCount, ...rest }: any) => rest);
}
