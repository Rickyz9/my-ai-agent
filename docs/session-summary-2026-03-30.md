# Session Summary - 2026-03-30

## Goal
Evolvere il progetto di generazione immagini locale verso un flusso più automatico, qualitativo e robusto, con:
- category autopilot
- fallback intelligenti su modelli e LoRA
- evaluation reale dell'output
- retry/repair guidati
- learning memory
- generate page più leggibile e orientata a decisioni progressive

## Current Local Setup
- Web app Next.js
- API Fastify
- Worker BullMQ
- ComfyUI Desktop su `http://127.0.0.1:8000`
- Ollama su `http://127.0.0.1:11434`
- Redis richiesto su `127.0.0.1:6379`
- Root modelli ComfyUI: `~/Documents/ComfyUI/models`

## Major Work Completed

### Core infrastructure
- Sistemati path assoluti per `DATA_DIR`
- Allineato `COMFY_URL` a ComfyUI Desktop su porta `8000`
- Allineato SQLite, worker e model registry
- Aggiunto `/models` per vedere i modelli realmente installati
- Sistemato il campo `seed` passando da `INT` a `BIGINT` in Prisma, con migration dedicata
- Aggiornati API e worker per leggere/scrivere `seed` correttamente

### Generate page
- Scene templates per molte categorie:
  - Anime Action Character
  - Anime Portrait
  - Editorial Portrait
  - Product Hero Shot
  - Cinematic Still
  - Environment Concept
  - Beauty Close-up
  - Macro Product Detail
  - Architectural Interior
  - Fashion Editorial
  - Food Editorial
- Quality presets, aspect presets e quality modes
- Prompt diagnostics con quick fixes
- Prompt score con gating del submit
- Golden path per categoria
- Auto-compose con Ollama
- Generate page ristrutturata in una sequenza logica a cascata, senza wizard reale:
  - Step 1: direction
  - Step 2: prompt
  - Step 3: model lane / LoRA / overrides
  - Step 4: framing / params
  - Step 5: review / generate
- Gerarchia visiva migliorata con blocchi `Core path` vs `Advanced`
- Rimossa una duplicazione reale: il `Final negative prompt` non è più un box separato, ma parte del `Prompt package`

### Category autopilot and recipes
- Estratta la logica in un modulo condiviso `render-autopilot.ts`
- Recipe dedicate per categoria con:
  - prompt reinforcement
  - negative prompt category-specifici
  - quality/aspect preset
  - detail pass / refiner policy
  - LoRA recommendation
- La selezione categoria applica tutta la recipe, non solo parte del prompt
- Prompt normalizer per input brevi
- Fallback automatici su:
  - workflow
  - checkpoint profile
  - LoRA mancanti
- Supporto a learning-aware recipe optimization
- Aggiunta una layer separata di `style lanes` sopra le categorie:
  - `Photoreal Clean`
  - `Photoreal Glamour`
  - `Fashion Heels`
  - `Cinematic Grounded`
  - `Product Glossy`
  - `Anime Clean`
- Le style lanes possono decidere:
  - style preset
  - extra reinforce/negative blocks
  - supporto a VAE / negative embedding
  - LoRA primaria e secondaria
- Aggiunta una `benchmark prompt suite` per tarare le style lanes con prompt ripetibili direttamente da `/generate`

### Prompt Studio
- Input libero in italiano
- Output finale forzato in inglese
- Risposta copy-ready con:
  - prompt
  - negative prompt
  - suggested settings
  - recommended profile
- Pulsante `Send to Generate`

### Model profiles and workflows
- Profili modello:
  - `general`
  - `anime`
  - `photoreal`
  - `photoreal-sdxl`
  - `product`
  - `flux-photoreal`
- Workflow integrati:
  - SDXL text2img
  - Qwen anime text2img
  - FLUX schnell text2img
  - FLUX fill inpaint
  - OpenPose ControlNet
  - upscale

### Qwen anime
- Integrato workflow reale `qwen_anime_text2img.json`
- Supporto a:
  - UNET
  - text encoder
  - VAE separati
- Resta disponibile come ramo anime dedicato

### Anime SDXL / Animagine
- `Animagine XL V3.1` gestito correttamente come checkpoint SDXL anime, non come workflow Qwen
- Le categorie anime preferiscono la lane `anime checkpoint SDXL` quando è presente `COMFY_CHECKPOINT_ANIME`
- Qwen resta fallback o ramo manuale opzionale

### FLUX
- Integrato workflow reale `flux_schnell_text2image.json`
- Pipeline FLUX separata da SDXL
- Asset richiesti:
  - `flux1-schnell.safetensors`
  - `clip_l.safetensors`
  - `t5xxl_fp16.safetensors`
  - `ae.safetensors`
- Supporto preset guidati:
  - FLUX Editorial Portrait
  - FLUX Magazine Cover
  - FLUX Beauty Close-up
  - FLUX Cinematic Female Portrait
- Modalità FLUX:
  - Draft
  - Final

### Inpaint and Control
- Integrato workflow reale `flux_fill_inpaint.json`
- Integrato workflow reale `pose_controlnet.json`
- Inpaint aggiornato per usare:
  - `source image`
  - `mask image` separata
- Preset locali:
  - Hand Cleanup
  - Neck Cleanup
  - Face Cleanup

## LoRA Work Completed

### Registry and UI
- Esteso il model registry per includere la categoria `loras`
- Aggiunto supporto `COMFY_LORA_NAME` anche lato API registry
- `/models` rende visibili le LoRA come categoria dedicata
- `/generate` ha un blocco `LoRA helper` che:
  - legge i file presenti in `ComfyUI/models/loras`
  - suggerisce una lane LoRA per scena/profilo
  - matcha i filename installati
  - applica `enableLora + loraName + loraStrength` con un click

### LoRA lanes and mapping
- Matching filename migliorato con:
  - `matchKeywords`
  - `bonusKeywords`
  - `avoidKeywords`
- Strategy separate per realism:
  - `Beauty / Editorial Clean`
  - `Real People / Glamour`
- Prompt-aware routing:
  - beauty/editorial pulito -> lane clean
  - glamour esplicito -> lane glamour
- Badge UI aggiunti:
  - `Clean realism`
  - `Glamour push`

### Specific installed LoRA
- `sdxl1.0_realastic_female_lora.safetensors`
  - integrata come LoRA SDXL per beauty/editorial portrait
  - filename normalization con fix typo `realastic -> realistic`
  - strength iniziale consigliata ~ `0.62`
- `real_people_generator.safetensors`
  - verificata come LoRA `SDXL`, non FLUX
  - mappata come alternativa `Real People / Glamour`
  - strength iniziale più prudente ~ `0.52`
- `ptheels_sdxl_V2-000010.safetensors`
  - integrata come LoRA specialistica fashion/heels
  - pensata come LoRA secondaria, non come default generalista
  - utile per lane `Fashion Heels`, non per cinematic grounded o portrait generici

### Multi-LoRA and SDXL support assets
- Supporto `multi-LoRA` stabile sul ramo `SDXL text-to-image`:
  - 1 LoRA primaria
  - 1 LoRA secondaria
- Aggiunta `loraChain` nel `modelConfig`
- Workflow dedicati:
  - `sdxl_text2img_lora_dual.json`
  - `sdxl_text2img_lora_dual_vae.json`
- Integrati anche:
  - `sdxlNaturalSkintone_fp32.safetensors` come `SDXL VAE`
  - `sdxl_cyberrealistic_simpleneg-neg.safetensors` come negative embedding SDXL
- Supporto ai workflow SDXL con VAE custom:
  - `sdxl_text2img_vae.json`
  - `sdxl_text2img_lora_vae.json`
  - `sdxl_text2img_refiner_vae.json`
  - `sdxl_img2img_vae.json`

### Current LoRA limitation handled
- `Refiner + LoRA` insieme non è ancora supportato dal workflow reale
- La UI e il worker ora spengono automaticamente il refiner quando la LoRA è attiva, evitando l'errore bloccante

## Evaluation, Repair and Learning

### Vision evaluation
- Installato e configurato `qwen2.5vl:3b` in Ollama
- `OLLAMA_VISION_MODEL=qwen2.5vl:3b`
- Verificato che l'evaluation dei job usa davvero `source: "vision"`

### Auto repair
- Aggiunti retry plans categoria-specifici
- Job detail con `Auto Repair / Retry Plans`
- `Auto-fix best issue` one-click
- Auto-fix automatico opzionale post-render se score sotto soglia
- Tracking di `renderRepairAttemptCount` e `renderLastRepairId`
- Escalation dei retry dopo tentativi multipli:
  - `Escalated`
  - `Plus`
- Penalizzazione del piano appena usato per evitare loop inutili

### Lineage and compare
- Job detail mostra parent/child lineage
- Compare view visuale parent vs child
- Badge automatici:
  - `Improved`
  - `Mixed`
  - `Needs Review`

### Learning memory
- Aggiunta learning memory locale sul worker
- Ogni render valutato salva:
  - categoria
  - config
  - score
  - variant
  - issue principali
- API dedicata per summary learning
- Generate page usa il summary per influenzare:
  - cfg
  - steps
  - detail pass
  - refiner
  - LoRA strength

### Recipe optimizer
- Introdotto un vero `recipe optimizer`
- Le recipe future per categoria vengono ottimizzate in base alla memoria storica

### Variant ranking
- Ogni render salva:
  - `renderVariantId`
  - `renderVariantLabel`
- La learning memory distingue le varianti e le classifica per categoria
- Ranking per sample count e average score

### Best-of-3 batch generation
- Per categorie selezionate:
  - `Beauty Close-up`
  - `Editorial Portrait`
  - `Anime Portrait`
  - `Product Hero Shot`
- `Generate` può lanciare automaticamente 3 candidati:
  - `Balanced`
  - `Detail`
  - `Drift Safe`
- Il worker aspetta i candidati, li valuta e seleziona il migliore
- Job detail mostra il `Candidate Batch` con score e badge `Best`
- Il vincitore del batch viene promosso nella learning memory con peso maggiore

### Category-specific quality tuning
- Raffinati i rami:
  - `Beauty / Glamour`
  - `Editorial Portrait`
  - `Fashion Editorial`
  - `Cinematic Still`
  - `Environment Concept`
  - `Product Hero Shot`
- Aggiunta categoria separata `Cinematic Action` per scene più dinamiche e spettacolari
- `best-of-3` con candidati dedicati per molte lane:
  - photoreal: `Face Stability`, `Skin Fidelity`, `Light Discipline`
  - cinematic: `Frame Hierarchy`, `Light Discipline`, `Atmosphere Control`
  - environment: `Scale Readability`, `Perspective Discipline`, `Atmosphere Separation`
  - product: `Geometry Integrity`, `Material Fidelity`, `Reflection Control`
  - editorial/fashion: candidati specifici magazine-oriented
  - anime: candidati dedicati per readability, face clarity e environment
- Ranking dei batch pesato per categoria nel worker
- Vision rubric più specifica per categoria

### Anime routing and stability
- Corretto il ramo anime per evitare mix errati tra `Qwen anime` e supporto `SDXL photoreal`
- Il ramo `Qwen anime` viene sanitizzato prima del submit:
  - profilo forzato `anime`
  - niente negative embedding SDXL
  - niente VAE custom SDXL
  - niente LoRA / detail pass
- I job che finiscono con `0 outputs` non vengono più segnati come `succeeded`
- Le scene `Anime Action Character` e `Anime Portrait` ora usano come default reale la lane `anime SDXL / Animagine`
- `Qwen anime` resta disponibile come workflow manuale/opzionale, non più come default implicito per le scene anime
- Rafforzati prompt e negative anime per evitare:
  - `plain white backdrop`
  - `empty studio background`
  - look da sticker isolato senza ambiente

### Batch UX and live refresh
- Aggiunta progress UI per ogni candidato del batch:
  - `progress %`
  - stato
  - mini progress bar
- Migliorato il microcopy:
  - `waiting for worker slot`
  - `running now`
  - `queued at`
  - `last update`
- Corretto il bug della job page:
  - prima smetteva di aggiornarsi quando il job principale finiva
  - ora continua a fare polling finché esiste almeno un candidato batch non terminale
  - restando nella job page ora dovrebbero comparire anche seconda e terza immagine senza dover uscire e rientrare

### Runtime and execution engine optimization
- Lo stream job in API non usa più polling Prisma ogni secondo per client:
  - ora fa subscribe Redis pub/sub per job id
  - invia un payload iniziale
  - poi inoltra eventi live di stato/progresso
  - mantiene solo un heartbeat leggero SSE
- Il worker ora pubblica eventi di job state dopo gli update principali:
  - `running`
  - progress durante esecuzione
  - `previewPath`
  - terminal states
- Aggiunto logging telemetry per fase nel worker:
  - `queueWaitMs`
  - `workflowBuildMs`
  - `submitMs`
  - `executionMs`
  - `outputPersistMs`
  - `evaluationMs`
- La summary learning in API ora è cacheata e viene invalidata quando:
  - cambia la memory
  - cambiano gli override manuali
- Il worker supporta ora concorrenza configurabile via:
  - `WORKER_CONCURRENCY`
  - default `1`

### Checkpoint safety and model stack UI
- Aggiunta guardia per evitare di usare checkpoint non-SDXL nella lane `photoreal-sdxl`
- Il registry prova a classificare i checkpoint (`sdxl`, `sd15`, `flux`, `qwen`, `unknown`)
- La generate page blocca il submit se la lane SDXL punta a un checkpoint incompatibile
- Aggiunta `select` vera per `Base checkpoint` nella generate page, popolata dai file reali in `ComfyUI/models/checkpoints`
- Chiarita la differenza in UI tra:
  - `Checkpoint profile lane`
  - `Base checkpoint`
  - `Style lane`

## Current Known Limitations
- Le LoRA sono operative davvero soprattutto sul ramo SDXL text-to-image
- Su Qwen / FLUX / inpaint / openpose il supporto LoRA non è ancora cablato in modo equivalente
- `Refiner + LoRA` non è ancora un workflow reale completo, anche se il sistema ora gestisce la combo in modo sicuro spegnendo il refiner
- L'inpaint funziona ma può ancora migliorare qualitativamente
- FLUX resta più sensibile a prompt vaghi
- Il worker processa ancora i batch in coda serialmente se ne tieni uno solo attivo, quindi i candidati `best-of-3` non avanzano davvero in parallelo
- Anche con stream event-driven, la UI jobs/job-detail fa ancora refresh API completo in alcuni punti invece di usare solo il payload SSE come fonte primaria
- `Qwen anime` resta più fragile della lane `anime SDXL / Animagine` e non è il ramo consigliato per il default qualitativo
- Redis deve essere attivo perché il worker processi i job

## Files Touched Most Recently
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/web/src/app/generate/page.tsx`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/web/src/app/generate/render-autopilot.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/web/src/app/jobs/[id]/page.tsx`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/api/src/routes/jobs.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/api/src/lib/job-events.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/api/src/routes/learning.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/worker/src/index.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/worker/src/lib/job-events.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/apps/worker/src/lib/learning-memory.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/packages/shared/src/index.ts`
- `/Users/riccardo.vitale/Desktop/Project Ai/my-ai-agent/packages/db/prisma/schema.prisma`

## Current Active State
Il progetto è ora in uno stato molto più avanzato rispetto all'inizio della sessione:
- generate page guidata e più ordinata
- autopilot per categoria
- fallback model-aware
- style lanes e benchmark prompts
- model stack più esplicito e controllabile
- evaluation reale con vision model
- retry/repair intelligenti
- best-of-3 con ranking
- batch progress e refresh live della job page
- job stream event-driven via Redis
- learning summary cache lato API
- telemetry runtime per fase nel worker
- concurrency worker configurabile
- learning memory che pesa di più i vincitori
- anime default riallineato alla lane `Animagine / anime SDXL`

## Best Next Step
I prossimi step con più impatto sono:
- migliorare ancora la qualità dell'evaluation vision con rubriche più specifiche per categoria
- far usare alla job page il payload SSE come fonte primaria, riducendo refresh completi superflui
- introdurre concorrenza controllata del worker per accelerare i batch senza saturare ComfyUI/GPU
- aggiungere telemetry/debug UI per tempi per fase e queue wait
- introdurre preset checkpoint-specifici ancora più mirati, ad esempio:
  - Animagine anime portrait
  - photoreal beauty clean
  - real people glamour
  - product fidelity

## Ready-to-Resume Prompt
Usa questo testo per ripartire in una chat nuova:

> Ripartiamo dal ramo generate/autopilot: abbiamo già category recipes, style lanes, fallback modelli/LoRA, vision evaluation con qwen2.5vl, auto-repair, best-of-3 con ranking per categoria, learning memory, multi-LoRA su SDXL, VAE + negative embedding SDXL e generate page riorganizzata a cascata. Le scene anime ora usano di default la lane anime SDXL/Animagine, mentre Qwen anime è rimasto workflow manuale opzionale. Sul runtime abbiamo anche job stream event-driven via Redis, learning summary cache lato API, telemetry per fase nel worker e concurrency configurabile via `WORKER_CONCURRENCY`. Il prossimo step è rifinire ancora la UI jobs per usare il payload SSE come fonte primaria e poi fare tuning checkpoint-specifico e concurrency controllata.
