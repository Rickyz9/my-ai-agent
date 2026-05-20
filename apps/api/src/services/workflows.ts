import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CreateJobInput } from "@repo/shared";

import { workspaceRoot } from "../lib/config.js";

export async function loadWorkflowTemplate(workflow: CreateJobInput["workflow"]) {
  const workflowFile =
    workflow === "hunyuan3d_image_to_glb"
      ? "3d_hunyuan3d_image_to_model.json"
      : workflow === "sdxl_openpose_text2img"
        ? "pose_controlnet.json"
        : `${workflow}.json`;
  const workflowPath = path.join(workspaceRoot, "workflows", workflowFile);
  const raw = await readFile(workflowPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

export function workflowTemplateUnavailableMessage(template: Record<string, unknown>, workflow: string) {
  if (template._status !== "stub") {
    return null;
  }

  return typeof template._todo === "string"
    ? template._todo
    : `${workflow} is still a stub workflow. Replace it with a tested ComfyUI export first.`;
}
