import { Database } from "bun:sqlite";

export function insertVector(
  db: Database,
  chunkId: number,
  embedding: number[]
): void {
  db.run("INSERT INTO vec_index (chunk_id, embedding) VALUES (?, ?)", [
    chunkId,
    new Float32Array(embedding),
  ]);
}

export function knnSearch(
  db: Database,
  queryEmbedding: number[],
  k: number = 10
): Array<{ chunkId: number; distance: number }> {
  const rows = db
    .query(
      `
SELECT chunk_id, distance
FROM vec_index
WHERE embedding MATCH ?
ORDER BY distance
LIMIT ?
`
    )
    .all(new Float32Array(queryEmbedding), k) as Array<{
    chunk_id: number;
    distance: number;
  }>;

  return rows.map((row) => ({ chunkId: row.chunk_id, distance: row.distance }));
}
