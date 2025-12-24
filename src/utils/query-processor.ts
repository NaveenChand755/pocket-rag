/**
 * Query preprocessing and sanitization utilities
 */

const STOP_WORDS = new Set([
  "what",
  "who",
  "where",
  "when",
  "why",
  "how",
  "which",
  "whom",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "its",
  "our",
  "their",
  "mine",
  "yours",
  "hers",
  "ours",
  "theirs",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "of",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "to",
  "from",
  "up",
  "down",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "again",
  "further",
  "once",
  "here",
  "there",
  "all",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "describe",
  "tell",
  "explain",
  "give",
  "show",
]);

/**
 * Smart preprocessing: split concatenated queries like "whoisrama" -> "who is rama"
 */
function smartSplit(text: string): string {
  return text
    .replace(/\b(who|what|where|when|why|how|which)(is|are|was|were)/gi, "$1 $2 ")
    .replace(/\b(is|are|was|were)([a-z]{3,})/gi, "$1 $2");
}

/**
 * Extract meaningful key terms from a query, removing stop words
 */
export function extractKeyTerms(query: string): string[] {
  const preprocessed = smartSplit(query);

  return preprocessed
    .replace(/['"():*^~<>{}[\]\\\/.,!?;:]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
    .map((w) => w.toLowerCase());
}

/**
 * Convert query to FTS5-compatible format
 */
export function sanitizeFTSQuery(query: string): string {
  const terms = extractKeyTerms(query);

  if (terms.length === 0) {
    return `"${query.replace(/['"]/g, "")}"`;
  }

  // Use OR for broader matching - we'll filter by relevance later
  return terms.map((t) => `"${t}"*`).join(" OR ");
}

/**
 * Expand query into multiple search terms for better recall
 */
export function expandQuery(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const expanded = [query]; // Original query

  // Add individual important words
  words.forEach((word) => {
    if (
      word.length > 4 &&
      !["what", "when", "where", "which", "about", "does", "have", "this", "that", "with", "from"].includes(word)
    ) {
      expanded.push(word);
    }
  });

  return [...new Set(expanded)];
}
