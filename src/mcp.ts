/**
 * MCP server entry point
 * Starts the stdio-based MCP server for Claude Desktop integration
 */

import { startMCPServer } from "./mcp/server";

async function main() {
  try {
    await startMCPServer();
  } catch (err) {
    console.error("[MCP] Fatal Error:", err);
    process.exit(1);
  }
}

main();
