import presets from "./prompt-templates.json" with { type: "json" };

import {
  checkpointProfileIds,
  composePromptInputSchema,
  composePromptResultSchema,
  renderEvaluationInputSchema,
  renderEvaluationSchema,
  type ComposePromptInput,
  type CheckpointProfileId,
  type ComposePromptResult,
  type RenderEvaluation,
  type RenderEvaluationInput
} from "@repo/shared";

const systemPrompt = `You are a prompt engineer for local image and video generation.
Return only JSON with keys: prompt, negativePrompt, params, safetyNotes.
params must contain: prompt, negativePrompt, seed, steps, cfg, samplerName, scheduler, width, height.
You may also return modelProfileId.
Keep prompt concise but production-ready.
Always write prompt and negativePrompt in English, even if the user writes in Italian or another language.
Treat the user's language only as input context. The final generation prompt package must always be English.
If prompt diagnostics are provided, actively repair weak structure: make the subject explicit, reduce prompt noise, add one clear lighting cue, and keep the result coherent rather than verbose.
For human subjects, favor one clearly defined person unless the request explicitly asks for multiple people. Do not merge subjects, body parts, props, clothing, or background elements.`;

export type OllamaClientOptions = {
  baseUrl: string;
  model: string;
  visionModel?: string;
};

type PresetConfig = {
  promptScaffold: string;
  negativePrompt: string;
};

const promptTemplates = presets as Record<string, PresetConfig>;
const defaultPreset: PresetConfig = {
  promptScaffold: "cinematic lighting, dramatic composition, rich environmental detail, clean focal subject",
  negativePrompt: "lowres, blurry, distorted anatomy, extra limbs, text, watermark"
};

function maybeNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
}

function splitCommaBlocks(value: unknown) {
  return typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function mergeCommaBlocks(...groups: Array<readonly string[]>) {
  return Array.from(new Set(groups.flat())).join(", ");
}

function clampNumericParam(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

function mentionsHumanSubject(text: string) {
  return /\b(person|people|portrait|woman|man|women|men|model|face|eyes|mouth|hands|feet|full-body|full body|fashion|character|persona|persone|ritratto|donna|uomo|volto|occhi|bocca|mani|piedi)\b/i.test(
    text
  );
}

function allowsMultipleHumans(text: string) {
  return /\b(two|three|four|couple|pair|group|crowd|family|team|people|men|women|due|tre|coppia|gruppo|famiglia)\b/i.test(
    text
  );
}

function wantsReadableText(text: string) {
  return /\b(text|typography|label|logo|brand|packaging|letters?|word|headline|title|signage|sign|poster|printed|testo|etichetta|scritta|lettere|titolo)\b/i.test(
    text
  );
}

function removeTextSuppressors(blocks: readonly string[], allowText: boolean) {
  if (!allowText) {
    return blocks;
  }

  return blocks.filter((block) => !["text", "logo"].includes(block.toLowerCase()));
}

function humanPromptGuardrails(text: string) {
  const subjectBlocks = allowsMultipleHumans(text)
    ? ["clearly separated human subjects", "no overlapping bodies", "clean silhouette separation"]
    : ["single focal human subject", "one uninterrupted body", "clean silhouette"];

  return [
    ...subjectBlocks,
    "natural human anatomy",
    "stable facial proportions",
    "natural eye symmetry",
    "clean mouth anatomy",
    "relaxed believable hands if visible",
    "grounded photoreal lighting"
  ];
}

const humanNegativeGuardrails = [
  "duplicate subject",
  "duplicate body",
  "fused bodies",
  "merged limbs",
  "extra arms",
  "extra legs",
  "extra fingers",
  "fused fingers",
  "deformed face",
  "dead eyes",
  "crossed eyes",
  "warped mouth",
  "melted teeth",
  "waxy skin",
  "muddy details",
  "blurry mass"
];

function inferModelProfile(userText: string, preset: ComposePromptInput["preset"]): CheckpointProfileId {
  if (/\b(goku|anime|manga|cel[- ]shaded|illustration|dragon ball|stylized character)\b/i.test(userText)) {
    return "anime";
  }

  const hasHumanSubject = mentionsHumanSubject(userText);

  if (/\b(product|packshot|bottle|watch|shoe|perfume|chair|object render)\b/i.test(userText) && !hasHumanSubject) {
    return "product";
  }

  if (
    hasHumanSubject ||
    /\b(photo|photoreal|realistic portrait|studio portrait|documentary|editorial photo|fotorealistico|fotorealismo|ritratto realistico)\b/i.test(
      userText
    )
  ) {
    return "photoreal-sdxl";
  }

  if (preset === "anime") {
    return "anime";
  }

  if (preset === "product-shot") {
    return "product";
  }

  if (preset === "photoreal" || preset === "editorial") {
    return "photoreal-sdxl";
  }

  return "general";
}

export async function composePrompt(
  options: OllamaClientOptions,
  input: ComposePromptInput
): Promise<ComposePromptResult> {
  const parsed = composePromptInputSchema.parse(input);
  const preset = promptTemplates[parsed.preset] ?? promptTemplates.cinematic ?? defaultPreset;
  const diagnostics = parsed.diagnostics ?? [];

  const userPrompt = [
    `User request: ${parsed.userText}`,
    `Style preset: ${parsed.preset}`,
    `Prompt scaffold: ${preset.promptScaffold}`,
    `Negative prompt hints: ${preset.negativePrompt}`,
    parsed.promptScore
      ? `Prompt score: ${parsed.promptScore.label} (${parsed.promptScore.score}/100)`
      : null,
    diagnostics.length > 0
      ? `Diagnostics to address:\n${diagnostics
          .map((diagnostic) => `- [${diagnostic.severity}] ${diagnostic.title}: ${diagnostic.detail}`)
          .join("\n")}`
      : null,
    "Default params: steps 30, cfg 7, samplerName dpmpp_2m, scheduler karras, width 1024, height 1024.",
    `Available modelProfileId values: ${checkpointProfileIds.join(", ")}.`,
    "Prefer a single clear subject, controlled composition, one lighting statement, and no bloated adjective chains.",
    "For photoreal human prompts, keep CFG modest, avoid dense surreal mixtures, and include negative terms for duplicate body, fused bodies, extra limbs, malformed hands, dead eyes, warped mouth, and muddy details.",
    "For readable product text, keep labels front-facing and simple; avoid tiny typography and fake clutter.",
    "Output prompt and negativePrompt in English only.",
    "Ensure safetyNotes mention copyrighted characters, public figures, and NSFW risk when relevant."
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`${options.baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      stream: false,
      format: "json",
      system: systemPrompt,
      prompt: userPrompt
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama compose failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as { response?: string };
  const content = payload.response ?? "{}";
  let candidate: Record<string, unknown>;

  try {
    candidate = JSON.parse(content) as Record<string, unknown>;
  } catch {
    candidate = {};
  }

  candidate.prompt ??= `English production prompt based on: ${parsed.userText}, ${preset.promptScaffold}`;
  candidate.negativePrompt ??= preset.negativePrompt;
  candidate.modelProfileId ??= inferModelProfile(parsed.userText, parsed.preset);
  const requestedText = `${parsed.userText} ${typeof candidate.prompt === "string" ? candidate.prompt : ""}`;
  const isHumanPrompt = mentionsHumanSubject(requestedText) && candidate.modelProfileId !== "anime";
  const isReadableTextPrompt = wantsReadableText(requestedText);

  if (isHumanPrompt) {
    candidate.modelProfileId = "photoreal-sdxl";
    candidate.prompt = mergeCommaBlocks(splitCommaBlocks(candidate.prompt).slice(0, 9), humanPromptGuardrails(requestedText));
    candidate.negativePrompt = mergeCommaBlocks(
      removeTextSuppressors(splitCommaBlocks(candidate.negativePrompt), isReadableTextPrompt),
      humanNegativeGuardrails
    );
  } else if (isReadableTextPrompt) {
    candidate.negativePrompt = mergeCommaBlocks(
      removeTextSuppressors(splitCommaBlocks(candidate.negativePrompt), true),
      ["gibberish letters", "misspelled text", "warped typography", "tiny fake text", "logo clutter"]
    );
  }

  if (typeof candidate.safetyNotes === "string") {
    candidate.safetyNotes = candidate.safetyNotes
      .split(/\n|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  candidate.safetyNotes ??= [];
  const params = (candidate.params as Record<string, unknown> | undefined) ?? {
    prompt: candidate.prompt,
    negativePrompt: candidate.negativePrompt,
    steps: 30,
    cfg: 7,
    samplerName: "dpmpp_2m",
    scheduler: "karras",
    width: 1024,
    height: 1024,
    seed: Math.floor(Math.random() * 1_000_000_000)
  };
  params.prompt = candidate.prompt;
  params.negativePrompt = candidate.negativePrompt;
  params.seed = maybeNumber(params.seed);
  params.steps ??= 30;
  params.steps = maybeNumber(params.steps);
  params.cfg ??= 7;
  params.cfg = maybeNumber(params.cfg);
  params.samplerName ??= "dpmpp_2m";
  params.scheduler ??= "karras";
  params.width ??= 1024;
  params.width = maybeNumber(params.width);
  params.height ??= 1024;
  params.height = maybeNumber(params.height);
  params.denoise = maybeNumber(params.denoise);
  params.strength = maybeNumber(params.strength);
  if (isHumanPrompt) {
    params.steps = clampNumericParam(params.steps, 30, 36, 32);
    params.cfg = clampNumericParam(params.cfg, 4.9, 5.8, 5.4);
    params.samplerName = "dpmpp_2m_sde";
    params.scheduler = "karras";
    if (params.width === params.height || typeof params.width !== "number" || typeof params.height !== "number") {
      params.width = 832;
      params.height = 1216;
    }
  } else if (isReadableTextPrompt) {
    params.cfg = clampNumericParam(params.cfg, 4.7, 5.6, 5.1);
  }
  candidate.params = params;

  return composePromptResultSchema.parse(candidate);
}

export function listPromptTemplates() {
  return promptTemplates;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const supportedRepairIds = [
  "face-detail",
  "eye-mouth-detail",
  "hand-anatomy-fix",
  "feet-anatomy-fix",
  "reduce-drift",
  "geometry-cleanup",
  "premium-materials",
  "label-text-safe",
  "subject-separation",
  "cinematic-polish",
  "anime-clean-linework",
  "anime-detail-boost",
  "generic-detail-boost"
] as const;

function normalizeRepairIds(repairIds: string[]) {
  const supported = new Set<string>(supportedRepairIds);
  return Array.from(
    new Set(
      repairIds
        .map((repairId) => repairId.trim())
        .map((repairId) => (repairId === "hands-detail" ? "hand-anatomy-fix" : repairId))
        .map((repairId) => (repairId === "foot-detail" || repairId === "feet-detail" ? "feet-anatomy-fix" : repairId))
        .map((repairId) => (repairId === "text-cleanup" || repairId === "label-cleanup" ? "label-text-safe" : repairId))
        .filter((repairId) => supported.has(repairId))
    )
  );
}

function isStructuredHumanLane(modelConfig: RenderEvaluationInput["modelConfig"]) {
  return (
    modelConfig?.humanStructureMode === "full-body" ||
    modelConfig?.humanStructureMode === "action" ||
    modelConfig?.renderStyleRecipeId === "human-structure"
  );
}

function heuristicRenderEvaluation(input: RenderEvaluationInput): RenderEvaluation {
  const parsed = renderEvaluationInputSchema.parse(input);
  const prompt = parsed.prompt.toLowerCase();
  const modelConfig = parsed.modelConfig ?? null;
  const structuredHumanLane = isStructuredHumanLane(modelConfig);
  const issues: string[] = [];
  let faceScore = 62;
  let handsScore = 58;
  let compositionScore = 64;
  let materialScore = 60;
  const categoryId = parsed.renderCategoryId ?? "";
  const isHumanCategory = [
    "beauty-closeup",
    "editorial-portrait",
    "fashion-editorial",
    "cinematic-still",
    "cinematic-action"
  ].includes(categoryId);
  const isProductCategory = ["product-hero-shot", "macro-product", "food-editorial"].includes(categoryId);
  const mentionsFeet = /\b(feet|foot|shoe|shoes|heels|boots|ankle|toes|full-body|full body)\b/.test(prompt);
  const mentionsText = /\b(text|typography|label|logo|brand|packaging|letters|word|headline|title)\b/.test(prompt);

  if (/\bportrait|beauty|editorial|fashion|face|close-up|close up\b/.test(prompt)) {
    faceScore += 10;
    compositionScore += 4;
  }

  if (isHumanCategory) {
    faceScore -= 4;
    issues.push("Human detail needs strict checking for eyes, mouth, hands, and feet.");
  }

  if (structuredHumanLane && isHumanCategory) {
    handsScore -= 14;
    compositionScore -= modelConfig?.humanStructureMode === "action" ? 10 : 7;
    issues.push("Structured human lane active: prioritize limb separation, stable pose, and readable silhouette.");
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

  if (modelConfig?.enableDetailPass) {
    faceScore += isHumanCategory ? 2 : 6;
    materialScore += isProductCategory && mentionsText ? 1 : 6;
    if (structuredHumanLane && isHumanCategory) {
      handsScore -= 4;
      compositionScore -= 3;
      issues.push("Global detail pass can amplify malformed hands or limbs in the structured human lane.");
    }
    if (isHumanCategory && (modelConfig.detailPassDenoise ?? 0.18) > 0.14) {
      faceScore -= 5;
      issues.push("Detail pass denoise is high for human facial detail and may look artificial.");
    }
  } else {
    issues.push("Detail pass is off, so micro-detail may be softer.");
  }

  if (modelConfig?.enableRefiner) {
    compositionScore += 4;
  }

  if (modelConfig?.enableLora) {
    const loraStrength = modelConfig.loraStrength ?? 0.8;
    if (loraStrength > 0.72) {
      compositionScore -= 8;
      faceScore -= 6;
      issues.push("LoRA strength is high and may overpower subject coherence.");
    }
    if (loraStrength < 0.45) {
      materialScore -= 4;
    }
  }

  if (parsed.workflow === "qwen_anime_text2img") {
    faceScore += 6;
    handsScore += 4;
    materialScore -= 8;
  }

  if ((parsed.renderCategoryId ?? "").includes("product")) {
    materialScore += 8;
  }

  if ((parsed.renderCategoryId ?? "").includes("anime")) {
    handsScore += 4;
    faceScore += 4;
  }

  const overallScore = clampScore((faceScore + handsScore + compositionScore + materialScore) / 4);
  const recommendedRepairIds: string[] = [];

  if (faceScore < 68 && isHumanCategory) {
    recommendedRepairIds.push("eye-mouth-detail", "face-detail", "reduce-drift");
  } else if (faceScore < 64) {
    recommendedRepairIds.push("face-detail", "reduce-drift");
  }
  if (handsScore < 64 && isHumanCategory) {
    recommendedRepairIds.push("hand-anatomy-fix", ...(mentionsFeet ? ["feet-anatomy-fix"] : []), "reduce-drift");
  } else if (handsScore < 60) {
    recommendedRepairIds.push("anime-clean-linework", "reduce-drift");
  }
  if (structuredHumanLane && isHumanCategory) {
    if (handsScore < 82) {
      recommendedRepairIds.push("hand-anatomy-fix", ...(mentionsFeet ? ["feet-anatomy-fix"] : []), "reduce-drift");
    }
    if (compositionScore < 78) {
      recommendedRepairIds.push("subject-separation", "reduce-drift");
    }
  }
  if (isProductCategory && mentionsText) {
    recommendedRepairIds.push("label-text-safe", "geometry-cleanup");
  } else if (materialScore < 64) {
    recommendedRepairIds.push("geometry-cleanup", "premium-materials");
  }
  if (compositionScore < 64) {
    recommendedRepairIds.push("subject-separation", "cinematic-polish", "reduce-drift");
  }

  return renderEvaluationSchema.parse({
    source: "heuristic",
    summary:
      overallScore >= 78
        ? "Render settings are in a strong range for this category."
        : overallScore >= 62
          ? "Render looks workable but has at least one quality risk worth refining."
          : "Render is likely to benefit from an immediate repair pass.",
    overallScore,
    faceScore: clampScore(faceScore),
    handsScore: clampScore(handsScore),
    compositionScore: clampScore(compositionScore),
    materialScore: clampScore(materialScore),
    confidence: 0.42,
    issues: Array.from(new Set(issues)),
    recommendedRepairIds: normalizeRepairIds(recommendedRepairIds)
  });
}

export async function evaluateRender(
  options: OllamaClientOptions,
  input: RenderEvaluationInput
): Promise<RenderEvaluation> {
  const parsed = renderEvaluationInputSchema.parse(input);

  if (!options.visionModel || !parsed.imageBase64) {
    return heuristicRenderEvaluation(parsed);
  }

  const system = `You are an image quality reviewer for local generative image workflows.
Return only JSON with keys:
summary, overallScore, faceScore, handsScore, compositionScore, materialScore, confidence, issues, recommendedRepairIds.
Scores must be 0-100. confidence must be 0-1.
issues must be short actionable strings.
recommendedRepairIds must only use ids from this list when relevant:
${supportedRepairIds.join(", ")}.`;

  const prompt = [
    `Workflow: ${parsed.workflow}`,
    `Render category: ${parsed.renderCategoryId ?? "unknown"}`,
    `Prompt: ${parsed.prompt}`,
    `Negative prompt: ${parsed.negativePrompt}`,
    `Model config: ${JSON.stringify(parsed.modelConfig ?? {})}`,
    "Evaluate the generated image for facial quality, hands, composition, and material fidelity."
  ].join("\n");

  try {
    const response = await fetch(`${options.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.visionModel,
        stream: false,
        format: "json",
        system,
        prompt,
        images: [parsed.imageBase64]
      })
    });

    if (!response.ok) {
      return heuristicRenderEvaluation(parsed);
    }

    const payload = (await response.json()) as { response?: string };
    const candidate = JSON.parse(payload.response ?? "{}") as Record<string, unknown>;
    candidate.source = "vision";
    candidate.issues ??= [];
    const visionRepairIds = Array.isArray(candidate.recommendedRepairIds)
      ? normalizeRepairIds(candidate.recommendedRepairIds.filter((item): item is string => typeof item === "string"))
      : [];
    const visionHandsScore = typeof candidate.handsScore === "number" ? candidate.handsScore : 100;
    const visionCompositionScore = typeof candidate.compositionScore === "number" ? candidate.compositionScore : 100;
    const structuredHumanLane = isStructuredHumanLane(parsed.modelConfig);
    const isHumanCategory = [
      "beauty-closeup",
      "editorial-portrait",
      "fashion-editorial",
      "cinematic-still",
      "cinematic-action"
    ].includes(parsed.renderCategoryId ?? "");
    const mentionsFeet = /\b(feet|foot|shoe|shoes|heels|boots|ankle|toes|full-body|full body)\b/i.test(parsed.prompt);

    if (structuredHumanLane && isHumanCategory) {
      if (visionHandsScore < 82) {
        visionRepairIds.unshift("hand-anatomy-fix", ...(mentionsFeet ? ["feet-anatomy-fix"] : []), "reduce-drift");
      }
      if (visionCompositionScore < 78) {
        visionRepairIds.unshift("subject-separation", "reduce-drift");
      }
    }
    candidate.recommendedRepairIds = normalizeRepairIds(visionRepairIds);

    return renderEvaluationSchema.parse(candidate);
  } catch {
    return heuristicRenderEvaluation(parsed);
  }
}
