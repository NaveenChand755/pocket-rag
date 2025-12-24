/**
 * MCP tool implementations
 */

import { db } from "../db/schema";
import { search } from "../services/search";
import type { SearchMode, MCPToolResult } from "../types";

/**
 * Search knowledge base tool
 */
export async function searchKnowledgeBase(
  query: string,
  mode: SearchMode = "hybrid"
): Promise<MCPToolResult> {
  try {
    console.error(`[MCP] 🔍 Searching: "${query}" (Mode: ${mode})`);

    const results = await search(query, mode);

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No relevant documents found." }],
      };
    }

    const formatted = results
      .map(
        (r) =>
          `[📄 File: ${r.filename}] (Relevance: ${((1 - r.distance) * 100).toFixed(0)}%)\n${r.content.trim()}`
      )
      .join("\n\n---\n\n");

    return { content: [{ type: "text", text: formatted }] };
  } catch (err: any) {
    console.error(`[MCP] ❌ Error: ${err.message}`);
    return {
      content: [{ type: "text", text: `Database Error: ${err.message}` }],
      isError: true,
    };
  }
}

/**
 * Get knowledge base statistics tool
 */
export async function getKnowledgeBaseStats(): Promise<MCPToolResult> {
  const stats = db
    .prepare(
      `SELECT (SELECT COUNT(DISTINCT filename) FROM docs) as doc_count, (SELECT COUNT(*) FROM docs) as chunk_count`
    )
    .get() as any;

  return {
    content: [
      {
        type: "text",
        text: `📚 Knowledge Base Stats\n- Documents: ${stats.doc_count}\n- Total Chunks: ${stats.chunk_count}`,
      },
    ],
  };
}

/**
 * List all indexed documents tool
 */
export async function listDocuments(): Promise<MCPToolResult> {
  const docs = db
    .prepare(`SELECT DISTINCT filename FROM docs ORDER BY filename`)
    .all() as any[];

  const list = docs.length ? docs.map((d) => `- ${d.filename}`).join("\n") : "No documents found.";

  return { content: [{ type: "text", text: `📂 Indexed Files:\n${list}` }] };
}
