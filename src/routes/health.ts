/**
 * Health check and stats routes
 */

import { Elysia } from "elysia";
import { db } from "../db/schema";
import { ENV } from "../config";
import type { StatsResponse } from "../types";

const statsQuery = db.prepare(`
SELECT
(SELECT COUNT(DISTINCT source) FROM chunks) as doc_count,
(SELECT COUNT(*) FROM chunks) as chunk_count
`);

export const healthRoutes = new Elysia()
  .get("/", () => ({
    name: "PocketRAG",
    status: "healthy",
    config: {
      chatProvider: ENV.chatProvider,
      embedProvider: ENV.embedProvider,
    },
  }))
  .get("/stats", (): StatsResponse => {
    const stats = statsQuery.get() as { doc_count: number; chunk_count: number } | undefined;

    return {
      documents: stats?.doc_count ?? 0,
      chunks: stats?.chunk_count ?? 0,
    };
  });
