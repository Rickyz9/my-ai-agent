import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { prisma } from "@repo/db";
import { runtimeHealthResponseSchema } from "@repo/shared";

import { env } from "../lib/config.js";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function readNumber(meta: Record<string, unknown>, key: string) {
  const value = meta[key];
  return typeof value === "number" ? value : 0;
}

type RuntimeSample = {
  queueWaitMs: number;
  laneWaitMs: number;
  workflowBuildMs: number;
  submitMs: number;
  executionMs: number;
  outputPersistMs: number;
  evaluationMs: number;
  totalRuntimeMs: number;
};

function buildRuntimeEntry(
  label: string,
  samples: RuntimeSample[]
) {
  return {
    label,
    sampleCount: samples.length,
    avgQueueWaitMs: average(samples.map((sample) => sample.queueWaitMs)),
    avgLaneWaitMs: average(samples.map((sample) => sample.laneWaitMs)),
    avgWorkflowBuildMs: average(samples.map((sample) => sample.workflowBuildMs)),
    avgSubmitMs: average(samples.map((sample) => sample.submitMs)),
    avgExecutionMs: average(samples.map((sample) => sample.executionMs)),
    avgOutputPersistMs: average(samples.map((sample) => sample.outputPersistMs)),
    avgEvaluationMs: average(samples.map((sample) => sample.evaluationMs)),
    avgTotalRuntimeMs: average(samples.map((sample) => sample.totalRuntimeMs))
  };
}

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => {
    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true
    });
    const hunyuanApiUrl = env.HUNYUAN3D_API_URL?.trim() ?? "";

    const [ollama, comfy, redisCheck, hunyuan3d] = await Promise.allSettled([
      fetch(`${env.OLLAMA_URL}/api/tags`),
      fetch(`${env.COMFY_URL}/system_stats`),
      redis.connect().then(async () => redis.ping()),
      hunyuanApiUrl ? fetch(`${hunyuanApiUrl.replace(/\/$/, "")}/openapi.json`) : Promise.resolve(null)
    ]);

    await redis.quit().catch(() => undefined);

    return {
      api: "ok" as const,
      ollama: {
        ok: ollama.status === "fulfilled" && ollama.value.ok,
        detail:
          ollama.status === "fulfilled"
            ? `HTTP ${ollama.value.status}`
            : String(ollama.reason)
      },
      comfy: {
        ok: comfy.status === "fulfilled" && comfy.value.ok,
        detail:
          comfy.status === "fulfilled"
            ? `HTTP ${comfy.value.status}`
            : String(comfy.reason)
      },
      redis: {
        ok: redisCheck.status === "fulfilled" && redisCheck.value === "PONG",
        detail:
          redisCheck.status === "fulfilled" ? redisCheck.value : String(redisCheck.reason)
      },
      hunyuan3d: {
        configured: Boolean(hunyuanApiUrl),
        ok: hunyuanApiUrl
          ? hunyuan3d.status === "fulfilled" && Boolean(hunyuan3d.value?.ok)
          : false,
        detail: !hunyuanApiUrl
          ? "Not configured"
          : hunyuan3d.status === "fulfilled"
            ? `HTTP ${hunyuan3d.value?.status ?? "unknown"}`
            : String(hunyuan3d.reason)
      }
    };
  });

  app.get("/api/health/runtime", async () => {
    const recentJobs = await prisma.job.findMany({
      where: {
        status: "succeeded"
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 80,
      include: {
        logs: {
          where: {
            message: {
              in: ["Worker picked job", "Job completed successfully", "Render quality evaluated"]
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    const workflowGroups = new Map<string, RuntimeSample[]>();
    const categoryGroups = new Map<string, RuntimeSample[]>();
    const allSamples: RuntimeSample[] = [];

    for (const job of recentJobs) {
      const pickedLog = job.logs.find((entry) => entry.message === "Worker picked job");
      const completedLog = job.logs.find((entry) => entry.message === "Job completed successfully");
      const evaluationLog = job.logs.find((entry) => entry.message === "Render quality evaluated");
      const completedMeta = (completedLog?.meta ?? {}) as Record<string, unknown>;
      const phaseDurations = ((completedMeta.phaseDurations as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
      const pickedMeta = (pickedLog?.meta ?? {}) as Record<string, unknown>;
      const evaluationMeta = (evaluationLog?.meta ?? {}) as Record<string, unknown>;
      const modelConfig = ((job.modelConfig as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

      const sample = {
        queueWaitMs: readNumber(phaseDurations, "queueWaitMs") || readNumber(pickedMeta, "queueWaitMs"),
        laneWaitMs: readNumber(phaseDurations, "laneWaitMs") || readNumber(pickedMeta, "laneWaitMs"),
        workflowBuildMs: readNumber(phaseDurations, "workflowBuildMs"),
        submitMs: readNumber(phaseDurations, "submitMs"),
        executionMs: readNumber(phaseDurations, "executionMs"),
        outputPersistMs: readNumber(phaseDurations, "outputPersistMs"),
        evaluationMs: readNumber(phaseDurations, "evaluationMs") || readNumber(evaluationMeta, "evaluationMs"),
        totalRuntimeMs: job.updatedAt.getTime() - job.createdAt.getTime()
      };

      allSamples.push(sample);

      const workflowSamples = workflowGroups.get(job.workflow) ?? [];
      workflowSamples.push(sample);
      workflowGroups.set(job.workflow, workflowSamples);

      const categoryId = typeof modelConfig.renderCategoryId === "string" ? modelConfig.renderCategoryId : "uncategorized";
      const categorySamples = categoryGroups.get(categoryId) ?? [];
      categorySamples.push(sample);
      categoryGroups.set(categoryId, categorySamples);
    }

    const response = {
      worker: {
        concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1)),
        heavyConcurrency: Math.max(1, Number(process.env.WORKER_HEAVY_CONCURRENCY ?? process.env.WORKER_CONCURRENCY ?? 1)),
        lightConcurrency: Math.max(1, Number(process.env.WORKER_LIGHT_CONCURRENCY ?? process.env.WORKER_CONCURRENCY ?? 1))
      },
      overview: {
        sampledJobs: allSamples.length,
        avgQueueWaitMs: average(allSamples.map((sample) => sample.queueWaitMs)),
        avgLaneWaitMs: average(allSamples.map((sample) => sample.laneWaitMs)),
        avgExecutionMs: average(allSamples.map((sample) => sample.executionMs)),
        avgEvaluationMs: average(allSamples.map((sample) => sample.evaluationMs)),
        avgTotalRuntimeMs: average(allSamples.map((sample) => sample.totalRuntimeMs))
      },
      workflowBottlenecks: [...workflowGroups.entries()]
        .map(([label, samples]) => buildRuntimeEntry(label, samples))
        .sort((left, right) => right.avgExecutionMs - left.avgExecutionMs || right.sampleCount - left.sampleCount)
        .slice(0, 6),
      categoryBottlenecks: [...categoryGroups.entries()]
        .map(([label, samples]) => buildRuntimeEntry(label, samples))
        .sort((left, right) => right.avgExecutionMs - left.avgExecutionMs || right.sampleCount - left.sampleCount)
        .slice(0, 6)
    };

    return runtimeHealthResponseSchema.parse(response);
  });
}
