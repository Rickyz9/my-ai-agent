import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import type { HealthResponse, LearningCategorySummary, LearningSummaryResponse, ModelRegistryResponse } from "@repo/shared";

import { ApiService } from "../../core/api.service";
import {
  buildSuitePayloads,
  qualitySuites,
  type BenchmarkCandidate,
  type BenchmarkSuite,
  type BenchmarkSuiteFamily,
  type SubmittedBenchmarkJob
} from "../../core/quality-lab-suites";

type ModelRegistryEntry = ModelRegistryResponse["entries"][number];
type SuiteTone = "ready" | "optional" | "missing";

const familyLabels: Record<BenchmarkSuiteFamily, string> = {
  human: "Human",
  anime: "Anime",
  product: "Product"
};

const familyDescriptions: Record<BenchmarkSuiteFamily, string> = {
  human: "Volti, mani, piedi, pose e dettaglio anatomico.",
  anime: "Varieta personaggio, linework, palette e leggibilita.",
  product: "Geometria, materiali, riflessi e testo sugli oggetti."
};

function scoreTone(value: number | null | undefined): SuiteTone {
  if (typeof value !== "number") {
    return "optional";
  }
  if (value >= 76) {
    return "ready";
  }
  if (value >= 64) {
    return "optional";
  }
  return "missing";
}

function findLearningEntry(
  learningSummary: LearningSummaryResponse | null,
  suite: BenchmarkSuite | null
): LearningCategorySummary | null {
  if (!learningSummary || !suite) {
    return null;
  }

  const entries = [...learningSummary.styleCategories, ...learningSummary.categories];
  return (
    entries.find((entry) => entry.categoryId === suite.categoryId && entry.styleRecipeId === suite.styleRecipeId) ??
    entries.find((entry) => entry.categoryId === suite.categoryId && !entry.styleRecipeId) ??
    null
  );
}

function groupSuites(suites: readonly BenchmarkSuite[]) {
  return (["human", "anime", "product"] as const).map((family) => ({
    family,
    label: familyLabels[family],
    description: familyDescriptions[family],
    suites: suites.filter((suite) => suite.family === family)
  }));
}

function profileRegistryEntryId(profileId: BenchmarkSuite["checkpointProfileId"]) {
  const ids: Record<BenchmarkSuite["checkpointProfileId"], string> = {
    general: "general-checkpoint",
    anime: "anime-checkpoint",
    photoreal: "photoreal-checkpoint",
    "photoreal-sdxl": "photoreal-sdxl-checkpoint",
    product: "product-checkpoint",
    hunyuan3d: "hunyuan3d-checkpoint"
  };
  return ids[profileId];
}

@Component({
  selector: "app-quality-lab-page",
  imports: [CommonModule, MatButtonModule, MatChipsModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule, RouterLink],
  templateUrl: "./quality-lab.page.html",
  styleUrl: "./quality-lab.page.scss"
})
export class QualityLabPage {
  private readonly api = inject(ApiService);

  readonly suites = qualitySuites;
  readonly suiteGroups = groupSuites(qualitySuites);
  readonly selectedSuiteId = signal(qualitySuites[0]?.id ?? "");
  readonly candidateCount = signal(3);
  readonly registry = signal<ModelRegistryResponse | null>(null);
  readonly learningSummary = signal<LearningSummaryResponse | null>(null);
  readonly health = signal<HealthResponse | null>(null);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly submittedJobs = signal<SubmittedBenchmarkJob[]>([]);

  readonly selectedSuite = computed(() => this.suites.find((suite) => suite.id === this.selectedSuiteId()) ?? this.suites[0] ?? null);

  readonly modelEntriesById = computed(
    () => new Map((this.registry()?.entries ?? []).map((entry) => [entry.id, entry] as const))
  );

  readonly learningEntriesByScope = computed(() => {
    const summary = this.learningSummary();
    const entries = [...(summary?.styleCategories ?? []), ...(summary?.categories ?? [])];
    return new Map(entries.map((entry) => [`${entry.categoryId}:${entry.styleRecipeId ?? ""}`, entry] as const));
  });

  readonly readinessEntries = computed(() =>
    ["photoreal-sdxl-checkpoint", "anime-checkpoint", "product-checkpoint", "controlnet-openpose", "sdxl-negative-embedding"]
      .map((entryId) => this.modelEntriesById().get(entryId))
      .filter((entry): entry is ModelRegistryEntry => Boolean(entry))
  );

  readonly selectedLearning = computed(() => findLearningEntry(this.learningSummary(), this.selectedSuite()));

  readonly selectedSuiteReadinessEntries = computed(() => {
    const suite = this.selectedSuite();
    if (!suite) {
      return [];
    }

    const ids = new Set([profileRegistryEntryId(suite.checkpointProfileId), ...suite.requiredModelIds]);
    return Array.from(ids)
      .map((entryId) => this.modelEntriesById().get(entryId))
      .filter((entry): entry is ModelRegistryEntry => Boolean(entry));
  });

  readonly selectedSuiteMissingModels = computed(() => this.selectedSuiteReadinessEntries().filter((entry) => !entry.exists));

  readonly selectedSuiteReady = computed(() => this.selectedSuiteMissingModels().length === 0);

  readonly activeCandidateCount = computed(() => {
    const suite = this.selectedSuite();
    return Math.max(1, Math.min(this.candidateCount(), suite?.candidates.length ?? 1));
  });

  readonly openPoseControlAvailable = computed(() => Boolean(this.modelEntriesById().get("controlnet-openpose")?.exists));

  readonly selectedSuiteInsight = computed(() => {
    const suite = this.selectedSuite();
    const learning = this.selectedLearning();
    const missingModels = this.selectedSuiteMissingModels();
    const health = this.health();

    if (!suite) {
      return { tone: "optional" as SuiteTone, title: "Nessuna suite selezionata", detail: "Seleziona una suite per vedere i controlli." };
    }
    if (!health?.comfy?.ok || !health?.redis?.ok) {
      return { tone: "missing" as SuiteTone, title: "Runtime non pronto", detail: "ComfyUI e Redis devono essere online prima dei benchmark." };
    }
    if (missingModels.length > 0) {
      return {
        tone: "missing" as SuiteTone,
        title: "Setup modello incompleto",
        detail: `${missingModels.map((entry) => entry.envVar).join(", ")} non ${missingModels.length === 1 ? "e" : "sono"} pronto.`
      };
    }
    if (!learning || learning.sampleCount === 0) {
      return { tone: "optional" as SuiteTone, title: "Baseline da creare", detail: "Esegui almeno una batch completa per avere un confronto reale." };
    }
    if (learning.sampleCount < 3) {
      return { tone: "optional" as SuiteTone, title: "Campioni ancora pochi", detail: `${learning.sampleCount} sample: meglio accumulare almeno 3 run comparabili.` };
    }
    if (learning.avgOverallScore < 64) {
      return { tone: "missing" as SuiteTone, title: "Qualita sotto soglia", detail: "Serve esplorare candidati alternativi e guardare i failure notes." };
    }
    if (learning.avgOverallScore < 76) {
      return { tone: "optional" as SuiteTone, title: "Qualita instabile", detail: "C'e una base utile, ma conviene tenere best-of-3 e auto-repair attivi." };
    }
    return { tone: "ready" as SuiteTone, title: "Lane promettente", detail: "La suite ha segnali sufficienti per promuovere il candidato migliore." };
  });

  readonly familySummary = computed(() =>
    this.suiteGroups.map((group) => {
      const entries = group.suites
        .map((suite) => findLearningEntry(this.learningSummary(), suite))
        .filter((entry): entry is LearningCategorySummary => Boolean(entry));
      const sampleCount = entries.reduce((sum, entry) => sum + entry.sampleCount, 0);
      const avgScore = entries.length
        ? entries.reduce((sum, entry) => sum + entry.avgOverallScore, 0) / entries.length
        : null;
      const riskCount = entries.filter((entry) => entry.avgOverallScore < 64 || entry.failureNotes.length > 0).length;
      return {
        ...group,
        sampleCount,
        avgScore,
        riskCount,
        tone: scoreTone(avgScore)
      };
    })
  );

  readonly selectedCandidateInsights = computed(() => {
    const suite = this.selectedSuite();
    const learning = this.selectedLearning();
    if (!suite) {
      return [];
    }

    return suite.candidates.map((candidate) => this.candidateInsight(candidate, learning));
  });

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [health, registry, learningSummary] = await Promise.all([
        this.api.getHealth(),
        this.api.getModelRegistry(),
        this.api.getLearningSummary()
      ]);
      this.health.set(health);
      this.registry.set(registry);
      this.learningSummary.set(learningSummary);
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : "Quality Lab load failed.");
    } finally {
      this.loading.set(false);
    }
  }

  selectSuite(suiteId: string) {
    this.selectedSuiteId.set(suiteId);
  }

  setCandidateCount(value: number) {
    this.candidateCount.set(value);
  }

  async submitSelected() {
    const suite = this.selectedSuite();
    if (!suite) {
      return;
    }
    await this.submitSuites([suite]);
  }

  async submitCriticalSet() {
    await this.submitSuites(qualitySuites.filter((suite) => suite.priority === "critical"));
  }

  async submitFamily(family: BenchmarkSuiteFamily) {
    await this.submitSuites(qualitySuites.filter((suite) => suite.family === family));
  }

  modelTone(entry: ModelRegistryEntry) {
    if (entry.exists) {
      return "ready";
    }
    return entry.required ? "missing" : "optional";
  }

  formatScore(value: number | null | undefined) {
    return typeof value === "number" ? value.toFixed(0) : "n/a";
  }

  formatPercent(value: number | null | undefined) {
    return typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a";
  }

  scoreTone(value: number | null | undefined) {
    return scoreTone(value);
  }

  candidateInsight(candidate: BenchmarkCandidate, learning: LearningCategorySummary | null) {
    const variant = learning?.rankedVariants.find((entry) => entry.variantId === candidate.id) ?? null;
    const batchCandidate = learning?.rankedBatchCandidates.find((entry) => entry.candidateLabel === candidate.label) ?? null;
    const avoided = Boolean(learning?.avoidVariantIds.includes(candidate.id));
    const score = variant?.avgOverallScore ?? batchCandidate?.avgOverallScore ?? null;
    const recommended = Boolean(variant?.recommended || batchCandidate?.recommended);

    return {
      candidate,
      variant,
      batchCandidate,
      score,
      avoided,
      recommended,
      tone: avoided ? "missing" as SuiteTone : recommended ? "ready" as SuiteTone : scoreTone(score),
      status: avoided ? "avoid" : recommended ? "winner" : score == null ? "untested" : "tracked"
    };
  }

  topIssues(learning: LearningCategorySummary | null) {
    return [...(learning?.topIssues ?? []), ...(learning?.failureNotes ?? [])].slice(0, 4);
  }

  private async submitSuites(suites: BenchmarkSuite[]) {
    this.submitting.set(true);
    this.submitError.set(null);
    this.submittedJobs.set([]);

    try {
      const payloads = suites.flatMap((suite) =>
        buildSuitePayloads(suite, Math.min(this.activeCandidateCount(), suite.candidates.length), this.openPoseControlAvailable()).map((payload) => ({
          payload,
          suite
        }))
      );
      const created = await Promise.all(
        payloads.map(async ({ payload, suite }) => {
          const result = await this.api.createJob(payload);
          return {
            id: result.id,
            suiteLabel: suite.label,
            candidateLabel: payload.modelConfig?.renderCandidateLabel ?? "Candidate"
          };
        })
      );
      this.submittedJobs.set(created);
    } catch (error) {
      this.submitError.set(error instanceof Error ? error.message : "Quality Lab submit failed.");
    } finally {
      this.submitting.set(false);
    }
  }
}
