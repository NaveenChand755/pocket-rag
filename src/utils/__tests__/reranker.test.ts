/**
 * Unit tests for reranking utilities
 */

import { describe, test, expect } from "bun:test";
import { rerank } from "../reranker";
import type { RankedResult } from "../../types";

describe("rerank", () => {
  test("should boost results with exact keyword matches", () => {
    const results: RankedResult[] = [
      { content: "This is about databases and SQL", score: 0.5 },
      { content: "Random unrelated text", score: 0.9 },
    ];

    const reranked = rerank(results, "database SQL");

    // Result with keyword matches should be ranked higher
    expect(reranked[0]!.content).toContain("databases");
  });

  test("should handle queries with no matches", () => {
    const results: RankedResult[] = [
      { content: "Text about programming", score: 0.8 },
      { content: "Text about cooking", score: 0.7 },
    ];

    const reranked = rerank(results, "quantum physics");

    // Should still return results sorted by original score
    expect(reranked.length).toBeGreaterThan(0);
    expect(reranked[0]!.score).toBeGreaterThanOrEqual(reranked[1]?.score || 0);
  });

  test("should boost exact phrase matches significantly", () => {
    const results: RankedResult[] = [
      { content: "Machine learning is powerful", score: 0.5 },
      { content: "Learning machines are different", score: 0.8 },
    ];

    const reranked = rerank(results, "machine learning");

    // Exact phrase match should be boosted
    expect(reranked[0]!.content).toBe("Machine learning is powerful");
  });

  test("should handle empty results", () => {
    const results: RankedResult[] = [];
    const reranked = rerank(results, "test query");

    expect(reranked).toEqual([]);
  });

  test("should handle empty query", () => {
    const results: RankedResult[] = [
      { content: "Some content", score: 0.5 },
    ];

    const reranked = rerank(results, "");

    // Should return results unchanged when no key terms
    expect(reranked.length).toBe(1);
  });

  test("should normalize accented characters", () => {
    const results: RankedResult[] = [
      { content: "café résumé naïve", score: 0.5 },
      { content: "coffee summary naive", score: 0.4 },
    ];

    const reranked = rerank(results, "cafe resume naive");

    // Should match normalized versions
    expect(reranked[0]!.content).toContain("café");
  });

  test("should use word boundary matching", () => {
    const results: RankedResult[] = [
      { content: "Rama is a hero in Ramayana", score: 0.5 },
      { content: "The Ramayana epic story", score: 0.6 },
    ];

    const reranked = rerank(results, "Rama");

    // "Rama" as standalone word should match but not partial matches
    expect(reranked[0]!.content).toContain("Rama is");
  });

  test("should limit results to top 15", () => {
    const results: RankedResult[] = Array.from({ length: 20 }, (_, i) => ({
      content: `Result ${i} with keyword test`,
      score: i / 20,
    }));

    const reranked = rerank(results, "test");

    expect(reranked.length).toBeLessThanOrEqual(15);
  });

  test("should handle queries with stop words", () => {
    const results: RankedResult[] = [
      { content: "Database optimization techniques", score: 0.5 },
      { content: "Random content", score: 0.6 },
    ];

    const reranked = rerank(results, "what are database optimization techniques");

    // Should extract "database" and "optimization" and "techniques"
    expect(reranked[0]!.content).toContain("Database");
  });

  test("should calculate match ratio correctly", () => {
    const results: RankedResult[] = [
      { content: "machine learning deep learning neural networks", score: 0.5 },
      { content: "machine learning only", score: 0.4 },
    ];

    const reranked = rerank(results, "machine learning deep neural");

    // First result matches 4/4 terms, second matches 2/4
    expect(reranked[0]!.content).toContain("machine learning deep");
  });

  test("should handle case-insensitive matching", () => {
    const results: RankedResult[] = [
      { content: "MACHINE LEARNING", score: 0.5 },
      { content: "machine learning", score: 0.4 },
    ];

    const reranked = rerank(results, "Machine Learning");

    // Both should match equally
    expect(reranked.length).toBe(2);
  });

  test("should handle special characters in query", () => {
    const results: RankedResult[] = [
      { content: "C++ programming language", score: 0.5 },
      { content: "Python programming", score: 0.4 },
    ];

    const reranked = rerank(results, "C++ programming");

    expect(reranked.length).toBeGreaterThan(0);
  });

  test("should maintain original result properties", () => {
    const results: RankedResult[] = [
      { content: "Test content", score: 0.5, filename: "test.pdf" },
    ];

    const reranked = rerank(results, "test");

    expect(reranked.length).toBeGreaterThan(0);
    const firstResult = reranked[0];
    expect(firstResult).toBeDefined();
    expect(firstResult).toHaveProperty("content");
    expect(firstResult).toHaveProperty("score");
    expect(firstResult).toHaveProperty("filename");
  });
});
