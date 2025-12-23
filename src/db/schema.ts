import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import { VECTOR_DIM } from "../config";

const DB_PATH = process.env.DB_PATH || "pocket-rag.sqlite";

const initDatabase = (): Database => {
  const db = new Database(DB_PATH, { create: true });

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");

  // 2. Load Extension
  // CRITICAL NOTE: This usually fails on macOS locally.
  // You MUST run this in Docker (Linux) for it to work reliably.
  sqliteVec.load(db);

  // 3. Syntax Fix: Use db.run() for Table Creation
  // FTS5 table for full-text search
  db.run(`
CREATE VIRTUAL TABLE IF NOT EXISTS docs USING fts5(
filename,
content,
created_at UNINDEXED,
tokenize = 'porter unicode61'
);
`);

  db.run(`
CREATE VIRTUAL TABLE IF NOT EXISTS vec_docs USING vec0(
doc_id INTEGER,
embedding float[${VECTOR_DIM}]
);
`);

  return db;
};

export const db = initDatabase();
