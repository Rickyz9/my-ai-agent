import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import type { ModelRegistryResponse } from "@repo/shared";

import { ApiService } from "../../core/api.service";

@Component({
  selector: "app-models-page",
  imports: [CommonModule, MatButtonModule, MatChipsModule, MatExpansionModule, MatIconModule, MatProgressBarModule],
  templateUrl: "./models.page.html",
  styleUrl: "./models.page.scss"
})
export class ModelsPage {
  private readonly api = inject(ApiService);

  readonly registry = signal<ModelRegistryResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly entriesByCategory = computed(() => {
    const grouped = new Map<string, ModelRegistryResponse["entries"]>();
    for (const entry of this.registry()?.entries ?? []) {
      grouped.set(entry.category, [...(grouped.get(entry.category) ?? []), entry]);
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => {
        if (left === "loras") {
          return -1;
        }
        if (right === "loras") {
          return 1;
        }
        return left.localeCompare(right);
      })
      .map(([category, entries]) => ({ category, entries }));
  });
  readonly totals = computed(() => {
    const entries = this.registry()?.entries ?? [];
    return {
      total: entries.length,
      present: entries.filter((entry) => entry.exists).length,
      missingRequired: entries.filter((entry) => entry.required && !entry.exists).length,
      optionalMissing: entries.filter((entry) => !entry.required && !entry.exists).length
    };
  });

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.registry.set(await this.api.getModelRegistry());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Model registry load failed.");
    } finally {
      this.loading.set(false);
    }
  }

  modelTone(entry: ModelRegistryResponse["entries"][number]) {
    if (entry.exists) {
      return "ok";
    }
    return entry.required ? "missing" : "optional";
  }
}
