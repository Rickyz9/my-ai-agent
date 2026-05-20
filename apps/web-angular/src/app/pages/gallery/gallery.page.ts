import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import type { Asset } from "@repo/shared";

import { ApiService } from "../../core/api.service";

type GalleryAsset = Asset & { workflow: string; prompt: string };
type TypeFilter = "all" | GalleryAsset["type"];

@Component({
  selector: "app-gallery-page",
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
  templateUrl: "./gallery.page.html",
  styleUrl: "./gallery.page.scss"
})
export class GalleryPage {
  private readonly api = inject(ApiService);

  readonly assets = signal<GalleryAsset[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal("");
  readonly typeFilter = signal<TypeFilter>("all");
  readonly visibleAssets = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const type = this.typeFilter();
    return this.assets().filter((asset) => {
      const matchesType = type === "all" || asset.type === type;
      const matchesSearch = !search || `${asset.workflow} ${asset.prompt} ${asset.jobId}`.toLowerCase().includes(search);
      return matchesType && matchesSearch;
    });
  });
  readonly counts = computed(() => {
    const assets = this.assets();
    return {
      total: assets.length,
      images: assets.filter((asset) => asset.type === "image").length,
      videos: assets.filter((asset) => asset.type === "video").length,
      models: assets.filter((asset) => asset.type === "model").length
    };
  });

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.assets.set(await this.api.listAssets());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Gallery load failed.");
    } finally {
      this.loading.set(false);
    }
  }

  dataUrl(path: string) {
    return this.api.dataUrl(path);
  }

  setSearch(event: Event) {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  setTypeFilter(value: TypeFilter) {
    this.typeFilter.set(value);
  }
}
