/**
 * Main API server entry point
 * Combines all routes and starts the Elysia server
 */

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { healthRoutes } from "./routes/health";
import { learnRoutes } from "./routes/learn";
import { askRoutes } from "./routes/ask";

const PORT = process.env.PORT || 3000;

const app = new Elysia()
  .use(cors())
  .use(healthRoutes)
  .use(learnRoutes)
  .use(askRoutes)
  .listen(PORT);

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
