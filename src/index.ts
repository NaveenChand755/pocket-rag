import { Elysia, t } from "elysia";
import { db } from "./db/schema";
import { AI } from "./services/ai";
import { ingestPDF, ingestMultiplePDFs } from "./services/ingest";
import { ENV } from "./config";

interface SearchResult {
  content: string;
  distance: number;
  filename: string;
}

interface FTSResult {
  content: string;
  filename: string;
  rank: number;
}

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

const statsQuery = db.prepare(`
SELECT
(SELECT COUNT(DISTINCT filename) FROM docs) as doc_count,
(SELECT COUNT(*) FROM docs) as chunk_count
`);

const app = new Elysia()
  .get("/", () => ({
    name: "PocketRAG",
    status: "healthy",
    config: {
      chatProvider: ENV.chatProvider,
      embedProvider: ENV.embedProvider,
    },
  }))

  .get("/stats", () => {
    const stats = statsQuery.get() as
      | { doc_count: number; chunk_count: number }
      | undefined;
    return {
      documents: stats?.doc_count ?? 0,
      chunks: stats?.chunk_count ?? 0,
    };
  })
  .post(
    "/learn",
    async ({ body }) => {
      const file = body.file;
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await ingestPDF(buffer, file.name);

      return {
        success: result.success,
        file: result.fileName,
        chunks: result.chunks,
        duration: `${(result.duration / 1000).toFixed(2)}s`,
        error: result.error,
      };
    },
    {
      body: t.Object({ file: t.File() }),
    }
  )

  .post(
    "/learn/bulk",
    async ({ body }) => {
      const files = await Promise.all(
        body.files.map(async (file) => ({
          buffer: Buffer.from(await file.arrayBuffer()),
          name: file.name,
        }))
      );

      const results = await ingestMultiplePDFs(files);

      return {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        results: results.map((r) => ({
          file: r.fileName,
          success: r.success,
          chunks: r.chunks,
          error: r.error,
        })),
      };
    },
    {
      body: t.Object({ files: t.Files() }),
    }
  )

  .get(
    "/ask",
    async ({ query }) => {
      const startTime = performance.now();
      const question = query.q;
      const searchMode = query.mode || "vector";

      if (!question?.trim()) {
        return { error: "Missing or empty ?q= parameter" };
      }

      try {
        let results: SearchResult[] = [];
        const timings: { search?: number; llm?: number; total?: number } = {};

        // Extract key terms from question (nouns, proper nouns)
        const extractKeyTerms = (q: string): string[] => {
          const stopWords = new Set([
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

          return q
            .replace(/['"():*^~<>{}[\]\\\/.,!?;:]/g, " ")
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
            .map((w) => w.toLowerCase());
        };

        // Convert query to FTS5 format - simpler, more effective
        const sanitizeFTSQuery = (q: string): string => {
          const terms = extractKeyTerms(q);
          if (terms.length === 0) return `"${q.replace(/['"]/g, "")}"`;

          // Use OR for broader matching - we'll filter by relevance later
          return terms.map((t) => `"${t}"*`).join(" OR ");
        };

        if (searchMode === "fts") {
          const safeQuery = sanitizeFTSQuery(question);
          const ftsResults = ftsSearchQuery.all(safeQuery) as FTSResult[];
          results = ftsResults.map((r) => ({
            content: r.content,
            filename: r.filename,
            distance: 1 - Math.min(1, Math.abs(r.rank) / 10),
          }));
        } else if (searchMode === "hybrid") {
          const qVector = await AI.embed(question);
          const queryBuffer = new Uint8Array(new Float32Array(qVector).buffer);
          const safeQuery = sanitizeFTSQuery(question);

          let vectorRaw: SearchResult[] = [];
          let ftsRaw: FTSResult[] = [];

          try {
            [vectorRaw, ftsRaw] = await Promise.all([
              Promise.resolve(
                vectorSearchQuery.all(
                  queryBuffer,
                  queryBuffer
                ) as SearchResult[]
              ),
              Promise.resolve(ftsSearchQuery.all(safeQuery) as FTSResult[]),
            ]);
          } catch (e) {
            // If FTS query fails, fall back to vector only
            console.error("[Search] FTS query failed, using vector only:", e);
            vectorRaw = vectorSearchQuery.all(
              queryBuffer,
              queryBuffer
            ) as SearchResult[];
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
            question
          );

          results = reranked.slice(0, 8).map((r) => {
            const orig = sortedResults.find((s) => s.doc.content === r.content);
            return (
              orig?.doc ?? {
                content: r.content,
                filename: "unknown",
                distance: 0.5,
              }
            );
          });
        } else {
          // Default: vector search - also apply reranking
          const qVector = await AI.embed(question);
          const queryBuffer = new Uint8Array(new Float32Array(qVector).buffer);
          const vectorRaw = vectorSearchQuery.all(
            queryBuffer,
            queryBuffer
          ) as SearchResult[];

          // Apply reranking for relevance filtering
          const reranked = AI.rerank(
            vectorRaw.map((doc) => ({
              content: doc.content,
              score: 1 - doc.distance,
            })),
            question
          );

          results = reranked.slice(0, 10).map((r) => {
            const orig = vectorRaw.find((v) => v.content === r.content);
            return (
              orig ?? { content: r.content, filename: "unknown", distance: 0.5 }
            );
          });
        }

        if (results.length === 0) {
          return {
            answer:
              "No relevant documents found. Please upload some PDFs first.",
            sources: [],
            provider: ENV.chatProvider,
          };
        }

        // Filter out any null results and deduplicate
        results = results.filter((r) => r.content != null);

        // Deduplicate by content (keep higher scored version)
        const seen = new Set<string>();
        results = results.filter((r) => {
          const key = r.content.slice(0, 100); // Use first 100 chars as key
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Take top 10 for more context
        results = results.slice(0, 10);
        const searchTime = performance.now() - startTime;

        if (results.length === 0) {
          return {
            answer:
              "Documents found but content could not be retrieved. Try re-uploading.",
            sources: [],
            provider: ENV.chatProvider,
          };
        }

        // Build context with clear source markers
        const context = results
          .map((r: SearchResult, i: number) => `[${r.filename}]\n${r.content}`)
          .join("\n\n---\n\n");

        // Generate answer
        const llmStart = performance.now();
        const answer = await AI.chat(context, question);
        const llmTime = performance.now() - llmStart;
        const totalTime = performance.now() - startTime;

        return {
          answer,
          sources: results.slice(0, 5).map((r: SearchResult) => ({
            filename: r.filename,
            content: r.content.slice(0, 150) + "...",
            relevance: (1 - r.distance).toFixed(3),
          })),
          provider: ENV.chatProvider,
          searchMode,
          timing: {
            search: `${searchTime.toFixed(0)}ms`,
            llm: `${llmTime.toFixed(0)}ms`,
            total: `${totalTime.toFixed(0)}ms`,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[Ask] Error:", message);
        return { error: message };
      }
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        mode: t.Optional(
          t.Union([t.Literal("vector"), t.Literal("fts"), t.Literal("hybrid")])
        ),
      }),
    }
  )

  .listen(process.env.PORT || 3000);

const PORT = process.env.PORT || 3000;
console.log(`
┌─────────────────────────────────────────┐
│ 📦 PocketRAG API Running │
├─────────────────────────────────────────┤
│ 🌐 URL: http://localhost:${String(PORT).padEnd(13)}│
│ │
│ 📚 Endpoints: │
│ GET / - Health check │
│ GET /stats - Document stats │
│ POST /learn - Upload single PDF │
│ POST /learn/bulk - Upload multiple │
│ GET /ask?q= - Ask a question │
└─────────────────────────────────────────┘
`);

export { app };
export type App = typeof app;
