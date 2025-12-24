/**
 * Unit tests for query processing utilities
 */

import { describe, test, expect } from "bun:test";
import { extractKeyTerms, sanitizeFTSQuery, expandQuery } from "../query-processor";

describe("extractKeyTerms", () => {
  test("should extract key terms from simple query", () => {
    const terms = extractKeyTerms("what is artificial intelligence");
    expect(terms).toEqual(["artificial", "intelligence"]);
  });

  test("should remove stop words", () => {
    const terms = extractKeyTerms("how does the system work");
    expect(terms).toEqual(["system", "work"]);
  });

  test("should handle concatenated queries like 'whoisrama'", () => {
    const terms = extractKeyTerms("whoisrama");
    expect(terms).toContain("rama");
  });

  test("should split 'israma' into separate words", () => {
    const terms = extractKeyTerms("israma");
    expect(terms).toContain("rama");
  });

  test("should handle 'whatisllama' correctly", () => {
    const terms = extractKeyTerms("whatisllama");
    expect(terms).toContain("llama");
  });

  test("should filter out short words (< 3 chars)", () => {
    const terms = extractKeyTerms("a big AI model");
    expect(terms).toEqual(["big", "model"]);
  });

  test("should remove punctuation", () => {
    const terms = extractKeyTerms("what's the API? How does it work!");
    expect(terms).toEqual(["api", "work"]);
  });

  test("should handle empty query", () => {
    const terms = extractKeyTerms("");
    expect(terms).toEqual([]);
  });

  test("should handle query with only stop words", () => {
    const terms = extractKeyTerms("the a an is");
    expect(terms).toEqual([]);
  });

  test("should convert to lowercase", () => {
    const terms = extractKeyTerms("Artificial Intelligence");
    expect(terms).toEqual(["artificial", "intelligence"]);
  });

  test("should handle multi-word proper nouns", () => {
    const terms = extractKeyTerms("Who is Elon Musk");
    expect(terms).toEqual(["elon", "musk"]);
  });

  test("should handle technical terms", () => {
    const terms = extractKeyTerms("PostgreSQL database optimization");
    expect(terms).toEqual(["postgresql", "database", "optimization"]);
  });
});

describe("sanitizeFTSQuery", () => {
  test("should create OR query from multiple terms", () => {
    const ftsQuery = sanitizeFTSQuery("artificial intelligence");
    expect(ftsQuery).toContain("artificial");
    expect(ftsQuery).toContain("intelligence");
    expect(ftsQuery).toContain("OR");
  });

  test("should add wildcard to terms", () => {
    const ftsQuery = sanitizeFTSQuery("search query");
    expect(ftsQuery).toContain("\"search\"*");
    expect(ftsQuery).toContain("\"query\"*");
  });

  test("should handle single word queries", () => {
    const ftsQuery = sanitizeFTSQuery("database");
    expect(ftsQuery).toContain("\"database\"*");
  });

  test("should handle empty query", () => {
    const ftsQuery = sanitizeFTSQuery("");
    expect(ftsQuery).toContain("\"\"");
  });

  test("should handle query with only stop words", () => {
    const ftsQuery = sanitizeFTSQuery("the a an");
    // When all words are filtered, returns original query wrapped
    expect(ftsQuery).toContain("the a an");
  });

  test("should escape double quotes in query", () => {
    const ftsQuery = sanitizeFTSQuery('query "with quotes"');
    expect(ftsQuery).not.toContain('""');
  });

  test("should handle concatenated query 'whoisrama'", () => {
    const ftsQuery = sanitizeFTSQuery("whoisrama");
    expect(ftsQuery).toContain("\"rama\"*");
  });
});

describe("expandQuery", () => {
  test("should include original query", () => {
    const expanded = expandQuery("artificial intelligence");
    expect(expanded).toContain("artificial intelligence");
  });

  test("should add individual important words", () => {
    const expanded = expandQuery("machine learning algorithms");
    expect(expanded).toContain("machine");
    expect(expanded).toContain("learning");
    expect(expanded).toContain("algorithms");
  });

  test("should filter out common short words", () => {
    const expanded = expandQuery("what does this mean");
    expect(expanded).not.toContain("what");
    expect(expanded).not.toContain("does");
    expect(expanded).not.toContain("this");
  });

  test("should only add words longer than 4 characters", () => {
    const expanded = expandQuery("the big data problem");
    expect(expanded).not.toContain("big"); // "big" is only 3 chars
    // "data" is 4 chars but expandQuery requires > 4, so only "problem" (7 chars) is added
    expect(expanded).toContain("problem");
    expect(expanded).toContain("the big data problem"); // Original query always included
  });

  test("should deduplicate terms", () => {
    const expanded = expandQuery("longer longer longer");
    // "longer" is 6 chars, so should be added and deduplicated
    const longerCount = expanded.filter((q) => q === "longer").length;
    expect(longerCount).toBe(1);
    expect(expanded.length).toBe(2); // Original query + "longer" deduplicated
  });

  test("should handle empty query", () => {
    const expanded = expandQuery("");
    expect(expanded).toEqual([""]);
  });

  test("should handle single word", () => {
    const expanded = expandQuery("database");
    expect(expanded).toContain("database");
  });
});
