import { Database } from "bun:sqlite";

export function prefilterByText(
  db: Database,
  query: string,
  limit: number = 100
): Set<number> {
  const rows = db
    .query(
      `
SELECT chunk_id
FROM chunks_fts
WHERE chunks_fts MATCH ?
LIMIT ?
`
    )
    .all(query, limit) as Array<{ chunk_id: number }>;

  return new Set(rows.map((row) => row.chunk_id));
}

export function hybridSearch(
  db: Database,
  textQuery: string,
  queryEmbedding: number[],
  k: number = 10
): Array<{ chunkId: number; distance: number }> {
  // Step 1: Pre-filter with FTS5
  const candidateIds = prefilterByText(db, textQuery, 100);

  if (candidateIds.size === 0) return [];

  // Step 2: Vector search only on candidates
  const placeholders = [...candidateIds].map(() => "?").join(",");
  const rows = db
    .query(
      `
SELECT chunk_id, distance
FROM vec_index
WHERE chunk_id IN (${placeholders})
AND embedding MATCH ?
ORDER BY distance
LIMIT ?
`
    )
    .all(...candidateIds, new Float32Array(queryEmbedding), k) as Array<{
    chunk_id: number;
    distance: number;
  }>;

  return rows.map((row) => ({ chunkId: row.chunk_id, distance: row.distance }));
}
