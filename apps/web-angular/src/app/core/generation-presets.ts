import type { CheckpointProfileId, JobParams, ModelConfig, StylePreset, WorkflowKind } from "@repo/shared";

export type OptimizationMode = "quality-first" | "balanced" | "fast-iterate" | "low-memory";

export type GenerationSceneId =
  | "anime-action-character"
  | "anime-portrait"
  | "anime-school-daylight"
  | "anime-slice-of-life"
  | "anime-fantasy-adventurer"
  | "anime-idol-stage"
  | "anime-magical-girl"
  | "anime-samurai"
  | "anime-mecha-pilot"
  | "anime-cozy-portrait"
  | "editorial-portrait"
  | "beauty-closeup"
  | "fashion-editorial"
  | "cinematic-still"
  | "cinematic-action"
  | "architectural-interior"
  | "product-hero-shot"
  | "macro-product"
  | "food-editorial";

export type SceneFamily = "anime" | "photoreal" | "human" | "product" | "cinematic";

export type GenerationSceneTemplate = {
  id: GenerationSceneId;
  family: SceneFamily;
  label: string;
  description: string;
  workflow: WorkflowKind;
  stylePreset: StylePreset;
  checkpointProfileId: CheckpointProfileId;
  promptBlocks: readonly string[];
  negativePrompt: string;
  params: Pick<JobParams, "steps" | "cfg" | "samplerName" | "scheduler" | "width" | "height">;
  modelConfig: Partial<ModelConfig>;
};

export type GenerationStyleRecipe = {
  id: string;
  label: string;
  family: SceneFamily;
  targetSceneIds: readonly GenerationSceneId[];
  reinforceBlocks: readonly string[];
  negativeBlocks: readonly string[];
  paramsOverrides?: Partial<JobParams>;
  modelConfigOverrides?: Partial<ModelConfig>;
};

export type BenchmarkPrompt = {
  id: string;
  label: string;
  sceneId: GenerationSceneId;
  styleRecipeId: string;
  prompt: string;
  negativePrompt: string;
};

export type CandidateDirection = {
  label: string;
  promptBlocks: readonly string[];
  negativeBlocks: readonly string[];
  paramsOverrides?: Partial<JobParams>;
  modelConfigOverrides?: Partial<ModelConfig>;
};

const animeNegative =
  "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, neon purple aura, glowing contour lines, overpowered energy blast, background overpowering character, messy linework, text, watermark";

export const sceneTemplates: readonly GenerationSceneTemplate[] = [
  {
    id: "anime-action-character",
    family: "anime",
    label: "Anime Action Character",
    description: "Dynamic pose, readable anatomy, controlled effects.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime action character, dynamic full-body pose, intense expression",
      "clean silhouette, readable hands, symmetrical eyes",
      "controlled aura effects, floating debris, sharp facial features",
      "dramatic anime background, action environment, energized scene depth"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, bad anatomy, bad hands, fused fingers, extra limbs, distorted face, asymmetrical eyes, messy aura, plain white backdrop, empty studio background, text, watermark",
    params: { steps: 30, cfg: 4, samplerName: "er_sde", scheduler: "simple", width: 1024, height: 1024 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-portrait",
    family: "anime",
    label: "Anime Portrait",
    description: "Face, eyes, hair, expression clarity.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime character portrait, tight composition, expressive face",
      "symmetrical eyes, defined jawline, detailed hair strands",
      "soft rim lighting, polished cel-shaded rendering"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, distorted face, asymmetrical eyes, deformed mouth, bad hands, extra fingers, muddy colors, text, watermark",
    params: { steps: 28, cfg: 4, samplerName: "er_sde", scheduler: "simple", width: 832, height: 1216 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-school-daylight",
    family: "anime",
    label: "Anime School Daylight",
    description: "Bright uniform design, daylight, calm setting.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime school character, clean uniform design, bright morning classroom light",
      "expressive face, neat hair shape, readable outfit details",
      "soft pastel color palette, calm slice-of-life background"
    ],
    negativePrompt: animeNegative,
    params: { steps: 28, cfg: 4, samplerName: "er_sde", scheduler: "simple", width: 832, height: 1216 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-slice-of-life",
    family: "anime",
    label: "Anime Slice Of Life",
    description: "Everyday clothes, warm light, softer colors.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "slice-of-life anime character, casual outfit, relaxed natural pose",
      "warm daylight, soft color harmony, expressive eyes",
      "cozy everyday background, clean cel shading, quiet mood"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, neon aura, energy blast, chaotic effects, background overpowering character, muddy colors, text, watermark",
    params: { steps: 28, cfg: 3.9, samplerName: "er_sde", scheduler: "simple", width: 1024, height: 1024 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-fantasy-adventurer",
    family: "anime",
    label: "Anime Fantasy Adventurer",
    description: "Readable costume, accessories, colorful world context.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime fantasy adventurer, expressive heroic character design, readable costume layers",
      "leather satchel, cloth folds, small fantasy accessories, clean silhouette",
      "sunlit village or forest path background, rich but controlled colors"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, neon purple aura, glowing contour lines, overpowered energy blast, messy armor mass, cluttered costume, text, watermark",
    params: { steps: 30, cfg: 4.1, samplerName: "er_sde", scheduler: "simple", width: 832, height: 1216 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-idol-stage",
    family: "anime",
    label: "Anime Idol Stage",
    description: "Bright performer, costume readability, controlled lights.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime idol performer, bright stage outfit, cheerful expressive pose",
      "clean costume ribbons and fabric details, glossy hair highlights",
      "colorful stage lighting, confetti accents, character remains clearly lit"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, harsh neon rim glow, face obscured by lighting, background overpowering character, chaotic effects, text, watermark",
    params: { steps: 30, cfg: 4, samplerName: "er_sde", scheduler: "simple", width: 832, height: 1216 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-magical-girl",
    family: "anime",
    label: "Anime Magical Girl",
    description: "Pastel costume, readable pose, gentle magic.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime magical girl, elegant transformation outfit, readable pastel costume design",
      "soft magical sparkles, ribbon shapes, clear facial expression",
      "bright dreamy background, clean cel shading, graceful pose"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, violent neon aura, overpowered energy blast, messy aura, chaotic debris, text, watermark",
    params: { steps: 30, cfg: 4, samplerName: "er_sde", scheduler: "simple", width: 832, height: 1216 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-samurai",
    family: "anime",
    label: "Anime Samurai",
    description: "Period clothing, sword silhouette, natural light.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime samurai character, layered kimono and light armor, disciplined standing pose",
      "readable sword silhouette, clean fabric folds, calm focused expression",
      "autumn courtyard background, warm natural light, restrained cinematic color"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, sci-fi cyber armor, neon purple aura, energy blast, messy armor mass, unreadable sword, chaotic background, text, watermark",
    params: { steps: 30, cfg: 4.1, samplerName: "er_sde", scheduler: "simple", width: 832, height: 1216 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-mecha-pilot",
    family: "anime",
    label: "Anime Mecha Pilot",
    description: "Visible face, cockpit context, controlled interface glow.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "anime mecha pilot, expressive face visible through open helmet or cockpit framing",
      "clean pilot suit panels, readable mechanical design, crisp cel shading",
      "cockpit or hangar background, controlled cyan interface lights, character remains bright"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, fully obscured face, black bodysuit default, neon purple aura, glowing contour overload, unreadable armor mass, background overpowering character, text, watermark",
    params: { steps: 30, cfg: 4, samplerName: "er_sde", scheduler: "simple", width: 1024, height: 1024 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "anime-cozy-portrait",
    family: "anime",
    label: "Anime Cozy Portrait",
    description: "Warm portrait, hair detail, casual room setting.",
    workflow: "sdxl_text2img",
    stylePreset: "anime",
    checkpointProfileId: "anime",
    promptBlocks: [
      "cozy anime character portrait, soft warm indoor light, expressive gentle face",
      "detailed hair strands, clean eyes, cardigan or casual outfit texture",
      "quiet room background, soft color palette, polished cel shading"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, neon aura, harsh rim glow, overpowered energy effects, busy background, uneven eyes, text, watermark",
    params: { steps: 28, cfg: 3.9, samplerName: "er_sde", scheduler: "simple", width: 832, height: 1216 },
    modelConfig: { checkpointProfileId: "anime", enableRefiner: false, enableLora: false, enableDetailPass: false }
  },
  {
    id: "editorial-portrait",
    family: "human",
    label: "Editorial Portrait",
    description: "Single subject, studio light, stable face structure.",
    workflow: "sdxl_text2img",
    stylePreset: "editorial",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "single editorial subject, clean silhouette, magazine portrait framing",
      "disciplined studio lighting, realistic shadow behavior, stable facial structure",
      "polished skin detail, quiet background, grounded emotional tone"
    ],
    negativePrompt:
      "lowres, blurry, bad anatomy, duplicate subject, oversaturated, waxy skin, overstyled glamour, messy styling, text, watermark",
    params: { steps: 34, cfg: 5.6, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 832, height: 1216 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: true,
      detailPassDenoise: 0.16
    }
  },
  {
    id: "beauty-closeup",
    family: "photoreal",
    label: "Beauty Close-up",
    description: "Face-first realism, eye symmetry, skin detail.",
    workflow: "sdxl_text2img",
    stylePreset: "photoreal",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "tight beauty portrait, symmetrical eyes, clean skin texture",
      "soft studio lighting, controlled highlights, shallow depth of field",
      "defined jawline, clean hairline, polished final image"
    ],
    negativePrompt: "waxy skin, asymmetrical eyes, bad anatomy, bad hands, oversaturated, text, watermark",
    params: { steps: 34, cfg: 5.4, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 832, height: 1216 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: true,
      detailPassDenoise: 0.15
    }
  },
  {
    id: "fashion-editorial",
    family: "human",
    label: "Fashion Editorial",
    description: "Garment clarity, pose discipline, human structure.",
    workflow: "sdxl_text2img",
    stylePreset: "editorial",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "fashion editorial portrait, single focal model, high-end styling hierarchy",
      "clean pose discipline, readable garments, premium fabric separation",
      "studio editorial lighting, polished skin detail, uncluttered set"
    ],
    negativePrompt:
      "waxy skin, asymmetrical eyes, twisted pose, broken fabric folds, cheap glamour, messy styling, clutter, text, watermark",
    params: { steps: 34, cfg: 5.5, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 832, height: 1216 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      humanStructureMode: "full-body",
      humanControlMode: "auto",
      humanPosePresetId: "walking-fashion",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: false
    }
  },
  {
    id: "cinematic-still",
    family: "cinematic",
    label: "Cinematic Still",
    description: "Grounded film frame, motivated light, restrained atmosphere.",
    workflow: "sdxl_text2img",
    stylePreset: "cinematic",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "single focal subject, grounded cinematic still, disciplined frame composition",
      "clear foreground, midground, and background separation, camera-anchored perspective",
      "motivated practical lighting, realistic shadow behavior, restrained atmosphere"
    ],
    negativePrompt:
      "lowres, blurry, flat lighting, bad anatomy, duplicate subject, muddy haze, fake teal-orange grade, plastic highlights, fake bokeh, text, watermark",
    params: { steps: 34, cfg: 5.4, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 1216, height: 832 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: true,
      detailPassDenoise: 0.12
    }
  },
  {
    id: "cinematic-action",
    family: "human",
    label: "Cinematic Action",
    description: "Readable action silhouette and body structure.",
    workflow: "sdxl_text2img",
    stylePreset: "cinematic",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "cinematic action scene, dynamic conflict, readable impact moment",
      "strong setpiece depth, motivated practical lighting, dramatic environment interaction",
      "heroic action silhouette, blockbuster realism, clean foreground to background separation"
    ],
    negativePrompt:
      "plain white backdrop, static studio portrait, still-life composition, muddy motion blur, confused limbs, duplicate subject, text, watermark",
    params: { steps: 36, cfg: 5.1, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 1344, height: 768 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      humanStructureMode: "action",
      humanControlMode: "auto",
      humanPosePresetId: "running-action",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: false
    }
  },
  {
    id: "architectural-interior",
    family: "photoreal",
    label: "Architectural Interior",
    description: "Perspective, room hierarchy, material separation.",
    workflow: "sdxl_text2img",
    stylePreset: "cinematic",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "architectural interior, strong perspective lines, coherent room layout",
      "clear foreground, midground, and background separation",
      "balanced natural and practical lighting, believable materials"
    ],
    negativePrompt: "warped perspective, floating furniture, muddy shadows, duplicate objects, blurry, text, watermark",
    params: { steps: 34, cfg: 5.6, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 1216, height: 832 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: false
    }
  },
  {
    id: "product-hero-shot",
    family: "product",
    label: "Product Hero Shot",
    description: "Packshot geometry, material fidelity, clean edges.",
    workflow: "sdxl_text2img",
    stylePreset: "product-shot",
    checkpointProfileId: "product",
    promptBlocks: [
      "single focal product, clean silhouette, centered commercial framing",
      "high material fidelity, precise geometry, controlled reflections",
      "crisp edge definition, premium surface response, uncluttered presentation"
    ],
    negativePrompt:
      "blurry, duplicate subject, warped geometry, bent edges, messy reflections, clutter, cropped, floating product, dirty speculars, text, watermark, logo",
    params: { steps: 32, cfg: 5.4, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 1024, height: 1280 },
    modelConfig: {
      checkpointProfileId: "product",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: true,
      detailPassDenoise: 0.14
    }
  },
  {
    id: "macro-product",
    family: "product",
    label: "Macro Product Detail",
    description: "Close object shot, material and reflection control.",
    workflow: "sdxl_text2img",
    stylePreset: "product-shot",
    checkpointProfileId: "product",
    promptBlocks: [
      "macro product shot, premium material detail, clean silhouette",
      "controlled reflections, crisp edge definition, shallow depth of field",
      "studio lighting, polished final image"
    ],
    negativePrompt: "messy reflections, blurry, warped geometry, clutter, text, watermark, logo",
    params: { steps: 32, cfg: 5.4, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 1024, height: 1280 },
    modelConfig: {
      checkpointProfileId: "product",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: true,
      detailPassDenoise: 0.12
    }
  },
  {
    id: "food-editorial",
    family: "product",
    label: "Food Editorial",
    description: "Food texture, plating hierarchy, restrained styling.",
    workflow: "sdxl_text2img",
    stylePreset: "product-shot",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "editorial food photography, plated subject, appetizing texture",
      "controlled highlights, readable garnish, clean composition",
      "studio or window lighting, shallow depth of field, polished finish"
    ],
    negativePrompt: "mushy texture, plastic-looking food, cluttered plate, messy garnish, blurry, text, watermark",
    params: { steps: 32, cfg: 5.4, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 1024, height: 1280 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: true,
      detailPassDenoise: 0.14
    }
  }
];

export const styleRecipes: readonly GenerationStyleRecipe[] = [
  {
    id: "anime-clean",
    label: "Anime Clean",
    family: "anime",
    targetSceneIds: sceneTemplates.filter((scene) => scene.family === "anime").map((scene) => scene.id),
    reinforceBlocks: ["distinct character design", "clean linework", "symmetrical eyes", "readable outfit and hair silhouette"],
    negativeBlocks: [
      "featureless black silhouette",
      "default black bodysuit",
      "dark cyber armor",
      "neon purple aura",
      "glowing contour overload",
      "background overpowering character",
      "muddy colors",
      "chaotic effects",
      "uneven eyes"
    ],
    paramsOverrides: { cfg: 4, steps: 29 }
  },
  {
    id: "photoreal-clean",
    label: "Photoreal Clean",
    family: "photoreal",
    targetSceneIds: ["beauty-closeup", "editorial-portrait", "fashion-editorial", "cinematic-still"],
    reinforceBlocks: ["grounded photoreal realism", "disciplined facial structure", "controlled highlight rolloff"],
    negativeBlocks: ["plastic skin", "cgi look", "airbrushed face", "dead eyes", "misaligned pupils"],
    paramsOverrides: { cfg: 5.3, steps: 34 },
    modelConfigOverrides: { enableDetailPass: true, detailPassDenoise: 0.14, enableRefiner: false }
  },
  {
    id: "human-structure",
    label: "Human Structure",
    family: "human",
    targetSceneIds: ["fashion-editorial", "cinematic-action", "cinematic-still", "editorial-portrait"],
    reinforceBlocks: [
      "one continuous anatomically plausible human body",
      "clear shoulder hip knee ankle alignment",
      "separated arms and legs with readable limb silhouette",
      "relaxed natural hands or cleanly out-of-frame hands",
      "stable grounded feet and believable footwear shape"
    ],
    negativeBlocks: [
      "duplicate body",
      "fused bodies",
      "merged limbs",
      "extra arms",
      "extra legs",
      "broken wrists",
      "warped feet",
      "melted shoes",
      "twisted pose"
    ],
    paramsOverrides: { cfg: 4.8, steps: 36 },
    modelConfigOverrides: {
      humanStructureMode: "full-body",
      humanControlMode: "auto",
      humanPosePresetId: "auto",
      enableDetailPass: false,
      enableRefiner: false,
      enableLora: false,
      loraName: "",
      loraChain: []
    }
  },
  {
    id: "cinematic-grounded",
    label: "Cinematic Grounded",
    family: "cinematic",
    targetSceneIds: ["cinematic-still", "cinematic-action", "architectural-interior"],
    reinforceBlocks: [
      "motivated practical lighting",
      "camera-anchored frame hierarchy",
      "restrained cinematic atmosphere",
      "grounded filmic color response"
    ],
    negativeBlocks: ["fake blockbuster grade", "muddy haze", "flat grading", "neon edge halos"],
    paramsOverrides: { cfg: 5.25, steps: 34 },
    modelConfigOverrides: { enableDetailPass: true, detailPassDenoise: 0.12, enableRefiner: false }
  },
  {
    id: "product-glossy",
    label: "Product Glossy",
    family: "product",
    targetSceneIds: ["product-hero-shot", "macro-product", "food-editorial"],
    reinforceBlocks: ["commercial polish", "disciplined glossy reflections", "geometry-first product rendering"],
    negativeBlocks: ["dirty glare", "bent edges", "messy reflections"],
    paramsOverrides: { cfg: 5.25, steps: 32 },
    modelConfigOverrides: { enableDetailPass: true, detailPassDenoise: 0.12 }
  },
  {
    id: "product-label-text-safe",
    label: "Label / Text Safe",
    family: "product",
    targetSceneIds: ["product-hero-shot", "macro-product"],
    reinforceBlocks: [
      "front-facing flat label panel",
      "large simple high-contrast typography",
      "clean label margins",
      "readable brand area without tiny decorative text"
    ],
    negativeBlocks: ["gibberish letters", "misspelled text", "tiny unreadable label", "warped typography", "fake logo clutter"],
    paramsOverrides: { cfg: 5.05, steps: 32 },
    modelConfigOverrides: { enableDetailPass: false, enableRefiner: false }
  }
];

export const benchmarkPrompts: readonly BenchmarkPrompt[] = [
  {
    id: "benchmark-anime-school-daylight",
    label: "Anime School Daylight",
    sceneId: "anime-school-daylight",
    styleRecipeId: "anime-clean",
    prompt:
      "anime school character standing near a classroom window in bright morning light, clean uniform design, expressive face, neat hair shape, soft pastel color palette, calm classroom background, polished cel shading",
    negativePrompt: animeNegative
  },
  {
    id: "benchmark-anime-fantasy-adventurer",
    label: "Anime Fantasy Adventurer",
    sceneId: "anime-fantasy-adventurer",
    styleRecipeId: "anime-clean",
    prompt:
      "anime fantasy adventurer on a sunlit forest path, expressive heroic face, readable layered outfit, leather satchel, cloth folds, small fantasy accessories, clean silhouette, rich controlled colors, polished cel shading",
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, neon purple aura, overpowered energy blast, messy armor mass, cluttered costume, text, watermark"
  },
  {
    id: "benchmark-beauty-clean-campaign",
    label: "Beauty Clean Campaign",
    sceneId: "beauty-closeup",
    styleRecipeId: "photoreal-clean",
    prompt:
      "beauty campaign photograph, tight close-up portrait, realistic skin texture, symmetrical eyes, soft beauty dish lighting, clean makeup rendering, natural lips, controlled highlights, grounded photoreal finish",
    negativePrompt: "waxy skin, dead eyes, misaligned pupils, warped mouth, plastic skin, cgi look, text, watermark"
  },
  {
    id: "benchmark-fashion-structure",
    label: "Fashion Structure",
    sceneId: "fashion-editorial",
    styleRecipeId: "human-structure",
    prompt:
      "full-body fashion editorial photograph, single model standing in a clean studio set, readable garment shape, relaxed hands separated from torso, both feet grounded, believable footwear, polished magazine lighting",
    negativePrompt:
      "duplicate body, merged limbs, extra arms, extra legs, extra fingers, fused fingers, warped feet, melted shoes, cropped feet, text, watermark"
  },
  {
    id: "benchmark-product-label",
    label: "Product Label",
    sceneId: "product-hero-shot",
    styleRecipeId: "product-label-text-safe",
    prompt:
      "commercial product hero shot of a luxury glass skincare bottle, front-facing flat white label printed with the word AURA in large simple black letters, centered composition, crisp rectangular label margins, precise bottle geometry, controlled glossy reflections, premium studio lighting",
    negativePrompt: "gibberish letters, misspelled text, warped label, fake logo clutter, messy reflections, bent bottle, blurry, watermark"
  }
];

export const optimizationModes: readonly {
  id: OptimizationMode;
  label: string;
  candidateCount: number;
  autoRepair: boolean;
  threshold: number;
}[] = [
  { id: "quality-first", label: "Quality First", candidateCount: 3, autoRepair: true, threshold: 72 },
  { id: "balanced", label: "Balanced", candidateCount: 2, autoRepair: true, threshold: 64 },
  { id: "fast-iterate", label: "Fast Iterate", candidateCount: 1, autoRepair: false, threshold: 58 },
  { id: "low-memory", label: "Low Memory", candidateCount: 1, autoRepair: false, threshold: 50 }
];

export function findSceneTemplate(sceneId: string | null | undefined) {
  return sceneTemplates.find((scene) => scene.id === sceneId) ?? null;
}

export function findStyleRecipe(recipeId: string | null | undefined) {
  return styleRecipes.find((recipe) => recipe.id === recipeId) ?? null;
}

export function findBenchmark(benchmarkId: string | null | undefined) {
  return benchmarkPrompts.find((benchmark) => benchmark.id === benchmarkId) ?? null;
}

export function getStyleRecipesForScene(sceneId: GenerationSceneId | "" | null | undefined) {
  if (!sceneId) {
    return styleRecipes;
  }

  return styleRecipes.filter((recipe) => recipe.targetSceneIds.includes(sceneId));
}

export function getSuggestedStyleRecipe(sceneId: GenerationSceneId | "" | null | undefined) {
  if (!sceneId) {
    return null;
  }

  return getStyleRecipesForScene(sceneId)[0] ?? null;
}

export function appendPromptBlocks(prompt: string, blocks: readonly string[]) {
  const existing = splitCommaList(prompt);
  const normalized = new Set(existing.map((item) => item.toLowerCase()));
  const additions = blocks.filter((block) => !normalized.has(block.toLowerCase()));
  return [...existing, ...additions].join(", ");
}

export function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function defaultModelConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    checkpointProfileId: "general",
    renderProvider: "local-comfy",
    humanStructureMode: "off",
    humanControlMode: "auto",
    humanPosePresetId: "auto",
    renderBatchSize: 1,
    renderRepairAttemptCount: 0,
    autoRepairOnLowScore: false,
    autoRepairThreshold: 62,
    autoRepairCount: 0,
    controlStrength: 0.8,
    enableRefiner: false,
    enableLora: false,
    loraStrength: 0.8,
    loraChain: [],
    enableDetailPass: false,
    detailPassDenoise: 0.18,
    ...overrides
  };
}

export function candidateDirectionsForScene(sceneId: GenerationSceneId | "" | null | undefined): readonly CandidateDirection[] {
  const scene = findSceneTemplate(sceneId);
  if (scene?.family === "anime") {
    return [
      {
        label: "Character Design",
        promptBlocks: ["distinct character design", "readable outfit shape", "clear face and hair silhouette", "stable anime anatomy"],
        negativeBlocks: ["featureless black silhouette", "default black bodysuit", "unreadable costume"]
      },
      {
        label: "Palette Clarity",
        promptBlocks: ["balanced color palette", "character brighter than background", "controlled lighting", "clean cel shading"],
        negativeBlocks: ["background overpowering character", "muddy colors", "harsh neon rim glow"]
      },
      {
        label: "Context Readability",
        promptBlocks: ["clear background context", "readable scene props", "balanced composition", "polished production anime frame"],
        negativeBlocks: ["chaotic effects", "busy background", "overpowered energy blast"]
      }
    ];
  }

  if (scene?.family === "product") {
    return [
      {
        label: "Geometry Safe",
        promptBlocks: ["precise product geometry", "rigid object integrity", "clean edges"],
        negativeBlocks: ["warped geometry", "bent edges", "double product"],
        paramsOverrides: { cfg: 5.1 }
      },
      {
        label: "Material Fidelity",
        promptBlocks: ["premium material realism", "controlled reflections", "clean specular behavior"],
        negativeBlocks: ["messy reflections", "dirty glare", "mushy texture"]
      },
      {
        label: "Label Safe",
        promptBlocks: ["front-facing flat label panel", "large simple high-contrast typography", "clean label margins"],
        negativeBlocks: ["gibberish letters", "warped typography", "tiny unreadable label"],
        modelConfigOverrides: { enableDetailPass: false, enableRefiner: false }
      }
    ];
  }

  if (scene?.family === "human" || scene?.family === "photoreal") {
    return [
      {
        label: "Face Fidelity",
        promptBlocks: ["stable facial proportions", "natural eye symmetry", "clean mouth anatomy", "grounded photoreal realism"],
        negativeBlocks: ["dead eyes", "misaligned pupils", "warped mouth", "waxy skin"]
      },
      {
        label: "Structure Safety",
        promptBlocks: ["natural human anatomy", "clean pose discipline", "relaxed believable hands if visible", "stable body proportions"],
        negativeBlocks: ["extra fingers", "fused fingers", "merged limbs", "twisted pose"],
        paramsOverrides: { cfg: 4.9 },
        modelConfigOverrides: { enableDetailPass: false, enableRefiner: false }
      },
      {
        label: "Lighting Cleanliness",
        promptBlocks: ["disciplined studio lighting", "controlled highlight rolloff", "quiet background", "realistic shadow behavior"],
        negativeBlocks: ["flat lighting", "overprocessed highlights", "cgi look"]
      }
    ];
  }

  return [
    {
      label: "Balanced",
      promptBlocks: ["clean composition", "single focal subject", "high detail finish"],
      negativeBlocks: ["clutter", "lowres", "blurry"]
    },
    {
      label: "Composition",
      promptBlocks: ["clear frame hierarchy", "readable foreground and background separation"],
      negativeBlocks: ["unclear focal subject", "busy background"]
    },
    {
      label: "Detail",
      promptBlocks: ["controlled fine detail", "crisp material response"],
      negativeBlocks: ["mushy texture", "oversharpened artifacts"]
    }
  ];
}

export function recipeForCandidate(sceneId: GenerationSceneId | "" | null | undefined, index: number) {
  const directions = candidateDirectionsForScene(sceneId);
  return directions[index % directions.length] ?? directions[0];
}
