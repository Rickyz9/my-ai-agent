import { CommonModule } from "@angular/common";
import { Component, OnDestroy, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTabsModule } from "@angular/material/tabs";
import type {
  CandidateBatchResponse,
  CreateJobInput,
  JobDetail,
  JobListItem,
  LearningCategorySummary,
  LearningSummaryResponse,
  RelatedJobsResponse,
  RenderEvaluation
} from "@repo/shared";

import { ApiService } from "../../core/api.service";
import { appendPromptBlocks } from "../../core/generation-presets";

type RuntimeTelemetry = {
  concurrencyLane?: string;
  laneLimit?: number;
  queueWaitMs?: number;
  laneWaitMs?: number;
  workflowBuildMs?: number;
  submitMs?: number;
  executionMs?: number;
  outputPersistMs?: number;
  evaluationMs?: number;
};

type RepairPlan = {
  id: string;
  label: string;
  description: string;
  params?: Partial<CreateJobInput["params"]>;
  modelConfig?: Partial<NonNullable<CreateJobInput["modelConfig"]>>;
  workflow?: CreateJobInput["workflow"];
};

function isTerminalStatus(status: JobDetail["status"] | undefined) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function formatMsValue(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }

  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
}

function getRuntimeTelemetry(job: JobDetail): RuntimeTelemetry {
  const pickedLog = job.logs.find((entry) => entry.message === "Worker picked job");
  const completedLog = job.logs.find((entry) => entry.message === "Job completed successfully");
  const evaluationLog = job.logs.find((entry) => entry.message === "Render quality evaluated");
  const pickedMeta = (pickedLog?.meta ?? {}) as Record<string, unknown>;
  const completedMeta = (completedLog?.meta ?? {}) as Record<string, unknown>;
  const phaseDurations = ((completedMeta["phaseDurations"] as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  const evaluationMeta = (evaluationLog?.meta ?? {}) as Record<string, unknown>;

  return {
    concurrencyLane: readString(pickedMeta["concurrencyLane"]),
    laneLimit: readNumber(pickedMeta["laneLimit"]),
    queueWaitMs: readNumber(phaseDurations["queueWaitMs"]) ?? readNumber(pickedMeta["queueWaitMs"]),
    laneWaitMs: readNumber(phaseDurations["laneWaitMs"]) ?? readNumber(pickedMeta["laneWaitMs"]),
    workflowBuildMs: readNumber(phaseDurations["workflowBuildMs"]),
    submitMs: readNumber(phaseDurations["submitMs"]),
    executionMs: readNumber(phaseDurations["executionMs"]),
    outputPersistMs: readNumber(phaseDurations["outputPersistMs"]),
    evaluationMs: readNumber(phaseDurations["evaluationMs"]) ?? readNumber(evaluationMeta["evaluationMs"])
  };
}

@Component({
  selector: "app-job-detail-page",
  imports: [CommonModule, MatButtonModule, MatChipsModule, MatIconModule, MatProgressBarModule, MatTabsModule, RouterLink],
  templateUrl: "./job-detail.page.html",
  styleUrl: "./job-detail.page.scss"
})
export class JobDetailPage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private stream: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly jobId = this.route.snapshot.paramMap.get("id") ?? "";
  readonly job = signal<JobDetail | null>(null);
  readonly candidateBatch = signal<CandidateBatchResponse | null>(null);
  readonly relatedJobs = signal<RelatedJobsResponse | null>(null);
  readonly learningSummary = signal<LearningSummaryResponse | null>(null);
  readonly evaluation = signal<RenderEvaluation | null>(null);
  readonly loading = signal(false);
  readonly evaluating = signal(false);
  readonly actionBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly liveStatus = signal<"connecting" | "live" | "polling">("connecting");
  readonly runtimeTelemetry = computed(() => {
    const currentJob = this.job();
    return currentJob ? getRuntimeTelemetry(currentJob) : null;
  });
  readonly activeLearningCategory = computed(() => {
    const currentJob = this.job();
    const summary = this.learningSummary();
    const categoryId = currentJob?.modelConfig?.renderCategoryId;
    if (!categoryId || !summary) {
      return null;
    }

    const styleRecipeId = currentJob.modelConfig?.renderStyleRecipeId;
    return (
      (styleRecipeId
        ? summary.styleCategories.find(
            (entry) => entry.categoryId === categoryId && entry.styleRecipeId === styleRecipeId
          )
        : null) ??
      summary.categories.find((entry) => entry.categoryId === categoryId) ??
      null
    );
  });
  readonly repairPlans = computed(() => this.buildRepairPlans());

  constructor() {
    void this.load();
    this.openStream();
    this.startPolling();
  }

  ngOnDestroy() {
    this.stream?.close();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  async load() {
    if (!this.jobId) {
      this.error.set("Job id mancante.");
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const [job, candidateBatch, relatedJobs, learningSummary] = await Promise.all([
        this.api.getJob(this.jobId),
        this.api.getCandidateBatch(this.jobId).catch(() => null),
        this.api.getRelatedJobs(this.jobId).catch(() => null),
        this.api.getLearningSummary().catch(() => null)
      ]);
      this.job.set(job);
      this.candidateBatch.set(candidateBatch);
      this.relatedJobs.set(relatedJobs);
      this.learningSummary.set(learningSummary);
      if (job.status === "succeeded" && !this.evaluation()) {
        void this.evaluate(false);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Job load failed.");
    } finally {
      this.loading.set(false);
    }
  }

  async evaluate(showBusy = true) {
    if (!this.jobId) {
      return;
    }

    if (showBusy) {
      this.evaluating.set(true);
    }
    this.error.set(null);
    try {
      this.evaluation.set(await this.api.evaluateJob(this.jobId));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Evaluation failed.");
    } finally {
      if (showBusy) {
        this.evaluating.set(false);
      }
    }
  }

  async rerun() {
    this.actionBusy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.rerunJob(this.jobId);
      await this.router.navigate(["/jobs", result.id]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Rerun failed.");
    } finally {
      this.actionBusy.set(false);
    }
  }

  async applyRepairPlan(plan: RepairPlan) {
    const currentJob = this.job();
    if (!currentJob) {
      return;
    }

    this.actionBusy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.rerunJobWithOverrides(currentJob.id, {
        ...(plan.workflow ? { workflow: plan.workflow } : {}),
        ...(plan.params ? { params: plan.params } : {}),
        modelConfig: {
          ...(plan.modelConfig ?? {}),
          renderRepairAttemptCount: (currentJob.modelConfig?.renderRepairAttemptCount ?? 0) + 1,
          renderLastRepairId: plan.id
        }
      });
      await this.router.navigate(["/jobs", result.id]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Repair rerun failed.");
    } finally {
      this.actionBusy.set(false);
    }
  }

  dataUrl(path: string) {
    return this.api.dataUrl(path);
  }

  formatMs(value: number | null | undefined) {
    return formatMsValue(value);
  }

  visibleProgress(progress: number, status: JobDetail["status"]) {
    return isTerminalStatus(status) ? progress : Math.max(4, progress);
  }

  logMeta(log: JobDetail["logs"][number]) {
    return log.meta ? JSON.stringify(log.meta, null, 2) : "";
  }

  workflowJson(job: JobDetail) {
    return JSON.stringify(job.workflowJson, null, 2);
  }

  topVariant(learning: LearningCategorySummary | null) {
    return learning?.rankedVariants[0] ?? null;
  }

  topRepair(learning: LearningCategorySummary | null) {
    return learning?.repairOutcomes.find((entry) => entry.recommended) ?? learning?.repairOutcomes[0] ?? null;
  }

  private buildRepairPlans(): RepairPlan[] {
    const currentJob = this.job();
    if (!currentJob || currentJob.status !== "succeeded") {
      return [];
    }

    const evaluation = this.evaluation();
    const prompt = currentJob.params.prompt;
    const negativePrompt = currentJob.params.negativePrompt;
    const plans: RepairPlan[] = [];
    const issueText = `${evaluation?.issues.join(" ") ?? ""} ${evaluation?.summary ?? ""}`.toLowerCase();

    if (!evaluation || evaluation.faceScore < 82 || issueText.includes("face") || issueText.includes("eye") || issueText.includes("mouth")) {
      plans.push({
        id: "eye-mouth-detail",
        label: "Face Fidelity",
        description: "Rilancia con enfasi su occhi, bocca, simmetria e struttura facciale.",
        params: {
          prompt: appendPromptBlocks(prompt, [
            "stable facial proportions",
            "natural eye symmetry",
            "clean mouth anatomy",
            "subtle believable expression"
          ]),
          negativePrompt: appendPromptBlocks(negativePrompt, [
            "dead eyes",
            "misaligned pupils",
            "warped mouth",
            "melted teeth",
            "waxy skin"
          ]),
          cfg: Math.min(currentJob.params.cfg, 5.4),
          steps: Math.max(currentJob.params.steps, 34)
        },
        modelConfig: {
          enableRefiner: false,
          enableDetailPass: true,
          detailPassDenoise: 0.1
        }
      });
    }

    if (!evaluation || evaluation.handsScore < 80 || issueText.includes("hand") || issueText.includes("finger")) {
      plans.push({
        id: "hand-anatomy-fix",
        label: "Hands Structure",
        description: "Rilancia in modo conservativo su mani, dita e continuità anatomica.",
        params: {
          prompt: appendPromptBlocks(prompt, [
            "natural hand anatomy if hands are visible",
            "clean fingers",
            "relaxed believable hands",
            "anatomically plausible wrists"
          ]),
          negativePrompt: appendPromptBlocks(negativePrompt, [
            "extra fingers",
            "fused fingers",
            "malformed hands",
            "broken wrists",
            "merged limbs"
          ]),
          cfg: Math.min(currentJob.params.cfg, 5.0)
        },
        modelConfig: {
          enableRefiner: false,
          enableDetailPass: false,
          humanStructureMode: currentJob.modelConfig?.humanStructureMode === "off" ? "portrait" : currentJob.modelConfig?.humanStructureMode,
          humanControlMode: "auto"
        }
      });
    }

    if (
      !evaluation ||
      evaluation.compositionScore < 78 ||
      issueText.includes("limb") ||
      issueText.includes("body") ||
      issueText.includes("duplicate")
    ) {
      plans.push({
        id: "subject-separation",
        label: "Composition Structure",
        description: "Rilancia con un soggetto più leggibile, meno fusione e gerarchia più pulita.",
        params: {
          prompt: appendPromptBlocks(prompt, [
            "single focal subject",
            "clean silhouette",
            "clear foreground to background separation",
            "readable body and object boundaries"
          ]),
          negativePrompt: appendPromptBlocks(negativePrompt, [
            "duplicate subject",
            "fused bodies",
            "merged limbs",
            "cluttered composition",
            "background overpowering subject"
          ]),
          cfg: Math.min(currentJob.params.cfg, 5.2)
        },
        modelConfig: {
          enableRefiner: false,
          enableLora: false
        }
      });
    }

    if (currentJob.modelConfig?.renderCategoryId?.includes("product") || issueText.includes("text") || issueText.includes("label")) {
      plans.push({
        id: "label-text-safe",
        label: "Product / Label Safe",
        description: "Rilancia con geometria e label più piatte e leggibili.",
        params: {
          prompt: appendPromptBlocks(prompt, [
            "front-facing flat label panel",
            "large simple high-contrast typography",
            "clean label margins",
            "precise product geometry"
          ]),
          negativePrompt: appendPromptBlocks(negativePrompt, [
            "gibberish letters",
            "misspelled text",
            "warped typography",
            "bent edges",
            "messy reflections"
          ]),
          cfg: Math.min(currentJob.params.cfg, 5.1)
        },
        modelConfig: {
          enableRefiner: false,
          enableDetailPass: false
        }
      });
    }

    plans.push({
      id: "generic-detail-boost",
      label: "Balanced Clean Rerun",
      description: "Rilancio prudente con CFG più basso e negative prompt più protettivo.",
      params: {
        prompt: appendPromptBlocks(prompt, ["clean composition", "stable geometry", "polished final image"]),
        negativePrompt: appendPromptBlocks(negativePrompt, ["lowres", "blurry", "deformed anatomy", "duplicate subject", "watermark"]),
        cfg: Math.min(currentJob.params.cfg, 5.4)
      },
      modelConfig: {
        enableRefiner: false
      }
    });

    return plans.slice(0, 5);
  }

  private startPolling() {
    this.pollTimer = setInterval(() => {
      const currentJob = this.job();
      const batch = this.candidateBatch();
      const hasActiveBatch = batch?.jobs.some((candidate) => !isTerminalStatus(candidate.status)) ?? false;
      if (!currentJob || !isTerminalStatus(currentJob.status) || hasActiveBatch) {
        void this.load();
      }
    }, 5000);
  }

  private openStream() {
    if (!this.jobId) {
      return;
    }

    this.stream = this.api.streamJob(this.jobId);
    this.stream.onopen = () => {
      this.liveStatus.set("live");
    };
    this.stream.onmessage = (event) => {
      const update = JSON.parse(event.data) as JobListItem;
      const current = this.job();
      if (current) {
        this.job.set({
          ...current,
          status: update.status,
          progress: update.progress,
          previewPath: update.previewPath,
          updatedAt: update.updatedAt
        });
      }
      if (update.status === "succeeded" || update.status === "failed" || update.status === "canceled") {
        this.stream?.close();
        void this.load();
      }
    };
    this.stream.onerror = () => {
      this.liveStatus.set("polling");
      this.stream?.close();
    };
  }
}
