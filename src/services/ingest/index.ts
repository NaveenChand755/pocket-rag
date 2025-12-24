import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

import { db } from "../../db/schema";
import { AI } from "../ai";
import { ENV } from "../../config";
import { SemanticChunker } from "../../chunking/semantic-chunker";
import { insertVector } from "../../db/vector-index";

interface IngestResult {
success: boolean;
fileName: string;
chunks: number;
duration: number;
error?: string;
}

// Initialize semantic chunker with config
const chunker = new SemanticChunker(ENV.chunking.size, ENV.chunking.overlap);

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

// Prepared statements for optimized tables
const getLastRowId = db.prepare("SELECT last_insert_rowid() as rowid");
const checkExists = db.prepare(
"SELECT COUNT(*) as count FROM chunks WHERE source = ?"
);
const insertChunk = db.prepare(
"INSERT INTO chunks (content, source) VALUES (?, ?)"
);
const insertChunkFts = db.prepare(
"INSERT INTO chunks_fts (content, chunk_id) VALUES (?, ?)"
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

// Use semantic chunker for better context-aware splitting
const chunks = chunker.chunk(text);
console.log(
`[Ingest] 📦 Created ${chunks.length} semantic chunks (size: ${ENV.chunking.size}, overlap: ${ENV.chunking.overlap})`
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

db.transaction(() => {
for (let i = 0; i < chunks.length; i++) {
const chunk = chunks[i];
const embedding = embeddings[i];
if (!chunk || !embedding) continue;

// Insert into chunks table
insertChunk.run(chunk, fileName);
const chunkResult = getLastRowId.get() as { rowid: number };

// Insert into FTS index for text search
insertChunkFts.run(chunk, chunkResult.rowid);

// Insert into vector index for similarity search
insertVector(db, chunkResult.rowid, embedding);
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