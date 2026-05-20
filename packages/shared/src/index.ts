import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);

export const workflowKinds = [
  "sdxl_text2img",
  "qwen_anime_text2img",
  "sdxl_img2img",
  "sdxl_inpaint_fix",
  "sdxl_openpose_text2img",
  "hunyuan3d_image_to_glb",
  "upscale",
  "video_basic"
] as const;
export const selectableWorkflowKinds = [
  "sdxl_text2img",
  "qwen_anime_text2img",
  "sdxl_img2img",
  "sdxl_openpose_text2img",
  "hunyuan3d_image_to_glb",
  "upscale"
] as const satisfies readonly (typeof workflowKinds)[number][];
export const internalWorkflowKinds = ["sdxl_inpaint_fix"] as const satisfies readonly (typeof workflowKinds)[number][];
export const stubWorkflowKinds = ["video_basic"] as const satisfies readonly (typeof workflowKinds)[number][];
export const legacyWorkflowKinds = ["flux_text2img"] as const;
export const workflowLabels = {
  sdxl_text2img: "SDXL Text to Image",
  qwen_anime_text2img: "Qwen Anime Text to Image",
  sdxl_img2img: "SDXL Image to Image",
  sdxl_inpaint_fix: "SDXL Inpaint Fix",
  sdxl_openpose_text2img: "SDXL OpenPose Text to Image",
  hunyuan3d_image_to_glb: "Hunyuan3D Image to GLB",
  upscale: "Upscale",
  video_basic: "Video Basic"
} as const;

export const stylePresets = [
  "cinematic",
  "anime",
  "product-shot",
  "editorial",
  "photoreal"
] as const;

export const negativePromptTags = [
  "lowres",
  "blurry",
  "bad anatomy",
  "bad hands",
  "extra fingers",
  "extra limbs",
  "deformed face",
  "duplicate subject",
  "cropped",
  "out of frame",
  "oversaturated",
  "muddy colors",
  "text",
  "watermark",
  "logo"
] as const;

export const negativePromptPresetMap: Record<(typeof stylePresets)[number], readonly string[]> = {
  cinematic: ["lowres", "blurry", "bad anatomy", "extra limbs", "text", "watermark"],
  anime: ["blurry", "bad hands", "extra fingers", "deformed face", "text", "watermark"],
  "product-shot": ["blurry", "duplicate subject", "cropped", "text", "watermark", "logo"],
  editorial: ["lowres", "oversaturated", "duplicate subject", "cropped", "watermark"],
  photoreal: ["bad anatomy", "bad hands", "extra fingers", "oversaturated", "text", "watermark"]
};

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled"
]);

export const assetTypeSchema = z.enum(["image", "video", "model"]);

export const samplerNames = ["euler", "dpmpp_2m", "dpmpp_2m_sde", "er_sde"] as const;
export const schedulerNames = ["normal", "karras", "sgm_uniform", "simple"] as const;
export const checkpointProfileIds = ["general", "anime", "photoreal", "photoreal-sdxl", "product", "hunyuan3d"] as const;
export const legacyCheckpointProfileIds = ["flux-photoreal"] as const;
export const humanPosePresetIds = [
  "auto",
  "standing-editorial",
  "walking-fashion",
  "running-action",
  "seated-portrait",
  "upper-body-portrait"
] as const;
export const hunyuanRenderPresetIds = [
  "fast-preview",
  "balanced",
  "geometry-quality",
  "round-objects",
  "hard-surface"
] as const;
export const checkpointProfileNegativePromptMap: Record<(typeof checkpointProfileIds)[number], readonly string[]> = {
  general: ["lowres", "blurry", "bad anatomy", "extra limbs", "text", "watermark"],
  anime: [
    "worst quality",
    "low quality",
    "blurry",
    "bad hands",
    "extra fingers",
    "fused fingers",
    "extra limbs",
    "deformed face",
    "asymmetrical eyes",
    "messy aura",
    "text",
    "watermark"
  ],
  photoreal: [
    "cgi look",
    "waxy skin",
    "bad anatomy",
    "bad hands",
    "extra fingers",
    "oversaturated",
    "text",
    "watermark"
  ],
  "photoreal-sdxl": [
    "bad photo",
    "bad photography",
    "cgi look",
    "plastic skin",
    "waxy skin",
    "airbrushed face",
    "bad anatomy",
    "bad proportions",
    "bad hands",
    "extra fingers",
    "fused fingers",
    "dead eyes",
    "face asymmetry",
    "eyes asymmetry",
    "deformed iris",
    "deformed pupils",
    "deformed eyes",
    "deformed mouth",
    "deformed lips",
    "bad teeth",
    "oversharpened skin",
    "oversaturated",
    "text",
    "watermark"
  ],
  product: [
    "blurry",
    "duplicate subject",
    "cropped",
    "warped geometry",
    "messy reflections",
    "text",
    "watermark",
    "logo"
  ],
  hunyuan3d: [
    "blurry",
    "lowres",
    "cropped object",
    "multiple objects",
    "busy background",
    "text",
    "watermark"
  ]
};
export const checkpointProfiles = [
  {
    id: "general",
    label: "General SDXL",
    description: "Safe default for cinematic and editorial prompts.",
    recommendedFor: ["cinematic", "editorial"]
  },
  {
    id: "anime",
    label: "Anime / Stylized",
    description: "For anime characters, cel-shaded action, and stylized illustration prompts.",
    recommendedFor: ["anime"]
  },
  {
    id: "photoreal",
    label: "Photoreal",
    description: "For realistic portraits, environments, and grounded lighting.",
    recommendedFor: ["photoreal"]
  },
  {
    id: "photoreal-sdxl",
    label: "Photoreal SDXL",
    description: "Stronger SDXL realism lane for portraits, cinematic stills, interiors, and grounded editorial work.",
    recommendedFor: ["photoreal", "cinematic", "editorial"]
  },
  {
    id: "product",
    label: "Product / Object",
    description: "For packshots, objects, clean edges, and material fidelity.",
    recommendedFor: ["product-shot"]
  },
  {
    id: "hunyuan3d",
    label: "Hunyuan3D",
    description: "Single-image to 3D mesh generation lane for GLB output.",
    recommendedFor: ["product-shot"]
  }
] as const;
export const workflowCapabilities = {
  sdxl_text2img: {
    recommendedStylePreset: "cinematic",
    supportsPromptCompose: true,
    supportsRefiner: true,
    supportsLora: true,
    supportsDetailPass: true,
    recommendedProfileId: "general",
    recommendedSamplerName: "dpmpp_2m",
    recommendedScheduler: "karras"
  },
  qwen_anime_text2img: {
    recommendedStylePreset: "anime",
    supportsPromptCompose: true,
    supportsRefiner: false,
    supportsLora: false,
    supportsDetailPass: false,
    recommendedProfileId: "anime",
    recommendedSamplerName: "er_sde",
    recommendedScheduler: "simple"
  },
  sdxl_img2img: {
    recommendedStylePreset: "editorial",
    supportsPromptCompose: true,
    supportsRefiner: false,
    supportsLora: false,
    supportsDetailPass: false,
    recommendedProfileId: "general",
    recommendedSamplerName: "dpmpp_2m",
    recommendedScheduler: "karras"
  },
  sdxl_inpaint_fix: {
    recommendedStylePreset: "photoreal",
    supportsPromptCompose: false,
    supportsRefiner: false,
    supportsLora: false,
    supportsDetailPass: false,
    recommendedProfileId: "photoreal-sdxl",
    recommendedSamplerName: "euler",
    recommendedScheduler: "normal"
  },
  sdxl_openpose_text2img: {
    recommendedStylePreset: "editorial",
    supportsPromptCompose: true,
    supportsRefiner: false,
    supportsLora: false,
    supportsDetailPass: false,
    recommendedProfileId: "photoreal-sdxl",
    recommendedSamplerName: "dpmpp_2m_sde",
    recommendedScheduler: "karras"
  },
  hunyuan3d_image_to_glb: {
    recommendedStylePreset: "product-shot",
    supportsPromptCompose: false,
    supportsRefiner: false,
    supportsLora: false,
    supportsDetailPass: false,
    recommendedProfileId: "hunyuan3d",
    recommendedSamplerName: "euler",
    recommendedScheduler: "simple"
  },
  upscale: {
    recommendedStylePreset: "photoreal",
    supportsPromptCompose: false,
    supportsRefiner: false,
    supportsLora: false,
    supportsDetailPass: false,
    recommendedProfileId: "product",
    recommendedSamplerName: "dpmpp_2m",
    recommendedScheduler: "karras"
  },
  video_basic: {
    recommendedStylePreset: "cinematic",
    supportsPromptCompose: false,
    supportsRefiner: false,
    supportsLora: false,
    supportsDetailPass: false,
    recommendedProfileId: "general",
    recommendedSamplerName: "dpmpp_2m",
    recommendedScheduler: "karras"
  }
} as const satisfies Record<
  (typeof workflowKinds)[number],
  {
    recommendedStylePreset: (typeof stylePresets)[number];
    supportsPromptCompose: boolean;
    supportsRefiner: boolean;
    supportsLora: boolean;
    supportsDetailPass: boolean;
    recommendedProfileId: (typeof checkpointProfileIds)[number];
    recommendedSamplerName: (typeof samplerNames)[number];
    recommendedScheduler: (typeof schedulerNames)[number];
  }
>;

export const jobParamsSchema = z.object({
  prompt: z.string().default(""),
  negativePrompt: z.string().default(""),
  seed: z.number().int().nonnegative().optional(),
  steps: z.number().int().min(1).max(150).default(30),
  cfg: z.number().min(1).max(30).default(7),
  samplerName: z.string().default("euler"),
  scheduler: z.string().default("normal"),
  width: z.number().int().min(256).max(2048).default(1024),
  height: z.number().int().min(256).max(2048).default(1024),
  denoise: z.number().min(0).max(1).optional(),
  strength: z.number().min(0).max(1).optional()
});

export const modelConfigSchema = z.object({
  checkpointProfileId: z.enum(checkpointProfileIds).optional(),
  renderProvider: z.enum(["local-comfy", "premium-openai", "premium-ideogram"]).default("local-comfy"),
  renderProviderModel: optionalNonEmptyString,
  renderProviderReason: optionalNonEmptyString,
  humanStructureMode: z.enum(["off", "portrait", "full-body", "action"]).default("off"),
  humanControlMode: z.enum(["auto", "off", "openpose"]).default("auto"),
  humanPosePresetId: z.enum(humanPosePresetIds).default("auto"),
  renderCategoryId: z.string().optional(),
  renderStyleRecipeId: z.string().optional(),
  renderStyleRecipeLabel: z.string().optional(),
  renderVariantId: z.string().optional(),
  renderVariantLabel: z.string().optional(),
  renderBatchId: z.string().optional(),
  renderBatchSize: z.number().int().min(1).max(8).default(1),
  renderCandidateIndex: z.number().int().min(1).max(8).optional(),
  renderCandidateLabel: z.string().optional(),
  renderRepairAttemptCount: z.number().int().min(0).max(12).default(0),
  renderLastRepairId: z.string().optional(),
  autoRepairOnLowScore: z.boolean().default(false),
  autoRepairThreshold: z.number().min(0).max(100).default(62),
  autoRepairCount: z.number().int().min(0).max(3).default(0),
  evaluationMode: z.enum(["vision", "heuristic"]).optional(),
  optimizationMode: z.enum(["quality-first", "balanced", "fast-iterate", "low-memory"]).optional(),
  hunyuanRenderPreset: z.enum(hunyuanRenderPresetIds).optional(),
  fluxRenderMode: z.enum(["fast", "quality"]).optional(),
  checkpointName: optionalNonEmptyString,
  sourceImageName: optionalNonEmptyString,
  maskImageName: optionalNonEmptyString,
  controlImageName: optionalNonEmptyString,
  controlStrength: z.number().min(0).max(1.5).default(0.8),
  enableRefiner: z.boolean().default(false),
  refinerCheckpointName: optionalNonEmptyString,
  sdxlVaeName: optionalNonEmptyString,
  negativeEmbeddingName: optionalNonEmptyString,
  enableLora: z.boolean().default(false),
  loraName: optionalNonEmptyString,
  loraStrength: z.number().min(0).max(2).default(0.8),
  loraChain: z
    .array(
      z.object({
        name: z.string().min(1),
        strength: z.number().min(0).max(2)
      })
    )
    .max(1)
    .default([]),
  enableDetailPass: z.boolean().default(false),
  detailPassDenoise: z.number().min(0.05).max(0.6).default(0.18)
});

export const composePromptInputSchema = z.object({
  userText: z.string().min(3),
  preset: z.enum(stylePresets).default("cinematic"),
  promptScore: z
    .object({
      label: z.enum(["Weak", "Usable", "Strong"]),
      score: z.number().min(0).max(100)
    })
    .optional(),
  diagnostics: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        detail: z.string(),
        severity: z.enum(["warn", "info"])
      })
    )
    .optional()
});

export const composePromptResultSchema = z.object({
  prompt: z.string(),
  negativePrompt: z.string(),
  params: jobParamsSchema,
  modelProfileId: z.enum(checkpointProfileIds).optional(),
  safetyNotes: z.array(z.string()).default([])
});

export const renderEvaluationInputSchema = z.object({
  workflow: z.enum(workflowKinds),
  renderCategoryId: z.string().optional(),
  prompt: z.string(),
  negativePrompt: z.string().default(""),
  modelConfig: modelConfigSchema.nullable().optional(),
  imageBase64: z.string().optional()
});

export const renderEvaluationSchema = z.object({
  source: z.enum(["vision", "heuristic"]),
  summary: z.string(),
  overallScore: z.number().min(0).max(100),
  faceScore: z.number().min(0).max(100),
  handsScore: z.number().min(0).max(100),
  compositionScore: z.number().min(0).max(100),
  materialScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string()).default([]),
  recommendedRepairIds: z.array(z.string()).default([])
});

export const createJobInputSchema = z.object({
  workflow: z.enum(workflowKinds),
  inputImagePath: z.string().optional(),
  params: jobParamsSchema,
  modelConfig: modelConfigSchema.optional()
});

export const rerunJobInputSchema = z.object({
  sourceJobId: z.string().cuid(),
  workflow: z.enum(workflowKinds).optional(),
  params: jobParamsSchema.partial().optional(),
  modelConfig: modelConfigSchema.partial().optional()
});

const responseWorkflowSchema = z.union([z.enum(workflowKinds), z.enum(legacyWorkflowKinds)]);
const responseCheckpointProfileSchema = z.union([z.enum(checkpointProfileIds), z.enum(legacyCheckpointProfileIds)]);
const responseModelConfigSchema = modelConfigSchema.extend({
  checkpointProfileId: responseCheckpointProfileSchema.optional()
});

export const jobListItemSchema = z.object({
  id: z.string().cuid(),
  workflow: responseWorkflowSchema,
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
  previewPath: z.string().nullable(),
  prompt: z.string()
});

export const assetSchema = z.object({
  id: z.string().cuid(),
  jobId: z.string().cuid(),
  type: assetTypeSchema,
  mimeType: z.string(),
  filePath: z.string(),
  thumbnailPath: z.string().nullable(),
  createdAt: z.string()
});

export const jobLogSchema = z.object({
  id: z.string().cuid(),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  createdAt: z.string(),
  meta: z.record(z.any()).nullable()
});

export const jobDetailSchema = jobListItemSchema.extend({
  comfyPromptId: z.string().nullable(),
  workflowJson: z.unknown().nullable(),
  params: jobParamsSchema,
  modelConfig: responseModelConfigSchema.nullable(),
  assets: z.array(assetSchema),
  logs: z.array(jobLogSchema),
  errorMessage: z.string().nullable()
});

export const relatedJobSummarySchema = z.object({
  id: z.string().cuid(),
  workflow: responseWorkflowSchema,
  status: jobStatusSchema,
  createdAt: z.string(),
  prompt: z.string(),
  previewPath: z.string().nullable(),
  relation: z.enum(["parent", "child"]),
  trigger: z.string().nullable()
});

export const relatedJobsResponseSchema = z.object({
  parent: relatedJobSummarySchema.nullable(),
  children: z.array(relatedJobSummarySchema)
});

export const candidateBatchJobSchema = z.object({
  id: z.string().cuid(),
  workflow: responseWorkflowSchema,
  status: jobStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  progress: z.number().int().min(0).max(100),
  prompt: z.string(),
  previewPath: z.string().nullable(),
  candidateIndex: z.number().int().min(1),
  candidateLabel: z.string(),
  best: z.boolean(),
  score: z.number().min(0).max(100).nullable()
});

export const candidateBatchResponseSchema = z.object({
  batchId: z.string().nullable(),
  bestJobId: z.string().nullable(),
  jobs: z.array(candidateBatchJobSchema)
});

export const learningCategorySummarySchema = z.object({
  categoryId: z.string(),
  styleRecipeId: z.string().nullable().optional(),
  fluxRenderMode: z.enum(["fast", "quality"]).nullable().optional(),
  sampleCount: z.number().int().min(0),
  avgOverallScore: z.number().min(0).max(100),
  avgRuntimeMs: z.number().min(0),
  avgScorePerSecond: z.number().min(0),
  avgFaceScore: z.number().min(0).max(100),
  avgHandsScore: z.number().min(0).max(100),
  avgCompositionScore: z.number().min(0).max(100),
  avgMaterialScore: z.number().min(0).max(100),
  preferredCfg: z.number().nullable(),
  preferredSteps: z.number().nullable(),
  preferredLoraStrength: z.number().nullable(),
  avoidLoraAbove: z.number().nullable(),
  detailPassBoost: z.boolean(),
  refinerBoost: z.boolean(),
  rankedVariants: z.array(
    z.object({
      variantId: z.string(),
      label: z.string(),
      sampleCount: z.number().int().min(0),
      avgOverallScore: z.number().min(0).max(100),
      avgFaceScore: z.number().min(0).max(100),
      avgCompositionScore: z.number().min(0).max(100),
      recommended: z.boolean()
    })
  ),
  rankedBatchCandidates: z.array(
    z.object({
      candidateLabel: z.string(),
      sampleCount: z.number().int().min(0),
      winCount: z.number().int().min(0),
      winRate: z.number().min(0).max(1),
      avgOverallScore: z.number().min(0).max(100),
      avgFaceScore: z.number().min(0).max(100),
      avgCompositionScore: z.number().min(0).max(100),
      recommended: z.boolean()
    })
  ),
  rankedPrimaryLoras: z.array(
    z.object({
      name: z.string(),
      sampleCount: z.number().int().min(0),
      avgOverallScore: z.number().min(0).max(100),
      recommended: z.boolean()
    })
  ),
  rankedCheckpoints: z.array(
    z.object({
      name: z.string(),
      sampleCount: z.number().int().min(0),
      avgOverallScore: z.number().min(0).max(100),
      recommended: z.boolean()
    })
  ),
  avoidVariantIds: z.array(z.string()),
  avoidDetailPass: z.boolean(),
  avoidRefiner: z.boolean(),
  unsafePrimaryLoras: z.array(z.string()),
  disfavoredCheckpoints: z.array(z.string()),
  regressiveRepairIds: z.array(z.string()),
  repairOutcomes: z.array(
    z.object({
      repairId: z.string(),
      sampleCount: z.number().int().min(0),
      improvedCount: z.number().int().min(0),
      improvedRate: z.number().min(0).max(1),
      avgDelta: z.number(),
      avgFaceDelta: z.number(),
      avgHandsDelta: z.number(),
      avgCompositionDelta: z.number(),
      avgMaterialDelta: z.number(),
      avgTargetDelta: z.number(),
      targetImprovedRate: z.number().min(0).max(1),
      avgRuntimeMs: z.number().min(0),
      recommended: z.boolean(),
      regressive: z.boolean()
    })
  ),
  preferredBatchSize: z.number().int().min(1).max(3),
  repairAggressiveness: z.enum(["conservative", "balanced", "aggressive"]),
  preferredEvaluationMode: z.enum(["vision", "heuristic"]),
  autoRepairEnabled: z.boolean(),
  recommendedAutoRepairThreshold: z.number().min(0).max(100),
  failureNotes: z.array(z.string()),
  topIssues: z.array(z.string()),
  manualPreferredVariantId: z.string().nullable().optional(),
  manualBannedPrimaryLoras: z.array(z.string()),
  manualBannedCheckpoints: z.array(z.string()),
  manualBannedRepairIds: z.array(z.string()),
  lastUpdated: z.string()
});

export const learningSummaryResponseSchema = z.object({
  updatedAt: z.string(),
  totalSamples: z.number().int().min(0),
  categories: z.array(learningCategorySummarySchema),
  styleCategories: z.array(learningCategorySummarySchema)
});

export const learningOverrideInputSchema = z.object({
  categoryId: z.string(),
  styleRecipeId: z.string().nullable().optional(),
  fluxRenderMode: z.enum(["fast", "quality"]).nullable().optional(),
  action: z.enum([
    "promote_variant",
    "clear_promoted_variant",
    "ban_primary_lora",
    "unban_primary_lora",
    "ban_checkpoint",
    "unban_checkpoint",
    "ban_repair",
    "unban_repair",
    "reset_scope"
  ]),
  targetId: z.string().optional()
});

export const learningOverrideResponseSchema = z.object({
  ok: z.boolean(),
  updatedAt: z.string()
});

export const learningDebugResponseSchema = z.object({
  updatedAt: z.string(),
  recordCount: z.number().int().min(0),
  records: z.array(z.record(z.string(), z.unknown()))
});

export const healthResponseSchema = z.object({
  api: z.literal("ok"),
  ollama: z.object({
    ok: z.boolean(),
    detail: z.string()
  }),
  comfy: z.object({
    ok: z.boolean(),
    detail: z.string()
  }),
  redis: z.object({
    ok: z.boolean(),
    detail: z.string()
  }),
  hunyuan3d: z.object({
    configured: z.boolean(),
    ok: z.boolean(),
    detail: z.string()
  })
});

export const runtimeBottleneckSchema = z.object({
  label: z.string(),
  sampleCount: z.number().int().min(0),
  avgQueueWaitMs: z.number().min(0),
  avgLaneWaitMs: z.number().min(0),
  avgWorkflowBuildMs: z.number().min(0),
  avgSubmitMs: z.number().min(0),
  avgExecutionMs: z.number().min(0),
  avgOutputPersistMs: z.number().min(0),
  avgEvaluationMs: z.number().min(0),
  avgTotalRuntimeMs: z.number().min(0)
});

export const runtimeHealthResponseSchema = z.object({
  worker: z.object({
    concurrency: z.number().int().min(1),
    heavyConcurrency: z.number().int().min(1),
    lightConcurrency: z.number().int().min(1)
  }),
  overview: z.object({
    sampledJobs: z.number().int().min(0),
    avgQueueWaitMs: z.number().min(0),
    avgLaneWaitMs: z.number().min(0),
    avgExecutionMs: z.number().min(0),
    avgEvaluationMs: z.number().min(0),
    avgTotalRuntimeMs: z.number().min(0)
  }),
  workflowBottlenecks: z.array(runtimeBottleneckSchema),
  categoryBottlenecks: z.array(runtimeBottleneckSchema)
});

export const modelRegistryEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  envVar: z.string(),
  category: z.string(),
  configuredFile: z.string().nullable(),
  resolvedPath: z.string().nullable(),
  exists: z.boolean(),
  architectureHint: z.string().nullable().optional(),
  required: z.boolean(),
  usedBy: z.array(z.string()),
  availableFiles: z.array(z.string())
});

export const modelRegistryResponseSchema = z.object({
  rootDir: z.string(),
  entries: z.array(modelRegistryEntrySchema)
});

export const queueName = "generation-jobs";

export type WorkflowKind = z.infer<typeof createJobInputSchema>["workflow"];
export type JobParams = z.infer<typeof jobParamsSchema>;
export type ComposePromptInput = z.infer<typeof composePromptInputSchema>;
export type ComposePromptResult = z.infer<typeof composePromptResultSchema>;
export type RenderEvaluationInput = z.infer<typeof renderEvaluationInputSchema>;
export type RenderEvaluation = z.infer<typeof renderEvaluationSchema>;
export type CreateJobInput = z.infer<typeof createJobInputSchema>;
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type RelatedJobSummary = z.infer<typeof relatedJobSummarySchema>;
export type RelatedJobsResponse = z.infer<typeof relatedJobsResponseSchema>;
export type CandidateBatchResponse = z.infer<typeof candidateBatchResponseSchema>;
export type LearningVariantSummary = z.infer<typeof learningCategorySummarySchema>["rankedVariants"][number];
export type LearningCategorySummary = z.infer<typeof learningCategorySummarySchema>;
export type LearningSummaryResponse = z.infer<typeof learningSummaryResponseSchema>;
export type LearningOverrideInput = z.infer<typeof learningOverrideInputSchema>;
export type LearningOverrideResponse = z.infer<typeof learningOverrideResponseSchema>;
export type LearningDebugResponse = z.infer<typeof learningDebugResponseSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type RuntimeHealthResponse = z.infer<typeof runtimeHealthResponseSchema>;
export type ModelRegistryResponse = z.infer<typeof modelRegistryResponseSchema>;
export type StylePreset = (typeof stylePresets)[number];
export type NegativePromptTag = (typeof negativePromptTags)[number];
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type CheckpointProfileId = (typeof checkpointProfileIds)[number];
