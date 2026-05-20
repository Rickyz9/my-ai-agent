import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import type {
  LearningCategorySummary,
  LearningDebugResponse,
  LearningOverrideInput,
  LearningSummaryResponse,
  RuntimeHealthResponse
} from "@repo/shared";

import { ApiService } from "../../core/api.service";

type SortMode = "samples" | "score" | "risk";
type ScopeFilter = "all" | "category" | "style";
type LearningEntryView = {
  entry: LearningCategorySummary;
  scope: "Category" | "Style lane";
};

function failureSignalCount(entry: LearningCategorySummary) {
  return (
    entry.unsafePrimaryLoras.length +
    entry.disfavoredCheckpoints.length +
    entry.regressiveRepairIds.length +
    entry.avoidVariantIds.length +
    (entry.avoidDetailPass ? 1 : 0) +
    (entry.avoidRefiner ? 1 : 0)
  );
}

function healthLabel(entry: LearningCategorySummary) {
  const failures = failureSignalCount(entry);
  if (entry.sampleCount >= 6 && entry.avgOverallScore >= 82 && failures <= 1) {
    return "Healthy";
  }
  if (failures >= 4 || (entry.sampleCount >= 4 && entry.avgOverallScore < 68)) {
    return "Risky";
  }
  return "Unstable";
}

@Component({
  selector: "app-learning-page",
  imports: [
    CommonModule,
    MatButtonModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule
  ],
  templateUrl: "./learning.page.html",
  styleUrl: "./learning.page.scss"
})
export class LearningPage {
  private readonly api = inject(ApiService);

  readonly summary = signal<LearningSummaryResponse | null>(null);
  readonly runtime = signal<RuntimeHealthResponse | null>(null);
  readonly debug = signal<LearningDebugResponse | null>(null);
  readonly loading = signal(false);
  readonly actionBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);
  readonly sortMode = signal<SortMode>("samples");
  readonly scopeFilter = signal<ScopeFilter>("all");
  readonly searchTerm = signal("");

  readonly entries = computed<LearningEntryView[]>(() => {
    const summary = this.summary();
    if (!summary) {
      return [];
    }

    const filter = this.scopeFilter();
    const search = this.searchTerm().trim().toLowerCase();
    const views: LearningEntryView[] = [
      ...(filter === "style" ? [] : summary.categories.map((entry) => ({ entry, scope: "Category" as const }))),
      ...(filter === "category" ? [] : summary.styleCategories.map((entry) => ({ entry, scope: "Style lane" as const })))
    ];
    const filtered = views.filter(({ entry }) => {
      if (!search) {
        return true;
      }
      return [
        entry.categoryId,
        entry.styleRecipeId ?? "",
        entry.fluxRenderMode ?? "",
        ...entry.topIssues,
        ...entry.failureNotes
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });

    return filtered.sort((left, right) => {
      if (this.sortMode() === "score") {
        return right.entry.avgOverallScore - left.entry.avgOverallScore || right.entry.sampleCount - left.entry.sampleCount;
      }
      if (this.sortMode() === "risk") {
        return this.riskRank(right.entry) - this.riskRank(left.entry) || left.entry.avgOverallScore - right.entry.avgOverallScore;
      }
      return right.entry.sampleCount - left.entry.sampleCount || right.entry.avgOverallScore - left.entry.avgOverallScore;
    });
  });

  readonly riskyEntries = computed(() =>
    this.entries()
      .filter(({ entry }) => this.health(entry) !== "Healthy")
      .slice(0, 5)
  );

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [summary, runtime] = await Promise.all([this.api.getLearningSummary(), this.api.getRuntimeHealth()]);
      this.summary.set(summary);
      this.runtime.set(runtime);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Learning load failed.");
    } finally {
      this.loading.set(false);
    }
  }

  setSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  health(entry: LearningCategorySummary) {
    return healthLabel(entry);
  }

  healthClass(entry: LearningCategorySummary) {
    return healthLabel(entry).toLowerCase();
  }

  failures(entry: LearningCategorySummary) {
    return failureSignalCount(entry);
  }

  topVariant(entry: LearningCategorySummary) {
    return entry.rankedVariants.at(0) ?? null;
  }

  topBatchCandidate(entry: LearningCategorySummary) {
    return entry.rankedBatchCandidates.at(0) ?? null;
  }

  topRepair(entry: LearningCategorySummary) {
    return entry.repairOutcomes.find((repair) => repair.recommended) ?? entry.repairOutcomes.at(0) ?? null;
  }

  async applyOverride(
    entry: LearningCategorySummary,
    action: LearningOverrideInput["action"],
    targetId?: string
  ) {
    this.actionBusy.set(true);
    this.feedback.set(null);
    try {
      await this.api.applyLearningOverride({
        categoryId: entry.categoryId,
        styleRecipeId: entry.styleRecipeId ?? null,
        fluxRenderMode: entry.fluxRenderMode ?? null,
        action,
        ...(targetId ? { targetId } : {})
      });
      await this.load();
      this.feedback.set(`Override aggiornato per ${entry.styleRecipeId ?? entry.categoryId}.`);
    } catch (error) {
      this.feedback.set(error instanceof Error ? error.message : "Learning override failed.");
    } finally {
      this.actionBusy.set(false);
    }
  }

  async loadDebug(entry: LearningCategorySummary) {
    this.actionBusy.set(true);
    this.feedback.set(null);
    try {
      this.debug.set(
        await this.api.getLearningDebug({
          categoryId: entry.categoryId,
          styleRecipeId: entry.styleRecipeId ?? null,
          fluxRenderMode: entry.fluxRenderMode ?? null
        })
      );
      this.feedback.set(`Debug caricato per ${entry.styleRecipeId ?? entry.categoryId}.`);
    } catch (error) {
      this.feedback.set(error instanceof Error ? error.message : "Learning debug failed.");
    } finally {
      this.actionBusy.set(false);
    }
  }

  private riskRank(entry: LearningCategorySummary) {
    const health = this.health(entry);
    return health === "Risky" ? 2 : health === "Unstable" ? 1 : 0;
  }
}
