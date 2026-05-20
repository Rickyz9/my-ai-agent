import { CommonModule } from "@angular/common";
import { Component, OnDestroy, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import type { JobListItem } from "@repo/shared";

import { ApiService } from "../../core/api.service";

type StatusFilter = "all" | JobListItem["status"];

function isTerminalStatus(status: JobListItem["status"]) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

@Component({
  selector: "app-jobs-page",
  imports: [
    CommonModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    RouterLink
  ],
  templateUrl: "./jobs.page.html",
  styleUrl: "./jobs.page.scss"
})
export class JobsPage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly streams = new Map<string, EventSource>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly jobs = signal<JobListItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal("");
  readonly statusFilter = signal<StatusFilter>("all");
  readonly liveCount = signal(0);
  readonly visibleJobs = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();
    return this.jobs().filter((job) => {
      const matchesStatus = status === "all" || job.status === status;
      const matchesSearch = !search || `${job.workflow} ${job.prompt} ${job.id}`.toLowerCase().includes(search);
      return matchesStatus && matchesSearch;
    });
  });
  readonly activeJobs = computed(() => this.jobs().filter((job) => !isTerminalStatus(job.status)).length);

  constructor() {
    void this.load();
    this.pollTimer = setInterval(() => void this.load(false), 10_000);
  }

  ngOnDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    for (const source of this.streams.values()) {
      source.close();
    }
    this.streams.clear();
  }

  async load(showLoading = true) {
    if (showLoading) {
      this.loading.set(true);
    }
    this.error.set(null);
    try {
      const jobs = await this.api.listJobs();
      this.jobs.set(jobs);
      this.syncStreams(jobs);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Job list failed.");
    } finally {
      if (showLoading) {
        this.loading.set(false);
      }
    }
  }

  setSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  setStatusFilter(value: StatusFilter) {
    this.statusFilter.set(value);
  }

  dataUrl(path: string | null) {
    return path ? this.api.dataUrl(path) : "";
  }

  visibleProgress(job: JobListItem) {
    return isTerminalStatus(job.status) ? job.progress : Math.max(4, job.progress);
  }

  private syncStreams(items: JobListItem[]) {
    const activeIds = new Set(items.filter((job) => !isTerminalStatus(job.status)).map((job) => job.id));

    for (const [jobId, source] of this.streams.entries()) {
      if (!activeIds.has(jobId)) {
        source.close();
        this.streams.delete(jobId);
      }
    }

    for (const job of items) {
      if (isTerminalStatus(job.status) || this.streams.has(job.id)) {
        continue;
      }

      const source = this.api.streamJob(job.id);
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as Pick<
            JobListItem,
            "id" | "workflow" | "status" | "progress" | "createdAt" | "updatedAt" | "previewPath" | "prompt"
          >;
          this.jobs.update((current) => current.map((entry) => (entry.id === payload.id ? { ...entry, ...payload } : entry)));
          if (isTerminalStatus(payload.status)) {
            source.close();
            this.streams.delete(job.id);
            this.liveCount.set(this.streams.size);
          }
        } catch {
          source.close();
          this.streams.delete(job.id);
          this.liveCount.set(this.streams.size);
        }
      };
      source.onerror = () => {
        source.close();
        this.streams.delete(job.id);
        this.liveCount.set(this.streams.size);
      };
      this.streams.set(job.id, source);
    }
    this.liveCount.set(this.streams.size);
  }
}
