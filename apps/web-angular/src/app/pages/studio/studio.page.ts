import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { checkpointProfiles, stylePresets, type ComposePromptResult, type StylePreset } from "@repo/shared";

import { ApiService } from "../../core/api.service";

function titleCase(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

@Component({
  selector: "app-studio-page",
  imports: [
    CommonModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReactiveFormsModule
  ],
  templateUrl: "./studio.page.html",
  styleUrl: "./studio.page.scss"
})
export class StudioPage {
  private readonly api = inject(ApiService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  readonly stylePresets = stylePresets;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);
  readonly result = signal<ComposePromptResult | null>(null);

  readonly form = this.fb.group({
    userText: this.fb.control("", [Validators.required, Validators.minLength(3)]),
    preset: this.fb.control<StylePreset>("cinematic")
  });

  readonly recommendedProfileLabel = computed(() => {
    const profileId = this.result()?.modelProfileId;
    return checkpointProfiles.find((profile) => profile.id === profileId)?.label ?? "General SDXL";
  });

  titleCase(value: string) {
    return titleCase(value);
  }

  async compose() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set("Scrivi una descrizione prima di comporre il prompt.");
      return;
    }

    const value = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);
    this.feedback.set(null);
    try {
      this.result.set(
        await this.api.composePrompt({
          userText: value.userText,
          preset: value.preset
        })
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : "Prompt compose failed.");
    } finally {
      this.loading.set(false);
    }
  }

  async copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      this.feedback.set(`${label} copiato.`);
      window.setTimeout(() => this.feedback.set(null), 1800);
    } catch (error) {
      this.feedback.set(error instanceof Error ? error.message : "Copia non riuscita.");
    }
  }

  paramsJson(output: ComposePromptResult) {
    return JSON.stringify(output.params, null, 2);
  }

  async sendToGenerate() {
    const result = this.result();
    if (!result) {
      return;
    }

    window.localStorage.setItem(
      "studio-to-generate",
      JSON.stringify({
        prompt: result.prompt,
        negativePrompt: result.negativePrompt,
        params: result.params,
        modelProfileId: result.modelProfileId ?? "general",
        stylePreset: this.form.controls.preset.value
      })
    );
    await this.router.navigate(["/generate"]);
  }
}
