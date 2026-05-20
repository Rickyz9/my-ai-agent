import { access } from "node:fs/promises";
import path from "node:path";

import { Queue } from "bullmq";

import { Prisma, prisma } from "@repo/db";
import { buildHumanPoseControlImage, resolveHumanPosePresetId, uploadInputBuffer } from "@repo/comfy";
import { modelConfigSchema, queueName, type CreateJobInput } from "@repo/shared";

import { env } from "../lib/config.js";
import { redisConnection } from "../queue/connection.js";
import { loadWorkflowTemplate, workflowTemplateUnavailableMessage } from "./workflows.js";

export const jobQueue = new Queue(queueName, {
  connection: redisConnection
});

export class WorkflowUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowUnavailableError";
  }
}

function shouldDisableGlobalDetailPassForModelConfig(modelConfig: Partial<NonNullable<CreateJobInput["modelConfig"]>> | undefined) {
  return (
    modelConfig?.humanStructureMode === "full-body" ||
    modelConfig?.humanStructureMode === "action" ||
    modelConfig?.humanControlMode === "openpose" ||
    ["cinematic-still", "environment-concept", "architectural-interior", "editorial-portrait"].includes(
      modelConfig?.renderCategoryId ?? ""
    ) ||
    modelConfig?.renderStyleRecipeId === "cinematic-grounded" ||
    modelConfig?.renderStyleRecipeId === "human-structure"
  );
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

async function prepareHumanPoseControlInput(input: CreateJobInput): Promise<CreateJobInput> {
  if (input.workflow !== "sdxl_openpose_text2img") {
    return input;
  }

  const modelConfig = modelConfigSchema.parse(input.modelConfig ?? {});
  if (!(await hasConfiguredOpenPoseControlNet())) {
    return {
      ...input,
      workflow: "sdxl_text2img",
      modelConfig: {
        ...modelConfig,
        humanControlMode: "off",
        controlImageName: "",
        enableRefiner: false,
        enableLora: false,
        loraName: "",
        loraChain: [],
        enableDetailPass: false
      }
    };
  }

  if (modelConfig.controlImageName?.trim()) {
    return {
      ...input,
      modelConfig: {
        ...modelConfig,
        humanControlMode: "openpose"
      }
    };
  }

  const presetId = resolveHumanPosePresetId({
    requestedPresetId: modelConfig.humanPosePresetId,
    renderCategoryId: modelConfig.renderCategoryId ?? null,
    humanStructureMode: modelConfig.humanStructureMode,
    prompt: input.params.prompt
  });
  const imageBuffer = buildHumanPoseControlImage(presetId, input.params.width, input.params.height);
  const uploadedName = await uploadInputBuffer(
    {
      baseUrl: env.COMFY_URL
    },
    imageBuffer,
    `codex-human-pose-${presetId}-${input.params.width}x${input.params.height}.png`
  );

  return {
    ...input,
    modelConfig: {
      ...modelConfig,
      humanControlMode: "openpose",
      humanPosePresetId: presetId,
      controlImageName: uploadedName,
      controlStrength:
        modelConfig.controlStrength ??
        (modelConfig.humanStructureMode === "action" || modelConfig.renderCategoryId === "cinematic-action" ? 0.72 : 0.78),
      enableRefiner: false,
      enableLora: false,
      loraName: "",
      loraChain: [],
      enableDetailPass: false
    }
  };
}

export async function enqueueJob(input: CreateJobInput) {
  const preparedInput = await prepareHumanPoseControlInput(input);
  const workflowJson = await loadWorkflowTemplate(preparedInput.workflow);
  const unavailableMessage = workflowTemplateUnavailableMessage(workflowJson, preparedInput.workflow);
  if (unavailableMessage) {
    throw new WorkflowUnavailableError(unavailableMessage);
  }

  const job = await prisma.job.create({
    data: {
      workflow: preparedInput.workflow,
      status: "queued",
      progress: 0,
      prompt: preparedInput.params.prompt,
      negativePrompt: preparedInput.params.negativePrompt,
      seed: preparedInput.params.seed != null ? BigInt(preparedInput.params.seed) : null,
      steps: preparedInput.params.steps,
      cfg: preparedInput.params.cfg,
      samplerName: preparedInput.params.samplerName,
      scheduler: preparedInput.params.scheduler,
      width: preparedInput.params.width,
      height: preparedInput.params.height,
      denoise: preparedInput.params.denoise ?? null,
      strength: preparedInput.params.strength ?? null,
      inputImagePath: preparedInput.inputImagePath ?? null,
      workflowJson: workflowJson as Prisma.InputJsonValue,
      ...(preparedInput.modelConfig
        ? { modelConfig: preparedInput.modelConfig as Prisma.InputJsonValue }
        : {})
    }
  });

  await prisma.jobLog.create({
    data: {
      jobId: job.id,
      message: "Job queued",
      level: "info",
      meta: {
        workflow: preparedInput.workflow,
        humanControlMode: preparedInput.modelConfig?.humanControlMode ?? null,
        humanPosePresetId: preparedInput.modelConfig?.humanPosePresetId ?? null,
        controlImageName: preparedInput.modelConfig?.controlImageName ?? null
      }
    }
  });

  await jobQueue.add(
    queueName,
    { jobId: job.id },
    {
      jobId: job.id,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5_000
      },
      removeOnComplete: 50,
      removeOnFail: 100
    }
  );

  return job;
}

export async function rerunJob(
  sourceJobId: string,
  overrides?: {
    workflow?: CreateJobInput["workflow"];
    params?: Partial<CreateJobInput["params"]>;
    modelConfig?: Partial<NonNullable<CreateJobInput["modelConfig"]>>;
  }
) {
  const source = await prisma.job.findUnique({
    where: { id: sourceJobId }
  });

  if (!source) {
    throw new Error("Source job not found");
  }

  const mergedModelConfig: Partial<NonNullable<CreateJobInput["modelConfig"]>> = {
    ...(((source.modelConfig as CreateJobInput["modelConfig"]) ?? {}) as NonNullable<CreateJobInput["modelConfig"]>),
    ...(overrides?.modelConfig ?? {})
  };

  // Reruns should start a fresh job lineage instead of inheriting stale batch metadata.
  delete mergedModelConfig.renderBatchId;
  delete mergedModelConfig.renderBatchSize;
  delete mergedModelConfig.renderCandidateIndex;
  delete mergedModelConfig.renderCandidateLabel;

  if (shouldDisableGlobalDetailPassForModelConfig(mergedModelConfig)) {
    mergedModelConfig.enableDetailPass = false;
  }

  return enqueueJob({
    workflow: overrides?.workflow ?? (source.workflow as CreateJobInput["workflow"]),
    inputImagePath: source.inputImagePath ?? undefined,
    params: {
      prompt: source.prompt,
      negativePrompt: source.negativePrompt,
      seed: source.seed != null ? Number(source.seed) : undefined,
      steps: source.steps,
      cfg: source.cfg,
      samplerName: source.samplerName,
      scheduler: source.scheduler,
      width: source.width,
      height: source.height,
      denoise: source.denoise ?? undefined,
      strength: source.strength ?? undefined,
      ...(overrides?.params ?? {})
    },
    modelConfig: mergedModelConfig as CreateJobInput["modelConfig"]
  });
}
