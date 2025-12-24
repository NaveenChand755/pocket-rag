/**
 * RAG query route - the main search and answer endpoint
 */

import { Elysia, t } from "elysia";
import { AI } from "../services/ai";
import { search } from "../services/search";
import { ENV } from "../config";
import type { SearchMode, AskResponse, SearchResult } from "../types";

export const askRoutes = new Elysia().get(
  "/ask",
  async ({ query }): Promise<AskResponse | { error: string }> => {
    const startTime = performance.now();
    const question = query.q;
    const searchMode = (query.mode || "vector") as SearchMode;

    if (!question?.trim()) {
      return { error: "Missing or empty ?q= parameter" };
    }

    try {
      // Execute search
      let results = await search(question, searchMode);

      if (results.length === 0) {
        return {
          answer: "No relevant documents found. Please upload some PDFs first.",
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
          answer: "Documents found but content could not be retrieved. Try re-uploading.",
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
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[Ask] Error:", message);
      return { error: message };
    }
  },
  {
    query: t.Object({
      q: t.Optional(t.String()),
      mode: t.Optional(t.Union([t.Literal("vector"), t.Literal("fts"), t.Literal("hybrid")])),
    }),
  }
);
