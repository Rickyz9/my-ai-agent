import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  buildLocalizedInpaintMask,
  buildHumanPoseControlImage,
  downloadOutputToFile,
  fetchPromptHistory,
  fetchOutputs,
  getLocalizedRepairMaskArea,
  outputPath,
  replacePlaceholders,
  resolveHumanPosePresetId,
  submitWorkflow,
  uploadInputBuffer,
  uploadInputImage,
  waitForCompletion
} from "@repo/comfy";
import { Prisma, prisma } from "@repo/db";
import { queueName, workflowCapabilities, type CheckpointProfileId, type CreateJobInput, type ModelConfig } from "@repo/shared";
import { Queue, Worker } from "bullmq";
import { publishJobEvent } from "./lib/job-events.js";
import { getRepairLearningHints, promoteBatchWinnerLearningSample, recordLearningSample } from "./lib/learning-memory.js";
 
const workspaceRoot = path.resolve(process.cwd(), "../..");
const env = {
  COMFY_URL: process.env.COMFY_URL ?? "http://127.0.0.1:8000",
  COMFY_MODELS_DIR: (() => {
    const raw = process.env.COMFY_MODELS_DIR ?? path.join(process.env.HOME ?? "", "Documents", "ComfyUI", "models");
    return path.isAbsolute(raw) ? raw : path.resolve(workspaceRoot, raw);
  })(),
  COMFY_INPUT_DIR: process.env.COMFY_INPUT_DIR ?? path.join(process.env.HOME ?? "", "Documents", "ComfyUI", "input"),
  COMFY_WAIT_TIMEOUT_MS: Math.max(60_000, Number(process.env.COMFY_WAIT_TIMEOUT_MS ?? 15 * 60 * 1000)),
  COMFY_WAIT_TIMEOUT_3D_MS: Math.max(5 * 60 * 1000, Number(process.env.COMFY_WAIT_TIMEOUT_3D_MS ?? 60 * 60 * 1000)),
  HUNYUAN3D_API_URL: process.env.HUNYUAN3D_API_URL ?? "",
  HUNYUAN3D_API_TIMEOUT_MS: Math.max(
    60_000,
    Number(process.env.HUNYUAN3D_API_TIMEOUT_MS ?? 60 * 60 * 1000)
  ),
  REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  COMFY_CHECKPOINT: process.env.COMFY_CHECKPOINT ?? "put-your-checkpoint-file-here.safetensors",
  COMFY_CHECKPOINT_ANIME: process.env.COMFY_CHECKPOINT_ANIME ?? "",
  COMFY_CHECKPOINT_PHOTOREAL: process.env.COMFY_CHECKPOINT_PHOTOREAL ?? "",
  COMFY_CHECKPOINT_PHOTOREAL_SDXL: process.env.COMFY_CHECKPOINT_PHOTOREAL_SDXL ?? "",
  COMFY_CHECKPOINT_PRODUCT: process.env.COMFY_CHECKPOINT_PRODUCT ?? "",
  COMFY_CHECKPOINT_3D: process.env.COMFY_CHECKPOINT_3D ?? "",
  COMFY_SDXL_VAE: process.env.COMFY_SDXL_VAE ?? "",
  COMFY_SDXL_NEGATIVE_EMBEDDING: process.env.COMFY_SDXL_NEGATIVE_EMBEDDING ?? "",
  OLLAMA_URL: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? "llama3.1",
  OLLAMA_VISION_MODEL: process.env.OLLAMA_VISION_MODEL ?? "",
  COMFY_CONTROLNET_OPENPOSE: process.env.COMFY_CONTROLNET_OPENPOSE ?? "",
  COMFY_CONTROLNET_VAE: process.env.COMFY_CONTROLNET_VAE ?? process.env.COMFY_SDXL_VAE ?? "",
  COMFY_QWEN_UNET: process.env.COMFY_QWEN_UNET ?? "anima-preview.safetensors",
  COMFY_QWEN_CLIP: process.env.COMFY_QWEN_CLIP ?? "qwen_3_06b_base.safetensors",
  COMFY_QWEN_VAE: process.env.COMFY_QWEN_VAE ?? "qwen_image_vae.safetensors",
  COMFY_CLIP_VISION_3D: process.env.COMFY_CLIP_VISION_3D ?? "llava_llama3_vision.safetensors",
  COMFY_REFINER_CHECKPOINT: process.env.COMFY_REFINER_CHECKPOINT ?? "",
  COMFY_UPSCALE_MODEL: process.env.COMFY_UPSCALE_MODEL ?? "put-your-upscale-model-here.pth",
  COMFY_LORA_NAME: process.env.COMFY_LORA_NAME ?? "",
  COMFY_LORA_STRENGTH: Number(process.env.COMFY_LORA_STRENGTH ?? 0.8),
  WORKER_CONCURRENCY: Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1)),
  WORKER_HEAVY_CONCURRENCY: Math.max(1, Number(process.env.WORKER_HEAVY_CONCURRENCY ?? 1)),
  WORKER_LIGHT_CONCURRENCY: Math.max(1, Number(process.env.WORKER_LIGHT_CONCURRENCY ?? process.env.WORKER_CONCURRENCY ?? 1)),
  WORKER_LOCK_DURATION_MS: Math.max(60_000, Number(process.env.WORKER_LOCK_DURATION_MS ?? 30 * 60 * 1000)),
  WORKER_STALLED_INTERVAL_MS: Math.max(30_000, Number(process.env.WORKER_STALLED_INTERVAL_MS ?? 60_000)),
  WORKER_MAX_STALLED_COUNT: Math.max(1, Number(process.env.WORKER_MAX_STALLED_COUNT ?? 3)),
  COMFY_OUTPUT_DIR: process.env.COMFY_OUTPUT_DIR ?? path.join(process.env.HOME ?? "", "Documents", "ComfyUI", "output"),
  DATA_DIR: (() => {
    const raw = process.env.DATA_DIR ?? "./data";
    return path.isAbsolute(raw) ? raw : path.resolve(workspaceRoot, raw);
  })()
};

type ConcurrencyLane = "heavy" | "light";

const workerLaneLimits: Record<ConcurrencyLane, number> = {
  heavy: Math.min(env.WORKER_CONCURRENCY, env.WORKER_HEAVY_CONCURRENCY),
  light: Math.min(env.WORKER_CONCURRENCY, env.WORKER_LIGHT_CONCURRENCY)
};

const workerLaneState: Record<ConcurrencyLane, { active: number; queue: Array<() => void> }> = {
  heavy: { active: 0, queue: [] },
  light: { active: 0, queue: [] }
};

const redisUrl = new URL(env.REDIS_URL);
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null
};

async function addLog(jobId: string, message: string, level: "info" | "warn" | "error", meta?: object) {
  await prisma.jobLog.create({
    data: {
      jobId,
      message,
      level,
      ...(meta ? { meta: meta as Prisma.InputJsonValue } : {})
    }
  });
}

async function publishCurrentJobState(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      workflow: true,
      status: true,
      progress: true,
      createdAt: true,
      updatedAt: true,
      previewPath: true,
      prompt: true
    }
  });

  if (!job) {
    return null;
  }

  await publishJobEvent({
    id: job.id,
    workflow: job.workflow,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    previewPath: job.previewPath,
    prompt: job.prompt
  });

  return job;
}

async function updateJobState(jobId: string, data: Prisma.JobUpdateInput) {
  await prisma.job.update({
    where: { id: jobId },
    data
  });
  await publishCurrentJobState(jobId);
}

function createProgressHeartbeat(jobId: string, startPercent = 15, ceilingPercent = 88, intervalMs = 8_000) {
  let current = startPercent;
  const timer = setInterval(() => {
    current = Math.min(ceilingPercent, current + 1);
    void updateJobState(jobId, {
      progress: current
    }).catch(() => {
      // Ignore transient heartbeat update failures; the real job state will still be written later.
    });
  }, intervalMs);

  return () => clearInterval(timer);
}

const jobQueue = new Queue(queueName, {
  connection: redisConnection
});

function isWorkflowStub(template: Record<string, unknown>) {
  return template._status === "stub";
}

function configuredModelFilename(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed && !trimmed.includes("put-your") ? trimmed : "";
}

function checkpointFromProfile(profileId: CheckpointProfileId | undefined): string {
  const fallback = configuredModelFilename(env.COMFY_CHECKPOINT);
  switch (profileId) {
    case "anime":
      return configuredModelFilename(env.COMFY_CHECKPOINT_ANIME) || fallback;
    case "photoreal":
      return configuredModelFilename(env.COMFY_CHECKPOINT_PHOTOREAL) || fallback;
    case "photoreal-sdxl":
      return (
        configuredModelFilename(env.COMFY_CHECKPOINT_PHOTOREAL_SDXL) ||
        configuredModelFilename(env.COMFY_CHECKPOINT_PHOTOREAL) ||
        fallback
      );
    case "product":
      return configuredModelFilename(env.COMFY_CHECKPOINT_PRODUCT) || fallback;
    case "hunyuan3d":
      return configuredModelFilename(env.COMFY_CHECKPOINT_3D) || fallback;
    case "general":
    default:
      return fallback;
  }
}

function resolveCheckpointName(modelConfig: ModelConfig | null | undefined) {
  return configuredModelFilename(modelConfig?.checkpointName) || checkpointFromProfile(modelConfig?.checkpointProfileId);
}

function resolveRefinerCheckpointName(modelConfig: ModelConfig | null | undefined) {
  return configuredModelFilename(modelConfig?.refinerCheckpointName) || configuredModelFilename(env.COMFY_REFINER_CHECKPOINT);
}

function normalizeSeedValue(seed: bigint | number | null | undefined) {
  return seed != null ? Number(seed) : undefined;
}

function getWorkflowWaitTimeoutMs(workflow: CreateJobInput["workflow"]) {
  if (workflow === "hunyuan3d_image_to_glb") {
    return env.COMFY_WAIT_TIMEOUT_3D_MS;
  }

  return env.COMFY_WAIT_TIMEOUT_MS;
}

function embeddingToken(filename: string) {
  return `embedding:${filename.replace(/\.[^.]+$/, "")}`;
}

function shouldUseDefaultNegativeEmbedding(modelConfig: ModelConfig | null | undefined) {
  return ["general", "photoreal", "photoreal-sdxl"].includes(modelConfig?.checkpointProfileId ?? "general");
}

function buildEffectiveNegativePrompt(baseNegativePrompt: string, modelConfig: ModelConfig | null | undefined) {
  const selectedEmbedding =
    modelConfig?.negativeEmbeddingName ||
    (shouldUseDefaultNegativeEmbedding(modelConfig) ? env.COMFY_SDXL_NEGATIVE_EMBEDDING : "");

  if (!selectedEmbedding) {
    return baseNegativePrompt;
  }

  return mergePromptParts(baseNegativePrompt, embeddingToken(selectedEmbedding));
}

function hasCustomSdxlVae(modelConfig: ModelConfig | null | undefined) {
  return Boolean(modelConfig?.sdxlVaeName || env.COMFY_SDXL_VAE);
}

function getConcurrencyLane(workflow: string): ConcurrencyLane {
  switch (workflow) {
    case "upscale":
    case "video_basic":
      return "light";
    default:
      return "heavy";
  }
}

async function acquireConcurrencyLaneSlot(lane: ConcurrencyLane) {
  const state = workerLaneState[lane];
  const startedAt = Date.now();

  if (state.active >= workerLaneLimits[lane]) {
    await new Promise<void>((resolve) => {
      state.queue.push(resolve);
    });
  }

  state.active += 1;

  return {
    waitMs: Date.now() - startedAt,
    release() {
      state.active = Math.max(0, state.active - 1);
      const next = state.queue.shift();
      if (next) {
        next();
      }
    }
  };
}

function getActiveLoraStack(modelConfig: ModelConfig | null | undefined) {
  const primary =
    modelConfig?.enableLora && (modelConfig.loraName || env.COMFY_LORA_NAME)
      ? [
          {
            name: modelConfig.loraName || env.COMFY_LORA_NAME,
            strength: modelConfig.loraStrength ?? env.COMFY_LORA_STRENGTH
          }
        ]
      : [];

  const extra = modelConfig?.enableLora
    ? (modelConfig.loraChain ?? []).filter((entry) => entry.name?.trim())
    : [];

  return [...primary, ...extra];
}

function mergePromptParts(...parts: Array<string | undefined>) {
  return Array.from(
    new Set(
      parts
        .flatMap((part) =>
          (part ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        )
    )
  ).join(", ");
}

const positiveIssueMarkers = [
  "positive aspect",
  "no issue",
  "not visible",
  "well-defined",
  "high level of detail",
  "strong focus on the subject",
  "clean and uncluttered",
  "cinematic and dramatic",
  "material fidelity is high",
  "sharp and well-defined",
  "is a positive aspect"
];

const defectIssueMarkers = [
  "artifact",
  "halo",
  "fringing",
  "oversharp",
  "oversharpened",
  "blur",
  "blurry",
  "soft",
  "muddy",
  "deformed",
  "distorted",
  "warped",
  "double",
  "duplicate",
  "clutter",
  "unclear",
  "asym",
  "uneven",
  "toxic",
  "neon",
  "waxy",
  "plastic",
  "bad",
  "poor",
  "flat",
  "confused",
  "washed",
  "unnatural",
  "cropped",
  "cut off",
  "gibberish",
  "misspelled",
  "text",
  "lettering",
  "typography"
];

function isActionableIssue(issue: string) {
  const normalized = issue.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const hasPositiveMarker = positiveIssueMarkers.some((marker) => normalized.includes(marker));
  const hasDefectMarker = defectIssueMarkers.some((marker) => normalized.includes(marker));

  if (hasPositiveMarker && !hasDefectMarker) {
    return false;
  }

  if (normalized.includes("hands are not visible")) {
    return false;
  }

  return true;
}

function sanitizeIssues(issues: string[]) {
  return Array.from(new Set(issues.map((issue) => issue.trim()).filter(Boolean).filter(isActionableIssue)));
}

const supportedRepairIds = [
  "face-detail",
  "eye-mouth-detail",
  "hand-anatomy-fix",
  "feet-anatomy-fix",
  "reduce-drift",
  "premium-materials",
  "geometry-cleanup",
  "label-text-safe",
  "subject-separation",
  "cinematic-polish",
  "anime-clean-linework",
  "anime-detail-boost",
  "generic-detail-boost"
] as const;

type SupportedRepairId = (typeof supportedRepairIds)[number];
type RepairFamily = "human" | "anime" | "product" | "scene" | "general";
type RepairTarget =
  | "face"
  | "hands"
  | "feet"
  | "text"
  | "geometry"
  | "material"
  | "composition"
  | "anime-linework"
  | "anime-drift"
  | "detail";

type RepairTargetSignal = {
  target: RepairTarget;
  severity: number;
  reason: string;
};

type RepairCandidatePlan = {
  repairId: SupportedRepairId;
  score: number;
  targets: RepairTarget[];
  reasons: string[];
};

type AutoRepairPlan = {
  repairIds: SupportedRepairId[];
  family: RepairFamily;
  targets: RepairTarget[];
  rankedCandidates: Array<RepairCandidatePlan & {
    learningAvgTargetDelta: number | null;
    learningTargetImprovedRate: number | null;
    learningSampleCount: number;
    learningAdjustedScore: number;
  }>;
  learningScope: string;
  learningPreferredRepairIds: string[];
  learningAvoidRepairIds: string[];
};

function normalizeRepairIds(repairIds: string[]): SupportedRepairId[] {
  const supported = new Set<string>(supportedRepairIds);
  return Array.from(
    new Set(
      repairIds
        .map((repairId) => repairId.trim())
        .map((repairId) => (repairId === "hands-detail" ? "hand-anatomy-fix" : repairId))
        .map((repairId) => (repairId === "foot-detail" || repairId === "feet-detail" ? "feet-anatomy-fix" : repairId))
        .map((repairId) => (repairId === "text-cleanup" || repairId === "label-cleanup" ? "label-text-safe" : repairId))
        .filter((repairId): repairId is SupportedRepairId => supported.has(repairId))
    )
  );
}

function shouldSkipDetailPass(modelConfig: ModelConfig | null | undefined) {
  const categoryId = modelConfig?.renderCategoryId ?? "";
  const styleRecipeId = modelConfig?.renderStyleRecipeId ?? "";
  const humanStructureMode = modelConfig?.humanStructureMode ?? "off";

  return (
    humanStructureMode === "full-body" ||
    humanStructureMode === "action" ||
    modelConfig?.humanControlMode === "openpose" ||
    ["cinematic-still", "environment-concept", "architectural-interior", "editorial-portrait"].includes(categoryId) ||
    styleRecipeId === "cinematic-grounded" ||
    styleRecipeId === "human-structure"
  );
}

function isHumanStructureLane(modelConfig: ModelConfig | null | undefined) {
  return (
    modelConfig?.humanStructureMode === "full-body" ||
    modelConfig?.humanStructureMode === "action" ||
    modelConfig?.renderStyleRecipeId === "human-structure"
  );
}

function getHumanStructureRepairMode(modelConfig: ModelConfig | null | undefined) {
  return modelConfig?.humanStructureMode === "action" || modelConfig?.renderCategoryId === "cinematic-action"
    ? "action"
    : "full-body";
}

async function hasConfiguredOpenPoseControlNet() {
  if (!env.COMFY_CONTROLNET_OPENPOSE || env.COMFY_CONTROLNET_OPENPOSE.includes("put-your")) {
    return false;
  }

  try {
    await access(path.join(env.COMFY_MODELS_DIR, "controlnet", env.COMFY_CONTROLNET_OPENPOSE));
    return true;
  } catch {
    return false;
  }
}

async function hasConfiguredRefinerCheckpoint(modelConfig: ModelConfig | null | undefined) {
  const refinerCheckpointName = resolveRefinerCheckpointName(modelConfig);
  if (!refinerCheckpointName) {
    return false;
  }

  try {
    await access(path.join(env.COMFY_MODELS_DIR, "checkpoints", refinerCheckpointName));
    return true;
  } catch {
    return false;
  }
}

async function ensureOpenPoseControlImage(input: {
  jobId: string;
  prompt: string;
  width: number;
  height: number;
  modelConfig: ModelConfig | null | undefined;
}) {
  if (input.modelConfig?.controlImageName?.trim()) {
    return input.modelConfig;
  }

  const presetId = resolveHumanPosePresetId({
    ...(input.modelConfig?.humanPosePresetId ? { requestedPresetId: input.modelConfig.humanPosePresetId } : {}),
    renderCategoryId: input.modelConfig?.renderCategoryId ?? null,
    ...(input.modelConfig?.humanStructureMode ? { humanStructureMode: input.modelConfig.humanStructureMode } : {}),
    prompt: input.prompt
  });
  const imageBuffer = buildHumanPoseControlImage(presetId, input.width, input.height);
  const uploadedName = await uploadInputBuffer(
    {
      baseUrl: env.COMFY_URL
    },
    imageBuffer,
    `codex-human-pose-${presetId}-${input.width}x${input.height}.png`
  );

  return {
    ...normalizeModelConfig(input.modelConfig),
    humanControlMode: "openpose" as const,
    humanPosePresetId: presetId,
    controlImageName: uploadedName,
    controlStrength:
      input.modelConfig?.controlStrength ??
      (input.modelConfig?.humanStructureMode === "action" || input.modelConfig?.renderCategoryId === "cinematic-action" ? 0.72 : 0.78),
    enableRefiner: false,
    enableLora: false,
    loraName: "",
    loraChain: [],
    enableDetailPass: false
  };
}

function scoreBatchCandidateByCategory(
  renderCategoryId: string | undefined,
  evaluation: {
    overallScore: number;
    faceScore: number;
    handsScore: number;
    compositionScore: number;
    materialScore: number;
  },
  modelConfig?: ModelConfig | null
) {
  const categoryId = renderCategoryId ?? "";
  const structuredHumanLane = isHumanStructureLane(modelConfig);

  if (["beauty-closeup", "editorial-portrait"].includes(categoryId)) {
    return (
      evaluation.overallScore * 0.22 +
      evaluation.faceScore * 0.44 +
      evaluation.handsScore * 0.12 +
      evaluation.materialScore * 0.12 +
      evaluation.compositionScore * 0.1
    );
  }

  if (categoryId === "fashion-editorial") {
    if (structuredHumanLane) {
      return (
        evaluation.overallScore * 0.18 +
        evaluation.faceScore * 0.16 +
        evaluation.handsScore * 0.32 +
        evaluation.materialScore * 0.12 +
        evaluation.compositionScore * 0.22
      );
    }

    return (
      evaluation.overallScore * 0.22 +
      evaluation.faceScore * 0.24 +
      evaluation.handsScore * 0.22 +
      evaluation.materialScore * 0.18 +
      evaluation.compositionScore * 0.14
    );
  }

  if (categoryId === "cinematic-still") {
    return (
      evaluation.overallScore * 0.3 +
      evaluation.compositionScore * 0.28 +
      evaluation.faceScore * 0.2 +
      evaluation.materialScore * 0.16 +
      evaluation.handsScore * 0.06
    );
  }

  if (categoryId === "cinematic-action") {
    if (structuredHumanLane) {
      return (
        evaluation.overallScore * 0.18 +
        evaluation.compositionScore * 0.28 +
        evaluation.faceScore * 0.12 +
        evaluation.handsScore * 0.3 +
        evaluation.materialScore * 0.12
      );
    }

    return (
      evaluation.overallScore * 0.24 +
      evaluation.compositionScore * 0.22 +
      evaluation.faceScore * 0.18 +
      evaluation.handsScore * 0.22 +
      evaluation.materialScore * 0.14
    );
  }

  if (categoryId === "environment-concept") {
    return (
      evaluation.overallScore * 0.3 +
      evaluation.compositionScore * 0.36 +
      evaluation.materialScore * 0.22 +
      evaluation.faceScore * 0.04 +
      evaluation.handsScore * 0.08
    );
  }

  if (["product-hero-shot", "macro-product", "food-editorial"].includes(categoryId)) {
    return (
      evaluation.overallScore * 0.26 +
      evaluation.materialScore * 0.36 +
      evaluation.compositionScore * 0.26 +
      evaluation.faceScore * 0.04 +
      evaluation.handsScore * 0.08
    );
  }

  if (categoryId.startsWith("anime-")) {
    return (
      evaluation.overallScore * 0.3 +
      evaluation.faceScore * 0.28 +
      evaluation.compositionScore * 0.22 +
      evaluation.handsScore * 0.12 +
      evaluation.materialScore * 0.08
    );
  }

  return (
    evaluation.overallScore * 0.4 +
    evaluation.faceScore * 0.22 +
    evaluation.compositionScore * 0.2 +
    evaluation.materialScore * 0.12 +
    evaluation.handsScore * 0.06
  );
}

function getVisionRubricForCategory(renderCategoryId: string | undefined) {
  const categoryId = renderCategoryId ?? "";

  if (categoryId === "beauty-closeup") {
    return {
      focus:
        "Prioritize realistic skin texture, natural eye symmetry, aligned pupils, believable lashes, clean mouth shape, believable lips, natural teeth only if visible, clean facial geometry, and soft controlled beauty lighting. Penalize plastic skin, waxy retouch, dead eyes, crossed eyes, warped mouths, melted teeth, or harsh cosmetic highlights.",
      repairs: "Prefer eye-mouth-detail for eye, mouth, lip, teeth, or pupil defects; prefer face-detail for broader face softness; prefer reduce-drift when the face feels uncanny or over-stylized."
    };
  }

  if (categoryId === "editorial-portrait") {
    return {
      focus:
        "Prioritize subject identity stability, facial structure, eye alignment, clean mouth anatomy, believable expression, disciplined editorial lighting, believable skin realism, and a quiet magazine-ready background. Penalize duplicate subject drift, asymmetry, dead eyes, warped lips, malformed teeth, awkward hands, overprocessed skin, or overglam styling.",
      repairs: "Prefer eye-mouth-detail for eyes, mouth, lips, or teeth defects; prefer hand-anatomy-fix when visible hands are malformed; prefer face-detail or reduce-drift when the portrait feels unstable or visually confused."
    };
  }

  if (categoryId === "fashion-editorial") {
    return {
      focus:
        "Prioritize face quality, eye and mouth fidelity, hand clarity, foot and footwear structure, pose discipline, garment readability, fabric realism, and clean editorial styling hierarchy. Penalize broken fingers, warped feet, melted shoes, twisted ankles, broken folds, messy styling, cheap glamour drift, awkward pose lines, or weak face fidelity.",
      repairs: "Prefer hand-anatomy-fix for bad fingers or hands; prefer feet-anatomy-fix for feet, footwear, or ankle defects; prefer eye-mouth-detail for face-detail defects; prefer premium-materials only when garment/material realism is the main weakness."
    };
  }

  if (categoryId === "cinematic-still") {
    return {
      focus:
        "Prioritize light direction, shadow logic, composition hierarchy, subject readability, grounded cinematic realism, and clean edge transitions. Penalize muddy atmosphere, flat grading, unclear focal subject, fake lighting, neon fringing, or toxic color casts.",
      repairs: "Prefer subject-separation and reduce-drift first; use cinematic-polish only when the frame needs cleaner lighting and atmosphere without stronger stylization."
    };
  }

  if (categoryId === "cinematic-action") {
    return {
      focus:
        "Prioritize action readability, clean silhouette, believable anatomy during motion, clear hands, stable feet and stance, setpiece geography, motivated lighting, and readable impact timing. Penalize static studio posing, muddy motion, confused limbs, extra fingers, warped feet, weak environment interaction, or action that feels frozen and empty.",
      repairs: "Prefer hand-anatomy-fix for visible hand defects; prefer feet-anatomy-fix for stance or foot defects; prefer subject-separation and reduce-drift when the action becomes muddy or anatomically unstable."
    };
  }

  if (categoryId === "environment-concept") {
    return {
      focus:
        "Prioritize perspective discipline, scale readability, large-form clarity, depth staging, and controlled atmosphere separation. Penalize warped perspective, floating forms, muddy silhouettes, scale confusion, or haze that obscures the scene structure.",
      repairs: "Prefer subject-separation, reduce-drift, and cinematic-polish when the scene feels muddy, structurally confused, or visually flat."
    };
  }

  if (["product-hero-shot", "macro-product", "food-editorial"].includes(categoryId)) {
    return {
      focus:
        "Prioritize geometry accuracy, edge integrity, material response, reflection control, clean commercial composition, and label readability when text or packaging is present. Penalize warped objects, bent edges, dirty reflections, mushy detail, floating products, clutter, gibberish letters, misspelled labels, warped typography, or unreadable tiny text.",
      repairs: "Prefer label-text-safe for garbled labels, fake logos, misspelled text, or warped typography; prefer geometry-cleanup for object shape errors; prefer premium-materials for weak material response."
    };
  }

  if (categoryId.startsWith("anime-")) {
    return {
      focus:
        "Prioritize distinct character design, face readability, eye symmetry, outfit readability, hair silhouette clarity, controlled palette, and clean composition. Penalize featureless black silhouettes, default black bodysuits, dark cyber armor drift, neon aura overload, glowing contour lines, muddy linework, uneven eyes, fused fingers, or backgrounds overpowering the character.",
      repairs: "Prefer anime-clean-linework and reduce-drift when the image collapses into dark neon silhouette or chaotic effects; prefer face-detail when eyes or expression readability is weak."
    };
  }

  return {
    focus:
      "Prioritize overall realism, composition clarity, subject coherence, believable materials, and stable anatomy. Penalize clutter, drift, fake-looking lighting, or disconnected details.",
    repairs: "Prefer reduce-drift, subject-separation, and premium-materials when the image feels unstable or low-coherence."
  };
}

function normalizeModelConfig(value: ModelConfig | null | undefined): ModelConfig {
  return {
    checkpointProfileId: value?.checkpointProfileId,
    renderProvider: value?.renderProvider ?? "local-comfy",
    renderProviderModel: value?.renderProviderModel,
    renderProviderReason: value?.renderProviderReason,
    humanStructureMode: value?.humanStructureMode ?? "off",
    humanControlMode: value?.humanControlMode ?? "auto",
    humanPosePresetId: value?.humanPosePresetId ?? "auto",
    renderCategoryId: value?.renderCategoryId,
    renderStyleRecipeId: value?.renderStyleRecipeId,
    renderStyleRecipeLabel: value?.renderStyleRecipeLabel,
    renderVariantId: value?.renderVariantId,
    renderVariantLabel: value?.renderVariantLabel,
    renderBatchId: value?.renderBatchId,
    renderBatchSize: value?.renderBatchSize ?? 1,
    renderCandidateIndex: value?.renderCandidateIndex,
    renderCandidateLabel: value?.renderCandidateLabel,
    renderRepairAttemptCount: value?.renderRepairAttemptCount ?? 0,
    renderLastRepairId: value?.renderLastRepairId,
    autoRepairOnLowScore: value?.autoRepairOnLowScore ?? false,
    autoRepairThreshold: value?.autoRepairThreshold ?? 62,
    autoRepairCount: value?.autoRepairCount ?? 0,
    evaluationMode: value?.evaluationMode,
    optimizationMode: value?.optimizationMode,
    fluxRenderMode: value?.fluxRenderMode,
    checkpointName: value?.checkpointName,
    sourceImageName: value?.sourceImageName,
    maskImageName: value?.maskImageName,
    controlImageName: value?.controlImageName,
    controlStrength: value?.controlStrength ?? 0.8,
    enableRefiner: value?.enableRefiner ?? false,
    refinerCheckpointName: value?.refinerCheckpointName,
    sdxlVaeName: value?.sdxlVaeName,
    negativeEmbeddingName: value?.negativeEmbeddingName,
    enableLora: value?.enableLora ?? false,
    loraName: value?.loraName,
    loraStrength: value?.loraStrength ?? 0.8,
    loraChain: value?.loraChain ?? [],
    enableDetailPass: value?.enableDetailPass ?? false,
    detailPassDenoise: value?.detailPassDenoise ?? 0.18
  };
}

async function evaluateRenderForAutoRepair(input: {
  workflow: CreateJobInput["workflow"];
  renderCategoryId?: string;
  prompt: string;
  negativePrompt: string;
  modelConfig: ModelConfig;
  imageBase64?: string;
}) {
  const issues: string[] = [];
  let faceScore = 62;
  let handsScore = 58;
  let compositionScore = 64;
  let materialScore = 60;
  const prompt = input.prompt.toLowerCase();
  const categoryId = input.renderCategoryId ?? "";
  const isHumanCategory = [
    "beauty-closeup",
    "editorial-portrait",
    "fashion-editorial",
    "cinematic-still",
    "cinematic-action"
  ].includes(categoryId);
  const isProductCategory = ["product-hero-shot", "macro-product", "food-editorial"].includes(categoryId);
  const mentionsText = /\b(text|typography|label|logo|brand|packaging|letters|word|headline|title)\b/.test(prompt);
  const mentionsFeet = /\b(feet|foot|shoe|shoes|heels|boots|ankle|toes|full-body|full body)\b/.test(prompt);
  const structuredHumanLane = isHumanStructureLane(input.modelConfig);

  if (/\bportrait|beauty|editorial|fashion|face|close-up|close up\b/.test(prompt)) {
    faceScore += 10;
    compositionScore += 4;
  }
  if (isHumanCategory) {
    faceScore -= 4;
    issues.push("Human detail needs strict checking for eyes, mouth, hands, and feet.");
  }
  if (structuredHumanLane) {
    compositionScore -= 3;
    handsScore -= 4;
    issues.push("Structured human lane is strict about full-body pose, limb separation, hands, and feet.");
  }
  if (/\bhand|hands|full-body|full body|action\b/.test(prompt)) {
    handsScore -= 12;
    issues.push("Hands are a likely weak point for this prompt.");
  }
  if (mentionsFeet) {
    handsScore -= 6;
    issues.push("Feet, footwear, or lower-body anatomy may need a conservative rerun.");
  }
  if (/\bproduct|macro|material|packshot|food\b/.test(prompt)) {
    materialScore += 14;
  }
  if (isProductCategory && mentionsText) {
    materialScore -= 10;
    issues.push("Generated label text is likely to be misspelled or poorly delineated.");
  }
  if (input.modelConfig.enableDetailPass) {
    faceScore += isHumanCategory ? 2 : 6;
    materialScore += isProductCategory && mentionsText ? 1 : 6;
    if (isHumanCategory && (input.modelConfig.detailPassDenoise ?? 0.18) > 0.14) {
      faceScore -= 5;
      issues.push("Detail pass denoise is high for human facial detail and may look artificial.");
    }
  } else {
    issues.push("Detail pass is off, so micro-detail may be softer.");
  }
  if (input.modelConfig.enableRefiner) {
    compositionScore += 4;
  }
  if (input.modelConfig.enableLora && input.modelConfig.loraStrength > 0.72) {
    compositionScore -= 8;
    faceScore -= 6;
    issues.push("LoRA strength is high and may overpower subject coherence.");
  }
  if (input.workflow === "qwen_anime_text2img") {
    faceScore += 6;
    handsScore += 4;
    materialScore -= 8;
  }
  const heuristic = {
    source: "heuristic" as const,
    summary:
      (faceScore + handsScore + compositionScore + materialScore) / 4 >= 78
        ? "Render settings are in a strong range for this category."
        : "Render is likely to benefit from an immediate repair pass.",
    overallScore: Math.max(0, Math.min(100, Math.round((faceScore + handsScore + compositionScore + materialScore) / 4))),
    faceScore: Math.max(0, Math.min(100, Math.round(faceScore))),
    handsScore: Math.max(0, Math.min(100, Math.round(handsScore))),
    compositionScore: Math.max(0, Math.min(100, Math.round(compositionScore))),
    materialScore: Math.max(0, Math.min(100, Math.round(materialScore))),
    confidence: 0.42,
    issues: Array.from(new Set(issues)),
    recommendedRepairIds: [] as string[]
  };

  if (heuristic.faceScore < 68 && isHumanCategory) {
    heuristic.recommendedRepairIds.push("eye-mouth-detail", "face-detail", "reduce-drift");
  } else if (heuristic.faceScore < 64) {
    heuristic.recommendedRepairIds.push("face-detail", "reduce-drift");
  }
  if (heuristic.handsScore < 64 && isHumanCategory) {
    heuristic.recommendedRepairIds.push("hand-anatomy-fix", ...(mentionsFeet ? ["feet-anatomy-fix"] : []), "reduce-drift");
  } else if (heuristic.handsScore < 60) {
    heuristic.recommendedRepairIds.push("anime-clean-linework", "reduce-drift");
  }
  if (structuredHumanLane && isHumanCategory && (heuristic.handsScore < 78 || heuristic.compositionScore < 74)) {
    heuristic.recommendedRepairIds.push("hand-anatomy-fix", "feet-anatomy-fix", "reduce-drift", "subject-separation");
  }
  if (isProductCategory && mentionsText) {
    heuristic.recommendedRepairIds.push("label-text-safe", "geometry-cleanup");
  } else if (heuristic.materialScore < 64) {
    heuristic.recommendedRepairIds.push("geometry-cleanup", "premium-materials");
  }
  if (heuristic.compositionScore < 64) {
    heuristic.recommendedRepairIds.push("subject-separation", "reduce-drift", "cinematic-polish");
  }
  heuristic.recommendedRepairIds = normalizeRepairIds(heuristic.recommendedRepairIds);

  if (input.modelConfig.evaluationMode === "heuristic" || !env.OLLAMA_VISION_MODEL || !input.imageBase64) {
    return heuristic;
  }

  try {
    const rubric = getVisionRubricForCategory(input.renderCategoryId);
    const response = await fetch(`${env.OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: env.OLLAMA_VISION_MODEL,
        stream: false,
        format: "json",
        system:
          [
            "You are evaluating a generated image for quality control.",
            "Return only JSON with keys summary, overallScore, faceScore, handsScore, compositionScore, materialScore, confidence, issues, recommendedRepairIds.",
            "Scores must be integers from 0 to 100.",
            "issues must contain only short concrete observations about visible problems or defects.",
            "Do not include praise, neutral scene description, or statements that no issue is present.",
            `recommendedRepairIds must be chosen only from: ${supportedRepairIds.join(", ")}.`
          ].join(" "),
        prompt: [
          `Workflow: ${input.workflow}`,
          `Render category: ${input.renderCategoryId ?? "unknown"}`,
          `Prompt: ${input.prompt}`,
          `Negative prompt: ${input.negativePrompt}`,
          `Model config: ${JSON.stringify(input.modelConfig)}`,
          `Category-specific evaluation focus: ${rubric.focus}`,
          `Repair guidance: ${rubric.repairs}`,
          "Be strict about realism and visible defects. Evaluate the actual image, not the intended prompt."
        ].join("\n"),
        images: [input.imageBase64]
      })
    });

    if (!response.ok) {
      return heuristic;
    }

    const payload = (await response.json()) as { response?: string };
    const parsed = JSON.parse(payload.response ?? "{}") as Record<string, unknown>;
    const parsedIssues = Array.isArray(parsed.issues)
      ? sanitizeIssues(parsed.issues.filter((item): item is string => typeof item === "string"))
      : heuristic.issues;
    const parsedRecommendedRepairIds = Array.isArray(parsed.recommendedRepairIds)
      ? normalizeRepairIds(parsed.recommendedRepairIds.filter((item): item is string => typeof item === "string"))
      : heuristic.recommendedRepairIds;
    const shouldSuppressRepairs =
      parsedIssues.length === 0 &&
      heuristic.issues.length === 0 &&
      typeof parsed.overallScore === "number" &&
      parsed.overallScore >= 84 &&
      typeof parsed.faceScore === "number" &&
      parsed.faceScore >= 82 &&
      typeof parsed.compositionScore === "number" &&
      parsed.compositionScore >= 80;

    const parsedOverallScore = typeof parsed.overallScore === "number" ? parsed.overallScore : heuristic.overallScore;
    const parsedFaceScore = typeof parsed.faceScore === "number" ? parsed.faceScore : heuristic.faceScore;
    const parsedHandsScore = typeof parsed.handsScore === "number" ? parsed.handsScore : heuristic.handsScore;
    const parsedCompositionScore =
      typeof parsed.compositionScore === "number" ? parsed.compositionScore : heuristic.compositionScore;
    const parsedMaterialScore = typeof parsed.materialScore === "number" ? parsed.materialScore : heuristic.materialScore;
    const structuredRepairIds =
      structuredHumanLane && !shouldSuppressRepairs && isHumanCategory && (parsedHandsScore < 82 || parsedCompositionScore < 78)
        ? ["hand-anatomy-fix", "feet-anatomy-fix", "reduce-drift", "subject-separation"]
        : [];

    return {
      ...heuristic,
      source: "vision" as const,
      summary: typeof parsed.summary === "string" ? parsed.summary : heuristic.summary,
      overallScore: parsedOverallScore,
      faceScore: parsedFaceScore,
      handsScore: parsedHandsScore,
      compositionScore: parsedCompositionScore,
      materialScore: parsedMaterialScore,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.6,
      issues: parsedIssues,
      recommendedRepairIds: shouldSuppressRepairs ? [] : normalizeRepairIds([...structuredRepairIds, ...parsedRecommendedRepairIds])
    };
  } catch {
    return heuristic;
  }
}

async function evaluateSourceJobForRepairOutcome(sourceJobId: string) {
  const sourceJob = await prisma.job.findUnique({
    where: { id: sourceJobId },
    include: {
      assets: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!sourceJob) {
    return null;
  }

  const sourceModelConfig = normalizeModelConfig((sourceJob.modelConfig as ModelConfig | null) ?? null);
  const latestImage = [...sourceJob.assets].reverse().find((asset) => asset.type === "image") ?? null;
  if (!latestImage) {
    return null;
  }

  const imageBase64 = await readFile(path.join(env.DATA_DIR, latestImage.filePath), "base64").catch(() => undefined);
  if (!imageBase64) {
    return null;
  }

  return evaluateRenderForAutoRepair({
    workflow: sourceJob.workflow as CreateJobInput["workflow"],
    prompt: sourceJob.prompt,
    negativePrompt: buildEffectiveNegativePrompt(sourceJob.negativePrompt, sourceModelConfig),
    modelConfig: sourceModelConfig,
    ...(sourceModelConfig.renderCategoryId ? { renderCategoryId: sourceModelConfig.renderCategoryId } : {}),
    imageBase64
  });
}

async function resolveCandidateBatchIfReady(batchId: string) {
  const jobs = await prisma.job.findMany({
    include: {
      assets: {
        orderBy: { createdAt: "asc" }
      },
      logs: {
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const batchJobs = jobs.filter((job) => {
    const modelConfig = (job.modelConfig as ModelConfig | null) ?? null;
    return modelConfig?.renderBatchId === batchId;
  });

  if (batchJobs.length === 0) {
    return;
  }

  const firstBatchJob = batchJobs[0];
  if (!firstBatchJob) {
    return;
  }

  const batchCategoryId = ((firstBatchJob.modelConfig as ModelConfig | null)?.renderCategoryId ?? "") || undefined;

  const expectedSize = ((firstBatchJob.modelConfig as ModelConfig | null)?.renderBatchSize ?? 1);
  if (batchJobs.length < expectedSize) {
    return;
  }

  if (!batchJobs.every((job) => ["succeeded", "failed", "canceled"].includes(job.status))) {
    return;
  }

  const alreadyResolved = batchJobs.some((job) =>
    job.logs.some((log) => {
      const meta = log.meta as Record<string, unknown> | null;
      return meta?.batchId === batchId && typeof meta?.bestJobId === "string";
    })
  );
  if (alreadyResolved) {
    return;
  }

  const scoredJobs = await Promise.all(
    batchJobs.map(async (job) => {
      const modelConfig = normalizeModelConfig((job.modelConfig as ModelConfig | null) ?? null);
      const latestImage = [...job.assets].reverse().find((asset) => asset.type === "image") ?? null;
      if (job.status !== "succeeded" || !latestImage) {
        return { job, evaluation: null };
      }

      const imageBase64 = await readFile(path.join(env.DATA_DIR, latestImage.filePath), "base64").catch(() => undefined);
      const evaluation = await evaluateRenderForAutoRepair({
        workflow: job.workflow as CreateJobInput["workflow"],
        prompt: job.prompt,
        negativePrompt: buildEffectiveNegativePrompt(job.negativePrompt, modelConfig),
        modelConfig,
        ...(modelConfig.renderCategoryId ? { renderCategoryId: modelConfig.renderCategoryId } : {}),
        ...(imageBase64 ? { imageBase64 } : {})
      });

      return { job, evaluation, modelConfig };
    })
  );

  const ranked = scoredJobs
    .filter((entry): entry is typeof entry & { evaluation: NonNullable<typeof entry["evaluation"]> } => Boolean(entry.evaluation))
    .map((entry) => ({
      ...entry,
      batchScore: scoreBatchCandidateByCategory(batchCategoryId, entry.evaluation, entry.modelConfig)
    }))
    .sort(
      (left, right) =>
        right.batchScore - left.batchScore ||
        right.evaluation.overallScore - left.evaluation.overallScore ||
        right.evaluation.faceScore - left.evaluation.faceScore ||
        right.evaluation.compositionScore - left.evaluation.compositionScore
    );

  const bestJobId = ranked[0]?.job.id ?? null;
  if (!bestJobId) {
    return;
  }

  await Promise.all(
    scoredJobs.map(async ({ job, evaluation, modelConfig }, index) => {
      await addLog(
        job.id,
        job.id === bestJobId ? "Candidate batch best render selected" : "Candidate batch comparison completed",
        "info",
        {
          batchId,
          bestJobId,
          rank: evaluation ? ranked.findIndex((entry) => entry.job.id === job.id) + 1 : null,
          batchScore: evaluation ? scoreBatchCandidateByCategory(batchCategoryId, evaluation, modelConfig) : null,
          rankingCategory: batchCategoryId ?? null,
          overallScore: evaluation?.overallScore ?? null,
          candidateIndex: ((job.modelConfig as ModelConfig | null)?.renderCandidateIndex ?? index + 1)
        }
      );
    })
  );

  await promoteBatchWinnerLearningSample(env.DATA_DIR, {
    batchId,
    bestJobId
  });
}

function buildAutoRepairOverride(source: {
  workflow: string;
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfg: number;
  modelConfig: ModelConfig | null | undefined;
}, repairId: string): {
  params: Partial<CreateJobInput["params"]>;
  modelConfig: Partial<ModelConfig>;
} {
  switch (repairId) {
    case "face-detail":
      return {
        params: {
          steps: Math.min(source.steps + 6, 42),
          cfg: Math.max(5.2, source.cfg - 0.2),
          prompt: mergePromptParts(source.prompt, "sharp eyes", "refined facial detail", "natural skin texture", "clean face geometry"),
          negativePrompt: mergePromptParts(source.negativePrompt, "asymmetrical eyes", "waxy skin", "airbrushed face")
        },
        modelConfig: workflowCapabilities[source.workflow as keyof typeof workflowCapabilities]?.supportsDetailPass
          ? {
              enableDetailPass: true,
              detailPassDenoise: 0.14
            }
          : {}
      };
    case "eye-mouth-detail":
      return {
        params: {
          steps: Math.min(source.steps + 4, 40),
          cfg: Math.max(4.9, source.cfg - 0.45),
          prompt: mergePromptParts(
            source.prompt,
            "natural eye symmetry",
            "aligned pupils",
            "clean mouth anatomy",
            "believable lips",
            "natural teeth only if visible"
          ),
          negativePrompt: mergePromptParts(
            source.negativePrompt,
            "dead eyes",
            "crossed eyes",
            "misaligned pupils",
            "warped mouth",
            "melted teeth",
            "overdefined lips"
          )
        },
        modelConfig: workflowCapabilities[source.workflow as keyof typeof workflowCapabilities]?.supportsDetailPass
          ? {
              enableDetailPass: true,
              detailPassDenoise: 0.1,
              enableRefiner: false
            }
          : {
              enableRefiner: false
            }
      };
    case "hand-anatomy-fix":
      return {
        params: {
          steps: Math.min(source.steps + (isHumanStructureLane(source.modelConfig) ? 5 : 3), isHumanStructureLane(source.modelConfig) ? 42 : 38),
          cfg: Math.max(isHumanStructureLane(source.modelConfig) ? 4.55 : 4.8, source.cfg - (isHumanStructureLane(source.modelConfig) ? 0.75 : 0.55)),
          prompt: mergePromptParts(
            source.prompt,
            "natural hand anatomy",
            "five fingers per hand if visible",
            "relaxed believable hands",
            "clean hand silhouette",
            ...(isHumanStructureLane(source.modelConfig)
              ? [
                  "simple balanced pose",
                  "arms separated from torso",
                  "hands relaxed away from face and body",
                  "one continuous anatomically plausible human body"
                ]
              : [])
          ),
          negativePrompt: mergePromptParts(
            source.negativePrompt,
            "extra fingers",
            "fused fingers",
            "missing fingers",
            "twisted hands",
            "melted hands",
            ...(isHumanStructureLane(source.modelConfig)
              ? ["merged limbs", "extra arms", "broken wrists", "hand occlusion hiding defects", "duplicate body"]
              : [])
          )
        },
        modelConfig:
          isHumanStructureLane(source.modelConfig)
            ? {
                humanStructureMode: getHumanStructureRepairMode(source.modelConfig),
                enableDetailPass: false,
                enableRefiner: false,
                enableLora: false,
                loraName: "",
                loraChain: []
              }
            : source.modelConfig?.enableLora && (source.modelConfig.loraStrength ?? 0) > 0.58
            ? {
                enableDetailPass: false,
                enableRefiner: false,
                loraStrength: Math.max(0.42, (source.modelConfig.loraStrength ?? 0.58) - 0.12)
              }
            : {
                enableDetailPass: false,
                enableRefiner: false
              }
      };
    case "feet-anatomy-fix":
      return {
        params: {
          steps: Math.min(source.steps + (isHumanStructureLane(source.modelConfig) ? 5 : 3), isHumanStructureLane(source.modelConfig) ? 42 : 38),
          cfg: Math.max(isHumanStructureLane(source.modelConfig) ? 4.55 : 4.8, source.cfg - (isHumanStructureLane(source.modelConfig) ? 0.75 : 0.55)),
          prompt: mergePromptParts(
            source.prompt,
            "stable feet anatomy",
            "believable footwear shape",
            "clean ankle structure",
            "natural stance",
            ...(isHumanStructureLane(source.modelConfig)
              ? [
                  "both feet grounded",
                  "clear lower-body silhouette",
                  "knees and ankles aligned",
                  "simple balanced full-body stance"
                ]
              : [])
          ),
          negativePrompt: mergePromptParts(
            source.negativePrompt,
            "warped feet",
            "melted shoes",
            "broken ankles",
            "extra toes",
            "twisted lower legs",
            ...(isHumanStructureLane(source.modelConfig)
              ? ["cropped feet", "merged legs", "extra legs", "broken knees", "floating stance"]
              : [])
          )
        },
        modelConfig:
          isHumanStructureLane(source.modelConfig)
            ? {
                humanStructureMode: getHumanStructureRepairMode(source.modelConfig),
                enableDetailPass: false,
                enableRefiner: false,
                enableLora: false,
                loraName: "",
                loraChain: []
              }
            : source.modelConfig?.enableLora && (source.modelConfig.loraStrength ?? 0) > 0.58
            ? {
                enableDetailPass: false,
                enableRefiner: false,
                loraStrength: Math.max(0.42, (source.modelConfig.loraStrength ?? 0.58) - 0.12)
              }
            : {
                enableDetailPass: false,
                enableRefiner: false
              }
      };
    case "reduce-drift":
      return {
        params: {
          steps: Math.min(source.steps + 2, 38),
          cfg: Math.max(5, source.cfg - 0.5),
          prompt: mergePromptParts(source.prompt, "single focal subject", "clean composition", "stable facial proportions"),
          negativePrompt: mergePromptParts(source.negativePrompt, "duplicate subject", "clutter", "deformed face")
        },
        modelConfig:
          source.modelConfig?.enableLora && (source.modelConfig.loraStrength ?? 0) > 0.7
            ? { loraStrength: Math.max(0.55, (source.modelConfig.loraStrength ?? 0.7) - 0.1) }
            : {}
      };
    case "geometry-cleanup":
      return {
        params: {
          steps: Math.min(source.steps + 4, 40),
          cfg: Math.max(5.2, source.cfg - 0.3),
          prompt: mergePromptParts(source.prompt, "precise geometry", "clean edge definition", "controlled reflections"),
          negativePrompt: mergePromptParts(source.negativePrompt, "warped geometry", "messy reflections", "double product")
        },
        modelConfig: workflowCapabilities[source.workflow as keyof typeof workflowCapabilities]?.supportsDetailPass
          ? {
              enableDetailPass: true,
              detailPassDenoise: 0.12
            }
          : {}
      };
    case "premium-materials":
      return {
        params: {
          steps: Math.min(source.steps + 6, 44),
          prompt: mergePromptParts(source.prompt, "premium material response", "micro texture clarity", "commercial product photography finish")
        },
        modelConfig:
          source.modelConfig?.enableLora && (source.modelConfig.loraStrength ?? 0) > 0.55
            ? { loraStrength: 0.5 }
            : {}
      };
    case "label-text-safe":
      return {
        params: {
          steps: Math.min(source.steps + 2, 36),
          cfg: Math.max(4.7, source.cfg - 0.7),
          prompt: mergePromptParts(
            source.prompt,
            "front-facing flat label panel",
            "large simple high contrast lettering",
            "clean label margins",
            "minimal typography"
          ),
          negativePrompt: mergePromptParts(
            source.negativePrompt,
            "gibberish letters",
            "misspelled text",
            "warped typography",
            "tiny fake text",
            "logo clutter"
          )
        },
        modelConfig: {
          enableDetailPass: false,
          enableRefiner: false
        }
      };
    case "subject-separation":
      return {
        params: {
          steps: Math.min(source.steps + 4, 42),
          prompt: mergePromptParts(source.prompt, "clear foreground midground background separation", "strong focal hierarchy", "readable scene depth"),
          negativePrompt: mergePromptParts(source.negativePrompt, "muddy composition", "confused perspective", "unclear focal point")
        },
        modelConfig: {}
      };
    case "cinematic-polish":
      return {
        params: {
          steps: Math.min(source.steps + 3, 40),
          cfg: Math.max(4.8, source.cfg - 0.35),
          prompt: mergePromptParts(
            source.prompt,
            "disciplined cinematic lighting",
            "controlled atmosphere",
            "refined color separation",
            "neutral edge transitions",
            "grounded filmic grading"
          ),
          negativePrompt: mergePromptParts(
            source.negativePrompt,
            "neon green edge fringing",
            "fluorescent contour halos",
            "oversharpened outlines",
            "toxic color cast",
            "muddy haze"
          )
        },
        modelConfig: workflowCapabilities[source.workflow as keyof typeof workflowCapabilities]?.supportsDetailPass
          ? {
              enableDetailPass: true,
              detailPassDenoise: 0.1,
              enableRefiner: false
            }
          : {
              enableRefiner: false
            }
      };
    case "anime-clean-linework":
      return {
        params: {
          steps: Math.min(source.steps + 4, 34),
          cfg: Math.min(4.5, Math.max(3.8, source.cfg)),
          prompt: mergePromptParts(
            source.prompt,
            "clean anime linework",
            "crisp cel shading",
            "symmetrical eyes",
            "readable character silhouette",
            "distinct outfit design"
          ),
          negativePrompt: mergePromptParts(
            source.negativePrompt,
            "featureless black silhouette",
            "default black bodysuit",
            "neon purple aura",
            "glowing contour overload",
            "background overpowering character",
            "muddy colors",
            "uneven eyes",
            "bad hands"
          )
        },
        modelConfig: { enableLora: false, loraName: "" }
      };
    case "anime-detail-boost":
      return {
        params: {
          steps: Math.min(source.steps + 6, 36),
          prompt: mergePromptParts(source.prompt, "high detail focal rendering", "defined hair strands", "polished illustration finish")
        },
        modelConfig: {}
      };
    case "generic-detail-boost":
    default:
      return {
        params: {
          steps: Math.min(source.steps + 4, 40),
          prompt: mergePromptParts(source.prompt, "high detail focal subject", "clean composition", "polished final image")
        },
        modelConfig: workflowCapabilities[source.workflow as keyof typeof workflowCapabilities]?.supportsDetailPass
          ? {
              enableDetailPass: true,
              detailPassDenoise: 0.16
            }
          : {}
      };
  }
}

type AutoRepairSourceJob = {
  id: string;
  workflow: string;
  prompt: string;
  negativePrompt: string;
  seed: bigint | number | null;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  width: number;
  height: number;
  denoise: number | null;
  strength: number | null;
  inputImagePath: string | null;
  modelConfig: Prisma.JsonValue | null;
};

type RepairEvaluation = {
  overallScore: number;
  faceScore: number;
  handsScore: number;
  compositionScore: number;
  materialScore: number;
  issues?: string[];
  recommendedRepairIds: string[];
};

function localizedRepairDenoise(repairId: string) {
  switch (repairId) {
    case "eye-mouth-detail":
      return 0.24;
    case "face-detail":
      return 0.3;
    case "hand-anatomy-fix":
      return 0.34;
    case "feet-anatomy-fix":
      return 0.36;
    case "label-text-safe":
      return 0.42;
    default:
      return 0.35;
  }
}

function localizedRepairSteps(repairId: string, requestedSteps: number) {
  const maxSteps = repairId === "label-text-safe" ? 38 : 36;
  return Math.min(Math.max(24, requestedSteps), maxSteps);
}

function localizedRepairCfg(repairId: string, requestedCfg: number) {
  if (repairId === "label-text-safe") {
    return Math.max(4.2, Math.min(requestedCfg, 5.2));
  }

  return Math.max(4.4, Math.min(requestedCfg, 5.6));
}

async function prepareLocalizedInpaintRepair(input: {
  repairId: string;
  sourceJob: AutoRepairSourceJob;
  sourceModelConfig: ModelConfig | null;
  sourceImagePath?: string | null;
}) {
  const area = getLocalizedRepairMaskArea(input.repairId);
  if (!area || !input.sourceImagePath) {
    return null;
  }

  const extension = path.extname(input.sourceImagePath).toLowerCase();
  const safeExtension = [".png", ".jpg", ".jpeg", ".webp"].includes(extension) ? extension : ".png";
  const sourceImageName = await uploadInputImage(
    {
      baseUrl: env.COMFY_URL
    },
    input.sourceImagePath,
    `codex-repair-source-${input.sourceJob.id}-${input.repairId}${safeExtension}`
  );
  const mask = buildLocalizedInpaintMask({
    repairId: input.repairId,
    width: input.sourceJob.width,
    height: input.sourceJob.height,
    renderCategoryId: input.sourceModelConfig?.renderCategoryId ?? null,
    humanStructureMode: input.sourceModelConfig?.humanStructureMode ?? null,
    humanPosePresetId: input.sourceModelConfig?.humanPosePresetId ?? "auto",
    prompt: input.sourceJob.prompt
  });

  if (!mask) {
    return null;
  }

  const maskImageName = await uploadInputBuffer(
    {
      baseUrl: env.COMFY_URL
    },
    mask.buffer,
    `codex-repair-mask-${input.sourceJob.id}-${input.repairId}-${input.sourceJob.width}x${input.sourceJob.height}.png`
  );

  return {
    area,
    sourceImageName,
    maskImageName
  };
}

function isStructuredHumanRepairTarget(modelConfig: ModelConfig | null | undefined) {
  return (
    isHumanStructureLane(modelConfig) ||
    modelConfig?.renderCategoryId === "fashion-editorial" ||
    modelConfig?.renderCategoryId === "cinematic-action"
  );
}

function shouldAutoRepairEvaluation(
  evaluation: RepairEvaluation,
  modelConfig: ModelConfig | null | undefined,
  autoRepairThreshold: number
) {
  if (evaluation.overallScore < autoRepairThreshold) {
    return true;
  }

  if (!isStructuredHumanRepairTarget(modelConfig)) {
    return false;
  }

  return evaluation.handsScore < 82 || evaluation.faceScore < 78 || evaluation.compositionScore < 78;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function inferRepairFamily(sourceJob: AutoRepairSourceJob, modelConfig: ModelConfig | null | undefined): RepairFamily {
  const categoryId = modelConfig?.renderCategoryId ?? "";
  if (categoryId.startsWith("anime-") || sourceJob.workflow === "qwen_anime_text2img" || modelConfig?.checkpointProfileId === "anime") {
    return "anime";
  }

  if (["product-hero-shot", "macro-product", "food-editorial"].includes(categoryId) || modelConfig?.checkpointProfileId === "product") {
    return "product";
  }

  if (
    isStructuredHumanRepairTarget(modelConfig) ||
    ["beauty-closeup", "editorial-portrait", "fashion-editorial"].includes(categoryId)
  ) {
    return "human";
  }

  if (["cinematic-still", "environment-concept", "architectural-interior"].includes(categoryId)) {
    return "scene";
  }

  return "general";
}

function issueTextForEvaluation(evaluation: RepairEvaluation) {
  return (evaluation.issues ?? []).join(" ").toLowerCase();
}

function hasAnyIssue(text: string, markers: readonly string[]) {
  return markers.some((marker) => text.includes(marker));
}

function hasPromptMatch(sourceJob: AutoRepairSourceJob, pattern: RegExp) {
  return pattern.test(sourceJob.prompt);
}

function addRepairTarget(
  targets: RepairTargetSignal[],
  target: RepairTarget,
  severity: number,
  reason: string
) {
  const normalizedSeverity = clampNumber(Math.round(severity), 1, 28);
  const existing = targets.find((entry) => entry.target === target);
  if (existing) {
    existing.severity = Math.max(existing.severity, normalizedSeverity);
    if (!existing.reason.includes(reason)) {
      existing.reason = `${existing.reason}; ${reason}`;
    }
    return;
  }

  targets.push({
    target,
    severity: normalizedSeverity,
    reason
  });
}

function inferRepairTargets(
  evaluation: RepairEvaluation,
  sourceJob: AutoRepairSourceJob,
  modelConfig: ModelConfig | null | undefined,
  family: RepairFamily
) {
  const categoryId = modelConfig?.renderCategoryId ?? "";
  const issueText = issueTextForEvaluation(evaluation);
  const prompt = sourceJob.prompt.toLowerCase();
  const targets: RepairTargetSignal[] = [];
  const mentionsFeet =
    categoryId === "fashion-editorial" ||
    /\b(feet|foot|shoe|shoes|heels|boots|ankle|toes|full-body|full body|piedi|scarpe|tacchi)\b/i.test(prompt);
  const mentionsText =
    /\b(text|typography|label|logo|brand|packaging|letters|word|headline|title|etichet|testo|lettere|marchio)\b/i.test(prompt);

  if (
    evaluation.faceScore < 78 ||
    hasAnyIssue(issueText, ["face", "eye", "eyes", "pupil", "iris", "mouth", "lips", "teeth", "volto", "occhi", "bocca"])
  ) {
    addRepairTarget(targets, "face", 78 - evaluation.faceScore + 8, "face, eyes, or mouth below target");
  }

  if (
    family === "human" &&
    (evaluation.handsScore < 82 || hasAnyIssue(issueText, ["hand", "hands", "finger", "fingers", "wrist", "dita", "mani"]))
  ) {
    addRepairTarget(targets, "hands", 82 - evaluation.handsScore + 10, "human hand anatomy risk");
  }

  if (
    family === "human" &&
    (mentionsFeet || hasAnyIssue(issueText, ["foot", "feet", "shoe", "shoes", "ankle", "toe", "piede", "piedi", "scarpe"]))
  ) {
    addRepairTarget(targets, "feet", 78 - evaluation.handsScore + 8, "feet, footwear, or lower-body stability risk");
  }

  if (
    evaluation.compositionScore < 78 ||
    hasAnyIssue(issueText, [
      "duplicate",
      "double",
      "fused",
      "merged",
      "clutter",
      "muddy",
      "unclear",
      "silhouette",
      "overpowering",
      "composition",
      "confused"
    ])
  ) {
    addRepairTarget(targets, "composition", 78 - evaluation.compositionScore + 8, "composition, separation, or drift below target");
  }

  if (
    family === "product" &&
    (mentionsText || hasAnyIssue(issueText, ["text", "label", "logo", "letter", "typography", "gibberish", "misspelled", "etichet"]))
  ) {
    addRepairTarget(targets, "text", 80 - evaluation.materialScore + 12, "product label or typography needs protection");
  }

  if (
    family === "product" &&
    (evaluation.materialScore < 74 || hasAnyIssue(issueText, ["geometry", "warped", "bent", "crooked", "double product", "floating"]))
  ) {
    addRepairTarget(targets, "geometry", 74 - evaluation.materialScore + 8, "product geometry or edge integrity below target");
  }

  if (
    (family === "product" || categoryId === "macro-product" || categoryId === "food-editorial") &&
    (evaluation.materialScore < 70 || hasAnyIssue(issueText, ["reflection", "material", "glare", "plastic", "glass", "texture"]))
  ) {
    addRepairTarget(targets, "material", 70 - evaluation.materialScore + 6, "material response or reflection quality below target");
  }

  if (
    family === "anime" &&
    (evaluation.faceScore < 78 || hasAnyIssue(issueText, ["uneven eyes", "messy linework", "muddy line", "warped mouth", "face"]))
  ) {
    addRepairTarget(targets, "anime-linework", 78 - evaluation.faceScore + 10, "anime facial readability or linework needs cleanup");
  }

  if (
    family === "anime" &&
    (evaluation.compositionScore < 80 ||
      hasAnyIssue(issueText, [
        "featureless black silhouette",
        "black bodysuit",
        "dark cyber",
        "neon",
        "aura",
        "glowing contour",
        "background overpowering",
        "chaotic"
      ]) ||
      hasPromptMatch(sourceJob, /\b(neon|aura|dark|cyber|energy|blast)\b/i))
  ) {
    addRepairTarget(targets, "anime-drift", 80 - evaluation.compositionScore + 10, "anime style drift, dark silhouette, or effects overload");
  }

  if (targets.length === 0 && evaluation.overallScore < 72) {
    addRepairTarget(targets, "detail", 72 - evaluation.overallScore + 6, "overall quality below category baseline");
  }

  return targets.sort((left, right) => right.severity - left.severity);
}

function pushRepairCandidate(
  plans: Map<SupportedRepairId, RepairCandidatePlan>,
  repairId: SupportedRepairId,
  score: number,
  target: RepairTarget,
  reason: string
) {
  const existing = plans.get(repairId);
  if (existing) {
    existing.score += score * 0.72;
    if (!existing.targets.includes(target)) {
      existing.targets.push(target);
    }
    if (!existing.reasons.includes(reason)) {
      existing.reasons.push(reason);
    }
    return;
  }

  plans.set(repairId, {
    repairId,
    score,
    targets: [target],
    reasons: [reason]
  });
}

function addTargetCandidates(
  plans: Map<SupportedRepairId, RepairCandidatePlan>,
  signal: RepairTargetSignal,
  family: RepairFamily,
  modelConfig: ModelConfig | null | undefined
) {
  const severityBoost = Math.min(14, signal.severity);
  switch (signal.target) {
    case "face":
      if (family === "anime") {
        pushRepairCandidate(plans, "anime-clean-linework", 34 + severityBoost, signal.target, signal.reason);
        pushRepairCandidate(plans, "anime-detail-boost", 18 + severityBoost * 0.5, signal.target, signal.reason);
        return;
      }
      pushRepairCandidate(plans, "eye-mouth-detail", 36 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "face-detail", 28 + severityBoost * 0.8, signal.target, signal.reason);
      pushRepairCandidate(plans, "reduce-drift", 10 + severityBoost * 0.4, signal.target, signal.reason);
      return;
    case "hands":
      pushRepairCandidate(plans, family === "anime" ? "anime-clean-linework" : "hand-anatomy-fix", 38 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "reduce-drift", 12 + severityBoost * 0.5, signal.target, signal.reason);
      return;
    case "feet":
      pushRepairCandidate(plans, "feet-anatomy-fix", 34 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "subject-separation", 14 + severityBoost * 0.45, signal.target, signal.reason);
      return;
    case "text":
      pushRepairCandidate(plans, "label-text-safe", 44 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "geometry-cleanup", 18 + severityBoost * 0.5, signal.target, signal.reason);
      return;
    case "geometry":
      pushRepairCandidate(plans, "geometry-cleanup", 36 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "premium-materials", 14 + severityBoost * 0.5, signal.target, signal.reason);
      return;
    case "material":
      pushRepairCandidate(plans, "premium-materials", 32 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "geometry-cleanup", 12 + severityBoost * 0.45, signal.target, signal.reason);
      return;
    case "composition":
      pushRepairCandidate(plans, "subject-separation", 32 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "reduce-drift", 28 + severityBoost * 0.85, signal.target, signal.reason);
      if (family === "scene" || modelConfig?.renderCategoryId === "cinematic-still") {
        pushRepairCandidate(plans, "cinematic-polish", 16 + severityBoost * 0.5, signal.target, signal.reason);
      }
      return;
    case "anime-linework":
      pushRepairCandidate(plans, "anime-clean-linework", 40 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "anime-detail-boost", 22 + severityBoost * 0.55, signal.target, signal.reason);
      return;
    case "anime-drift":
      pushRepairCandidate(plans, "reduce-drift", 38 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "anime-clean-linework", 30 + severityBoost * 0.7, signal.target, signal.reason);
      pushRepairCandidate(plans, "subject-separation", 16 + severityBoost * 0.45, signal.target, signal.reason);
      return;
    case "detail":
    default:
      pushRepairCandidate(plans, "generic-detail-boost", 22 + severityBoost, signal.target, signal.reason);
      pushRepairCandidate(plans, "reduce-drift", 14 + severityBoost * 0.45, signal.target, signal.reason);
  }
}

function buildStrategicRepairCandidates(
  evaluation: RepairEvaluation,
  sourceJob: AutoRepairSourceJob,
  modelConfig: ModelConfig | null | undefined,
  family: RepairFamily,
  targets: RepairTargetSignal[]
) {
  const plans = new Map<SupportedRepairId, RepairCandidatePlan>();

  for (const target of targets) {
    addTargetCandidates(plans, target, family, modelConfig);
  }

  for (const repairId of normalizeRepairIds(evaluation.recommendedRepairIds)) {
    pushRepairCandidate(plans, repairId, 20, "detail", "vision model recommended this repair");
  }

  return [...plans.values()].sort((left, right) => right.score - left.score);
}

function maxRepairCandidatesForStrategy(family: RepairFamily, targets: RepairTarget[], modelConfig: ModelConfig | null | undefined) {
  const targetSet = new Set(targets);
  if (family === "human" && (isStructuredHumanRepairTarget(modelConfig) || targetSet.has("hands") || targetSet.has("feet"))) {
    return 2;
  }

  if (family === "product" && targetSet.has("text") && (targetSet.has("geometry") || targetSet.has("material"))) {
    return 2;
  }

  if (family === "anime" && targetSet.has("anime-drift") && targetSet.has("anime-linework")) {
    return 2;
  }

  return 1;
}

async function selectAutoRepairPlan(
  evaluation: RepairEvaluation,
  sourceJob: AutoRepairSourceJob,
  modelConfig: ModelConfig | null | undefined,
  options?: {
    sourceImageAvailable?: boolean;
  }
) : Promise<AutoRepairPlan> {
  const family = inferRepairFamily(sourceJob, modelConfig);
  const targetSignals = inferRepairTargets(evaluation, sourceJob, modelConfig, family);
  const targets = targetSignals.map((target) => target.target);
  const candidates = buildStrategicRepairCandidates(evaluation, sourceJob, modelConfig, family, targetSignals);
  if (candidates.length === 0) {
    return {
      repairIds: [],
      family,
      targets,
      rankedCandidates: [],
      learningScope: "none",
      learningPreferredRepairIds: [],
      learningAvoidRepairIds: []
    };
  }

  const learningHints = await getRepairLearningHints(env.DATA_DIR, {
    categoryId: modelConfig?.renderCategoryId ?? null,
    styleRecipeId: modelConfig?.renderStyleRecipeId ?? null
  });
  const preferredIndex = new Map(learningHints.preferredRepairIds.map((repairId, index) => [repairId, index]));
  const learningByRepair = new Map(learningHints.repairSummaries.map((summary) => [summary.repairId, summary]));
  const filteredCandidates = candidates.filter((candidate) => {
    const avoid = learningHints.avoidRepairIds.includes(candidate.repairId);
    if (!avoid) {
      return true;
    }

    return Boolean(options?.sourceImageAvailable) && Boolean(getLocalizedRepairMaskArea(candidate.repairId));
  });
  const usableCandidates = filteredCandidates.length > 0 ? filteredCandidates : candidates;
  const ranked = [...usableCandidates]
    .map((candidate) => {
      const learningSummary = learningByRepair.get(candidate.repairId);
      const preferredRank = preferredIndex.get(candidate.repairId);
      const avoided = learningHints.avoidRepairIds.includes(candidate.repairId);
      const learningDelta =
        learningSummary && learningSummary.deltaCount >= 2
          ? clampNumber(learningSummary.avgTargetDelta * 2.4, -18, 18) + learningSummary.targetImprovedRate * 9
          : 0;
      const preferredBoost = preferredRank != null ? Math.max(6, 18 - preferredRank * 4) : 0;
      const localizedFallbackBoost =
        avoided && options?.sourceImageAvailable && getLocalizedRepairMaskArea(candidate.repairId) ? 5 : 0;
      const avoidPenalty = avoided ? (localizedFallbackBoost ? -10 : -42) : 0;
      const learningAdjustedScore = candidate.score + learningDelta + preferredBoost + localizedFallbackBoost + avoidPenalty;

      return {
        ...candidate,
        learningAvgTargetDelta: learningSummary?.avgTargetDelta ?? null,
        learningTargetImprovedRate: learningSummary?.targetImprovedRate ?? null,
        learningSampleCount: learningSummary?.sampleCount ?? 0,
        learningAdjustedScore: Math.round(learningAdjustedScore * 10) / 10
      };
    })
    .sort(
      (left, right) =>
        right.learningAdjustedScore - left.learningAdjustedScore ||
        right.score - left.score ||
        Number(Boolean(getLocalizedRepairMaskArea(right.repairId))) - Number(Boolean(getLocalizedRepairMaskArea(left.repairId)))
    );
  const maxRepairCandidates = maxRepairCandidatesForStrategy(family, targets, modelConfig);

  return {
    repairIds: ranked.slice(0, maxRepairCandidates).map((candidate) => candidate.repairId),
    family,
    targets,
    rankedCandidates: ranked.slice(0, 6),
    learningScope: learningHints.scope,
    learningPreferredRepairIds: learningHints.preferredRepairIds,
    learningAvoidRepairIds: learningHints.avoidRepairIds
  };
}

async function enqueueAutoRepairJob(
  sourceJob: AutoRepairSourceJob,
  repairId: string,
  options?: {
    batchId?: string;
    batchSize?: number;
    candidateIndex?: number;
    sourceImagePath?: string | null;
  }
) {
  const sourceModelConfig = (sourceJob.modelConfig as ModelConfig | null) ?? null;
  const override = buildAutoRepairOverride(
    {
      workflow: sourceJob.workflow,
      prompt: sourceJob.prompt,
      negativePrompt: sourceJob.negativePrompt,
      steps: sourceJob.steps,
      cfg: sourceJob.cfg,
      modelConfig: sourceModelConfig
    },
    repairId
  );
  const localizedRepair = await prepareLocalizedInpaintRepair({
    repairId,
    sourceJob,
    sourceModelConfig,
    sourceImagePath: options?.sourceImagePath ?? null
  });
  const nextWorkflow = localizedRepair ? "sdxl_inpaint_fix" : sourceJob.workflow;
  const nextSteps = localizedRepair
    ? localizedRepairSteps(repairId, override.params.steps ?? sourceJob.steps)
    : override.params.steps ?? sourceJob.steps;
  const nextCfg = localizedRepair
    ? localizedRepairCfg(repairId, override.params.cfg ?? sourceJob.cfg)
    : override.params.cfg ?? sourceJob.cfg;

  const nextModelConfig: ModelConfig = {
    ...normalizeModelConfig(sourceModelConfig),
    ...(override.modelConfig ?? {}),
    ...(localizedRepair
      ? {
          sourceImageName: localizedRepair.sourceImageName,
          maskImageName: localizedRepair.maskImageName,
          enableDetailPass: false,
          enableRefiner: false,
          enableLora: false,
          loraName: "",
          loraChain: []
        }
      : {}),
    enableRefiner: false,
    refinerCheckpointName: "",
    renderBatchId: options?.batchId ?? "",
    renderBatchSize: options?.batchSize ?? 1,
    renderCandidateIndex: options?.candidateIndex ?? 1,
    renderCandidateLabel: options?.batchId
      ? `Repair ${options.candidateIndex}: ${repairId}${localizedRepair ? " local" : ""}`
      : `Repair: ${repairId}${localizedRepair ? " local" : ""}`,
    renderRepairAttemptCount: (sourceModelConfig?.renderRepairAttemptCount ?? 0) + 1,
    renderLastRepairId: repairId,
    autoRepairCount: (sourceModelConfig?.autoRepairCount ?? 0) + 1
  };
  const nextJob = await prisma.job.create({
    data: {
      workflow: nextWorkflow as CreateJobInput["workflow"],
      status: "queued",
      progress: 0,
      prompt: override.params.prompt ?? sourceJob.prompt,
      negativePrompt: override.params.negativePrompt ?? sourceJob.negativePrompt,
      seed: sourceJob.seed,
      steps: nextSteps,
      cfg: nextCfg,
      samplerName: localizedRepair ? "euler" : override.params.samplerName ?? sourceJob.samplerName,
      scheduler: localizedRepair ? "normal" : override.params.scheduler ?? sourceJob.scheduler,
      width: override.params.width ?? sourceJob.width,
      height: override.params.height ?? sourceJob.height,
      denoise: localizedRepair ? localizedRepairDenoise(repairId) : override.params.denoise ?? sourceJob.denoise,
      strength: override.params.strength ?? sourceJob.strength,
      inputImagePath: localizedRepair?.sourceImageName ?? sourceJob.inputImagePath,
      modelConfig: nextModelConfig as Prisma.InputJsonValue
    }
  });

  await prisma.jobLog.create({
    data: {
      jobId: nextJob.id,
      message: "Auto repair rerun queued",
      level: "info",
      meta: {
        sourceJobId: sourceJob.id,
        repairId,
        localizedRepairArea: localizedRepair?.area ?? null,
        sourceImageName: localizedRepair?.sourceImageName ?? null,
        maskImageName: localizedRepair?.maskImageName ?? null,
        repairBatchId: options?.batchId ?? null,
        repairCandidateIndex: options?.candidateIndex ?? null
      }
    }
  });

  await jobQueue.add(
    queueName,
    { jobId: nextJob.id },
    {
      jobId: nextJob.id,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5_000
      },
      removeOnComplete: 50,
      removeOnFail: 100
    }
  );

  return nextJob;
}

async function enqueueAutoRepairJobs(
  sourceJob: AutoRepairSourceJob,
  repairIds: string[],
  options?: {
    sourceImagePath?: string | null;
  }
) {
  if (repairIds.length <= 1) {
    const firstRepairId = repairIds[0];
    return firstRepairId
      ? [
          await enqueueAutoRepairJob(sourceJob, firstRepairId, {
            sourceImagePath: options?.sourceImagePath ?? null
          })
        ]
      : [];
  }

  const batchId = `repair-${randomUUID()}`;
  const jobs = [];
  for (const [index, repairId] of repairIds.entries()) {
    jobs.push(
      await enqueueAutoRepairJob(sourceJob, repairId, {
        batchId,
        batchSize: repairIds.length,
        candidateIndex: index + 1,
        sourceImagePath: options?.sourceImagePath ?? null
      })
    );
  }
  return jobs;
}

function resolveWorkflowKey(baseWorkflow: string, modelConfig: ModelConfig | null | undefined): string {
  const loraStack = getActiveLoraStack(modelConfig);
  const hasLoraStack = loraStack.length > 0;
  const hasSecondaryLora = loraStack.length > 1;

  if (baseWorkflow === "sdxl_inpaint_fix") {
    return baseWorkflow;
  }

  if (baseWorkflow === "sdxl_img2img") {
    return hasCustomSdxlVae(modelConfig) ? "sdxl_img2img_vae" : "sdxl_img2img";
  }

  if (baseWorkflow === "sdxl_openpose_text2img") {
    return "pose_controlnet";
  }

  if (baseWorkflow === "hunyuan3d_image_to_glb") {
    return "3d_hunyuan3d_image_to_model";
  }

  if (baseWorkflow !== "sdxl_text2img") {
    return baseWorkflow;
  }

  if (modelConfig?.enableRefiner) {
    return hasCustomSdxlVae(modelConfig) ? "sdxl_text2img_refiner_vae" : "sdxl_text2img_refiner";
  }

  if (hasLoraStack) {
    if (hasSecondaryLora) {
      return hasCustomSdxlVae(modelConfig) ? "sdxl_text2img_lora_dual_vae" : "sdxl_text2img_lora_dual";
    }

    return hasCustomSdxlVae(modelConfig) ? "sdxl_text2img_lora_vae" : "sdxl_text2img_lora";
  }

  return hasCustomSdxlVae(modelConfig) ? "sdxl_text2img_vae" : "sdxl_text2img";
}

async function persistAssets(
  jobId: string,
  assets: Awaited<ReturnType<typeof fetchOutputs>>,
  dataDir: string,
  comfyUrl: string
) {
  const persisted: Array<{ target: string; relativePath: string; type: "image" | "video" | "model" }> = [];
  await mkdir(path.join(dataDir, "outputs", jobId), { recursive: true });

  for (const asset of assets) {
    const target = outputPath(dataDir, jobId, asset.filename);
    await downloadOutputToFile(
      {
        baseUrl: comfyUrl
      },
      asset,
      target
    );

    const relativePath = path.relative(dataDir, target);
    const type = asset.mimeType.startsWith("video/")
      ? "video"
      : asset.mimeType.startsWith("model/")
        ? "model"
        : "image";

    await prisma.asset.create({
      data: {
        jobId,
        type: type as never,
        mimeType: asset.mimeType,
        filePath: relativePath,
        thumbnailPath: type === "image" ? relativePath : null
      }
    });

    persisted.push({ target, relativePath, type });
  }

  const lastPreview = [...persisted].reverse().find((item) => item.type === "image") ?? null;
  if (lastPreview) {
    await updateJobState(jobId, {
      previewPath: lastPreview.relativePath
    });
  }

  return persisted;
}

async function findNewestGlbOutput(rootDir: string, minMtimeMs: number, preferredDir?: string | null): Promise<string | null> {
  const normalizedPreferredDir = preferredDir ? path.resolve(preferredDir) : null;
  const queue = [normalizedPreferredDir ?? rootDir];
  const matches: Array<{ filePath: string; mtimeMs: number }> = [];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) {
      continue;
    }

    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = (await readdir(currentDir, { withFileTypes: true })) as Array<{
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }>;
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".glb")) {
        continue;
      }

      try {
        const fileStat = await stat(fullPath);
        if (fileStat.mtimeMs >= minMtimeMs) {
          matches.push({ filePath: fullPath, mtimeMs: fileStat.mtimeMs });
        }
      } catch {
        continue;
      }
    }
  }

  const filteredMatches =
    matches.length > 0 || !normalizedPreferredDir
      ? matches
      : [];
  const newest = filteredMatches.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (newest) {
    return newest.filePath;
  }

  if (normalizedPreferredDir) {
    return findNewestGlbOutput(rootDir, minMtimeMs);
  }

  const fallbackNewest = matches.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  return fallbackNewest?.filePath ?? null;
}

async function importLocalModelAsset(jobId: string, sourcePath: string, dataDir: string) {
  await mkdir(path.join(dataDir, "outputs", jobId), { recursive: true });
  const target = outputPath(dataDir, jobId, path.basename(sourcePath));
  await copyFile(sourcePath, target);
  const relativePath = path.relative(dataDir, target);

  await prisma.asset.create({
    data: {
      jobId,
      type: "model" as never,
      mimeType: "model/gltf-binary",
      filePath: relativePath,
      thumbnailPath: null
    }
  });

  return [{ target, relativePath, type: "model" as const }];
}

async function persistGeneratedModelBuffer(jobId: string, buffer: Uint8Array, dataDir: string, filename = "model.glb") {
  await mkdir(path.join(dataDir, "outputs", jobId), { recursive: true });
  const target = outputPath(dataDir, jobId, filename);
  await writeFile(target, buffer);
  const relativePath = path.relative(dataDir, target);

  await prisma.asset.create({
    data: {
      jobId,
      type: "model" as never,
      mimeType: "model/gltf-binary",
      filePath: relativePath,
      thumbnailPath: null
    }
  });

  return [{ target, relativePath, type: "model" as const }];
}

function resolveComfyInputPath(filename: string) {
  return path.join(env.COMFY_INPUT_DIR, path.basename(filename));
}

function getHunyuanRenderPresetSettings(modelConfig: ModelConfig | null | undefined) {
  switch (modelConfig?.hunyuanRenderPreset) {
    case "fast-preview":
      return {
        id: "fast-preview",
        numInferenceSteps: 24,
        guidanceScale: 4.8,
        octreeResolution: 192
      };
    case "geometry-quality":
      return {
        id: "geometry-quality",
        numInferenceSteps: 40,
        guidanceScale: 5.5,
        octreeResolution: 384
      };
    case "round-objects":
      return {
        id: "round-objects",
        numInferenceSteps: 38,
        guidanceScale: 5,
        octreeResolution: 256
      };
    case "hard-surface":
      return {
        id: "hard-surface",
        numInferenceSteps: 36,
        guidanceScale: 6,
        octreeResolution: 256
      };
    case "balanced":
    default:
      return {
        id: "balanced",
        numInferenceSteps: 30,
        guidanceScale: 5,
        octreeResolution: 256
      };
  }
}

async function runHunyuan3dApiJob(
  jobId: string,
  job: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>>,
  modelConfig: ModelConfig | null,
  phaseDurations: {
    queueWaitMs: number;
    laneWaitMs: number;
    workflowBuildMs: number;
    submitMs: number;
    executionMs: number;
    outputPersistMs: number;
    evaluationMs: number;
  }
) {
  if (!env.HUNYUAN3D_API_URL.trim()) {
    throw new Error("Hunyuan3D API is not configured. Set HUNYUAN3D_API_URL to your official Hunyuan3D-2 server.");
  }

  const sourceImageName = modelConfig?.sourceImageName?.trim();
  if (!sourceImageName) {
    throw new Error("Hunyuan3D requires a source image filename before generation can start.");
  }

  const sourcePath = resolveComfyInputPath(sourceImageName);
  let sourceBuffer: Buffer;
  try {
    sourceBuffer = await readFile(sourcePath);
  } catch {
    throw new Error(
      `Hunyuan3D source image was not found at ${sourcePath}. Upload the image first or check COMFY_INPUT_DIR.`
    );
  }

  const seed = normalizeSeedValue(job.seed) ?? Math.floor(Math.random() * 1_000_000_000);
  const preset = getHunyuanRenderPresetSettings(modelConfig);
  const requestPayload = {
    image: sourceBuffer.toString("base64"),
    seed,
    num_inference_steps: Math.max(1, Math.min(50, Math.round(job.steps || preset.numInferenceSteps))),
    guidance_scale: Number.isFinite(job.cfg) ? job.cfg : preset.guidanceScale,
    octree_resolution: preset.octreeResolution,
    texture: false,
    type: "glb"
  };

  phaseDurations.workflowBuildMs = 0;
  const startedAt = Date.now();
  await updateJobState(jobId, {
    workflowJson: {
      provider: "hunyuan3d-api",
      endpoint: env.HUNYUAN3D_API_URL,
      sourceImageName,
      seed,
      renderPreset: preset.id,
      numInferenceSteps: requestPayload.num_inference_steps,
      guidanceScale: requestPayload.guidance_scale,
      octreeResolution: requestPayload.octree_resolution
    } as Prisma.InputJsonValue,
    comfyPromptId: null,
    progress: 15
  });
  await addLog(jobId, "Submitting job to Hunyuan3D API", "info", {
    endpoint: env.HUNYUAN3D_API_URL,
    sourceImageName,
    seed,
    renderPreset: preset.id,
    numInferenceSteps: requestPayload.num_inference_steps,
    guidanceScale: requestPayload.guidance_scale,
    octreeResolution: requestPayload.octree_resolution
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.HUNYUAN3D_API_TIMEOUT_MS);
  const stopExecutionHeartbeat = createProgressHeartbeat(jobId, 15, 92);

  let response: Response;
  try {
    response = await fetch(`${env.HUNYUAN3D_API_URL.replace(/\/$/, "")}/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Hunyuan3D API wait timeout after ${env.HUNYUAN3D_API_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    stopExecutionHeartbeat();
  }

  phaseDurations.submitMs = Date.now() - startedAt;
  phaseDurations.executionMs = phaseDurations.submitMs;

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Hunyuan3D API failed: ${response.status} ${detail}`);
  }

  await addLog(jobId, "Hunyuan3D API execution completed", "info", {
    executionMs: phaseDurations.executionMs
  });

  const outputStartedAt = Date.now();
  const outputBuffer = new Uint8Array(await response.arrayBuffer());
  const persistedAssets = await persistGeneratedModelBuffer(jobId, outputBuffer, env.DATA_DIR, `${jobId}.glb`);
  phaseDurations.outputPersistMs = Date.now() - outputStartedAt;

  return persistedAssets;
}

const worker = new Worker(
  queueName,
  async (bullJob) => {
    const jobId = String(bullJob.data.jobId);
    const job = await prisma.job.findUnique({
      where: { id: jobId }
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const concurrencyLane = getConcurrencyLane(job.workflow);
    const laneSlot = await acquireConcurrencyLaneSlot(concurrencyLane);

    try {
      const rawModelConfig = (job.modelConfig as ModelConfig | null) ?? null;
      let modelConfig =
        rawModelConfig?.enableRefiner && rawModelConfig?.enableLora
          ? {
              ...rawModelConfig,
              enableRefiner: false
            }
          : rawModelConfig;
      if (job.workflow === "sdxl_openpose_text2img" && !(await hasConfiguredOpenPoseControlNet())) {
        throw new Error(
          `OpenPose ControlNet model is not installed/configured. Add an SDXL OpenPose ControlNet file to ${path.join(
            env.COMFY_MODELS_DIR,
            "controlnet"
          )} and set COMFY_CONTROLNET_OPENPOSE to that filename.`
        );
      }

      if (job.workflow === "sdxl_openpose_text2img" && !modelConfig?.controlImageName?.trim()) {
        modelConfig = await ensureOpenPoseControlImage({
          jobId,
          prompt: job.prompt,
          width: job.width,
          height: job.height,
          modelConfig
        });
        await prisma.job.update({
          where: { id: jobId },
          data: {
            modelConfig: modelConfig as Prisma.InputJsonValue
          }
        });
        await addLog(jobId, "OpenPose control image generated automatically by worker", "info", {
          controlImageName: modelConfig.controlImageName,
          humanPosePresetId: modelConfig.humanPosePresetId,
          controlStrength: modelConfig.controlStrength
        });
      }

      if (modelConfig?.enableRefiner && !(await hasConfiguredRefinerCheckpoint(modelConfig))) {
        const requestedRefinerCheckpoint =
          modelConfig.refinerCheckpointName || env.COMFY_REFINER_CHECKPOINT || null;
        modelConfig = {
          ...modelConfig,
          enableRefiner: false,
          refinerCheckpointName: ""
        };
        await prisma.job.update({
          where: { id: jobId },
          data: {
            modelConfig: modelConfig as Prisma.InputJsonValue
          }
        });
        await addLog(jobId, "Refiner disabled because no valid refiner checkpoint is configured.", "warn", {
          configuredRefinerCheckpoint: requestedRefinerCheckpoint
        });
      }

      const loraStack = getActiveLoraStack(modelConfig);
      const workflowKey = resolveWorkflowKey(job.workflow, modelConfig);
      const workflowCapability = workflowCapabilities[job.workflow as keyof typeof workflowCapabilities];
      const effectiveNegativePrompt =
        job.workflow === "qwen_anime_text2img"
          ? job.negativePrompt
          : buildEffectiveNegativePrompt(job.negativePrompt, modelConfig);
      const phaseStartedAt = {
        pickedAt: Date.now(),
        submitAt: 0,
        executionAt: 0,
        outputAt: 0,
        evaluationAt: 0
      };
      const phaseDurations = {
        queueWaitMs: Date.now() - job.createdAt.getTime(),
        laneWaitMs: laneSlot.waitMs,
        workflowBuildMs: 0,
        submitMs: 0,
        executionMs: 0,
        outputPersistMs: 0,
        evaluationMs: 0
      };

      await updateJobState(jobId, {
        status: "running",
        progress: 5
      });
      await addLog(jobId, "Worker picked job", "info", {
        workflow: job.workflow,
        resolvedWorkflow: workflowKey,
        concurrencyLane,
        laneLimit: workerLaneLimits[concurrencyLane],
        modelConfig,
        loraStack,
        effectiveNegativePrompt,
        queueWaitMs: phaseDurations.queueWaitMs,
        laneWaitMs: phaseDurations.laneWaitMs
      });

      if (modelConfig?.enableLora && loraStack.length === 0) {
        throw new Error("LoRA is enabled but no lora name was provided");
      }

      if (rawModelConfig?.enableRefiner && rawModelConfig?.enableLora) {
        await addLog(jobId, "Refiner disabled automatically because this job also enables a LoRA.", "warn", {
          loraName: rawModelConfig.loraName ?? env.COMFY_LORA_NAME ?? null
        });
      }

      if (job.workflow === "sdxl_inpaint_fix") {
        if (!modelConfig?.sourceImageName?.trim()) {
          throw new Error("Inpaint fix requires a source image filename from your ComfyUI input folder.");
        }
        if (!modelConfig?.maskImageName?.trim()) {
          throw new Error("Inpaint fix requires a separate mask image filename from your ComfyUI input folder.");
        }
      }

      if (job.workflow === "sdxl_openpose_text2img" && !modelConfig?.controlImageName?.trim()) {
        throw new Error("OpenPose workflow requires a control image filename from your ComfyUI input folder.");
      }

      if (job.workflow === "hunyuan3d_image_to_glb" && !modelConfig?.sourceImageName?.trim()) {
        throw new Error("Hunyuan3D requires a source image filename before generation can start.");
      }

      let finalPersistedAssets: Array<{ target: string; relativePath: string; type: "image" | "video" | "model" }> = [];
      let comfyAssetCount = 0;

    if (job.workflow === "hunyuan3d_image_to_glb" && env.HUNYUAN3D_API_URL.trim()) {
      finalPersistedAssets = await runHunyuan3dApiJob(jobId, job, modelConfig, phaseDurations);
    } else {
      const templatePath = path.resolve(workspaceRoot, "workflows", `${workflowKey}.json`);
      const workflowTemplate = JSON.parse(await readFile(templatePath, "utf8")) as Record<string, unknown>;

      if (isWorkflowStub(workflowTemplate)) {
        throw new Error(
          typeof workflowTemplate._todo === "string"
            ? workflowTemplate._todo
            : `${workflowKey} is still a stub workflow. Replace it with a tested ComfyUI export first.`
        );
      }

      const workflowTemplateJson = JSON.stringify(workflowTemplate);
      const checkpointName = resolveCheckpointName(modelConfig);
      const refinerCheckpointName = resolveRefinerCheckpointName(modelConfig);
      if (workflowTemplateJson.includes("{{checkpoint_name}}") && !checkpointName) {
        throw new Error(
          "No valid checkpoint is configured. Set COMFY_CHECKPOINT or a profile-specific checkpoint to an installed ComfyUI checkpoint filename."
        );
      }
      if (workflowTemplateJson.includes("{{refiner_checkpoint_name}}") && !refinerCheckpointName) {
        throw new Error(
          "Refiner workflow selected, but no valid refiner checkpoint is configured. Set COMFY_REFINER_CHECKPOINT to an installed checkpoint filename or disable refiner."
        );
      }

      const workflow = replacePlaceholders(workflowTemplate, {
        prompt: job.prompt,
        negative_prompt: effectiveNegativePrompt,
        checkpoint_name: checkpointName,
        clip_vision_name: env.COMFY_CLIP_VISION_3D,
        output_prefix: `mesh/${jobId}/ComfyUI`,
        sdxl_vae_name: modelConfig?.sdxlVaeName || env.COMFY_SDXL_VAE,
        unet_name: env.COMFY_QWEN_UNET,
        clip_name: env.COMFY_QWEN_CLIP,
        vae_name: env.COMFY_QWEN_VAE,
        controlnet_name: env.COMFY_CONTROLNET_OPENPOSE,
        controlnet_vae_name: modelConfig?.sdxlVaeName || env.COMFY_CONTROLNET_VAE || env.COMFY_SDXL_VAE,
        refiner_checkpoint_name: refinerCheckpointName,
        upscale_model_name: env.COMFY_UPSCALE_MODEL,
        lora_name: loraStack[0]?.name ?? "",
        lora_strength: loraStack[0]?.strength ?? env.COMFY_LORA_STRENGTH,
        lora_name_2: loraStack[1]?.name ?? "",
        lora_strength_2: loraStack[1]?.strength ?? 0.42,
        source_image: modelConfig?.sourceImageName || job.inputImagePath || "",
        mask_image: modelConfig?.maskImageName || "",
        control_image: modelConfig?.controlImageName || "",
        control_strength: modelConfig?.controlStrength ?? 0.8,
        seed: normalizeSeedValue(job.seed) ?? Math.floor(Math.random() * 1_000_000_000),
        seed_2: (normalizeSeedValue(job.seed) ?? Math.floor(Math.random() * 1_000_000_000)) + 1,
        steps: job.steps,
        refine_steps: Math.max(8, Math.round(job.steps * 0.5)),
        refiner_steps: Math.max(8, Math.round(job.steps * 0.35)),
        refiner_start_step: Math.max(1, Math.min(job.steps - 1, Math.round(job.steps * 0.8))),
        refiner_denoise: 0.2,
        cfg: job.cfg,
        sampler_name: job.samplerName,
        scheduler: job.scheduler,
        width: job.width,
        height: job.height,
        denoise: job.denoise ?? "",
        strength: job.strength ?? "",
        input_image: job.inputImagePath ?? ""
      });
      phaseDurations.workflowBuildMs = Date.now() - phaseStartedAt.pickedAt;
      phaseStartedAt.submitAt = Date.now();

      const { promptId, clientId } = await submitWorkflow(
        {
          baseUrl: env.COMFY_URL
        },
        workflow
      );
      phaseDurations.submitMs = Date.now() - phaseStartedAt.submitAt;
      phaseStartedAt.executionAt = Date.now();

      await updateJobState(jobId, {
        comfyPromptId: promptId,
        workflowJson: workflow as Prisma.InputJsonValue,
        progress: 15
      });
      const workflowWaitTimeoutMs = getWorkflowWaitTimeoutMs(job.workflow as CreateJobInput["workflow"]);
      await addLog(jobId, "Workflow submitted to ComfyUI", "info", {
        promptId,
        submitMs: phaseDurations.submitMs,
        waitTimeoutMs: workflowWaitTimeoutMs
      });

      const stopExecutionHeartbeat = createProgressHeartbeat(jobId, 15, 88);
      try {
        await waitForCompletion(
          {
            baseUrl: env.COMFY_URL,
            clientId
          },
          promptId,
          async (progress) => {
            await updateJobState(jobId, {
              progress: Math.max(15, Math.min(88, progress.percent))
            });
          },
          workflowWaitTimeoutMs
        );
      } finally {
        stopExecutionHeartbeat();
      }
      phaseDurations.executionMs = Date.now() - phaseStartedAt.executionAt;

      await addLog(jobId, "ComfyUI execution completed", "info", {
        executionMs: phaseDurations.executionMs
      });

      phaseStartedAt.outputAt = Date.now();
      const assets = await fetchOutputs(
        {
          baseUrl: env.COMFY_URL
        },
        promptId
      );
      comfyAssetCount = assets.length;
      const promptHistory = await fetchPromptHistory(
        {
          baseUrl: env.COMFY_URL
        },
        promptId
      );

      finalPersistedAssets =
        assets.length > 0
          ? await persistAssets(jobId, assets, env.DATA_DIR, env.COMFY_URL)
          : [];

      if (assets.length === 0 && job.workflow === "hunyuan3d_image_to_glb") {
        const preferredOutputDir = path.join(env.COMFY_OUTPUT_DIR, "mesh", jobId);
        await addLog(jobId, "No assets in ComfyUI history, scanning output directory for GLB fallback", "info", {
          outputDir: env.COMFY_OUTPUT_DIR,
          preferredOutputDir,
          executionStartedAt: phaseStartedAt.executionAt || null
        });
        const latestGlb = await findNewestGlbOutput(
          env.COMFY_OUTPUT_DIR,
          phaseStartedAt.executionAt || Date.now() - 10 * 60 * 1000,
          preferredOutputDir
        );
        if (latestGlb) {
          finalPersistedAssets = await importLocalModelAsset(jobId, latestGlb, env.DATA_DIR);
          await addLog(jobId, "Imported GLB from ComfyUI output fallback", "info", {
            source: latestGlb
          });
        } else {
          await addLog(jobId, "No recent GLB file found in ComfyUI output fallback scan", "warn", {
            outputDir: env.COMFY_OUTPUT_DIR,
            preferredOutputDir
          });
        }
      }

      if (assets.length === 0 && finalPersistedAssets.length === 0) {
        await addLog(jobId, "ComfyUI history returned no asset metadata", "warn", {
          promptId,
          historyStatus: promptHistory?.status ?? null,
          historyKeys: promptHistory ? Object.keys(promptHistory) : [],
          historyMeta: promptHistory?.meta ?? null
        });
        await addLog(jobId, "ComfyUI returned no output assets for this job", "error", {
          workflow: job.workflow,
          resolvedWorkflow: workflowKey,
          promptId
        });
        throw new Error(`ComfyUI completed ${workflowKey} without any output assets.`);
      }
      phaseDurations.outputPersistMs = Date.now() - phaseStartedAt.outputAt;
    }

    if (modelConfig?.enableDetailPass && workflowCapability?.supportsDetailPass && !shouldSkipDetailPass(modelConfig)) {
      const baseImage = finalPersistedAssets.find((item) => item.type === "image");
      if (baseImage) {
        await updateJobState(jobId, {
          progress: 92
        });
        await addLog(jobId, "Starting SDXL detail pass", "info", {
          source: baseImage.relativePath,
          denoise: modelConfig.detailPassDenoise ?? 0.18
        });

        const uploadedName = await uploadInputImage(
          {
            baseUrl: env.COMFY_URL
          },
          baseImage.target,
          `detail-${jobId}${path.extname(baseImage.target) || ".png"}`
        );

        const detailWorkflowKey = hasCustomSdxlVae(modelConfig) ? "sdxl_img2img_vae" : "sdxl_img2img";
        const detailTemplatePath = path.resolve(workspaceRoot, "workflows", `${detailWorkflowKey}.json`);
        const detailWorkflowTemplate = JSON.parse(
          await readFile(detailTemplatePath, "utf8")
        ) as Record<string, unknown>;
        const detailCheckpointName = resolveCheckpointName(modelConfig);
        if (!detailCheckpointName) {
          throw new Error(
            "No valid checkpoint is configured for the detail pass. Set COMFY_CHECKPOINT or a profile-specific checkpoint to an installed ComfyUI checkpoint filename."
          );
        }
        const detailWorkflow = replacePlaceholders(detailWorkflowTemplate, {
          prompt: job.prompt,
          negative_prompt: effectiveNegativePrompt,
          checkpoint_name: detailCheckpointName,
          sdxl_vae_name: modelConfig?.sdxlVaeName || env.COMFY_SDXL_VAE,
          seed: (normalizeSeedValue(job.seed) ?? Math.floor(Math.random() * 1_000_000_000)) + 1,
          steps: Math.max(14, Math.round(job.steps * 0.6)),
          cfg: Math.min(job.cfg, 6.5),
          sampler_name: job.samplerName,
          scheduler: job.scheduler,
          denoise: modelConfig.detailPassDenoise ?? 0.18,
          input_image: uploadedName
        });

        const detailSubmission = await submitWorkflow(
          {
            baseUrl: env.COMFY_URL
          },
          detailWorkflow
        );
        await waitForCompletion(
          {
            baseUrl: env.COMFY_URL,
            clientId: detailSubmission.clientId
          },
          detailSubmission.promptId,
          async (progress) => {
            await updateJobState(jobId, {
              progress: Math.max(92, Math.min(99, progress.percent))
            });
          }
        );

        const detailAssets = await fetchOutputs(
          {
            baseUrl: env.COMFY_URL
          },
          detailSubmission.promptId
        );
        const persistedDetailAssets = await persistAssets(jobId, detailAssets, env.DATA_DIR, env.COMFY_URL);
        if (persistedDetailAssets.some((item) => item.type === "image")) {
          finalPersistedAssets = persistedDetailAssets;
          await addLog(jobId, "Detail pass completed", "info", {
            outputs: persistedDetailAssets.length,
            promotedAsFinal: true
          });
        } else {
          await addLog(jobId, "Detail pass produced no final image. Keeping base render.", "warn");
        }
      }
    } else if (modelConfig?.enableDetailPass && shouldSkipDetailPass(modelConfig)) {
      await addLog(jobId, "Detail pass skipped for this cinematic/environment lane to preserve the base render.", "info", {
        renderCategoryId: modelConfig.renderCategoryId ?? null,
        renderStyleRecipeId: modelConfig.renderStyleRecipeId ?? null
      });
    }

    await updateJobState(jobId, {
      status: "succeeded",
      progress: 100
    });
    await addLog(jobId, "Job completed successfully", "info", {
      outputs: finalPersistedAssets.length || comfyAssetCount,
      phaseDurations
    });

    const finalImage = [...finalPersistedAssets].reverse().find((item) => item.type === "image");
    const shouldEvaluateOutput = job.workflow !== "hunyuan3d_image_to_glb";
    const autoRepairEnabled = Boolean(modelConfig?.autoRepairOnLowScore);
    const autoRepairCount = modelConfig?.autoRepairCount ?? 0;
    const autoRepairThreshold = modelConfig?.autoRepairThreshold ?? 62;

    if (!shouldEvaluateOutput) {
      await addLog(jobId, "Render evaluation skipped for Hunyuan3D workflow", "info", {
        workflow: job.workflow
      });
    } else if (finalImage) {
      phaseStartedAt.evaluationAt = Date.now();
      const imageBase64 = await readFile(finalImage.target, "base64").catch(() => undefined);
      const evaluation = await evaluateRenderForAutoRepair({
        workflow: job.workflow as CreateJobInput["workflow"],
        prompt: job.prompt,
        negativePrompt: effectiveNegativePrompt,
        modelConfig: normalizeModelConfig(modelConfig),
        ...(modelConfig?.renderCategoryId ? { renderCategoryId: modelConfig.renderCategoryId } : {}),
        ...(imageBase64 ? { imageBase64 } : {})
      });
      phaseDurations.evaluationMs = Date.now() - phaseStartedAt.evaluationAt;

      await addLog(jobId, "Render quality evaluated", "info", {
        source: evaluation.source,
        overallScore: evaluation.overallScore,
        faceScore: evaluation.faceScore,
        handsScore: evaluation.handsScore,
        compositionScore: evaluation.compositionScore,
        materialScore: evaluation.materialScore,
        issues: evaluation.issues,
        recommendedRepairIds: evaluation.recommendedRepairIds,
        evaluationMs: phaseDurations.evaluationMs
      });
      if (modelConfig?.renderCategoryId) {
        const sourceJobLog = await prisma.jobLog.findFirst({
          where: {
            jobId,
            message: "Auto repair rerun queued"
          },
          orderBy: {
            createdAt: "desc"
          }
        });
        const sourceJobId =
          sourceJobLog && sourceJobLog.meta && typeof (sourceJobLog.meta as Record<string, unknown>).sourceJobId === "string"
            ? ((sourceJobLog.meta as Record<string, unknown>).sourceJobId as string)
            : null;
        const sourceEvaluation = sourceJobId ? await evaluateSourceJobForRepairOutcome(sourceJobId) : null;
        const repairDelta =
          sourceEvaluation && modelConfig.renderLastRepairId ? evaluation.overallScore - sourceEvaluation.overallScore : null;
        const repairFaceDelta =
          sourceEvaluation && modelConfig.renderLastRepairId ? evaluation.faceScore - sourceEvaluation.faceScore : null;
        const repairHandsDelta =
          sourceEvaluation && modelConfig.renderLastRepairId ? evaluation.handsScore - sourceEvaluation.handsScore : null;
        const repairCompositionDelta =
          sourceEvaluation && modelConfig.renderLastRepairId
            ? evaluation.compositionScore - sourceEvaluation.compositionScore
            : null;
        const repairMaterialDelta =
          sourceEvaluation && modelConfig.renderLastRepairId ? evaluation.materialScore - sourceEvaluation.materialScore : null;
        const repairTargetDelta =
          modelConfig.renderLastRepairId === "hand-anatomy-fix" || modelConfig.renderLastRepairId === "feet-anatomy-fix"
            ? repairHandsDelta
            : modelConfig.renderLastRepairId === "face-detail" || modelConfig.renderLastRepairId === "eye-mouth-detail"
              ? repairFaceDelta
              : modelConfig.renderLastRepairId === "subject-separation" ||
                  modelConfig.renderLastRepairId === "reduce-drift" ||
                  modelConfig.renderLastRepairId === "cinematic-polish"
                ? repairCompositionDelta
                : modelConfig.renderLastRepairId === "premium-materials" ||
                    modelConfig.renderLastRepairId === "geometry-cleanup" ||
                    modelConfig.renderLastRepairId === "label-text-safe"
                  ? repairMaterialDelta
                  : repairDelta;
        const repairImproved =
          repairDelta != null || repairTargetDelta != null
            ? (repairDelta ?? 0) >= 3 || (repairTargetDelta ?? 0) >= 3
            : null;

        await recordLearningSample(env.DATA_DIR, {
          jobId,
          categoryId: modelConfig.renderCategoryId,
          styleRecipeId: modelConfig.renderStyleRecipeId ?? null,
          fluxRenderMode: null,
          checkpointProfileId: modelConfig.checkpointProfileId ?? null,
          checkpointName: modelConfig.checkpointName ?? null,
          variantId: modelConfig.renderVariantId ?? "base-balanced",
          variantLabel: modelConfig.renderVariantLabel ?? "Base Balanced",
          candidateLabel: modelConfig.renderCandidateLabel ?? null,
          batchId: modelConfig.renderBatchId ?? null,
          bestInBatch: false,
          selectionWeight: 1,
          workflow: job.workflow,
          primaryLoraName: modelConfig.enableLora ? modelConfig.loraName ?? null : null,
          secondaryLoraNames: modelConfig.enableLora ? (modelConfig.loraChain ?? []).map((entry) => entry.name) : [],
          repairId: modelConfig.renderLastRepairId ?? null,
          repairAttemptCount: modelConfig.renderRepairAttemptCount ?? 0,
          repairDelta,
          repairFaceDelta,
          repairHandsDelta,
          repairCompositionDelta,
          repairMaterialDelta,
          repairImproved,
          runtimeMs:
            phaseDurations.queueWaitMs +
            phaseDurations.laneWaitMs +
            phaseDurations.workflowBuildMs +
            phaseDurations.submitMs +
            phaseDurations.executionMs +
            phaseDurations.outputPersistMs +
            phaseDurations.evaluationMs,
          overallScore: evaluation.overallScore,
          faceScore: evaluation.faceScore,
          handsScore: evaluation.handsScore,
          compositionScore: evaluation.compositionScore,
          materialScore: evaluation.materialScore,
          cfg: job.cfg,
          steps: job.steps,
          detailPass: Boolean(modelConfig.enableDetailPass),
          refiner: Boolean(modelConfig.enableRefiner),
          loraStrength: modelConfig.enableLora ? modelConfig.loraStrength : null,
          issues: evaluation.issues
        });
      }

      const autoRepairPlan = await selectAutoRepairPlan(evaluation, job, modelConfig, {
        sourceImageAvailable: Boolean(finalImage.target)
      });
      if (autoRepairPlan.rankedCandidates.length > 0) {
        await addLog(jobId, "Auto repair strategy evaluated", "info", {
          family: autoRepairPlan.family,
          targets: autoRepairPlan.targets,
          learningScope: autoRepairPlan.learningScope,
          learningPreferredRepairIds: autoRepairPlan.learningPreferredRepairIds,
          learningAvoidRepairIds: autoRepairPlan.learningAvoidRepairIds,
          selectedRepairIds: autoRepairPlan.repairIds,
          rankedCandidates: autoRepairPlan.rankedCandidates.map((candidate) => ({
            repairId: candidate.repairId,
            score: Math.round(candidate.score * 10) / 10,
            learningAdjustedScore: candidate.learningAdjustedScore,
            targets: candidate.targets,
            reasons: candidate.reasons,
            learningSampleCount: candidate.learningSampleCount,
            learningAvgTargetDelta: candidate.learningAvgTargetDelta,
            learningTargetImprovedRate: candidate.learningTargetImprovedRate
          }))
        });
      }
      if (
        autoRepairEnabled &&
        autoRepairCount < 1 &&
        shouldAutoRepairEvaluation(evaluation, modelConfig, autoRepairThreshold) &&
        autoRepairPlan.repairIds.length > 0
      ) {
        const autoRepairJobs = await enqueueAutoRepairJobs(job, autoRepairPlan.repairIds, {
          sourceImagePath: finalImage.target
        });
        await addLog(jobId, autoRepairPlan.repairIds.length > 1 ? "Auto repair candidate batch created" : "Auto repair rerun created", "warn", {
          threshold: autoRepairThreshold,
          overallScore: evaluation.overallScore,
          faceScore: evaluation.faceScore,
          handsScore: evaluation.handsScore,
          compositionScore: evaluation.compositionScore,
          repairFamily: autoRepairPlan.family,
          repairTargets: autoRepairPlan.targets,
          repairIds: autoRepairPlan.repairIds,
          localizedRepairIds: autoRepairPlan.repairIds.filter((repairId) => Boolean(getLocalizedRepairMaskArea(repairId))),
          rerunJobIds: autoRepairJobs.map((repairJob) => repairJob.id)
        });
      }
    }

      if (modelConfig?.renderBatchId && (modelConfig.renderBatchSize ?? 1) > 1) {
        await resolveCandidateBatchIfReady(modelConfig.renderBatchId);
      }
    } finally {
      laneSlot.release();
    }
  },
  {
    connection: redisConnection,
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: env.WORKER_LOCK_DURATION_MS,
    stalledInterval: env.WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: env.WORKER_MAX_STALLED_COUNT
  }
);

worker.on("failed", async (bullJob, error) => {
  const jobId = bullJob?.data.jobId ? String(bullJob.data.jobId) : undefined;
  if (!jobId) {
    return;
  }

  await updateJobState(jobId, {
    status: "failed",
    errorMessage: error.message
  });
  await addLog(jobId, "Job failed", "error", { error: error.message });

  const failedJob = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      modelConfig: true
    }
  });
  const modelConfig = (failedJob?.modelConfig as ModelConfig | null) ?? null;
  if (modelConfig?.renderBatchId && (modelConfig.renderBatchSize ?? 1) > 1) {
    await resolveCandidateBatchIfReady(modelConfig.renderBatchId).catch(async (resolveError) => {
      await addLog(jobId, "Candidate batch resolution after failure failed", "warn", {
        error: resolveError instanceof Error ? resolveError.message : String(resolveError)
      });
    });
  }
});

console.log("Worker listening for generation jobs");
