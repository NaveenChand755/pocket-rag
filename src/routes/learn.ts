/**
 * PDF ingestion routes
 */

import { Elysia, t } from "elysia";
import { ingestPDF, ingestMultiplePDFs } from "../services/ingest";

export const learnRoutes = new Elysia()
  .post(
    "/learn",
    async ({ body }) => {
      const file = body.file;
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await ingestPDF(buffer, file.name);

      return {
        success: result.success,
        file: result.fileName,
        chunks: result.chunks,
        duration: `${(result.duration / 1000).toFixed(2)}s`,
        error: result.error,
      };
    },
    {
      body: t.Object({ file: t.File() }),
    }
  )
  .post(
    "/learn/bulk",
    async ({ body }) => {
      const files = await Promise.all(
        body.files.map(async (file) => ({
          buffer: Buffer.from(await file.arrayBuffer()),
          name: file.name,
        }))
      );

      const results = await ingestMultiplePDFs(files);

      return {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        results: results.map((r) => ({
          file: r.fileName,
          success: r.success,
          chunks: r.chunks,
          error: r.error,
        })),
      };
    },
    {
      body: t.Object({ files: t.Files() }),
    }
  );
