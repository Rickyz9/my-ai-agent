import { access, readdir } from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { modelRegistryResponseSchema } from "@repo/shared";

import { env } from "../lib/config.js";

type ModelEntryDefinition = {
  id: string;
  label: string;
  envVar:
    | "COMFY_CHECKPOINT"
    | "COMFY_CHECKPOINT_ANIME"
    | "COMFY_CHECKPOINT_PHOTOREAL"
    | "COMFY_CHECKPOINT_PHOTOREAL_SDXL"
    | "COMFY_CHECKPOINT_PRODUCT"
    | "COMFY_CHECKPOINT_3D"
    | "COMFY_SDXL_VAE"
    | "COMFY_SDXL_NEGATIVE_EMBEDDING"
    | "COMFY_CONTROLNET_OPENPOSE"
    | "COMFY_CONTROLNET_VAE"
    | "COMFY_REFINER_CHECKPOINT"
    | "COMFY_QWEN_UNET"
    | "COMFY_QWEN_CLIP"
    | "COMFY_QWEN_VAE"
    | "COMFY_LORA_NAME"
    | "COMFY_UPSCALE_MODEL";
  category: string;
  required: boolean;
  usedBy: string[];
};

const modelEntries: ModelEntryDefinition[] = [
  {
    id: "general-checkpoint",
    label: "General checkpoint",
    envVar: "COMFY_CHECKPOINT",
    category: "checkpoints",
    required: true,
    usedBy: ["sdxl_text2img", "sdxl_img2img"]
  },
  {
    id: "anime-checkpoint",
    label: "Anime checkpoint",
    envVar: "COMFY_CHECKPOINT_ANIME",
    category: "checkpoints",
    required: false,
    usedBy: ["sdxl_text2img", "anime profile fallback"]
  },
  {
    id: "photoreal-checkpoint",
    label: "Photoreal checkpoint",
    envVar: "COMFY_CHECKPOINT_PHOTOREAL",
    category: "checkpoints",
    required: false,
    usedBy: ["sdxl_text2img", "photoreal profile"]
  },
  {
    id: "photoreal-sdxl-checkpoint",
    label: "Photoreal SDXL checkpoint",
    envVar: "COMFY_CHECKPOINT_PHOTOREAL_SDXL",
    category: "checkpoints",
    required: false,
    usedBy: ["sdxl_text2img", "photoreal-sdxl profile"]
  },
  {
    id: "product-checkpoint",
    label: "Product checkpoint",
    envVar: "COMFY_CHECKPOINT_PRODUCT",
    category: "checkpoints",
    required: false,
    usedBy: ["sdxl_text2img", "product profile"]
  },
  {
    id: "hunyuan3d-checkpoint",
    label: "Hunyuan3D checkpoint",
    envVar: "COMFY_CHECKPOINT_3D",
    category: "checkpoints",
    required: false,
    usedBy: ["hunyuan3d_image_to_glb", "single-image to GLB generation"]
  },
  {
    id: "sdxl-vae",
    label: "SDXL custom VAE",
    envVar: "COMFY_SDXL_VAE",
    category: "vae",
    required: false,
    usedBy: ["sdxl_text2img", "sdxl_img2img", "photoreal-sdxl finishing"]
  },
  {
    id: "sdxl-negative-embedding",
    label: "SDXL negative embedding",
    envVar: "COMFY_SDXL_NEGATIVE_EMBEDDING",
    category: "embeddings",
    required: false,
    usedBy: ["sdxl_text2img negative prompt cleanup", "photoreal-sdxl stabilization"]
  },
  {
    id: "refiner-checkpoint",
    label: "SDXL refiner checkpoint",
    envVar: "COMFY_REFINER_CHECKPOINT",
    category: "checkpoints",
    required: false,
    usedBy: ["sdxl_text2img refiner"]
  },
  {
    id: "default-lora",
    label: "Default LoRA",
    envVar: "COMFY_LORA_NAME",
    category: "loras",
    required: false,
    usedBy: ["sdxl_text2img_lora", "portrait tuning", "style specialization"]
  },
  {
    id: "qwen-unet",
    label: "Qwen diffusion model",
    envVar: "COMFY_QWEN_UNET",
    category: "diffusion_models",
    required: false,
    usedBy: ["qwen_anime_text2img"]
  },
  {
    id: "controlnet-openpose",
    label: "OpenPose ControlNet model",
    envVar: "COMFY_CONTROLNET_OPENPOSE",
    category: "controlnet",
    required: false,
    usedBy: ["sdxl_openpose_text2img"]
  },
  {
    id: "controlnet-vae",
    label: "ControlNet VAE",
    envVar: "COMFY_CONTROLNET_VAE",
    category: "vae",
    required: false,
    usedBy: ["sdxl_openpose_text2img"]
  },
  {
    id: "qwen-clip",
    label: "Qwen text encoder",
    envVar: "COMFY_QWEN_CLIP",
    category: "text_encoders",
    required: false,
    usedBy: ["qwen_anime_text2img"]
  },
  {
    id: "qwen-vae",
    label: "Qwen VAE",
    envVar: "COMFY_QWEN_VAE",
    category: "vae",
    required: false,
    usedBy: ["qwen_anime_text2img"]
  },
  {
    id: "upscale-model",
    label: "Upscale model",
    envVar: "COMFY_UPSCALE_MODEL",
    category: "upscale_models",
    required: false,
    usedBy: ["upscale", "detail finishing"]
  }
];

async function safeListDir(dirPath: string) {
  try {
    const files = await readdir(dirPath);
    return files.sort();
  } catch {
    return [];
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function inferCheckpointArchitecture(filename: string | null | undefined) {
  const normalized = (filename ?? "").toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized.includes("hunyuan_3d") ||
    normalized.includes("hunyuan3d") ||
    normalized.includes("3d-dit-v2-mv") ||
    normalized.includes("3d_v2")
  ) {
    return "hunyuan3d";
  }

  if (normalized.includes("sdxl") || normalized.includes("_xl") || normalized.includes("xl_") || normalized.includes("juggernautxl")) {
    return "sdxl";
  }

  if (
    normalized.includes("sd15") ||
    normalized.includes("sd 1.5") ||
    normalized.includes("1.5") ||
    normalized.includes("majicmix") ||
    normalized.includes("realistic_v7")
  ) {
    return "sd15";
  }

  if (normalized.includes("qwen")) {
    return "qwen";
  }

  return "unknown";
}

function configuredModelFilename(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed && !trimmed.includes("put-your") ? trimmed : null;
}

export async function registerModelRoutes(app: FastifyInstance) {
  app.get("/api/models", async () => {
    const categoryCache = new Map<string, string[]>();
    const entries = await Promise.all(
      modelEntries.map(async (entry) => {
        const configuredFile = configuredModelFilename(env[entry.envVar]);
        const categoryDir = path.join(env.COMFY_MODELS_DIR, entry.category);
        const availableFiles =
          categoryCache.get(entry.category) ?? (await safeListDir(categoryDir));
        categoryCache.set(entry.category, availableFiles);

        const resolvedPath = configuredFile ? path.join(categoryDir, configuredFile) : null;
        const exists = resolvedPath ? await fileExists(resolvedPath) : false;

        return {
          id: entry.id,
          label: entry.label,
          envVar: entry.envVar,
          category: entry.category,
          configuredFile: configuredFile ?? null,
          resolvedPath,
          exists,
          architectureHint: entry.category === "checkpoints" ? inferCheckpointArchitecture(configuredFile) : null,
          required: entry.required,
          usedBy: entry.usedBy,
          availableFiles
        };
      })
    );

    return modelRegistryResponseSchema.parse({
      rootDir: env.COMFY_MODELS_DIR,
      entries
    });
  });
}
