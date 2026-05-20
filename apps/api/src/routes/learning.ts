import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { learningDebugResponseSchema, learningOverrideInputSchema, learningOverrideResponseSchema, learningSummaryResponseSchema } from "@repo/shared";

import { env } from "../lib/config.js";

type LearningRecord = {
  createdAt: string;
  jobId: string;
  categoryId: string;
  styleRecipeId: string | null;
  fluxRenderMode: "fast" | "quality" | null;
  checkpointProfileId: string | null;
  checkpointName: string | null;
  variantId: string;
  variantLabel: string;
  candidateLabel: string | null;
  batchId: string | null;
  bestInBatch: boolean;
  selectionWeight: number;
  workflow: string;
  primaryLoraName: string | null;
  secondaryLoraNames: string[];
  repairId: string | null;
  repairAttemptCount: number;
  repairDelta: number | null;
  repairFaceDelta: number | null;
  repairHandsDelta: number | null;
  repairCompositionDelta: number | null;
  repairMaterialDelta: number | null;
  repairImproved: boolean | null;
  runtimeMs: number;
  overallScore: number;
  faceScore: number;
  handsScore: number;
  compositionScore: number;
  materialScore: number;
  cfg: number;
  steps: number;
  detailPass: boolean;
  refiner: boolean;
  loraStrength: number | null;
  issues: string[];
};

type LearningMemoryFile = {
  version: 1;
  updatedAt: string;
  records: LearningRecord[];
};

const learningMemoryPath = path.join(env.DATA_DIR, "learning", "render-learning-memory.json");
const learningOverridesPath = path.join(env.DATA_DIR, "learning", "render-learning-overrides.json");

type LearningScopeOverride = {
  preferredVariantId: string | null;
  bannedPrimaryLoras: string[];
  bannedCheckpoints: string[];
  bannedRepairIds: string[];
};

type LearningOverridesFile = {
  version: 1;
  updatedAt: string;
  scopes: Record<string, LearningScopeOverride>;
};

let learningSummaryCache:
  | {
      cacheKey: string;
      payload: unknown;
    }
  | null = null;

async function loadLearningMemory(): Promise<LearningMemoryFile> {
  try {
    const raw = await readFile(learningMemoryPath, "utf8");
    const parsed = JSON.parse(raw) as LearningMemoryFile;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records.map(normalizeLearningRecord) : []
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: []
    };
  }
}

function normalizeLearningRecord(record: Partial<LearningRecord>) {
  return {
    createdAt: record.createdAt ?? new Date().toISOString(),
    jobId: record.jobId ?? "",
    categoryId: record.categoryId ?? "unknown",
    styleRecipeId: record.styleRecipeId ?? null,
    fluxRenderMode: record.fluxRenderMode === "fast" || record.fluxRenderMode === "quality" ? record.fluxRenderMode : null,
    checkpointProfileId: record.checkpointProfileId ?? null,
    checkpointName: record.checkpointName ?? null,
    variantId: record.variantId ?? "base-balanced",
    variantLabel: record.variantLabel ?? "Base Balanced",
    candidateLabel: record.candidateLabel ?? null,
    batchId: record.batchId ?? null,
    bestInBatch: record.bestInBatch ?? false,
    selectionWeight: typeof record.selectionWeight === "number" ? record.selectionWeight : 1,
    workflow: record.workflow ?? "sdxl_text2img",
    primaryLoraName: record.primaryLoraName ?? null,
    secondaryLoraNames: Array.isArray(record.secondaryLoraNames) ? record.secondaryLoraNames : [],
    repairId: record.repairId ?? null,
    repairAttemptCount: typeof record.repairAttemptCount === "number" ? record.repairAttemptCount : 0,
    repairDelta: typeof record.repairDelta === "number" ? record.repairDelta : null,
    repairFaceDelta: typeof record.repairFaceDelta === "number" ? record.repairFaceDelta : null,
    repairHandsDelta: typeof record.repairHandsDelta === "number" ? record.repairHandsDelta : null,
    repairCompositionDelta: typeof record.repairCompositionDelta === "number" ? record.repairCompositionDelta : null,
    repairMaterialDelta: typeof record.repairMaterialDelta === "number" ? record.repairMaterialDelta : null,
    repairImproved: typeof record.repairImproved === "boolean" ? record.repairImproved : null,
    runtimeMs: typeof record.runtimeMs === "number" && Number.isFinite(record.runtimeMs) ? record.runtimeMs : 0,
    overallScore: typeof record.overallScore === "number" ? record.overallScore : 0,
    faceScore: typeof record.faceScore === "number" ? record.faceScore : 0,
    handsScore: typeof record.handsScore === "number" ? record.handsScore : 0,
    compositionScore: typeof record.compositionScore === "number" ? record.compositionScore : 0,
    materialScore: typeof record.materialScore === "number" ? record.materialScore : 0,
    cfg: typeof record.cfg === "number" ? record.cfg : 0,
    steps: typeof record.steps === "number" ? record.steps : 0,
    detailPass: record.detailPass ?? false,
    refiner: record.refiner ?? false,
    loraStrength: typeof record.loraStrength === "number" ? record.loraStrength : null,
    issues: Array.isArray(record.issues) ? record.issues.filter((issue): issue is string => typeof issue === "string") : []
  } satisfies LearningRecord;
}

function getScopeKey(categoryId: string, styleRecipeId?: string | null, fluxRenderMode?: "fast" | "quality" | null) {
  return `${categoryId}::${styleRecipeId ?? ""}::${fluxRenderMode ?? ""}`;
}

function emptyScopeOverride(): LearningScopeOverride {
  return {
    preferredVariantId: null,
    bannedPrimaryLoras: [],
    bannedCheckpoints: [],
    bannedRepairIds: []
  };
}

async function loadLearningOverrides(): Promise<LearningOverridesFile> {
  try {
    const raw = await readFile(learningOverridesPath, "utf8");
    const parsed = JSON.parse(raw) as LearningOverridesFile;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      scopes: typeof parsed.scopes === "object" && parsed.scopes ? parsed.scopes : {}
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      scopes: {}
    };
  }
}

async function saveLearningOverrides(payload: LearningOverridesFile) {
  await mkdir(path.dirname(learningOverridesPath), { recursive: true });
  await writeFile(learningOverridesPath, JSON.stringify(payload, null, 2), "utf8");
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  if (values.length === 0) {
    return 0;
  }

  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return 0;
  }

  return values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function normalizeVariantRecord(record: LearningRecord) {
  return {
    variantId: record.variantId || "base-balanced",
    variantLabel: record.variantLabel || "Base Balanced"
  };
}

function weightedAverageFor(records: LearningRecord[], predicate: (record: LearningRecord) => boolean) {
  return weightedAverage(
    records
      .filter(predicate)
      .map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))
  );
}

function repairTargetDelta(record: LearningRecord) {
  if (record.repairId === "hand-anatomy-fix" || record.repairId === "feet-anatomy-fix") {
    return record.repairHandsDelta ?? record.repairDelta;
  }

  if (record.repairId === "face-detail" || record.repairId === "eye-mouth-detail") {
    return record.repairFaceDelta ?? record.repairDelta;
  }

  if (record.repairId === "subject-separation" || record.repairId === "reduce-drift" || record.repairId === "cinematic-polish") {
    return record.repairCompositionDelta ?? record.repairDelta;
  }

  if (record.repairId === "premium-materials" || record.repairId === "geometry-cleanup" || record.repairId === "label-text-safe") {
    return record.repairMaterialDelta ?? record.repairDelta;
  }

  return record.repairDelta;
}

function averageRuntime(records: LearningRecord[]) {
  return average(records.map((record) => (typeof record.runtimeMs === "number" && Number.isFinite(record.runtimeMs) ? record.runtimeMs : 0)));
}

export async function registerLearningRoutes(app: FastifyInstance) {
  app.get("/api/learning/summary", async () => {
    const memory = await loadLearningMemory();
    const overrides = await loadLearningOverrides();
    const cacheKey = `${memory.updatedAt}:${memory.records.length}:${overrides.updatedAt}:${Object.keys(overrides.scopes).length}`;
    if (learningSummaryCache?.cacheKey === cacheKey) {
      return learningSummaryResponseSchema.parse(learningSummaryCache.payload);
    }
    const groups = new Map<string, LearningRecord[]>();
    const styleGroups = new Map<string, LearningRecord[]>();

    for (const record of memory.records) {
      const existing = groups.get(record.categoryId) ?? [];
      existing.push(record);
      groups.set(record.categoryId, existing);

      if (record.styleRecipeId || record.fluxRenderMode) {
        const styleKey = `${record.categoryId}::${record.styleRecipeId ?? ""}::${record.fluxRenderMode ?? ""}`;
        const styleExisting = styleGroups.get(styleKey) ?? [];
        styleExisting.push(record);
        styleGroups.set(styleKey, styleExisting);
      }
    }

    const buildSummary = (
      categoryId: string,
      records: LearningRecord[],
      styleRecipeId: string | null = null,
      fluxRenderMode: "fast" | "quality" | null = null
    ) => {
      const scopeOverride = overrides.scopes[getScopeKey(categoryId, styleRecipeId, fluxRenderMode)] ?? emptyScopeOverride();
      const highConfidence = records.filter((record) => record.overallScore >= 70);
      const lowConfidenceLoras = records.filter(
        (record) => typeof record.loraStrength === "number" && record.overallScore < 60
      );
      const issueCounts = new Map<string, number>();
      for (const record of records) {
        for (const issue of record.issues) {
          issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
        }
      }
      const variantGroups = new Map<string, LearningRecord[]>();
      for (const record of records) {
        const variant = normalizeVariantRecord(record);
        const key = `${variant.variantId}::${variant.variantLabel}`;
        const existing = variantGroups.get(key) ?? [];
        existing.push(record);
        variantGroups.set(key, existing);
      }
      const rankedVariants = [...variantGroups.entries()]
        .map(([key, variantRecords]) => {
          const [variantId, label] = key.split("::");
          return {
            variantId,
            label,
            sampleCount: variantRecords.length,
            avgOverallScore: weightedAverage(
              variantRecords.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))
            ),
            avgFaceScore: weightedAverage(
              variantRecords.map((record) => ({ value: record.faceScore, weight: record.selectionWeight ?? 1 }))
            ),
            avgCompositionScore: weightedAverage(
              variantRecords.map((record) => ({ value: record.compositionScore, weight: record.selectionWeight ?? 1 }))
            )
          };
        })
        .sort(
          (left, right) =>
            right.avgOverallScore - left.avgOverallScore ||
            right.sampleCount - left.sampleCount ||
            right.avgFaceScore - left.avgFaceScore
        )
        .map((entry, index) => ({
          ...entry,
          recommended:
            scopeOverride.preferredVariantId != null
              ? entry.variantId === scopeOverride.preferredVariantId
              : index === 0 && entry.sampleCount >= 2
        }));
      const candidateGroups = new Map<string, LearningRecord[]>();
      for (const record of records) {
        if (!record.candidateLabel) {
          continue;
        }
        const existing = candidateGroups.get(record.candidateLabel) ?? [];
        existing.push(record);
        candidateGroups.set(record.candidateLabel, existing);
      }
      const rankedBatchCandidates = [...candidateGroups.entries()]
        .map(([candidateLabel, candidateRecords]) => {
          const winCount = candidateRecords.filter((record) => record.bestInBatch).length;
          return {
            candidateLabel,
            sampleCount: candidateRecords.length,
            winCount,
            winRate: candidateRecords.length > 0 ? winCount / candidateRecords.length : 0,
            avgOverallScore: weightedAverage(
              candidateRecords.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))
            ),
            avgFaceScore: weightedAverage(
              candidateRecords.map((record) => ({ value: record.faceScore, weight: record.selectionWeight ?? 1 }))
            ),
            avgCompositionScore: weightedAverage(
              candidateRecords.map((record) => ({ value: record.compositionScore, weight: record.selectionWeight ?? 1 }))
            )
          };
        })
        .sort(
          (left, right) =>
            right.winRate - left.winRate ||
            right.avgOverallScore - left.avgOverallScore ||
            right.sampleCount - left.sampleCount
        )
        .map((entry, index) => ({
          ...entry,
          recommended: index === 0 && entry.sampleCount >= 2
        }));
      const checkpointGroups = new Map<string, LearningRecord[]>();
      for (const record of records) {
        const checkpointName = record.checkpointName?.trim();
        if (!checkpointName) {
          continue;
        }
        const existing = checkpointGroups.get(checkpointName) ?? [];
        existing.push(record);
        checkpointGroups.set(checkpointName, existing);
      }
      const primaryLoraGroups = new Map<string, LearningRecord[]>();
      for (const record of records) {
        const loraName = record.primaryLoraName?.trim();
        if (!loraName) {
          continue;
        }
        const existing = primaryLoraGroups.get(loraName) ?? [];
        existing.push(record);
        primaryLoraGroups.set(loraName, existing);
      }
      const rankedCheckpoints = [...checkpointGroups.entries()]
        .map(([name, checkpointRecords]) => ({
          name,
          sampleCount: checkpointRecords.length,
          avgOverallScore: weightedAverageFor(checkpointRecords, () => true)
        }))
        .sort((left, right) => right.avgOverallScore - left.avgOverallScore || right.sampleCount - left.sampleCount)
        .map((entry, index) => ({
          ...entry,
          recommended: index === 0 && !scopeOverride.bannedCheckpoints.includes(entry.name)
        }));
      const rankedPrimaryLoras = [...primaryLoraGroups.entries()]
        .map(([name, loraRecords]) => ({
          name,
          sampleCount: loraRecords.length,
          avgOverallScore: weightedAverageFor(loraRecords, () => true)
        }))
        .sort((left, right) => right.avgOverallScore - left.avgOverallScore || right.sampleCount - left.sampleCount)
        .map((entry, index) => ({
          ...entry,
          recommended: index === 0 && !scopeOverride.bannedPrimaryLoras.includes(entry.name)
        }));
      const disfavoredCheckpoints = Array.from(
        new Set([
          ...[...checkpointGroups.entries()]
            .filter(([, checkpointRecords]) => checkpointRecords.length >= 2)
            .filter(([, checkpointRecords]) => weightedAverageFor(checkpointRecords, () => true) < 58)
            .map(([checkpointName]) => checkpointName),
          ...scopeOverride.bannedCheckpoints
        ])
      );
      const unsafePrimaryLoras = Array.from(
        new Set([
          ...[...primaryLoraGroups.entries()]
            .filter(([, loraRecords]) => loraRecords.length >= 2)
            .filter(([, loraRecords]) => weightedAverageFor(loraRecords, () => true) < 60)
            .map(([loraName]) => loraName),
          ...scopeOverride.bannedPrimaryLoras
        ])
      );
      const avoidVariantIds = rankedVariants
        .filter((entry) => entry.sampleCount >= 2 && entry.avgOverallScore < 60)
        .map((entry) => entry.variantId);
      const detailPassEnabledRecords = records.filter((record) => record.detailPass);
      const detailPassDisabledRecords = records.filter((record) => !record.detailPass);
      const avoidDetailPass =
        detailPassEnabledRecords.length >= 2 &&
        detailPassDisabledRecords.length >= 2 &&
        weightedAverageFor(detailPassEnabledRecords, () => true) + 6 < weightedAverageFor(detailPassDisabledRecords, () => true);
      const refinerEnabledRecords = records.filter((record) => record.refiner);
      const refinerDisabledRecords = records.filter((record) => !record.refiner);
      const avoidRefiner =
        refinerEnabledRecords.length >= 2 &&
        refinerDisabledRecords.length >= 2 &&
        weightedAverageFor(refinerEnabledRecords, () => true) + 6 < weightedAverageFor(refinerDisabledRecords, () => true);
      const repairGroups = new Map<string, LearningRecord[]>();
      for (const record of records) {
        const repairId = record.repairId?.trim();
        if (!repairId) {
          continue;
        }
        const existing = repairGroups.get(repairId) ?? [];
        existing.push(record);
        repairGroups.set(repairId, existing);
      }
      const repairOutcomes = [...repairGroups.entries()]
        .map(([repairId, repairRecords]) => {
          const recordsWithDelta = repairRecords.filter(
            (record): record is LearningRecord & { repairDelta: number; repairImproved: boolean } =>
              typeof record.repairDelta === "number" && typeof record.repairImproved === "boolean"
          );
          const targetDeltas = repairRecords
            .map(repairTargetDelta)
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
          const improvedCount = recordsWithDelta.filter((record) => record.repairImproved).length;
          const targetImprovedCount = targetDeltas.filter((value) => value >= 3).length;
          const avgDelta =
            recordsWithDelta.length > 0 ? average(recordsWithDelta.map((record) => record.repairDelta)) : 0;
          const avgFaceDelta = average(
            repairRecords
              .map((record) => record.repairFaceDelta)
              .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
          );
          const avgHandsDelta = average(
            repairRecords
              .map((record) => record.repairHandsDelta)
              .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
          );
          const avgCompositionDelta = average(
            repairRecords
              .map((record) => record.repairCompositionDelta)
              .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
          );
          const avgMaterialDelta = average(
            repairRecords
              .map((record) => record.repairMaterialDelta)
              .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
          );
          const avgTargetDelta = targetDeltas.length > 0 ? average(targetDeltas) : avgDelta;
          const targetImprovedRate = targetDeltas.length > 0 ? targetImprovedCount / targetDeltas.length : 0;

          return {
            repairId,
            sampleCount: repairRecords.length,
            improvedCount,
            improvedRate: recordsWithDelta.length > 0 ? improvedCount / recordsWithDelta.length : 0,
            avgDelta,
            avgFaceDelta,
            avgHandsDelta,
            avgCompositionDelta,
            avgMaterialDelta,
            avgTargetDelta,
            targetImprovedRate,
            avgRuntimeMs: averageRuntime(repairRecords),
            recommended:
              (recordsWithDelta.length >= 2 || targetDeltas.length >= 2) &&
              avgTargetDelta >= 2 &&
              (targetDeltas.length > 0 ? targetImprovedRate : improvedCount / recordsWithDelta.length) >= 0.5 &&
              averageRuntime(repairRecords) <= 180_000,
            regressive: (recordsWithDelta.length >= 2 && avgDelta <= -2) || (targetDeltas.length >= 2 && avgTargetDelta <= -2)
          };
        })
        .sort(
          (left, right) =>
            Number(right.recommended) - Number(left.recommended) ||
            right.avgDelta - left.avgDelta ||
            right.improvedRate - left.improvedRate
        );
      const regressiveRepairIds = Array.from(
        new Set([
          ...[...repairGroups.entries()]
            .map(([repairId]) => repairOutcomes.find((entry) => entry.repairId === repairId))
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
            .filter((entry) => entry.regressive)
            .map((entry) => entry.repairId),
          ...scopeOverride.bannedRepairIds
        ])
      );
      const avgRuntimeMs = averageRuntime(records);
      const avgScorePerSecond =
        avgRuntimeMs > 0 ? weightedAverage(records.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))) / (avgRuntimeMs / 1000) : 0;
      const preferredBatchSize =
        records.length < 4
          ? 3
          : avgRuntimeMs > 180_000 && weightedAverage(records.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))) >= 82
            ? 1
            : avgRuntimeMs > 110_000 || weightedAverage(records.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))) >= 78
              ? 2
              : 3;
      const positiveRepairOutcomes = repairOutcomes.filter((entry) => entry.avgDelta > 0);
      const repairAggressiveness =
        repairOutcomes.some((entry) => entry.regressive) && !positiveRepairOutcomes.some((entry) => entry.recommended)
          ? "conservative"
          : positiveRepairOutcomes.some((entry) => entry.recommended && entry.avgRuntimeMs <= 150_000)
            ? "aggressive"
            : "balanced";
      const preferredEvaluationMode =
        avgRuntimeMs > 180_000 && records.length >= 6 && weightedAverage(records.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))) >= 80
          ? "heuristic"
          : "vision";
      const autoRepairEnabled = repairAggressiveness !== "conservative" || weightedAverage(records.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))) < 72;
      const recommendedAutoRepairThreshold =
        repairAggressiveness === "aggressive" ? 70 : repairAggressiveness === "balanced" ? 62 : 55;
      const topVariant = rankedVariants[0] ?? null;
      const failureNotes = [
        ...(scopeOverride.preferredVariantId ? [`Variant ${scopeOverride.preferredVariantId} has been manually promoted for this scope.`] : []),
        ...(preferredBatchSize === 1
          ? ["This scope is stable enough that the system should usually avoid best-of-3 and render a single candidate first."]
          : preferredBatchSize === 2
            ? ["This scope benefits from a smaller batch budget. Best-of-2 is usually more cost-effective than best-of-3."]
            : []),
        ...(avgRuntimeMs > 180_000 ? ["This scope is runtime-heavy and should avoid unnecessary exploration or expensive retries."] : []),
        ...(avgScorePerSecond > 0 && avgScorePerSecond < 0.55 ? ["Quality-per-second is currently weak here, so the system should prefer cheaper stable settings."] : []),
        ...(preferredEvaluationMode === "heuristic"
          ? ["Evaluation can usually stay in heuristic mode here because this scope is stable and expensive."]
          : []),
        ...(!autoRepairEnabled
          ? ["Auto-repair should stay off by default here unless the score is clearly low."]
          : []),
        ...(topVariant && topVariant.sampleCount >= 4 && topVariant.avgOverallScore >= 82 ? [`Variant ${topVariant.label} is stable enough to favor exploitation over wide exploration.`] : []),
        ...(avoidDetailPass ? ["Detail pass has underperformed for this category and will be avoided."] : []),
        ...(avoidRefiner ? ["Refiner has regressed results for this category and will be avoided."] : []),
        ...unsafePrimaryLoras.slice(0, 2).map((name) => `Primary LoRA ${name} has produced weak results and will be downranked.`),
        ...disfavoredCheckpoints.slice(0, 2).map((name) => `Checkpoint ${name} has underperformed and will be downranked.`),
        ...regressiveRepairIds.slice(0, 2).map((repairId) => `Repair plan ${repairId} has often regressed outputs for this category.`)
      ];

      return {
        categoryId,
        styleRecipeId,
        fluxRenderMode,
        sampleCount: records.length,
        avgOverallScore: weightedAverage(records.map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))),
        avgRuntimeMs,
        avgScorePerSecond,
        avgFaceScore: weightedAverage(records.map((record) => ({ value: record.faceScore, weight: record.selectionWeight ?? 1 }))),
        avgHandsScore: weightedAverage(records.map((record) => ({ value: record.handsScore, weight: record.selectionWeight ?? 1 }))),
        avgCompositionScore: weightedAverage(
          records.map((record) => ({ value: record.compositionScore, weight: record.selectionWeight ?? 1 }))
        ),
        avgMaterialScore: weightedAverage(
          records.map((record) => ({ value: record.materialScore, weight: record.selectionWeight ?? 1 }))
        ),
        preferredCfg:
          highConfidence.length > 0
            ? weightedAverage(highConfidence.map((record) => ({ value: record.cfg, weight: record.selectionWeight ?? 1 })))
            : null,
        preferredSteps:
          highConfidence.length > 0
            ? weightedAverage(highConfidence.map((record) => ({ value: record.steps, weight: record.selectionWeight ?? 1 })))
            : null,
        preferredLoraStrength:
          highConfidence.filter((record) => typeof record.loraStrength === "number").length > 0
            ? weightedAverage(
                highConfidence
                  .filter((record): record is LearningRecord & { loraStrength: number } => typeof record.loraStrength === "number")
                  .map((record) => ({ value: record.loraStrength, weight: record.selectionWeight ?? 1 }))
              )
            : null,
        avoidLoraAbove:
          lowConfidenceLoras.length > 0
            ? Math.max(...lowConfidenceLoras.map((record) => record.loraStrength ?? 0))
            : null,
        detailPassBoost:
          !avoidDetailPass &&
          weightedAverage(
            records
              .filter((record) => record.detailPass)
              .map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))
          ) >
            weightedAverage(
              records
                .filter((record) => !record.detailPass)
                .map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))
            ),
        refinerBoost:
          !avoidRefiner &&
          weightedAverage(
            records
              .filter((record) => record.refiner)
              .map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))
          ) >
            weightedAverage(
              records
                .filter((record) => !record.refiner)
                .map((record) => ({ value: record.overallScore, weight: record.selectionWeight ?? 1 }))
            ),
        rankedVariants,
        rankedBatchCandidates,
        rankedPrimaryLoras,
        rankedCheckpoints,
        avoidVariantIds,
        avoidDetailPass,
        avoidRefiner,
        unsafePrimaryLoras,
        disfavoredCheckpoints,
        regressiveRepairIds,
        repairOutcomes,
        preferredBatchSize,
        repairAggressiveness,
        preferredEvaluationMode,
        autoRepairEnabled,
        recommendedAutoRepairThreshold,
        failureNotes,
        topIssues: [...issueCounts.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([issue]) => issue),
        manualPreferredVariantId: scopeOverride.preferredVariantId,
        manualBannedPrimaryLoras: scopeOverride.bannedPrimaryLoras,
        manualBannedCheckpoints: scopeOverride.bannedCheckpoints,
        manualBannedRepairIds: scopeOverride.bannedRepairIds,
        lastUpdated: records[records.length - 1]?.createdAt ?? memory.updatedAt
      };
    };

    const categories = [...groups.entries()].map(([categoryId, records]) => buildSummary(categoryId, records, null, null));
    const styleCategories = [...styleGroups.entries()].map(([key, records]) => {
      const [categoryId, styleRecipeId, fluxRenderMode] = key.split("::");
      return buildSummary(
        categoryId ?? "",
        records,
        styleRecipeId ? styleRecipeId : null,
        fluxRenderMode === "fast" || fluxRenderMode === "quality" ? fluxRenderMode : null
      );
    });

    const payload = {
      updatedAt: memory.updatedAt,
      totalSamples: memory.records.length,
      categories,
      styleCategories
    };
    learningSummaryCache = {
      cacheKey,
      payload
    };

    return learningSummaryResponseSchema.parse(payload);
  });

  app.get("/api/learning/debug", async (request) => {
    const query = request.query as { categoryId?: string; styleRecipeId?: string; fluxRenderMode?: "fast" | "quality" };
    const memory = await loadLearningMemory();
    const records = memory.records.filter((record) => {
      if (query.categoryId && record.categoryId !== query.categoryId) {
        return false;
      }
      if (query.styleRecipeId && record.styleRecipeId !== query.styleRecipeId) {
        return false;
      }
      if (query.fluxRenderMode && record.fluxRenderMode !== query.fluxRenderMode) {
        return false;
      }
      return true;
    });

    return learningDebugResponseSchema.parse({
      updatedAt: memory.updatedAt,
      recordCount: records.length,
      records
    });
  });

  app.post("/api/learning/override", async (request) => {
    const input = learningOverrideInputSchema.parse(request.body);
    const overrides = await loadLearningOverrides();
    const scopeKey = getScopeKey(input.categoryId, input.styleRecipeId ?? null, input.fluxRenderMode ?? null);

    if (input.action === "reset_scope") {
      const memory = await loadLearningMemory();
      const filteredRecords = memory.records.filter(
        (record) =>
          !(
            record.categoryId === input.categoryId &&
            (input.styleRecipeId ? record.styleRecipeId === input.styleRecipeId : true) &&
            (input.fluxRenderMode ? record.fluxRenderMode === input.fluxRenderMode : true)
          )
      );
      await mkdir(path.dirname(learningMemoryPath), { recursive: true });
      await writeFile(
        learningMemoryPath,
        JSON.stringify(
          {
            version: 1,
            updatedAt: new Date().toISOString(),
            records: filteredRecords
          },
          null,
          2
        ),
        "utf8"
      );
      delete overrides.scopes[scopeKey];
      const updatedAt = new Date().toISOString();
      await saveLearningOverrides({
        ...overrides,
        updatedAt
      });
      learningSummaryCache = null;

      return learningOverrideResponseSchema.parse({
        ok: true,
        updatedAt
      });
    }

    const existing = overrides.scopes[scopeKey] ?? emptyScopeOverride();

    if (input.action === "promote_variant" && input.targetId) {
      existing.preferredVariantId = input.targetId;
    }

    if (input.action === "clear_promoted_variant") {
      existing.preferredVariantId = null;
    }

    if (input.action === "ban_primary_lora" && input.targetId) {
      existing.bannedPrimaryLoras = Array.from(new Set([...existing.bannedPrimaryLoras, input.targetId]));
    }

    if (input.action === "unban_primary_lora" && input.targetId) {
      existing.bannedPrimaryLoras = existing.bannedPrimaryLoras.filter((item) => item !== input.targetId);
    }

    if (input.action === "ban_checkpoint" && input.targetId) {
      existing.bannedCheckpoints = Array.from(new Set([...existing.bannedCheckpoints, input.targetId]));
    }

    if (input.action === "unban_checkpoint" && input.targetId) {
      existing.bannedCheckpoints = existing.bannedCheckpoints.filter((item) => item !== input.targetId);
    }

    if (input.action === "ban_repair" && input.targetId) {
      existing.bannedRepairIds = Array.from(new Set([...existing.bannedRepairIds, input.targetId]));
    }

    if (input.action === "unban_repair" && input.targetId) {
      existing.bannedRepairIds = existing.bannedRepairIds.filter((item) => item !== input.targetId);
    }

    const updatedAt = new Date().toISOString();
    overrides.scopes[scopeKey] = existing;
    await saveLearningOverrides({
      ...overrides,
      updatedAt
    });
    learningSummaryCache = null;

    return learningOverrideResponseSchema.parse({
      ok: true,
      updatedAt
    });
  });
}
