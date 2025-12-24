import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import { VECTOR_DIM } from "../config";

const DB_PATH = process.env.DB_PATH || "pocket-rag.sqlite";

const initDatabase = (): Database => {
  const db = new Database(DB_PATH, { create: true });

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");

  // Load sqlite-vec extension
  // CRITICAL NOTE: This usually fails on macOS locally.
  // You MUST run this in Docker (Linux) for it to work reliably.
  sqliteVec.load(db);

  // Chunks table for semantic chunking
  db.run(`
CREATE TABLE IF NOT EXISTS chunks (
id INTEGER PRIMARY KEY,
content TEXT NOT NULL,
source TEXT,
created_at INTEGER DEFAULT (strftime('%s', 'now'))
)
`);

  // Vec0 index for fast KNN search on chunks
  db.run(`
CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(
chunk_id INTEGER PRIMARY KEY,
embedding float[${VECTOR_DIM}]
)
`);

  // FTS5 index for pre-filtering on chunks
  db.run(`
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
content,
chunk_id UNINDEXED,
tokenize = 'porter unicode61'
)
`);

  return db;
};

export const db = initDatabase();
