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
  "worst quality, low quality, blurry, featureless black silhouette, black bodysuit, dark cyber armor, neon purple aura, glowing contour lines, overpowered energy blast, background overpowering character, chaotic effects, messy linework, muddy colors, uneven eyes, fused fingers, text, watermark";

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
      "anime action character, single readable protagonist, dynamic but clear full-body pose",
      "clean linework, symmetrical eyes, readable hands, distinct hair silhouette",
      "detailed outfit design with separated costume layers, crisp cel shading",
      "controlled action effects, background supports the character without overpowering"
    ],
    negativePrompt:
      "worst quality, low quality, blurry, bad anatomy, bad hands, fused fingers, extra limbs, distorted face, asymmetrical eyes, featureless black silhouette, default black bodysuit, dark cyber armor, messy aura, chaotic effects, background overpowering character, text, watermark",
    params: { steps: 32, cfg: 3.9, samplerName: "er_sde", scheduler: "simple", width: 1024, height: 1024 },
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
    workflow: "sdxl_openpose_text2img",
    stylePreset: "editorial",
    checkpointProfileId: "photoreal-sdxl",
    promptBlocks: [
      "head-to-toe fashion editorial photograph, one adult model, single continuous body, high-end styling hierarchy",
      "disciplined runway pose, face fully visible, natural eyes and mouth, relaxed hands separated from torso",
      "both shoes fully visible and grounded, clean ankles, believable footwear construction",
      "readable garments with crisp seams, tailoring edges, natural fabric folds, fabric separated from skin",
      "studio editorial lighting, uncluttered magazine set, polished but realistic skin texture"
    ],
    negativePrompt:
      "waxy skin, blurry face, asymmetrical eyes, warped mouth, twisted pose, duplicate body, merged limbs, hidden hands, hand occlusion hiding defects, extra fingers, fused fingers, broken wrists, cropped feet, warped feet, melted shoes, broken ankles, broken fabric folds, fabric fused to skin, cheap glamour, messy styling, clutter, text, watermark",
    params: { steps: 38, cfg: 4.85, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 832, height: 1216 },
    modelConfig: {
      checkpointProfileId: "photoreal-sdxl",
      humanStructureMode: "full-body",
      humanControlMode: "openpose",
      humanPosePresetId: "walking-fashion",
      controlStrength: 0.78,
      enableRefiner: false,
      enableLora: false,
      enableDetailPass: false,
      autoRepairThreshold: 78
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
      "cinematic action scene with one readable hero subject, clear impact moment",
      "fast shutter action clarity, separated arms and legs, clean heroic silhouette",
      "strong setpiece depth, motivated practical lighting, readable environment interaction",
      "blockbuster realism, clean foreground to background separation, controlled debris"
    ],
    negativePrompt:
      "plain white backdrop, static studio portrait, still-life composition, muddy motion blur, confused limbs, duplicate subject, merged limbs, extra arms, extra legs, broken hands, warped feet, background overpowering subject, text, watermark",
    params: { steps: 38, cfg: 4.9, samplerName: "dpmpp_2m_sde", scheduler: "karras", width: 1344, height: 768 },
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
    id: "anime-action-readable",
    label: "Anime Action Readable",
    family: "anime",
    targetSceneIds: ["anime-action-character"],
    reinforceBlocks: [
      "single readable protagonist",
      "clean action linework",
      "distinct outfit design",
      "character brighter and sharper than the background",
      "controlled aura and debris effects"
    ],
    negativeBlocks: [
      "featureless black silhouette",
      "default black bodysuit",
      "dark cyber armor",
      "neon aura overload",
      "glowing contour overload",
      "chaotic effects",
      "background overpowering character",
      "messy linework"
    ],
    paramsOverrides: { cfg: 3.9, steps: 32 },
    modelConfigOverrides: { enableDetailPass: false, enableRefiner: false, enableLora: false }
  },
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
    id: "fashion-editorial-detail",
    label: "Fashion Editorial Detail",
    family: "human",
    targetSceneIds: ["fashion-editorial"],
    reinforceBlocks: [
      "head-to-toe fashion editorial photograph",
      "face fully visible with natural eyes and clean mouth anatomy",
      "visible relaxed hands with separated fingers away from torso",
      "grounded feet, clean ankles, believable footwear shape",
      "readable garment seams, tailoring edges, and natural fabric folds",
      "premium fabric texture separated from skin"
    ],
    negativeBlocks: [
      "blurry face",
      "warped mouth",
      "extra fingers",
      "fused fingers",
      "hidden hands",
      "broken wrists",
      "cropped feet",
      "warped feet",
      "melted shoes",
      "broken ankles",
      "merged limbs",
      "broken fabric folds",
      "fabric fused to skin",
      "messy styling"
    ],
    paramsOverrides: { cfg: 4.75, steps: 39 },
    modelConfigOverrides: {
      humanStructureMode: "full-body",
      humanControlMode: "openpose",
      humanPosePresetId: "walking-fashion",
      controlStrength: 0.78,
      enableDetailPass: false,
      enableRefiner: false,
      enableLora: false,
      loraName: "",
      loraChain: [],
      autoRepairThreshold: 78
    }
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
    id: "cinematic-action-readable",
    label: "Cinematic Action Readable",
    family: "human",
    targetSceneIds: ["cinematic-action"],
    reinforceBlocks: [
      "one readable hero subject",
      "clear impact timing",
      "fast shutter action clarity",
      "separated arms and legs with clean silhouette",
      "subject remains brighter and sharper than the setpiece"
    ],
    negativeBlocks: [
      "muddy motion blur",
      "confused limbs",
      "merged limbs",
      "duplicate subject",
      "extra arms",
      "extra legs",
      "background overpowering subject",
      "chaotic debris cloud"
    ],
    paramsOverrides: { cfg: 4.85, steps: 38 },
    modelConfigOverrides: {
      humanStructureMode: "action",
      humanControlMode: "auto",
      humanPosePresetId: "running-action",
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
    id: "benchmark-anime-action-readable",
    label: "Anime Action Readable",
    sceneId: "anime-action-character",
    styleRecipeId: "anime-action-readable",
    prompt:
      "anime action character leaping forward with a clear heroic pose, single readable protagonist, sharp face and hair silhouette, distinct outfit design, clean action linework, controlled aura effects, background supports the character without overpowering",
    negativePrompt:
      "worst quality, low quality, blurry, featureless black silhouette, default black bodysuit, dark cyber armor, neon aura overload, chaotic effects, messy linework, uneven eyes, fused fingers, text, watermark"
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
    styleRecipeId: "fashion-editorial-detail",
    prompt:
      "head-to-toe fashion editorial photograph, one adult model standing in a clean studio set, face fully visible with natural eyes and mouth, relaxed hands separated from torso, both shoes fully visible and grounded, believable footwear construction, readable garment seams, crisp tailoring edges, natural fabric folds, premium fabric texture, polished magazine lighting",
    negativePrompt:
      "blurry face, warped mouth, duplicate body, merged limbs, extra arms, extra legs, hidden hands, extra fingers, fused fingers, broken wrists, cropped feet, warped feet, melted shoes, broken ankles, broken fabric folds, fabric fused to skin, text, watermark"
  },
  {
    id: "benchmark-cinematic-action-readable",
    label: "Cinematic Action Readable",
    sceneId: "cinematic-action",
    styleRecipeId: "cinematic-action-readable",
    prompt:
      "cinematic action scene with one readable hero subject, clear impact timing, fast shutter action clarity, separated arms and legs, clean heroic silhouette, controlled debris, motivated practical lighting, readable setpiece depth",
    negativePrompt:
      "muddy motion blur, confused limbs, merged limbs, duplicate subject, extra arms, extra legs, broken hands, warped feet, background overpowering subject, chaotic debris cloud, text, watermark"
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
  if (scene?.id === "anime-action-character") {
    return [
      {
        label: "Clean Action Linework",
        promptBlocks: [
          "clean action linework",
          "sharp character outline",
          "symmetrical eyes",
          "readable hands and fingers",
          "crisp cel shading"
        ],
        negativeBlocks: ["messy linework", "uneven eyes", "fused fingers", "muddy character edges", "motion smear"],
        paramsOverrides: { cfg: 3.85, steps: 32 }
      },
      {
        label: "Character First",
        promptBlocks: [
          "single readable protagonist",
          "character brighter than background",
          "clear face and hair silhouette",
          "controlled aura effects",
          "background supports the pose"
        ],
        negativeBlocks: ["background overpowering character", "featureless black silhouette", "neon aura overload", "chaotic effects"]
      },
      {
        label: "Costume Readability",
        promptBlocks: [
          "distinct outfit design",
          "separated costume layers",
          "readable armor or cloth panels",
          "clean accessory shapes",
          "polished production character art"
        ],
        negativeBlocks: ["default black bodysuit", "dark cyber armor mass", "unreadable costume", "cluttered silhouette"],
        paramsOverrides: { cfg: 4.0, steps: 33 }
      }
    ];
  }

  if (scene?.id === "fashion-editorial") {
    return [
      {
        label: "Hands / Feet Safe",
        promptBlocks: [
          "head-to-toe model framing",
          "visible relaxed hands with separated fingers",
          "hands away from torso",
          "natural wrists",
          "grounded feet",
          "believable footwear shape",
          "clean ankle structure"
        ],
        negativeBlocks: ["hidden hands", "extra fingers", "fused fingers", "broken wrists", "cropped feet", "warped feet", "melted shoes"],
        paramsOverrides: { cfg: 4.65, steps: 39 },
        modelConfigOverrides: {
          enableDetailPass: false,
          enableRefiner: false,
          humanStructureMode: "full-body",
          humanControlMode: "openpose",
          humanPosePresetId: "walking-fashion",
          controlStrength: 0.78
        }
      },
      {
        label: "Garment Detail",
        promptBlocks: [
          "fashion lookbook clarity",
          "readable garment seams",
          "crisp tailoring edges",
          "premium fabric texture",
          "natural fabric folds",
          "outfit separated from body"
        ],
        negativeBlocks: ["broken fabric folds", "melted clothing", "messy styling", "fabric fused to skin", "plastic fabric"],
        paramsOverrides: { cfg: 4.8, steps: 39 },
        modelConfigOverrides: { enableDetailPass: false, humanControlMode: "openpose", controlStrength: 0.76 }
      },
      {
        label: "Pose Discipline",
        promptBlocks: [
          "disciplined runway pose",
          "face fully visible",
          "balanced shoulder and hip alignment",
          "clean body line",
          "limbs separated from torso",
          "single continuous body"
        ],
        negativeBlocks: ["twisted pose", "duplicate body", "merged limbs", "impossible stance", "broken spine", "blurry face"],
        paramsOverrides: { cfg: 4.7, steps: 38 },
        modelConfigOverrides: {
          enableDetailPass: false,
          enableRefiner: false,
          humanStructureMode: "full-body",
          humanControlMode: "openpose",
          humanPosePresetId: "walking-fashion",
          controlStrength: 0.8
        }
      }
    ];
  }

  if (scene?.id === "cinematic-action") {
    return [
      {
        label: "Readable Impact",
        promptBlocks: [
          "clear impact timing",
          "fast shutter action clarity",
          "one readable hero subject",
          "controlled debris",
          "clean action silhouette"
        ],
        negativeBlocks: ["muddy motion blur", "chaotic debris cloud", "duplicate subject", "unclear impact"],
        paramsOverrides: { cfg: 4.75, steps: 38 },
        modelConfigOverrides: { enableDetailPass: false, enableRefiner: false, humanStructureMode: "action" }
      },
      {
        label: "Action Anatomy",
        promptBlocks: [
          "separated arms and legs",
          "anatomically plausible action pose",
          "readable hands if visible",
          "stable feet and stance",
          "clean limb silhouette"
        ],
        negativeBlocks: ["confused limbs", "merged limbs", "extra arms", "extra legs", "broken hands", "warped feet"],
        paramsOverrides: { cfg: 4.65, steps: 38 },
        modelConfigOverrides: { enableDetailPass: false, enableRefiner: false, humanStructureMode: "action" }
      },
      {
        label: "Subject Separation",
        promptBlocks: [
          "subject remains brighter and sharper than the setpiece",
          "clear foreground midground background separation",
          "readable environment interaction",
          "motivated practical lighting",
          "controlled atmosphere"
        ],
        negativeBlocks: ["background overpowering subject", "muddy haze", "flat grading", "unclear focal point"],
        paramsOverrides: { cfg: 4.9, steps: 37 }
      }
    ];
  }

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
