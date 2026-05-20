import path from "node:path";
import { z } from "zod";

export const workspaceRoot = path.resolve(process.cwd(), "../..");

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  API_BODY_LIMIT_MB: z.coerce.number().default(25),
  OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1"),
  OLLAMA_VISION_MODEL: z.string().optional(),
  COMFY_URL: z.string().url().default("http://127.0.0.1:8000"),
  HUNYUAN3D_API_URL: z.string().url().optional(),
  COMFY_MODELS_DIR: z.string().default(path.join(process.env.HOME ?? "", "Documents", "ComfyUI", "models")),
  COMFY_CHECKPOINT: z.string().optional(),
  COMFY_CHECKPOINT_ANIME: z.string().optional(),
  COMFY_CHECKPOINT_PHOTOREAL: z.string().optional(),
  COMFY_CHECKPOINT_PHOTOREAL_SDXL: z.string().optional(),
  COMFY_CHECKPOINT_PRODUCT: z.string().optional(),
  COMFY_CHECKPOINT_3D: z.string().optional(),
  COMFY_SDXL_VAE: z.string().optional(),
  COMFY_SDXL_NEGATIVE_EMBEDDING: z.string().optional(),
  COMFY_CONTROLNET_OPENPOSE: z.string().optional(),
  COMFY_CONTROLNET_VAE: z.string().optional(),
  COMFY_QWEN_UNET: z.string().optional(),
  COMFY_QWEN_CLIP: z.string().optional(),
  COMFY_QWEN_VAE: z.string().optional(),
  COMFY_REFINER_CHECKPOINT: z.string().optional(),
  COMFY_UPSCALE_MODEL: z.string().optional(),
  COMFY_LORA_NAME: z.string().optional(),
  COMFY_LORA_STRENGTH: z.coerce.number().optional(),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
  DATA_DIR: z.string().default(path.join(workspaceRoot, "data"))
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  COMFY_MODELS_DIR: path.isAbsolute(parsedEnv.COMFY_MODELS_DIR)
    ? parsedEnv.COMFY_MODELS_DIR
    : path.resolve(workspaceRoot, parsedEnv.COMFY_MODELS_DIR),
  DATA_DIR: path.isAbsolute(parsedEnv.DATA_DIR)
    ? parsedEnv.DATA_DIR
    : path.resolve(workspaceRoot, parsedEnv.DATA_DIR)
};
