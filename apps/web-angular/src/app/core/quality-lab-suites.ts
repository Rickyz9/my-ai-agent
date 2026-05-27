import type { CheckpointProfileId, CreateJobInput, JobParams, ModelConfig } from "@repo/shared";

import { defaultModelConfig } from "./generation-presets";

export type BenchmarkCandidate = {
  id: string;
  label: string;
  focus: string;
  successCriteria: readonly string[];
  promptSuffix: string;
  negativeSuffix?: string;
  params?: Partial<JobParams>;
  modelConfig?: Partial<ModelConfig>;
};

export type BenchmarkSuiteFamily = "human" | "anime" | "product";

export type BenchmarkSuite = {
  id: string;
  label: string;
  family: BenchmarkSuiteFamily;
  categoryId: string;
  styleRecipeId: string;
  priority: "critical" | "watch" | "baseline";
  description: string;
  checkpointProfileId: CheckpointProfileId;
  requiredModelIds: readonly string[];
  providerModel: string;
  providerReason: string;
  successCriteria: readonly string[];
  params: JobParams;
  modelConfig: Partial<ModelConfig>;
  candidates: readonly BenchmarkCandidate[];
};

export type SubmittedBenchmarkJob = {
  id: string;
  suiteLabel: string;
  candidateLabel: string;
};

const humanNegative =
  "bad photo, bad photography, cgi look, plastic skin, waxy skin, airbrushed face, bad anatomy, bad proportions, duplicate subject, fused bodies, merged limbs, extra arms, extra legs, extra fingers, fused fingers, face asymmetry, eyes asymmetry, deformed eyes, bad eyes, deformed face, deformed mouth, deformed lips, bad teeth, blurry, muddy details, text, watermark";

const productTextNegative =
  "warped geometry, bent edges, duplicate product, floating product, messy reflections, dirty glare, gibberish letters, misspelled text, warped typography, tiny fake text, fake logo clutter, blurry, watermark";

export const qualitySuites: readonly BenchmarkSuite[] = [
  {
    id: "beauty-realvis-face",
    label: "Beauty Face Realism",
    family: "human",
    categoryId: "beauty-closeup",
    styleRecipeId: "quality-lab-realvis-human",
    priority: "critical",
    description: "Close-up umano per occhi, bocca, pelle e micro-dettaglio.",
    checkpointProfileId: "photoreal-sdxl",
    requiredModelIds: ["photoreal-sdxl-checkpoint", "sdxl-negative-embedding"],
    providerModel: "RealVisXL local",
    providerReason: "Baseline locale fotoreal prima di escalation premium.",
    successCriteria: ["Occhi allineati", "Bocca naturale", "Pelle non cerosa", "Nessuna duplicazione del volto"],
    params: {
      prompt:
        "tight beauty portrait of one adult woman, centered close-up framing, direct eye contact, natural eye symmetry, realistic skin texture with fine pores, clean lips and mouth anatomy, soft beauty dish lighting, neutral seamless background, premium cosmetic photography, grounded photoreal realism",
      negativePrompt: humanNegative,
      steps: 34,
      cfg: 5.3,
      samplerName: "dpmpp_2m_sde",
      scheduler: "karras",
      width: 832,
      height: 1216
    },
    modelConfig: { enableDetailPass: true, detailPassDenoise: 0.1, autoRepairThreshold: 78 },
    candidates: [
      {
        id: "eye-mouth-fidelity",
        label: "Eye / Mouth Fidelity",
        focus: "Occhi, bocca, denti e simmetria del volto.",
        successCriteria: ["Pupille allineate", "Palpebre naturali", "Bocca pulita", "Denti credibili se visibili"],
        promptSuffix:
          "aligned pupils, crisp iris detail, natural eyelids, believable lips, clean teeth only if visible, relaxed natural expression",
        negativeSuffix: "dead eyes, crossed eyes, misaligned pupils, warped mouth, melted teeth"
      },
      {
        id: "skin-realism",
        label: "Skin Realism",
        focus: "Texture pelle credibile senza effetto plastica.",
        successCriteria: ["Pori leggibili", "Highlight morbidi", "Makeup coerente", "Niente pelle plastica"],
        promptSuffix:
          "realistic skin pores, natural skin texture, subtle skin variation, refined highlight rolloff, realistic makeup finish",
        negativeSuffix: "overprocessed skin, porcelain skin, plastic highlights, smeared makeup",
        params: { steps: 36, cfg: 5.2 },
        modelConfig: { detailPassDenoise: 0.11 }
      },
      {
        id: "anatomy-conservative",
        label: "Anatomy Conservative",
        focus: "Riduzione di deformazioni e duplicazioni.",
        successCriteria: ["Un solo soggetto", "Collo stabile", "Proporzioni coerenti", "Silhouette pulita"],
        promptSuffix:
          "single focal human subject, stable facial proportions, clean silhouette, no overlapping bodies, calm pose discipline",
        negativeSuffix: "duplicate head, duplicate face, fused neck, broken anatomy, blurry mass",
        params: { cfg: 4.95 },
        modelConfig: { enableDetailPass: false }
      }
    ]
  },
  {
    id: "fashion-hands-feet",
    label: "Fashion Editorial Detail",
    family: "human",
    categoryId: "fashion-editorial",
    styleRecipeId: "fashion-editorial-detail",
    priority: "critical",
    description: "Figura intera controllata per volto, mani, piedi/scarpe e tessuti.",
    checkpointProfileId: "photoreal-sdxl",
    requiredModelIds: ["photoreal-sdxl-checkpoint", "controlnet-openpose", "sdxl-negative-embedding"],
    providerModel: "RealVisXL local",
    providerReason: "Categoria ad alto rischio anatomico da misurare con batch controllati.",
    successCriteria: ["Volto leggibile", "Mani leggibili", "Piedi/scarpe stabili", "Outfit non fuso al corpo"],
    params: {
      prompt:
        "head-to-toe fashion editorial photograph of one adult woman, high-end tailored outfit, face fully visible with natural eyes and clean mouth anatomy, visible hands with relaxed fingers away from torso, stable feet and believable footwear shape, clean leg line, readable garment seams, crisp tailoring edges, natural fabric folds, premium fabric separation, uncluttered editorial set, photoreal magazine lighting",
      negativePrompt: humanNegative,
      steps: 38,
      cfg: 4.85,
      samplerName: "dpmpp_2m_sde",
      scheduler: "karras",
      width: 832,
      height: 1216
    },
    modelConfig: {
      humanStructureMode: "full-body",
      humanControlMode: "openpose",
      humanPosePresetId: "walking-fashion",
      controlStrength: 0.78,
      enableDetailPass: false,
      autoRepairThreshold: 78
    },
    candidates: [
      {
        id: "face-fidelity",
        label: "Face Fidelity",
        focus: "Occhi, bocca e proporzioni del volto.",
        successCriteria: ["Occhi simmetrici", "Bocca naturale", "Volto non sfocato", "Pelle non cerosa"],
        promptSuffix:
          "clear face fidelity, symmetrical eyes, aligned pupils, natural mouth anatomy, believable skin texture",
        negativeSuffix: "blurry face, dead eyes, crossed eyes, misaligned pupils, warped mouth, waxy skin",
        params: { cfg: 4.75 }
      },
      {
        id: "hands-feet-safe",
        label: "Hands / Feet Safe",
        focus: "Mani, dita, piedi e scarpe.",
        successCriteria: ["Cinque dita quando visibili", "Polsi non rotti", "Scarpe simmetriche", "Appoggio credibile"],
        promptSuffix:
          "natural hand anatomy, five clear fingers on each visible hand, hands away from torso, stable feet, believable shoe structure, grounded stance",
        negativeSuffix: "hidden hands, extra fingers, missing fingers, fused fingers, broken wrists, cropped feet, warped feet, melted shoes, broken ankles",
        params: { cfg: 4.65 }
      },
      {
        id: "garment-readability",
        label: "Garment Readability",
        focus: "Tessuti, outfit e separazione dei materiali.",
        successCriteria: ["Cuciture leggibili", "Pieghe naturali", "Materiali separati", "Bordi outfit netti"],
        promptSuffix:
          "readable garment structure, clean fabric folds, premium textile texture, clear outfit hierarchy, crisp tailoring edges, fabric separated from skin",
        negativeSuffix: "broken fabric folds, melted clothing, fabric fused to skin, plastic fabric, messy styling, clutter",
        params: { steps: 39, cfg: 4.8 }
      },
      {
        id: "pose-discipline",
        label: "Pose Discipline",
        focus: "Linea corporea e postura.",
        successCriteria: ["Spalle e bacino coerenti", "Niente torsioni impossibili", "Arti separati", "Postura bilanciata"],
        promptSuffix:
          "elegant balanced stance, clean body line, anatomically plausible limb proportions, readable silhouette, stable shoulder and hip alignment",
        negativeSuffix: "twisted pose, broken spine, impossible stance, confused limbs",
        params: { cfg: 4.7 }
      }
    ]
  },
  {
    id: "cinematic-action-readable",
    label: "Cinematic Action Readability",
    family: "human",
    categoryId: "cinematic-action",
    styleRecipeId: "cinematic-action-readable",
    priority: "critical",
    description: "Action fotoreal per silhouette, arti, impatto e separazione dal setpiece.",
    checkpointProfileId: "photoreal-sdxl",
    requiredModelIds: ["photoreal-sdxl-checkpoint", "controlnet-openpose", "sdxl-negative-embedding"],
    providerModel: "RealVisXL local",
    providerReason: "Lane ad alto rischio: va misurata con pose controllate e action readability.",
    successCriteria: ["Soggetto leggibile", "Arti separati", "Impatto chiaro", "Sfondo non fonde il corpo"],
    params: {
      prompt:
        "cinematic action scene with one adult hero subject, clear impact moment, fast shutter action clarity, separated arms and legs, readable hands if visible, stable feet and stance, controlled debris, motivated practical lighting, strong setpiece depth, grounded photoreal blockbuster realism",
      negativePrompt: humanNegative,
      steps: 38,
      cfg: 4.9,
      samplerName: "dpmpp_2m_sde",
      scheduler: "karras",
      width: 1344,
      height: 768
    },
    modelConfig: {
      humanStructureMode: "action",
      humanControlMode: "openpose",
      humanPosePresetId: "running-action",
      controlStrength: 0.72,
      enableDetailPass: false,
      autoRepairThreshold: 76
    },
    candidates: [
      {
        id: "readable-impact",
        label: "Readable Impact",
        focus: "Momento d'azione chiaro senza blur fangoso.",
        successCriteria: ["Impatto evidente", "Debris controllato", "Soggetto centrale", "No motion smear"],
        promptSuffix:
          "clear impact timing, fast shutter clarity, crisp action silhouette, controlled debris arcs, subject remains visually dominant",
        negativeSuffix: "muddy motion blur, chaotic debris cloud, unclear impact, subject lost in background",
        params: { cfg: 4.75 }
      },
      {
        id: "action-anatomy",
        label: "Action Anatomy",
        focus: "Arti, mani, piedi e posa durante il movimento.",
        successCriteria: ["Braccia separate", "Gambe leggibili", "Mani non fuse", "Appoggio credibile"],
        promptSuffix:
          "anatomically plausible action pose, separated arms and legs, clean limb silhouette, stable feet and stance, readable hands if visible",
        negativeSuffix: "confused limbs, merged limbs, extra arms, extra legs, broken hands, warped feet",
        params: { cfg: 4.65 },
        modelConfig: { controlStrength: 0.76 }
      },
      {
        id: "subject-separation",
        label: "Subject Separation",
        focus: "Gerarchia frame e separazione dallo sfondo.",
        successCriteria: ["Soggetto piu nitido dello sfondo", "Setpiece leggibile", "Atmosfera controllata", "Focal point chiaro"],
        promptSuffix:
          "clear foreground midground background separation, subject brighter and sharper than setpiece, readable environment interaction, controlled atmosphere",
        negativeSuffix: "background overpowering subject, muddy haze, unclear focal point, flat grading",
        params: { cfg: 4.95, steps: 37 }
      }
    ]
  },
  {
    id: "product-label-readable",
    label: "Product Label Text",
    family: "product",
    categoryId: "product-hero-shot",
    styleRecipeId: "quality-lab-text-product",
    priority: "critical",
    description: "Packshot per etichette, loghi simulati e testo leggibile.",
    checkpointProfileId: "photoreal-sdxl",
    requiredModelIds: ["photoreal-sdxl-checkpoint", "sdxl-negative-embedding"],
    providerModel: "RealVisXL local",
    providerReason: "Baseline locale per capire quando serve provider premium specializzato su testo.",
    successCriteria: ["Oggetto non deformato", "Etichetta frontale", "Lettere grandi leggibili", "Riflessi controllati"],
    params: {
      prompt:
        "commercial product hero shot of a luxury glass skincare bottle, front-facing flat white label printed with the word AURA in large simple black letters, centered composition, crisp rectangular label margins, precise bottle geometry, controlled glossy reflections, premium studio lighting, clean advertising photography",
      negativePrompt: productTextNegative,
      steps: 34,
      cfg: 4.9,
      samplerName: "dpmpp_2m_sde",
      scheduler: "karras",
      width: 1024,
      height: 1280
    },
    modelConfig: { enableDetailPass: false, autoRepairThreshold: 74 },
    candidates: [
      {
        id: "label-readability",
        label: "Label Readability",
        focus: "Lettere grandi e margini puliti.",
        successCriteria: ["AURA leggibile", "Lettere non fuse", "Label planare", "Contrasto alto"],
        promptSuffix:
          "large readable product label, simple uppercase typography, flat label plane facing camera, high contrast black letters on white label",
        negativeSuffix: "gibberish letters, misspelled word, tiny unreadable text, warped typography"
      },
      {
        id: "geometry-integrity",
        label: "Geometry Integrity",
        focus: "Forma e bordo dell'oggetto.",
        successCriteria: ["Bordi verticali", "Tappo allineato", "Label rettangolare", "Prospettiva stabile"],
        promptSuffix:
          "rigid bottle symmetry, straight vertical edges, clean cap alignment, precise label rectangle, stable object silhouette",
        negativeSuffix: "warped bottle, bent label, crooked cap, distorted perspective",
        params: { cfg: 5.05 }
      },
      {
        id: "reflection-control",
        label: "Reflection Control",
        focus: "Riflessi e materiale vetro.",
        successCriteria: ["Vetro leggibile", "Riflessi puliti", "No glare bruciato", "Materiale premium"],
        promptSuffix:
          "clean studio reflections, controlled highlight rolloff, transparent glass thickness, premium surface response",
        negativeSuffix: "dirty reflections, hot glare, muddy glass, noisy speculars",
        params: { steps: 36, cfg: 5.1 }
      }
    ]
  },
  {
    id: "anime-face-action",
    label: "Anime Face / Action",
    family: "anime",
    categoryId: "anime-portrait",
    styleRecipeId: "quality-lab-anime-clean",
    priority: "critical",
    description: "Anime SDXL per occhi, linework e leggibilita del personaggio.",
    checkpointProfileId: "anime",
    requiredModelIds: ["anime-checkpoint"],
    providerModel: "Animagine local",
    providerReason: "Baseline anime locale con checkpoint dedicato.",
    successCriteria: ["Occhi simmetrici", "Linework pulito", "Palette non solo dark/neon", "Personaggio leggibile"],
    params: {
      prompt:
        "anime character portrait, tight close-up framing, expressive face, symmetrical eyes, clean hair framing, refined cel shading, soft rim lighting, polished anime illustration finish, production-ready character art",
      negativePrompt:
        "worst quality, low quality, blurry, uneven eyes, muddy colors, messy linework, bad hands, deformed face, deformed mouth, extra fingers, text, watermark",
      steps: 30,
      cfg: 4.8,
      samplerName: "dpmpp_2m",
      scheduler: "karras",
      width: 832,
      height: 1216
    },
    modelConfig: { enableDetailPass: false, autoRepairThreshold: 72 },
    candidates: [
      {
        id: "face-clarity",
        label: "Face Clarity",
        focus: "Occhi, bocca e linee del volto.",
        successCriteria: ["Occhi nitidi", "Bocca pulita", "Espressione leggibile", "Linee volto stabili"],
        promptSuffix: "sharp anime eyes, symmetrical pupils, clean mouth line, readable facial expression, refined lineart",
        negativeSuffix: "uneven pupils, warped mouth, muddy face, messy linework"
      },
      {
        id: "hair-linework",
        label: "Hair Linework",
        focus: "Capelli e pulizia delle linee.",
        successCriteria: ["Ciocche separate", "Silhouette capelli pulita", "Highlight coerenti", "Niente massa scura"],
        promptSuffix: "clean hair strand grouping, polished cel-shaded hair, crisp silhouette, controlled highlights",
        negativeSuffix: "tangled hair mass, noisy hair, muddy highlights"
      },
      {
        id: "action-readability",
        label: "Action Readability",
        focus: "Variante piu dinamica ma leggibile.",
        successCriteria: ["Pose dinamica leggibile", "Aura controllata", "Costume separato", "Niente silhouette cyber nera"],
        promptSuffix: "dynamic upper-body pose, readable character silhouette, controlled aura effects, clean costume shape",
        negativeSuffix: "chaotic effects, cluttered silhouette, fused fingers, character sticker look",
        params: { width: 1024, height: 1024 },
        modelConfig: { renderCategoryId: "anime-action-character" }
      }
    ]
  },
  {
    id: "anime-action-character-readable",
    label: "Anime Action Character",
    family: "anime",
    categoryId: "anime-action-character",
    styleRecipeId: "anime-action-readable",
    priority: "critical",
    description: "Action anime per linework, costume e personaggio leggibile senza caos neon.",
    checkpointProfileId: "anime",
    requiredModelIds: ["anime-checkpoint"],
    providerModel: "Animagine local",
    providerReason: "Lane anime dinamica da separare dal portrait: serve misurare silhouette, outfit ed effetti.",
    successCriteria: ["Linework pulito", "Personaggio leggibile", "Costume dettagliato", "Effetti sotto controllo"],
    params: {
      prompt:
        "anime action character key visual, single readable protagonist leaping forward, dynamic but clear full-body pose, expressive face, symmetrical eyes, readable hands, distinct outfit design with separated costume layers, clean action linework, crisp cel shading, controlled aura effects, background supports the character without overpowering",
      negativePrompt:
        "worst quality, low quality, blurry, featureless black silhouette, default black bodysuit, dark cyber armor, neon aura overload, glowing contour overload, chaotic effects, background overpowering character, messy linework, uneven eyes, fused fingers, text, watermark",
      steps: 32,
      cfg: 3.9,
      samplerName: "er_sde",
      scheduler: "simple",
      width: 1024,
      height: 1024
    },
    modelConfig: { enableDetailPass: false, autoRepairThreshold: 74 },
    candidates: [
      {
        id: "clean-action-linework",
        label: "Clean Action Linework",
        focus: "Pulizia linee, occhi, mani e contorno personaggio.",
        successCriteria: ["Linee nette", "Occhi simmetrici", "Mani leggibili", "No motion smear"],
        promptSuffix:
          "sharp character outline, clean action linework, symmetrical eyes, readable hands and fingers, crisp cel shading",
        negativeSuffix: "messy linework, uneven eyes, fused fingers, muddy character edges, motion smear",
        params: { cfg: 3.85 }
      },
      {
        id: "character-first",
        label: "Character First",
        focus: "Il personaggio resta piu importante di aura e sfondo.",
        successCriteria: ["Soggetto dominante", "Sfondo subordinato", "Aura controllata", "Silhouette chiara"],
        promptSuffix:
          "character brighter and sharper than background, clear face and hair silhouette, controlled aura effects, background supports the pose",
        negativeSuffix: "background overpowering character, featureless black silhouette, neon aura overload, chaotic effects"
      },
      {
        id: "costume-readability",
        label: "Costume Readability",
        focus: "Outfit, accessori e separazione dei dettagli.",
        successCriteria: ["Outfit distinto", "Layer separati", "Accessori leggibili", "Niente massa nera"],
        promptSuffix:
          "distinct outfit design, separated costume layers, readable armor or cloth panels, clean accessory shapes, polished production character art",
        negativeSuffix: "default black bodysuit, dark cyber armor mass, unreadable costume, cluttered silhouette",
        params: { steps: 33, cfg: 4.0 }
      }
    ]
  }
];

function appendComma(base: string, suffix?: string) {
  return suffix?.trim() ? `${base}, ${suffix}` : base;
}

export function buildSuitePayloads(
  suite: BenchmarkSuite,
  requestedCandidateCount: number,
  openPoseControlAvailable: boolean
): CreateJobInput[] {
  const candidates = suite.candidates.slice(0, requestedCandidateCount);
  const batchId = candidates.length > 1 ? crypto.randomUUID() : "";
  const baseSeed = Math.floor(Math.random() * 1_000_000_000);

  return candidates.map((candidate, index) => {
    const modelConfig: ModelConfig = defaultModelConfig({
      checkpointProfileId: suite.checkpointProfileId,
      renderProvider: "local-comfy",
      renderProviderModel: suite.providerModel,
      renderProviderReason: suite.providerReason,
      renderCategoryId: suite.categoryId,
      renderStyleRecipeId: suite.styleRecipeId,
      renderStyleRecipeLabel: suite.label,
      renderVariantId: candidate.id,
      renderVariantLabel: candidate.label,
      renderBatchId: batchId,
      renderBatchSize: candidates.length,
      renderCandidateIndex: index + 1,
      renderCandidateLabel: candidate.label,
      autoRepairOnLowScore: true,
      autoRepairThreshold: 74,
      evaluationMode: "vision",
      optimizationMode: "quality-first",
      ...suite.modelConfig,
      ...candidate.modelConfig
    });
    const shouldUseOpenPose =
      openPoseControlAvailable &&
      (modelConfig.humanControlMode === "openpose" ||
        (modelConfig.humanControlMode === "auto" &&
          (modelConfig.humanStructureMode === "full-body" || modelConfig.humanStructureMode === "action")));

    return {
      workflow: shouldUseOpenPose ? "sdxl_openpose_text2img" : "sdxl_text2img",
      params: {
        ...suite.params,
        ...candidate.params,
        seed: baseSeed + index,
        prompt: appendComma(suite.params.prompt, candidate.promptSuffix),
        negativePrompt: appendComma(suite.params.negativePrompt, candidate.negativeSuffix)
      },
      modelConfig
    };
  });
}
