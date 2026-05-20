import { Injectable } from "@angular/core";
import type {
  Asset,
  CandidateBatchResponse,
  ComposePromptInput,
  ComposePromptResult,
  CreateJobInput,
  HealthResponse,
  JobDetail,
  JobListItem,
  LearningDebugResponse,
  LearningOverrideInput,
  LearningOverrideResponse,
  LearningSummaryResponse,
  ModelRegistryResponse,
  RelatedJobsResponse,
  RenderEvaluation,
  RuntimeHealthResponse
} from "@repo/shared";

import { environment } from "../../environments/environment";

@Injectable({ providedIn: "root" })
export class ApiService {
  readonly apiBaseUrl = environment.apiBaseUrl;

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const hasJsonBody = init?.body != null && !(init.body instanceof File);
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(hasJsonBody ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  composePrompt(payload: ComposePromptInput) {
    return this.request<ComposePromptResult>("/api/prompt/compose", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  createJob(payload: CreateJobInput) {
    return this.request<{ id: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  rerunJob(id: string) {
    return this.request<{ id: string }>(`/api/jobs/${id}/rerun`, {
      method: "POST"
    });
  }

  rerunJobWithOverrides(
    id: string,
    payload: {
      workflow?: CreateJobInput["workflow"];
      params?: Partial<CreateJobInput["params"]>;
      modelConfig?: Partial<NonNullable<CreateJobInput["modelConfig"]>>;
    }
  ) {
    return this.request<{ id: string }>(`/api/jobs/${id}/rerun`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  listJobs() {
    return this.request<JobListItem[]>("/api/jobs");
  }

  getJob(id: string) {
    return this.request<JobDetail>(`/api/jobs/${id}`);
  }

  evaluateJob(id: string) {
    return this.request<RenderEvaluation>(`/api/jobs/${id}/evaluate`);
  }

  getRelatedJobs(id: string) {
    return this.request<RelatedJobsResponse>(`/api/jobs/${id}/related`);
  }

  getCandidateBatch(id: string) {
    return this.request<CandidateBatchResponse>(`/api/jobs/${id}/candidates`);
  }

  getLearningSummary() {
    return this.request<LearningSummaryResponse>("/api/learning/summary");
  }

  getLearningDebug(params?: {
    categoryId?: string;
    styleRecipeId?: string | null;
    fluxRenderMode?: "fast" | "quality" | null;
  }) {
    const search = new URLSearchParams();
    if (params?.categoryId) {
      search.set("categoryId", params.categoryId);
    }
    if (params?.styleRecipeId) {
      search.set("styleRecipeId", params.styleRecipeId);
    }
    if (params?.fluxRenderMode) {
      search.set("fluxRenderMode", params.fluxRenderMode);
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return this.request<LearningDebugResponse>(`/api/learning/debug${suffix}`);
  }

  applyLearningOverride(payload: LearningOverrideInput) {
    return this.request<LearningOverrideResponse>("/api/learning/override", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  listAssets() {
    return this.request<(Asset & { workflow: string; prompt: string })[]>("/api/assets");
  }

  getHealth() {
    return this.request<HealthResponse>("/api/health");
  }

  getRuntimeHealth() {
    return this.request<RuntimeHealthResponse>("/api/health/runtime");
  }

  getModelRegistry() {
    return this.request<ModelRegistryResponse>("/api/models");
  }

  async uploadComfyInputImage(file: File) {
    const response = await fetch(`${this.apiBaseUrl}/api/uploads/comfy-input`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": file.name
      },
      body: file,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    return (await response.json()) as { filename: string; contentType: string };
  }

  streamJob(id: string) {
    return new EventSource(`${this.apiBaseUrl}/api/jobs/${id}/stream`);
  }

  dataUrl(relativePath: string) {
    return `${this.apiBaseUrl}/data/${relativePath}`;
  }
}
