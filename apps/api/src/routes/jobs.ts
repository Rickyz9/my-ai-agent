import { readFile } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { prisma } from "@repo/db";
import {
  candidateBatchResponseSchema,
  createJobInputSchema,
  jobDetailSchema,
  jobListItemSchema,
  relatedJobSummarySchema,
  relatedJobsResponseSchema,
  rerunJobInputSchema,
  type CreateJobInput
} from "@repo/shared";
import { evaluateRender } from "@repo/ollama";

import { env } from "../lib/config.js";
import { subscribeToJobEvents } from "../lib/job-events.js";
import { enqueueJob, rerunJob, WorkflowUnavailableError } from "../services/jobs.js";

function serializeJob(job: {
  id: string;
  workflow: string;
  status: string;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  previewPath: string | null;
  prompt: string;
}) {
  return {
    id: job.id,
    workflow: job.workflow,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    previewPath: job.previewPath,
    prompt: job.prompt
  };
}

export async function registerJobRoutes(app: FastifyInstance) {
  app.post("/api/jobs", async (request, reply) => {
    const parsed = createJobInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const job = await enqueueJob(parsed.data);
      return reply.status(201).send({
        id: job.id
      });
    } catch (error) {
      if (error instanceof WorkflowUnavailableError) {
        return reply.status(400).send({ error: error.message });
      }

      throw error;
    }
  });

  app.get("/api/jobs", async () => {
    const jobs = await prisma.job.findMany({
      orderBy: {
        createdAt: "desc"
      }
    });

    return jobs.map((job) => jobListItemSchema.parse(serializeJob(job)));
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        assets: {
          orderBy: { createdAt: "asc" }
        },
        logs: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!job) {
      return reply.status(404).send({ error: "Job not found" });
    }

    return jobDetailSchema.parse({
      ...serializeJob(job),
      comfyPromptId: job.comfyPromptId,
      workflowJson: job.workflowJson,
      params: {
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        seed: job.seed != null ? Number(job.seed) : undefined,
        steps: job.steps,
        cfg: job.cfg,
        samplerName: job.samplerName,
        scheduler: job.scheduler,
        width: job.width,
        height: job.height,
        denoise: job.denoise ?? undefined,
        strength: job.strength ?? undefined
      },
      modelConfig: (job.modelConfig as Record<string, unknown> | null) ?? null,
      assets: job.assets.map((asset) => ({
        id: asset.id,
        jobId: asset.jobId,
        type: asset.type,
        mimeType: asset.mimeType,
        filePath: asset.filePath,
        thumbnailPath: asset.thumbnailPath,
        createdAt: asset.createdAt.toISOString()
      })),
      logs: job.logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
        meta: log.meta as Record<string, unknown> | null
      })),
      errorMessage: job.errorMessage
    });
  });

  app.get("/api/jobs/:id/stream", async (request, reply) => {
    const { id } = request.params as { id: string };
    const origin = request.headers.origin;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", origin ?? "*");
    reply.raw.setHeader("Vary", "Origin");
    reply.raw.flushHeaders();

    const job = await prisma.job.findUnique({
      where: { id }
    });

    if (!job) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "Job not found" })}\n\n`);
      reply.raw.end();
      return reply;
    }

    reply.raw.write(`data: ${JSON.stringify(serializeJob(job))}\n\n`);

    if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
      reply.raw.end();
      return reply;
    }

    const heartbeat = setInterval(() => {
      reply.raw.write(": keep-alive\n\n");
    }, 15_000);

    const unsubscribe = await subscribeToJobEvents(id, (payload) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);

      if (payload.status === "succeeded" || payload.status === "failed" || payload.status === "canceled") {
        clearInterval(heartbeat);
        void unsubscribe();
        reply.raw.end();
      }
    });

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      void unsubscribe();
    });

    return reply;
  });

  app.get("/api/jobs/:id/evaluate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        assets: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!job) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const latestImage = [...job.assets].reverse().find((asset) => asset.type === "image") ?? null;
    const imageBase64 = latestImage
      ? await readFile(path.join(env.DATA_DIR, latestImage.filePath), "base64").catch(() => undefined)
      : undefined;

    const evaluation = await evaluateRender(
      {
        baseUrl: env.OLLAMA_URL,
        model: env.OLLAMA_MODEL,
        ...(env.OLLAMA_VISION_MODEL ? { visionModel: env.OLLAMA_VISION_MODEL } : {})
      },
      {
        workflow: job.workflow as CreateJobInput["workflow"],
        renderCategoryId:
          typeof (job.modelConfig as Record<string, unknown> | null)?.renderCategoryId === "string"
            ? ((job.modelConfig as Record<string, unknown>).renderCategoryId as string)
            : undefined,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        modelConfig: (job.modelConfig as Record<string, unknown> | null) as CreateJobInput["modelConfig"],
        imageBase64
      }
    );

    return evaluation;
  });

  app.get("/api/jobs/:id/related", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          logs: {
            orderBy: { createdAt: "asc" }
          }
        }
      });

      if (!job) {
        return reply.status(404).send({ error: "Job not found" });
      }

      const sourceJobLog = job.logs.find((entry) => {
        const meta = entry.meta as Record<string, unknown> | null;
        return typeof meta?.sourceJobId === "string";
      });
      const parentId = sourceJobLog ? ((sourceJobLog.meta as Record<string, unknown>).sourceJobId as string) : null;

      const allJobs = await prisma.job.findMany({
        include: {
          logs: {
            orderBy: { createdAt: "asc" }
          }
        },
        orderBy: { createdAt: "asc" }
      });

      const parentJob = parentId ? allJobs.find((entry) => entry.id === parentId) ?? null : null;
      const childJobs = allJobs.filter((entry) =>
        entry.logs.some((log) => {
          const meta = log.meta as Record<string, unknown> | null;
          return typeof meta?.sourceJobId === "string" && meta.sourceJobId === id;
        })
      );

      const parsedParent = parentJob
        ? relatedJobSummarySchema.safeParse({
            id: parentJob.id,
            workflow: parentJob.workflow,
            status: parentJob.status,
            createdAt: parentJob.createdAt.toISOString(),
            prompt: parentJob.prompt,
            previewPath: parentJob.previewPath,
            relation: "parent",
            trigger: parentJob.logs.find((entry) => {
              const meta = entry.meta as Record<string, unknown> | null;
              return typeof meta?.rerunJobId === "string" && meta.rerunJobId === id;
            })?.message ?? null
          })
        : null;
      const parsedChildren = childJobs
        .map((child) =>
          relatedJobSummarySchema.safeParse({
            id: child.id,
            workflow: child.workflow,
            status: child.status,
            createdAt: child.createdAt.toISOString(),
            prompt: child.prompt,
            previewPath: child.previewPath,
            relation: "child",
            trigger:
              child.logs.find((entry) => {
                const meta = entry.meta as Record<string, unknown> | null;
                return typeof meta?.sourceJobId === "string" && meta.sourceJobId === id;
              })?.message ?? null
          })
        )
        .filter((result): result is { success: true; data: typeof relatedJobSummarySchema._type } => result.success)
        .map((result) => result.data);

      return relatedJobsResponseSchema.parse({
        parent: parsedParent?.success ? parsedParent.data : null,
        children: parsedChildren
      });
    } catch (error) {
      app.log.error(error, "Failed to resolve related jobs");
      return {
        parent: null,
        children: []
      };
    }
  });

  app.get("/api/jobs/:id/candidates", async (request, reply) => {
    const { id } = request.params as { id: string };
    const jobs = await prisma.job.findMany({
      include: {
        logs: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const currentJob = jobs.find((job) => job.id === id) ?? null;
    if (!currentJob) {
      return reply.status(404).send({ error: "Job not found" });
    }

    const currentModelConfig = (currentJob.modelConfig as Record<string, unknown> | null) ?? null;
    const batchId = typeof currentModelConfig?.renderBatchId === "string" ? (currentModelConfig.renderBatchId as string) : null;
    if (!batchId) {
      return candidateBatchResponseSchema.parse({
        batchId: null,
        bestJobId: null,
        jobs: []
      });
    }

    const batchJobs = jobs.filter((job) => {
      const modelConfig = (job.modelConfig as Record<string, unknown> | null) ?? null;
      return modelConfig?.renderBatchId === batchId;
    });

    const bestJobId =
      batchJobs
        .flatMap((job) => job.logs)
        .map((log) => (log.meta as Record<string, unknown> | null)?.bestJobId)
        .find((value): value is string => typeof value === "string") ?? null;

    return candidateBatchResponseSchema.parse({
      batchId,
      bestJobId,
      jobs: batchJobs.map((job, index) => {
        const modelConfig = (job.modelConfig as Record<string, unknown> | null) ?? null;
        const scoreLog = [...job.logs]
          .reverse()
          .find((log) => typeof (log.meta as Record<string, unknown> | null)?.overallScore === "number");
        return {
          id: job.id,
          workflow: job.workflow,
          status: job.status,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
          progress: job.progress,
          prompt: job.prompt,
          previewPath: job.previewPath,
          candidateIndex:
            typeof modelConfig?.renderCandidateIndex === "number"
              ? (modelConfig.renderCandidateIndex as number)
              : index + 1,
          candidateLabel:
            typeof modelConfig?.renderCandidateLabel === "string"
              ? (modelConfig.renderCandidateLabel as string)
              : `Candidate ${index + 1}`,
          best: job.id === bestJobId,
          score:
            typeof (scoreLog?.meta as Record<string, unknown> | null)?.overallScore === "number"
              ? ((scoreLog?.meta as Record<string, unknown>).overallScore as number)
              : null
        };
      })
    });
  });

  app.post("/api/jobs/:id/rerun", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = rerunJobInputSchema.safeParse({
      sourceJobId: id,
      ...((request.body as Record<string, unknown> | undefined) ?? {})
    });
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const overrides: Parameters<typeof rerunJob>[1] = {};
    if (parsed.data.workflow) {
      overrides.workflow = parsed.data.workflow;
    }
    if (parsed.data.params) {
      overrides.params = parsed.data.params as Partial<CreateJobInput["params"]>;
    }
    if (parsed.data.modelConfig) {
      overrides.modelConfig = parsed.data.modelConfig as Partial<NonNullable<CreateJobInput["modelConfig"]>>;
    }

    const job = await rerunJob(parsed.data.sourceJobId, overrides);
    return reply.status(201).send({ id: job.id });
  });
}
