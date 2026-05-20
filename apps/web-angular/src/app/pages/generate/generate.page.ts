import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatChipsModule } from "@angular/material/chips";
import { MatDividerModule } from "@angular/material/divider";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import {
  checkpointProfileNegativePromptMap,
  checkpointProfiles,
  humanPosePresetIds,
  negativePromptTags,
  samplerNames,
  schedulerNames,
  selectableWorkflowKinds,
  stylePresets,
  workflowCapabilities,
  workflowLabels,
  type CheckpointProfileId,
  type CreateJobInput,
  type HealthResponse,
  type JobParams,
  type LearningCategorySummary,
  type LearningSummaryResponse,
  type ModelConfig,
  type ModelRegistryResponse,
  type NegativePromptTag,
  type StylePreset,
  type WorkflowKind
} from "@repo/shared";

import { ApiService } from "../../core/api.service";
import {
  appendPromptBlocks,
  benchmarkPrompts,
  candidateDirectionsForScene,
  defaultModelConfig,
  findBenchmark,
  findSceneTemplate,
  findStyleRecipe,
  getStyleRecipesForScene,
  getSuggestedStyleRecipe,
  optimizationModes,
  recipeForCandidate,
  sceneTemplates,
  type GenerationSceneId,
  type OptimizationMode
} from "../../core/generation-presets";

type StudioTransferPayload = {
  prompt?: string;
  negativePrompt?: string;
  params?: Partial<JobParams>;
  modelProfileId?: CheckpointProfileId;
  stylePreset?: StylePreset;
};

type PromptDiagnostic = {
  id: string;
  title: string;
  detail: string;
  severity: "warn" | "info";
  fixLabel?: string;
  fixAction?:
    | "apply-profile-negative"
    | "remove-text-suppressors"
    | "enable-human-structure"
    | "disable-detail-pass"
    | "lower-cfg"
    | "reduce-batch";
};

type PromptScore = {
  label: "Weak" | "Usable" | "Strong";
  score: number;
};

type ModelRegistryEntry = ModelRegistryResponse["entries"][number];

function profileRegistryEntryId(profileId: CheckpointProfileId) {
  const ids: Record<CheckpointProfileId, string> = {
    general: "general-checkpoint",
    anime: "anime-checkpoint",
    photoreal: "photoreal-checkpoint",
    "photoreal-sdxl": "photoreal-sdxl-checkpoint",
    product: "product-checkpoint",
    hunyuan3d: "hunyuan3d-checkpoint"
  };
  return ids[profileId];
}

function hasAny(value: string, terms: readonly string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function promptWantsReadableText(prompt: string) {
  return hasAny(prompt, ["label", "logo", "word", "text", "typography", "letter", "printed"]);
}

function isHumanScene(entry: ReturnType<typeof findSceneTemplate>) {
  return entry?.family === "human" || entry?.family === "photoreal";
}

@Component({
  selector: "app-generate-page",
  imports: [
    CommonModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDividerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule
  ],
  templateUrl: "./generate.page.html",
  styleUrl: "./generate.page.scss"
})
export class GeneratePage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  readonly workflows = selectableWorkflowKinds;
  readonly workflowLabels = workflowLabels;
  readonly stylePresets = stylePresets;
  readonly samplerNames = samplerNames;
  readonly schedulerNames = schedulerNames;
  readonly checkpointProfiles = checkpointProfiles;
  readonly humanPosePresetIds = humanPosePresetIds;
  readonly negativePromptTags = negativePromptTags;
  readonly sceneTemplates = sceneTemplates;
  readonly benchmarkPrompts = benchmarkPrompts;
  readonly optimizationModes = optimizationModes;
  readonly loading = signal(false);
  readonly composing = signal(false);
  readonly uploading = signal(false);
  readonly supportLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly supportError = signal<string | null>(null);
  readonly uploadedSourceImage = signal<string | null>(null);
  readonly selectedSceneId = signal<GenerationSceneId | "">("");
  readonly selectedStyleRecipeId = signal("");
  readonly selectedBenchmarkId = signal("");
  readonly health = signal<HealthResponse | null>(null);
  readonly modelRegistry = signal<ModelRegistryResponse | null>(null);
  readonly learningSummary = signal<LearningSummaryResponse | null>(null);
  readonly formRevision = signal(0);
  readonly weakPromptConfirmed = signal(false);

  readonly form = this.fb.group({
    workflow: this.fb.control<WorkflowKind>("sdxl_text2img"),
    sceneId: this.fb.control<GenerationSceneId | "">(""),
    styleRecipeId: this.fb.control(""),
    benchmarkId: this.fb.control(""),
    optimizationMode: this.fb.control<OptimizationMode>("balanced"),
    candidateCount: this.fb.control(2, [Validators.min(1), Validators.max(3)]),
    stylePreset: this.fb.control<StylePreset>("cinematic"),
    prompt: this.fb.control("", [Validators.required, Validators.minLength(3)]),
    negativePrompt: this.fb.control(""),
    checkpointProfileId: this.fb.control<CheckpointProfileId>("general"),
    steps: this.fb.control(30, [Validators.min(1), Validators.max(150)]),
    cfg: this.fb.control(7, [Validators.min(1), Validators.max(30)]),
    width: this.fb.control(1024, [Validators.min(256), Validators.max(2048)]),
    height: this.fb.control(1024, [Validators.min(256), Validators.max(2048)]),
    samplerName: this.fb.control("dpmpp_2m"),
    scheduler: this.fb.control("karras"),
    seed: this.fb.control<number | null>(null),
    autoRepairOnLowScore: this.fb.control(true),
    autoRepairThreshold: this.fb.control(62),
    enableDetailPass: this.fb.control(false),
    detailPassDenoise: this.fb.control(0.18, [Validators.min(0.05), Validators.max(0.6)]),
    humanStructureMode: this.fb.control<"off" | "portrait" | "full-body" | "action">("off"),
    humanControlMode: this.fb.control<"auto" | "off" | "openpose">("auto"),
    humanPosePresetId: this.fb.control<NonNullable<ModelConfig["humanPosePresetId"]>>("auto"),
    controlStrength: this.fb.control(0.8, [Validators.min(0), Validators.max(1.5)])
  });

  readonly selectedWorkflow = signal<WorkflowKind>("sdxl_text2img");
  readonly selectedWorkflowCapabilities = computed(() => workflowCapabilities[this.selectedWorkflow()]);
  readonly selectedScene = computed(() => findSceneTemplate(this.selectedSceneId()));
  readonly selectedStyleRecipe = computed(() => findStyleRecipe(this.selectedStyleRecipeId()));
  readonly availableStyleRecipes = computed(() => getStyleRecipesForScene(this.selectedSceneId()));
  readonly candidateDirections = computed(() => candidateDirectionsForScene(this.selectedSceneId()));
  readonly modelEntriesById = computed(
    () => new Map((this.modelRegistry()?.entries ?? []).map((entry) => [entry.id, entry] as const))
  );
  readonly selectedProfileEntry = computed(() => {
    this.formRevision();
    return this.modelEntriesById().get(profileRegistryEntryId(this.form.controls.checkpointProfileId.value)) ?? null;
  });
  readonly openPoseEntry = computed(() => this.modelEntriesById().get("controlnet-openpose") ?? null);
  readonly needsOpenPoseControl = computed(() => {
    this.formRevision();
    const value = this.form.getRawValue();
    return (
      value.workflow === "sdxl_openpose_text2img" ||
      value.humanControlMode === "openpose" ||
      (value.humanControlMode === "auto" &&
        (value.humanStructureMode === "full-body" || value.humanStructureMode === "action"))
    );
  });
  readonly readinessEntries = computed(() => {
    this.formRevision();
    const ids = new Set<string>([
      profileRegistryEntryId(this.form.controls.checkpointProfileId.value),
      "sdxl-negative-embedding"
    ]);
    const workflow = this.form.controls.workflow.value;
    if (workflow === "sdxl_text2img" || workflow === "sdxl_img2img" || workflow === "sdxl_openpose_text2img") {
      ids.add("sdxl-vae");
    }
    if (workflow === "qwen_anime_text2img") {
      ids.add("qwen-vae");
    }
    if (this.needsOpenPoseControl()) {
      ids.add("controlnet-openpose");
    }
    return Array.from(ids)
      .map((id) => this.modelEntriesById().get(id))
      .filter((entry): entry is ModelRegistryEntry => Boolean(entry));
  });
  readonly activeLearningCategory = computed<LearningCategorySummary | null>(() => {
    this.formRevision();
    const summary = this.learningSummary();
    const sceneId = this.form.controls.sceneId.value;
    if (!summary || !sceneId) {
      return null;
    }
    const styleRecipeId = this.form.controls.styleRecipeId.value;
    return (
      (styleRecipeId
        ? summary.styleCategories.find((entry) => entry.categoryId === sceneId && entry.styleRecipeId === styleRecipeId)
        : null) ??
      summary.categories.find((entry) => entry.categoryId === sceneId) ??
      null
    );
  });
  readonly promptDiagnostics = computed(() => this.buildPromptDiagnostics());
  readonly promptScore = computed<PromptScore>(() => {
    const diagnostics = this.promptDiagnostics();
    const penalty = diagnostics.reduce((score, item) => score + (item.severity === "warn" ? 14 : 6), 0);
    const value = Math.max(0, 100 - penalty);
    return {
      score: value,
      label: value >= 82 ? "Strong" : value >= 62 ? "Usable" : "Weak"
    };
  });

  constructor() {
    this.form.valueChanges.subscribe(() => {
      this.formRevision.update((value) => value + 1);
      this.weakPromptConfirmed.set(false);
    });
    this.form.controls.workflow.valueChanges.subscribe((workflow) => {
      this.selectedWorkflow.set(workflow);
      const capability = workflowCapabilities[workflow];
      this.form.patchValue(
        {
          stylePreset: capability.recommendedStylePreset,
          checkpointProfileId: capability.recommendedProfileId,
          samplerName: capability.recommendedSamplerName,
          scheduler: capability.recommendedScheduler,
          enableDetailPass: false
        },
        { emitEvent: false }
      );
    });
    this.form.controls.sceneId.valueChanges.subscribe((sceneId) => {
      this.selectedSceneId.set(sceneId);
      this.applySceneTemplate(sceneId);
    });
    this.form.controls.styleRecipeId.valueChanges.subscribe((recipeId) => {
      this.selectedStyleRecipeId.set(recipeId);
      this.applyStyleRecipe(recipeId);
    });
    this.form.controls.benchmarkId.valueChanges.subscribe((benchmarkId) => {
      this.selectedBenchmarkId.set(benchmarkId);
      this.applyBenchmarkPrompt(benchmarkId);
    });
    this.form.controls.optimizationMode.valueChanges.subscribe((mode) => {
      this.applyOptimizationMode(mode);
    });
    this.applyStudioTransfer();
    void this.loadSupportData();
  }

  async loadSupportData() {
    this.supportLoading.set(true);
    this.supportError.set(null);
    try {
      const [health, registry, learningSummary] = await Promise.all([
        this.api.getHealth(),
        this.api.getModelRegistry(),
        this.api.getLearningSummary()
      ]);
      this.health.set(health);
      this.modelRegistry.set(registry);
      this.learningSummary.set(learningSummary);
    } catch (error) {
      this.supportError.set(error instanceof Error ? error.message : "Generate support data failed.");
    } finally {
      this.supportLoading.set(false);
    }
  }

  private markFormChanged() {
    this.formRevision.update((value) => value + 1);
    this.weakPromptConfirmed.set(false);
  }

  private applyStudioTransfer() {
    if (typeof window === "undefined") {
      return;
    }

    const rawPayload = window.localStorage.getItem("studio-to-generate");
    if (!rawPayload) {
      return;
    }

    window.localStorage.removeItem("studio-to-generate");
    try {
      const payload = JSON.parse(rawPayload) as StudioTransferPayload;
      if (typeof payload.prompt !== "string") {
        return;
      }

      this.selectedSceneId.set("");
      this.selectedStyleRecipeId.set("");
      this.selectedBenchmarkId.set("");
      this.form.patchValue(
        {
          sceneId: "",
          styleRecipeId: "",
          benchmarkId: "",
          prompt: payload.prompt,
          negativePrompt: payload.negativePrompt ?? "",
          stylePreset: payload.stylePreset ?? this.form.controls.stylePreset.value,
          checkpointProfileId: payload.modelProfileId ?? this.form.controls.checkpointProfileId.value,
          ...(typeof payload.params?.steps === "number" ? { steps: payload.params.steps } : {}),
          ...(typeof payload.params?.cfg === "number" ? { cfg: payload.params.cfg } : {}),
          ...(typeof payload.params?.width === "number" ? { width: payload.params.width } : {}),
          ...(typeof payload.params?.height === "number" ? { height: payload.params.height } : {}),
          ...(typeof payload.params?.samplerName === "string" ? { samplerName: payload.params.samplerName } : {}),
          ...(typeof payload.params?.scheduler === "string" ? { scheduler: payload.params.scheduler } : {})
        },
        { emitEvent: false }
      );
    } catch {
      this.error.set("Payload Studio non valido.");
    }
    this.markFormChanged();
  }

  applyOptimizationMode(modeId: OptimizationMode) {
    const mode = optimizationModes.find((item) => item.id === modeId);
    if (!mode) {
      return;
    }

    this.form.patchValue(
      {
        candidateCount: mode.candidateCount,
        autoRepairOnLowScore: mode.autoRepair,
        autoRepairThreshold: mode.threshold
      },
      { emitEvent: false }
    );
    this.markFormChanged();
  }

  isNegativeTagActive(tag: NegativePromptTag | string) {
    this.formRevision();
    return splitPromptList(this.form.controls.negativePrompt.value).some(
      (item) => item.toLowerCase() === tag.toLowerCase()
    );
  }

  toggleNegativeTag(tag: NegativePromptTag) {
    const current = splitPromptList(this.form.controls.negativePrompt.value);
    const active = current.some((item) => item.toLowerCase() === tag.toLowerCase());
    const next = active ? current.filter((item) => item.toLowerCase() !== tag.toLowerCase()) : [...current, tag];
    this.form.controls.negativePrompt.setValue(next.join(", "));
  }

  applyProfileNegativePrompt() {
    this.appendNegativeBlocks(checkpointProfileNegativePromptMap[this.form.controls.checkpointProfileId.value]);
  }

  applyDiagnosticFix(action: PromptDiagnostic["fixAction"]) {
    if (!action) {
      return;
    }
    if (action === "apply-profile-negative") {
      this.applyProfileNegativePrompt();
      return;
    }
    if (action === "remove-text-suppressors") {
      const next = splitPromptList(this.form.controls.negativePrompt.value).filter(
        (item) => !["text", "logo"].includes(item.toLowerCase())
      );
      this.form.controls.negativePrompt.setValue(next.join(", "));
      return;
    }
    if (action === "enable-human-structure") {
      const scene = this.selectedScene();
      this.form.patchValue({
        humanStructureMode: scene?.id === "cinematic-action" ? "action" : scene?.id === "fashion-editorial" ? "full-body" : "portrait",
        humanControlMode: "auto",
        humanPosePresetId: scene?.modelConfig.humanPosePresetId ?? "auto"
      });
      return;
    }
    if (action === "disable-detail-pass") {
      this.form.controls.enableDetailPass.setValue(false);
      return;
    }
    if (action === "lower-cfg") {
      this.form.controls.cfg.setValue(this.selectedScene()?.family === "anime" ? 4.2 : 5.2);
      return;
    }
    if (action === "reduce-batch") {
      this.form.patchValue({ candidateCount: 1, optimizationMode: "fast-iterate" });
    }
  }

  applySceneTemplate(sceneId: GenerationSceneId | "") {
    const scene = findSceneTemplate(sceneId);
    if (!scene) {
      return;
    }

    const suggestedRecipe = getSuggestedStyleRecipe(scene.id);
    const nextPrompt = this.form.controls.prompt.value.trim()
      ? appendPromptBlocks(this.form.controls.prompt.value, scene.promptBlocks)
      : scene.promptBlocks.join(", ");

    this.selectedStyleRecipeId.set(suggestedRecipe?.id ?? "");
    this.form.patchValue(
      {
        benchmarkId: "",
        workflow: scene.workflow,
        stylePreset: scene.stylePreset,
        checkpointProfileId: scene.checkpointProfileId,
        styleRecipeId: suggestedRecipe?.id ?? "",
        prompt: nextPrompt,
        negativePrompt: scene.negativePrompt,
        steps: scene.params.steps,
        cfg: scene.params.cfg,
        width: scene.params.width,
        height: scene.params.height,
        samplerName: scene.params.samplerName,
        scheduler: scene.params.scheduler
      },
      { emitEvent: false }
    );
    this.selectedWorkflow.set(scene.workflow);
    this.selectedBenchmarkId.set("");
    this.patchModelControls(scene.modelConfig);

    if (suggestedRecipe) {
      this.applyStyleRecipe(suggestedRecipe.id);
    }
    this.markFormChanged();
  }

  applyStyleRecipe(recipeId: string) {
    const recipe = findStyleRecipe(recipeId);
    if (!recipe) {
      return;
    }

    this.form.patchValue(
      {
        prompt: appendPromptBlocks(this.form.controls.prompt.value, recipe.reinforceBlocks),
        negativePrompt: appendPromptBlocks(this.form.controls.negativePrompt.value, recipe.negativeBlocks),
        ...(recipe.paramsOverrides?.steps ? { steps: recipe.paramsOverrides.steps } : {}),
        ...(recipe.paramsOverrides?.cfg ? { cfg: recipe.paramsOverrides.cfg } : {}),
        ...(recipe.paramsOverrides?.width ? { width: recipe.paramsOverrides.width } : {}),
        ...(recipe.paramsOverrides?.height ? { height: recipe.paramsOverrides.height } : {}),
        ...(recipe.paramsOverrides?.samplerName ? { samplerName: recipe.paramsOverrides.samplerName } : {}),
        ...(recipe.paramsOverrides?.scheduler ? { scheduler: recipe.paramsOverrides.scheduler } : {})
      },
      { emitEvent: false }
    );
    this.patchModelControls(recipe.modelConfigOverrides ?? {});
    this.markFormChanged();
  }

  applyBenchmarkPrompt(benchmarkId: string) {
    const benchmark = findBenchmark(benchmarkId);
    if (!benchmark) {
      return;
    }

    const scene = findSceneTemplate(benchmark.sceneId);
    const recipe = findStyleRecipe(benchmark.styleRecipeId);
    if (!scene) {
      return;
    }

    this.selectedSceneId.set(scene.id);
    this.selectedStyleRecipeId.set(recipe?.id ?? "");
    this.form.patchValue(
      {
        sceneId: scene.id,
        styleRecipeId: recipe?.id ?? "",
        workflow: scene.workflow,
        stylePreset: scene.stylePreset,
        checkpointProfileId: scene.checkpointProfileId,
        prompt: recipe ? appendPromptBlocks(benchmark.prompt, recipe.reinforceBlocks) : benchmark.prompt,
        negativePrompt: recipe ? appendPromptBlocks(benchmark.negativePrompt, recipe.negativeBlocks) : benchmark.negativePrompt,
        steps: recipe?.paramsOverrides?.steps ?? scene.params.steps,
        cfg: recipe?.paramsOverrides?.cfg ?? scene.params.cfg,
        width: recipe?.paramsOverrides?.width ?? scene.params.width,
        height: recipe?.paramsOverrides?.height ?? scene.params.height,
        samplerName: recipe?.paramsOverrides?.samplerName ?? scene.params.samplerName,
        scheduler: recipe?.paramsOverrides?.scheduler ?? scene.params.scheduler
      },
      { emitEvent: false }
    );
    this.selectedWorkflow.set(scene.workflow);
    this.patchModelControls({
      ...scene.modelConfig,
      ...(recipe?.modelConfigOverrides ?? {})
    });
    this.markFormChanged();
  }

  private patchModelControls(modelConfig: Partial<ModelConfig>) {
    this.form.patchValue(
      {
        enableDetailPass: modelConfig.enableDetailPass ?? this.form.controls.enableDetailPass.value,
        detailPassDenoise: modelConfig.detailPassDenoise ?? this.form.controls.detailPassDenoise.value,
        humanStructureMode: modelConfig.humanStructureMode ?? this.form.controls.humanStructureMode.value,
        humanControlMode: modelConfig.humanControlMode ?? this.form.controls.humanControlMode.value,
        humanPosePresetId: modelConfig.humanPosePresetId ?? this.form.controls.humanPosePresetId.value,
        controlStrength: modelConfig.controlStrength ?? this.form.controls.controlStrength.value
      },
      { emitEvent: false }
    );
    this.markFormChanged();
  }

  async composePrompt() {
    const prompt = this.form.controls.prompt.value.trim();
    if (prompt.length < 3) {
      this.error.set("Scrivi almeno una breve descrizione prima di comporre il prompt.");
      return;
    }

    this.error.set(null);
    this.composing.set(true);
    try {
      const result = await this.api.composePrompt({
        userText: prompt,
        preset: this.form.controls.stylePreset.value,
        promptScore: this.promptScore(),
        diagnostics: this.promptDiagnostics().map(({ id, title, detail, severity }) => ({ id, title, detail, severity }))
      });
      this.form.patchValue({
        prompt: result.prompt,
        negativePrompt: result.negativePrompt,
        steps: result.params.steps,
        cfg: result.params.cfg,
        width: result.params.width,
        height: result.params.height,
        samplerName: result.params.samplerName,
        scheduler: result.params.scheduler,
        checkpointProfileId: result.modelProfileId ?? this.form.controls.checkpointProfileId.value
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Prompt compose failed.");
    } finally {
      this.composing.set(false);
    }
  }

  async uploadSourceImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.error.set(null);
    this.uploading.set(true);
    try {
      const uploaded = await this.api.uploadComfyInputImage(file);
      this.uploadedSourceImage.set(uploaded.filename);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      this.uploading.set(false);
      input.value = "";
    }
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set("Controlla prompt e parametri prima di lanciare il job.");
      return;
    }
    if (this.needsOpenPoseControl() && this.openPoseEntry() && !this.openPoseEntry()?.exists) {
      this.error.set("OpenPose richiede un modello ControlNet installato/configurato. Disattiva OpenPose o configura COMFY_CONTROLNET_OPENPOSE.");
      return;
    }
    if (this.promptScore().label === "Weak" && !this.weakPromptConfirmed()) {
      this.weakPromptConfirmed.set(true);
      this.error.set("Prompt score Weak. Correggi i segnali o premi di nuovo Genera per continuare.");
      return;
    }

    const value = this.form.getRawValue();
    const candidateCount = Math.max(1, Math.min(3, value.candidateCount));
    const batchId = candidateCount > 1 ? crypto.randomUUID() : "";

    this.error.set(null);
    this.loading.set(true);
    try {
      const jobs = [];
      for (let index = 0; index < candidateCount; index += 1) {
        jobs.push(await this.api.createJob(this.buildPayload(index, candidateCount, batchId)));
      }
      await this.router.navigate(["/jobs", jobs[0]?.id]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Job submit failed.");
    } finally {
      this.loading.set(false);
    }
  }

  private buildPayload(candidateIndex: number, candidateCount: number, batchId: string): CreateJobInput {
    const value = this.form.getRawValue();
    const sourceImageName = this.uploadedSourceImage();
    const scene = findSceneTemplate(value.sceneId);
    const recipe = findStyleRecipe(value.styleRecipeId);
    const candidate = candidateCount > 1 ? recipeForCandidate(value.sceneId, candidateIndex) : null;
    const promptWithRecipe = recipe ? appendPromptBlocks(value.prompt, recipe.reinforceBlocks) : value.prompt;
    const prompt = candidate ? appendPromptBlocks(promptWithRecipe, candidate.promptBlocks) : promptWithRecipe;
    const negativeWithRecipe = recipe ? appendPromptBlocks(value.negativePrompt, recipe.negativeBlocks) : value.negativePrompt;
    const negativePrompt = candidate ? appendPromptBlocks(negativeWithRecipe, candidate.negativeBlocks) : negativeWithRecipe;
    const candidateLabel = candidate ? `${candidateIndex + 1}. ${candidate.label}` : scene?.label ?? "Manual";
    const params: CreateJobInput["params"] = {
      prompt,
      negativePrompt,
      steps: candidate?.paramsOverrides?.steps ?? value.steps,
      cfg: candidate?.paramsOverrides?.cfg ?? value.cfg,
      width: candidate?.paramsOverrides?.width ?? value.width,
      height: candidate?.paramsOverrides?.height ?? value.height,
      samplerName: candidate?.paramsOverrides?.samplerName ?? value.samplerName,
      scheduler: candidate?.paramsOverrides?.scheduler ?? value.scheduler,
      ...(value.seed == null ? {} : { seed: value.seed + candidateIndex })
    };
    const modelConfig: ModelConfig = defaultModelConfig({
      ...(scene?.modelConfig ?? {}),
      ...(recipe?.modelConfigOverrides ?? {}),
      checkpointProfileId: value.checkpointProfileId,
      ...(scene ? { renderCategoryId: scene.id } : {}),
      ...(recipe ? { renderStyleRecipeId: recipe.id, renderStyleRecipeLabel: recipe.label } : {}),
      ...(candidate
        ? {
            renderVariantId: candidate.label.toLowerCase().replaceAll(" ", "-"),
            renderVariantLabel: candidate.label
          }
        : {}),
      humanStructureMode: value.humanStructureMode,
      humanControlMode: value.humanControlMode,
      humanPosePresetId: value.humanPosePresetId,
      controlStrength: value.controlStrength,
      autoRepairOnLowScore: value.autoRepairOnLowScore,
      autoRepairThreshold: value.autoRepairThreshold,
      renderBatchId: batchId,
      renderBatchSize: candidateCount,
      renderCandidateIndex: candidateIndex + 1,
      renderCandidateLabel: candidateLabel,
      enableDetailPass: value.enableDetailPass,
      detailPassDenoise: value.detailPassDenoise,
      ...(candidate?.modelConfigOverrides ?? {}),
      ...(sourceImageName ? { sourceImageName } : {})
    });

    return {
      workflow: value.workflow,
      ...(sourceImageName ? { inputImagePath: sourceImageName } : {}),
      params,
      modelConfig
    };
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

  modelTone(entry: ModelRegistryEntry) {
    if (entry.exists) {
      return "ready";
    }
    return entry.required ? "missing" : "optional";
  }

  private appendNegativeBlocks(blocks: readonly string[]) {
    this.form.controls.negativePrompt.setValue(appendPromptBlocks(this.form.controls.negativePrompt.value, blocks));
  }

  private buildPromptDiagnostics(): PromptDiagnostic[] {
    this.formRevision();
    const value = this.form.getRawValue();
    const scene = findSceneTemplate(value.sceneId);
    const prompt = value.prompt.trim();
    const negativePrompt = value.negativePrompt.trim();
    const diagnostics: PromptDiagnostic[] = [];
    const promptBlocks = splitPromptList(prompt);
    const negativeBlocks = splitPromptList(negativePrompt);
    const selectedEntry = this.selectedProfileEntry();
    const learning = this.activeLearningCategory();

    if (!scene) {
      diagnostics.push({
        id: "scene-missing",
        title: "Scene manuale",
        detail: "Nessuna lane selezionata: learning e preset lavorano con meno contesto.",
        severity: "info"
      });
    }

    if (promptBlocks.length < 5) {
      diagnostics.push({
        id: "prompt-short",
        title: "Prompt corto",
        detail: "Aggiungi soggetto, inquadratura, luce, ambiente e vincoli di qualità.",
        severity: "warn"
      });
    }

    if (selectedEntry && !selectedEntry.exists) {
      diagnostics.push({
        id: "checkpoint-missing",
        title: "Checkpoint non trovato",
        detail: `${selectedEntry.envVar} punta a ${selectedEntry.configuredFile ?? "nessun file"}.`,
        severity: selectedEntry.required ? "warn" : "info"
      });
    }

    if (isHumanScene(scene) && value.humanStructureMode === "off") {
      diagnostics.push({
        id: "human-structure-off",
        title: "Human structure off",
        detail: "La lane umana beneficia di struttura anatomica esplicita nel model config.",
        severity: "warn",
        fixLabel: "Attiva struttura",
        fixAction: "enable-human-structure"
      });
    }

    if (isHumanScene(scene) && value.enableDetailPass && (value.humanStructureMode === "full-body" || value.humanStructureMode === "action")) {
      diagnostics.push({
        id: "detail-full-body-risk",
        title: "Detail pass rischioso",
        detail: "Su figura intera o action può amplificare artefatti di mani, piedi e arti.",
        severity: "warn",
        fixLabel: "Disattiva",
        fixAction: "disable-detail-pass"
      });
    }

    if (this.needsOpenPoseControl() && this.openPoseEntry() && !this.openPoseEntry()?.exists) {
      diagnostics.push({
        id: "openpose-missing",
        title: "OpenPose non pronto",
        detail: "ControlNet OpenPose non risulta disponibile dal registry.",
        severity: "warn"
      });
    }

    if ((scene?.family === "anime" || scene?.family === "photoreal" || scene?.family === "human") && value.cfg > 6) {
      diagnostics.push({
        id: "cfg-high",
        title: "CFG alto",
        detail: "CFG troppo alto tende a irrigidire volti, mani e linework.",
        severity: "info",
        fixLabel: "Riduci CFG",
        fixAction: "lower-cfg"
      });
    }

    if (scene?.family === "anime" && hasAny(prompt, ["black bodysuit", "dark cyber", "neon purple", "shadow silhouette"])) {
      diagnostics.push({
        id: "anime-dark-collapse",
        title: "Anime troppo scuro",
        detail: "Questi termini spingono verso personaggi neri e poco leggibili.",
        severity: "warn"
      });
    }

    if (promptWantsReadableText(prompt) && negativeBlocks.some((item) => ["text", "logo"].includes(item.toLowerCase()))) {
      diagnostics.push({
        id: "text-negative-conflict",
        title: "Testo in conflitto",
        detail: "Il prompt chiede testo leggibile ma il negative prompt lo sopprime.",
        severity: "warn",
        fixLabel: "Rimuovi soppressori",
        fixAction: "remove-text-suppressors"
      });
    }

    if (negativeBlocks.length < 5) {
      diagnostics.push({
        id: "negative-light",
        title: "Negative leggero",
        detail: "Aggiungi il preset negativo del profilo per stabilizzare la lane.",
        severity: "info",
        fixLabel: "Applica profilo",
        fixAction: "apply-profile-negative"
      });
    }

    if (value.candidateCount > 1 && value.width * value.height >= 1_500_000) {
      diagnostics.push({
        id: "batch-heavy",
        title: "Batch pesante",
        detail: "Risoluzione alta e più candidati aumentano memoria e tempo coda.",
        severity: "info",
        fixLabel: "Riduci batch",
        fixAction: "reduce-batch"
      });
    }

    if (learning?.avoidDetailPass && value.enableDetailPass) {
      diagnostics.push({
        id: "learning-avoid-detail",
        title: "Learning evita detail pass",
        detail: "La memoria segnala performance peggiori con detail pass in questa lane.",
        severity: "warn",
        fixLabel: "Disattiva",
        fixAction: "disable-detail-pass"
      });
    }

    if (learning?.disfavoredCheckpoints.length && selectedEntry?.configuredFile && learning.disfavoredCheckpoints.includes(selectedEntry.configuredFile)) {
      diagnostics.push({
        id: "learning-checkpoint-risk",
        title: "Checkpoint debole",
        detail: "La memoria ha penalizzato questo checkpoint nello scope selezionato.",
        severity: "warn"
      });
    }

    return diagnostics;
  }
}

function splitPromptList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
