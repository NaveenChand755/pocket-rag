import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

import { db } from "../db/schema";
import { AI } from "./ai";
import { ENV } from "../config";

interface IngestResult {
  success: boolean;
  fileName: string;
  chunks: number;
  duration: number;
  error?: string;
}

const chunkText = (text: string, size: number, overlap: number): string[] => {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk) chunks.push(chunk);

    start += size - overlap;

    // Avoid infinite loop on small texts
    if (start >= text.length || size <= overlap) break;
  }

  return chunks;
};

const processBatch = async <T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
};

const insertDoc = db.prepare(
  "INSERT INTO docs (filename, content, created_at) VALUES (?, ?, ?)"
);
const getLastRowId = db.prepare("SELECT last_insert_rowid() as rowid");
const insertVec = db.prepare(
  "INSERT INTO vec_docs(doc_id, embedding) VALUES (?, ?)"
);
const checkExists = db.prepare(
  "SELECT COUNT(*) as count FROM docs WHERE filename = ?"
);

export async function ingestPDF(
  fileBuffer: Buffer,
  fileName: string,
  options?: { skipDuplicate?: boolean }
): Promise<IngestResult> {
  const startTime = performance.now();

  try {
    console.log(`[Ingest] 📄 Processing ${fileName}...`);

    // Check for duplicate
    if (options?.skipDuplicate) {
      const existing = checkExists.get(fileName) as
        | { count: number }
        | undefined;
      if (existing && existing.count > 0) {
        console.log(`[Ingest] ⏭️ Skipping ${fileName} (already exists)`);
        return {
          success: true,
          fileName,
          chunks: 0,
          duration: performance.now() - startTime,
        };
      }
    }

    const data = await pdf(fileBuffer);
    const text = data.text.trim();

    if (!text) {
      throw new Error("PDF contains no extractable text");
    }

    const { size, overlap } = ENV.chunking;
    const chunks = chunkText(text, size, overlap);
    console.log(
      `[Ingest] 📦 Created ${chunks.length} chunks (size: ${size}, overlap: ${overlap})`
    );

    // Generate all embeddings with high concurrency
    console.log(`[Ingest] ⚡ Generating embeddings (concurrency: 20)...`);
    const embedStart = performance.now();
    const embeddings = await AI.embedBatch(chunks, 20);
    const embedTime = ((performance.now() - embedStart) / 1000).toFixed(1);
    console.log(
      `[Ingest] ✅ Embeddings complete in ${embedTime}s (${(
        chunks.length / parseFloat(embedTime)
      ).toFixed(0)} chunks/sec)`
    );

    // Insert all in a single transaction for atomicity & speed
    console.log(`[Ingest] 💾 Storing in database...`);
    const timestamp = Date.now();

    db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        if (!chunk || !embedding) continue;

        insertDoc.run(fileName, chunk, timestamp);
        const result = getLastRowId.get() as { rowid: number };

        const vectorBuffer = new Uint8Array(new Float32Array(embedding).buffer);
        insertVec.run(result.rowid, vectorBuffer);
      }
    })();

    const duration = performance.now() - startTime;
    console.log(
      `[Ingest] ✅ Completed ${fileName} | ${chunks.length} chunks | ${(
        duration / 1000
      ).toFixed(2)}s`
    );

    return { success: true, fileName, chunks: chunks.length, duration };
  } catch (error) {
    const duration = performance.now() - startTime;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Ingest] ❌ Failed ${fileName}:`, message);

    return { success: false, fileName, chunks: 0, duration, error: message };
  }
}

export async function ingestMultiplePDFs(
  files: Array<{ buffer: Buffer; name: string }>
): Promise<IngestResult[]> {
  console.log(`[Ingest] 📚 Starting bulk ingest of ${files.length} files...`);

  const results: IngestResult[] = [];

  for (const file of files) {
    const result = await ingestPDF(file.buffer, file.name, {
      skipDuplicate: true,
    });
    results.push(result);
  }

  const successful = results.filter((r) => r.success).length;
  console.log(
    `[Ingest] 📊 Bulk ingest complete: ${successful}/${files.length} successful`
  );

  return results;
}
