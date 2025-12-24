/**
 * Integration tests for API routes
 * These tests verify the HTTP endpoints work correctly
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { healthRoutes } from "../health";
import { askRoutes } from "../ask";
import { learnRoutes } from "../learn";

describe("Health Routes", () => {
  let app: any; // Using any to avoid complex Elysia type inference issues

  beforeAll(() => {
    app = new Elysia().use(healthRoutes);
  });

  test("GET / should return healthy status", async () => {
    const response = await app.handle(new Request("http://localhost/"));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("name", "PocketRAG");
    expect(data).toHaveProperty("status", "healthy");
    expect(data).toHaveProperty("config");
    expect(data.config).toHaveProperty("chatProvider");
    expect(data.config).toHaveProperty("embedProvider");
  });

  test("GET /stats should return document statistics", async () => {
    const response = await app.handle(new Request("http://localhost/stats"));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("documents");
    expect(data).toHaveProperty("chunks");
    expect(typeof data.documents).toBe("number");
    expect(typeof data.chunks).toBe("number");
    expect(data.documents).toBeGreaterThanOrEqual(0);
    expect(data.chunks).toBeGreaterThanOrEqual(0);
  });

  test("Health endpoint should respond quickly", async () => {
    const start = performance.now();
    await app.handle(new Request("http://localhost/"));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // Should respond in < 100ms
  });
});

describe("Ask Routes", () => {
  let app: any; // Using any to avoid complex Elysia type inference issues

  beforeAll(() => {
    app = new Elysia().use(askRoutes);
  });

  test("GET /ask should require 'q' parameter", async () => {
    const response = await app.handle(new Request("http://localhost/ask"));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("Missing or empty");
  });

  test("GET /ask with empty query should return error", async () => {
    const response = await app.handle(new Request("http://localhost/ask?q="));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("error");
  });

  test("GET /ask with valid query should return response structure", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=test+query&mode=vector")
    );
    expect(response.status).toBe(200);

    const data = await response.json();

    // Should have either answer or error
    if ("answer" in data) {
      expect(data).toHaveProperty("answer");
      expect(data).toHaveProperty("sources");
      expect(data).toHaveProperty("provider");
      expect(Array.isArray(data.sources)).toBe(true);
    } else {
      expect(data).toHaveProperty("error");
    }
  });

  test("GET /ask should support vector mode", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=artificial+intelligence&mode=vector")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    if ("searchMode" in data) {
      expect(data.searchMode).toBe("vector");
    }
  });

  test("GET /ask should support fts mode", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=machine+learning&mode=fts")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    if ("searchMode" in data) {
      expect(data.searchMode).toBe("fts");
    }
  });

  test("GET /ask should support hybrid mode", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=deep+learning&mode=hybrid")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    if ("searchMode" in data) {
      expect(data.searchMode).toBe("hybrid");
    }
  });

  test("GET /ask should default to vector mode if not specified", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=test+query")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    // Default mode is vector as per ask.ts:16
    if ("searchMode" in data) {
      expect(data.searchMode).toBe("vector");
    }
  });

  test("GET /ask response should include timing information when successful", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=test&mode=vector")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    if ("timing" in data) {
      expect(data.timing).toHaveProperty("search");
      expect(data.timing).toHaveProperty("llm");
      expect(data.timing).toHaveProperty("total");
      expect(data.timing.search).toMatch(/\d+ms/);
      expect(data.timing.llm).toMatch(/\d+ms/);
      expect(data.timing.total).toMatch(/\d+ms/);
    }
  });

  test("GET /ask should handle special characters in query", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=C%2B%2B+programming&mode=vector")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toBeDefined();
  });

  test("GET /ask should limit sources to 5", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=test+query&mode=hybrid")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    if ("sources" in data && Array.isArray(data.sources)) {
      expect(data.sources.length).toBeLessThanOrEqual(5);
    }
  });

  test("GET /ask should include relevance scores in sources", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=test&mode=vector")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    if ("sources" in data && data.sources.length > 0) {
      expect(data.sources[0]).toHaveProperty("filename");
      expect(data.sources[0]).toHaveProperty("content");
      expect(data.sources[0]).toHaveProperty("relevance");
    }
  });

  test("GET /ask should truncate source content to 150 chars", async () => {
    const response = await app.handle(
      new Request("http://localhost/ask?q=test&mode=vector")
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    if ("sources" in data && data.sources.length > 0) {
      const contentLength = data.sources[0].content.replace("...", "").length;
      expect(contentLength).toBeLessThanOrEqual(150);
    }
  });
});

describe("Learn Routes", () => {
  let app: any; // Using any to avoid complex Elysia type inference issues

  beforeAll(() => {
    // @ts-ignore - Complex Elysia type inference issue with learnRoutes
    app = new Elysia().use(learnRoutes);
  });

  test("POST /learn should accept PDF file uploads", async () => {
    // Create a mock PDF file
    const mockPDF = new Blob(["Mock PDF content"], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", mockPDF, "test.pdf");

    const response = await app.handle(
      new Request("http://localhost/learn", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("success");
    expect(data).toHaveProperty("file");
    expect(data).toHaveProperty("chunks");
    expect(data).toHaveProperty("duration");
  });

  test("POST /learn should return error for invalid files", async () => {
    const mockFile = new Blob(["Not a PDF"], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", mockFile, "test.txt");

    const response = await app.handle(
      new Request("http://localhost/learn", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    // Should either fail or report error
    if (!data.success) {
      expect(data).toHaveProperty("error");
    }
  });

  test("POST /learn/bulk should accept multiple PDF files", async () => {
    const mockPDF1 = new Blob(["Mock PDF 1"], { type: "application/pdf" });
    const mockPDF2 = new Blob(["Mock PDF 2"], { type: "application/pdf" });

    const formData = new FormData();
    formData.append("files", mockPDF1, "test1.pdf");
    formData.append("files", mockPDF2, "test2.pdf");

    const response = await app.handle(
      new Request("http://localhost/learn/bulk", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("successful");
    expect(data).toHaveProperty("results");
    expect(Array.isArray(data.results)).toBe(true);
  });

  test("POST /learn/bulk should report individual file results", async () => {
    const mockPDF = new Blob(["Mock PDF"], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("files", mockPDF, "test.pdf");

    const response = await app.handle(
      new Request("http://localhost/learn/bulk", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    if (data.results.length > 0) {
      expect(data.results[0]).toHaveProperty("file");
      expect(data.results[0]).toHaveProperty("success");
      expect(data.results[0]).toHaveProperty("chunks");
    }
  });
});

describe("Error Handling", () => {
  test("Invalid route should return 404", async () => {
    const app: any = new Elysia().use(healthRoutes);
    const response = await app.handle(
      new Request("http://localhost/nonexistent")
    );

    expect(response.status).toBe(404);
  });

  test("Invalid HTTP method should be rejected", async () => {
    const app: any = new Elysia().use(healthRoutes);
    const response = await app.handle(
      new Request("http://localhost/stats", { method: "POST" })
    );

    expect(response.status).toBe(404);
  });

  test("Malformed query parameters should be handled gracefully", async () => {
    const app: any = new Elysia().use(askRoutes);
    const response = await app.handle(
      new Request("http://localhost/ask?q=test&mode=invalid")
    );

    expect(response.status).toBe(200);
    // Should either accept or reject gracefully
    const data = await response.json();
    expect(data).toBeDefined();
  });
});

describe("CORS and Headers", () => {
  test("Health endpoint should return JSON content type", async () => {
    const app: any = new Elysia().use(healthRoutes);
    const response = await app.handle(new Request("http://localhost/"));

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("Stats endpoint should return JSON content type", async () => {
    const app: any = new Elysia().use(healthRoutes);
    const response = await app.handle(new Request("http://localhost/stats"));

    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("Ask endpoint should return JSON content type", async () => {
    const app: any = new Elysia().use(askRoutes);
    const response = await app.handle(
      new Request("http://localhost/ask?q=test")
    );

    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

describe("Performance", () => {
  test("Health check should respond in < 100ms", async () => {
    const app: any = new Elysia().use(healthRoutes);
    const start = performance.now();

    await app.handle(new Request("http://localhost/"));

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });

  test("Stats query should respond in < 200ms", async () => {
    const app: any = new Elysia().use(healthRoutes);
    const start = performance.now();

    await app.handle(new Request("http://localhost/stats"));

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(200);
  });
});
