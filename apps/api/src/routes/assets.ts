import path from "node:path";

import type { FastifyInstance } from "fastify";

import { prisma } from "@repo/db";
import { uploadInputBuffer } from "@repo/comfy";

import { env } from "../lib/config.js";

export async function registerAssetRoutes(app: FastifyInstance) {
  app.get("/api/assets", async () => {
    const assets = await prisma.asset.findMany({
      include: {
        job: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return assets.map((asset) => ({
      id: asset.id,
      jobId: asset.jobId,
      type: asset.type,
      mimeType: asset.mimeType,
      filePath: asset.filePath,
      thumbnailPath: asset.thumbnailPath,
      createdAt: asset.createdAt.toISOString(),
      workflow: asset.job.workflow,
      prompt: asset.job.prompt
    }));
  });

  app.post("/api/uploads/comfy-input", async (request, reply) => {
    const filenameHeader = request.headers["x-filename"];
    const filename = Array.isArray(filenameHeader) ? filenameHeader[0] : filenameHeader;
    const contentTypeHeader = request.headers["content-type"];
    const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;

    if (!filename?.trim()) {
      return reply.status(400).send({ error: "Missing x-filename header" });
    }

    const safeFilename = path.basename(filename).replace(/[^\w.-]+/g, "_");
    const body = request.body;
    const buffer =
      body instanceof Uint8Array
        ? body
        : Buffer.isBuffer(body)
          ? body
          : typeof body === "string"
            ? Buffer.from(body)
            : null;

    if (!buffer || buffer.byteLength === 0) {
      return reply.status(400).send({ error: "Upload body is empty" });
    }

    const uploadedName = await uploadInputBuffer(
      {
        baseUrl: env.COMFY_URL
      },
      buffer,
      safeFilename
    );

    return {
      filename: uploadedName,
      contentType: contentType ?? "application/octet-stream"
    };
  });
}
