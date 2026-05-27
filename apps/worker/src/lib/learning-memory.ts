import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

export type RepairLearningSummary = {
  repairId: string;
  sampleCount: number;
  deltaCount: number;
  avgTargetDelta: number;
  avgOverallDelta: number;
  targetImprovedRate: number;
};

const MAX_RECORDS = 400;

function getLearningMemoryPath(dataDir: string) {
  return path.join(dataDir, "learning", "render-learning-memory.json");
}

function getLearningOverridesPath(dataDir: string) {
  return path.join(dataDir, "learning", "render-learning-overrides.json");
}

async function loadLearningMemory(dataDir: string): Promise<LearningMemoryFile> {
  const filePath = getLearningMemoryPath(dataDir);

  try {
    const raw = await readFile(filePath, "utf8");
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

async function loadLearningOverrides(dataDir: string): Promise<LearningOverridesFile> {
  const filePath = getLearningOverridesPath(dataDir);

  try {
    const raw = await readFile(filePath, "utf8");
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

async function saveLearningMemory(dataDir: string, payload: LearningMemoryFile) {
  const filePath = getLearningMemoryPath(dataDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

export async function recordLearningSample(
  dataDir: string,
  record: Omit<LearningRecord, "createdAt">
) {
  const memory = await loadLearningMemory(dataDir);
  const nextRecord: LearningRecord = {
    ...normalizeLearningRecord(record),
    createdAt: new Date().toISOString()
  };
  const records = [...memory.records, nextRecord].slice(-MAX_RECORDS);
  await saveLearningMemory(dataDir, {
    version: 1,
    updatedAt: new Date().toISOString(),
    records
  });
}

export async function promoteBatchWinnerLearningSample(
  dataDir: string,
  input: {
    batchId: string;
    bestJobId: string;
  }
) {
  const memory = await loadLearningMemory(dataDir);
  let changed = false;
  const records = memory.records.map((record) => {
    if (record.batchId !== input.batchId) {
      return record;
    }

    if (record.jobId === input.bestJobId) {
      changed = true;
      return {
        ...record,
        bestInBatch: true,
        selectionWeight: Math.max(record.selectionWeight, 2)
      };
    }

    return record;
  });

  if (!changed) {
    return;
  }

  await saveLearningMemory(dataDir, {
    version: 1,
    updatedAt: new Date().toISOString(),
    records
  });
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

  if (
    record.repairId === "premium-materials" ||
    record.repairId === "garment-detail-fix" ||
    record.repairId === "geometry-cleanup" ||
    record.repairId === "label-text-safe"
  ) {
    return record.repairMaterialDelta ?? record.repairDelta;
  }

  return record.repairDelta;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getScopeKey(categoryId: string, styleRecipeId?: string | null, fluxRenderMode?: "fast" | "quality" | null) {
  return `${categoryId}::${styleRecipeId ?? ""}::${fluxRenderMode ?? ""}`;
}

function repairFamilyFromCategoryId(categoryId: string | null | undefined) {
  const id = categoryId ?? "";
  if (id.startsWith("anime-")) {
    return "anime";
  }

  if (["product-hero-shot", "macro-product", "food-editorial"].includes(id)) {
    return "product";
  }

  if (["beauty-closeup", "editorial-portrait", "fashion-editorial", "cinematic-action"].includes(id)) {
    return "human";
  }

  if (["cinematic-still", "environment-concept", "architectural-interior"].includes(id)) {
    return "scene";
  }

  return "general";
}

function getManualBannedRepairIds(overrides: LearningOverridesFile, input: {
  categoryId?: string | null;
  styleRecipeId?: string | null;
}) {
  const categoryId = input.categoryId?.trim();
  if (!categoryId) {
    return [];
  }

  const exactScope = overrides.scopes[getScopeKey(categoryId, input.styleRecipeId ?? null)];
  const categoryScope = overrides.scopes[getScopeKey(categoryId)];

  return Array.from(
    new Set([
      ...(exactScope?.bannedRepairIds ?? []),
      ...(categoryScope?.bannedRepairIds ?? [])
    ])
  );
}

export async function getRepairLearningHints(
  dataDir: string,
  input: {
    categoryId?: string | null;
    styleRecipeId?: string | null;
  }
) {
  const memory = await loadLearningMemory(dataDir);
  const overrides = await loadLearningOverrides(dataDir);
  const categoryRecords = memory.records.filter(
    (record) =>
      record.repairId &&
      record.categoryId === input.categoryId
  );
  const styleRecords = input.styleRecipeId
    ? categoryRecords.filter((record) => record.styleRecipeId === input.styleRecipeId)
    : [];
  const family = repairFamilyFromCategoryId(input.categoryId);
  const familyRecords =
    input.categoryId && categoryRecords.length < 2
      ? memory.records.filter((record) => record.repairId && repairFamilyFromCategoryId(record.categoryId) === family)
      : [];
  const matchingRecords =
    styleRecords.length >= 2
      ? styleRecords
      : categoryRecords.length >= 2
        ? categoryRecords
        : familyRecords.length >= 2
          ? familyRecords
          : categoryRecords;
  const repairIds = Array.from(new Set(matchingRecords.map((record) => record.repairId).filter((repairId): repairId is string => Boolean(repairId))));
  const summaries: RepairLearningSummary[] = repairIds.map((repairId) => {
    const records = matchingRecords.filter((record) => record.repairId === repairId);
    const recordsWithTargetDelta = records
      .map(repairTargetDelta)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const recordsWithOverallDelta = records
      .map((record) => record.repairDelta)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const avgTargetDelta = average(recordsWithTargetDelta);
    const avgOverallDelta = average(recordsWithOverallDelta);
    const targetImprovedRate =
      recordsWithTargetDelta.length > 0
        ? recordsWithTargetDelta.filter((value) => value >= 3).length / recordsWithTargetDelta.length
        : 0;

    return {
      repairId,
      sampleCount: records.length,
      deltaCount: recordsWithTargetDelta.length,
      avgTargetDelta,
      avgOverallDelta,
      targetImprovedRate
    };
  });
  const manualBannedRepairIds = getManualBannedRepairIds(overrides, input);

  return {
    scope:
      styleRecords.length >= 2
        ? "style"
        : categoryRecords.length >= 2
          ? "category"
          : familyRecords.length >= 2
            ? "family"
            : "category",
    repairSummaries: summaries,
    preferredRepairIds: summaries
      .filter((summary) => summary.deltaCount >= 2 && summary.avgTargetDelta >= 2 && summary.targetImprovedRate >= 0.5)
      .sort((left, right) => right.avgTargetDelta - left.avgTargetDelta || right.targetImprovedRate - left.targetImprovedRate)
      .map((summary) => summary.repairId),
    avoidRepairIds: Array.from(
      new Set([
        ...summaries
          .filter((summary) => summary.deltaCount >= 2 && (summary.avgTargetDelta <= -2 || summary.avgOverallDelta <= -3))
          .map((summary) => summary.repairId),
        ...manualBannedRepairIds
      ])
    )
  };
}
