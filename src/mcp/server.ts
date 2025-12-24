/**
 * MCP Server implementation
 * Registers tools and handles stdio transport
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchKnowledgeBase, getKnowledgeBaseStats, listDocuments } from "./tools";

export function createMCPServer(): McpServer {
  const server = new McpServer({
    name: "PocketRAG",
    version: "1.0.0",
  });

  // Tool 1: Search knowledge base
  server.registerTool(
    "search_knowledge_base",
    {
      description: "Search local PDF documentation for context.",
      inputSchema: {
        query: z.string().describe("The search keywords or question"),
        mode: z
          .enum(["vector", "fts", "hybrid"])
          .default("hybrid")
          .describe("Search mode"),
      },
    },
    async ({ query, mode }) => searchKnowledgeBase(query, mode)
  );

  // Tool 2: Get knowledge base stats
  server.registerTool(
    "get_knowledge_base_stats",
    {
      description: "Get statistics about the local knowledge base.",
      inputSchema: {},
    },
    async () => getKnowledgeBaseStats()
  );

  // Tool 3: List documents
  server.registerTool(
    "list_documents",
    {
      description: "List all files currently indexed.",
      inputSchema: {},
    },
    async () => listDocuments()
  );

  return server;
}

export async function startMCPServer() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("[MCP] 🚀 PocketRAG Native Server Running over Stdio");
}
