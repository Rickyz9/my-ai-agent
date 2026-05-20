# Local Gen Studio

Monorepo locale per generazione immagini e video su macOS Apple Silicon con:

- `apps/web-angular`: frontend principale Angular Material su porta `4200`
- `apps/api`: Fastify REST API + SSE
- `apps/worker`: BullMQ worker per job asincroni
- `packages/db`: Prisma + SQLite
- `packages/comfy`: client ComfyUI + workflow templating
- `packages/ollama`: client Ollama + prompt composer
- `packages/shared`: tipi Zod condivisi
- `infra`: Redis via Docker Compose
- `workflows`: template JSON ComfyUI
- `data`: DB SQLite, output e log locali

## File tree

```text
.
├── .env.example
├── apps
│   ├── api
│   │   └── src
│   │       ├── index.ts
│   │       ├── lib/config.ts
│   │       ├── queue/connection.ts
│   │       ├── routes/assets.ts
│   │       ├── routes/health.ts
│   │       ├── routes/jobs.ts
│   │       ├── routes/prompt.ts
│   │       └── services/jobs.ts
│   ├── web-angular
│   │   └── src
│   │       ├── app
│   │       │   ├── core
│   │       │   ├── pages
│   │       │   │   ├── generate
│   │       │   │   ├── jobs
│   │       │   │   ├── job-detail
│   │       │   │   ├── gallery
│   │       │   │   ├── models
│   │       │   │   ├── learning
│   │       │   │   ├── quality-lab
│   │       │   │   └── studio
│   │       │   ├── app.routes.ts
│   │       │   └── app.ts
│   │       └── environments/environment.ts
│   └── worker
│       └── src/index.ts
├── data
│   ├── logs
│   └── outputs
├── infra/docker-compose.yml
├── packages
│   ├── comfy/src/index.ts
│   ├── db
│   │   ├── prisma/schema.prisma
│   │   └── src/index.ts
│   ├── ollama
│   │   └── src
│   │       ├── index.ts
│   │       └── prompt-templates.json
│   └── shared/src/index.ts
├── workflows
│   ├── 3d_hunyuan3d_image_to_model.json
│   ├── pose_controlnet.json
│   ├── qwen_anime_text2img.json
│   ├── sdxl_img2img.json
│   ├── sdxl_inpaint_fix.json
│   ├── sdxl_text2img.json
│   ├── upscale.json
│   └── video_basic.json      # stub non esposto in UI
├── eslint.config.mjs
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── turbo.json
```

## Setup macOS

### 1. Prerequisiti

- Node.js 20+ installato localmente
- `pnpm` installato globalmente
- Docker Desktop avviato
- Ollama installato e attivo su `http://127.0.0.1:11434`
- ComfyUI Desktop installato e avviato su `http://127.0.0.1:8000`

Su Apple Silicon conviene usare build native ARM64 di Node, Ollama e Python/torch per evitare overhead di emulazione. Per SDXL e pipeline video usa modelli compatibili con il tuo setup Metal/PyTorch e tieni workflow e batch size conservativi finché non misuri la stabilità locale.

### 2. Configurazione ambiente

```bash
cp .env.example .env
```

Valori principali:

- `OLLAMA_URL`: endpoint locale di Ollama
- `OLLAMA_MODEL`: modello usato per comporre prompt
- `COMFY_URL`: endpoint locale di ComfyUI
- `COMFY_CHECKPOINT`: nome esatto del checkpoint presente in `ComfyUI/models/checkpoints`
- `COMFY_CHECKPOINT_PHOTOREAL_SDXL`: checkpoint SDXL realistico dedicato per ritratti, cinematic still e interior
- `COMFY_REFINER_CHECKPOINT`: checkpoint refiner opzionale usato per il secondo passaggio SDXL; se vuoto il refiner viene disattivato automaticamente
- `COMFY_UPSCALE_MODEL`: nome esatto del modello upscale presente in `ComfyUI/models/upscale_models`
- `COMFY_CHECKPOINT_3D`: checkpoint Hunyuan3D presente in `ComfyUI/models/checkpoints`
- `COMFY_LORA_NAME`: LoRA default opzionale presente in `ComfyUI/models/loras`
- `COMFY_LORA_STRENGTH`: forza LoRA default
- `REDIS_URL`: Redis per BullMQ
- `DATA_DIR`: cartella locale per DB, log e output
- `DATABASE_URL`: SQLite Prisma, già puntato a `./data/app.db`

Il frontend Angular principale usa `apps/web-angular/src/environments/environment.ts` e punta di default a `http://127.0.0.1:4000`. I comandi root `dev`, `build`, `typecheck` e `lint` lavorano sulla stack Angular + API + worker + pacchetti core.

### 3. Installa dipendenze

```bash
pnpm install
```

### 4. Avvia Redis

```bash
docker compose -f infra/docker-compose.yml up -d
```

Opzionale: RedisInsight è esposto su `http://127.0.0.1:5540`.

### 5. Inizializza Prisma

```bash
pnpm db:generate
pnpm db:migrate
```

### 6. Avvia Ollama

Esempio:

```bash
ollama serve
ollama pull llama3.1
```

Sostituisci `llama3.1` con un modello locale che ti dia risposte JSON stabili.

### 7. Avvia ComfyUI

Assicurati che:

- i checkpoint citati nei workflow esistano davvero
- eventuali custom node dei workflow video/upscale siano installati
- l’API di ComfyUI Desktop sia raggiungibile su `127.0.0.1:8000`

Il file `workflows/video_basic.json` è volutamente uno stub. Sostituiscilo con un export reale del tuo workflow ComfyUI e mantieni i placeholder `{{prompt}}`, `{{negative_prompt}}`, `{{seed}}`, `{{steps}}`, `{{cfg}}`, `{{width}}`, `{{height}}`, `{{input_image}}` dove necessario.

### 8. Avvio sviluppo

```bash
pnpm dev
```

`pnpm dev` avvia la UI Angular principale, API e worker.

Servizi attesi:

- web Angular: `http://127.0.0.1:4200`
- api: `http://127.0.0.1:4000`
- worker: processo BullMQ separato

Script utili:

- `pnpm dev:angular`: Angular + API + worker
- `pnpm dev:all`: alias della stack Angular principale
- `pnpm build`: build production della stack principale Angular + API + worker + pacchetti core
- `pnpm build:angular`: build del frontend Angular
- `pnpm typecheck`: typecheck della stack principale Angular + API + worker + pacchetti core
- `pnpm typecheck:angular`: typecheck del frontend Angular
- `pnpm lint`: lint della stack principale Angular + API + worker + pacchetti core
- `pnpm lint:angular`: lint del frontend Angular

## Workflow applicativo

### Prompt Studio

`POST /api/prompt/compose`

- riceve `userText` e `preset`
- chiama Ollama via `packages/ollama`
- ritorna `prompt`, `negativePrompt`, `params`, `safetyNotes`

### Generate

`POST /api/jobs`

- crea record `Job` su SQLite
- salva il workflow template iniziale
- enqueue su BullMQ

### Worker

Il worker:

- carica il job dal DB
- sostituisce placeholder nel JSON workflow
- invia il workflow a ComfyUI con `submitWorkflow`
- monitora lo stato con `waitForCompletion`
- recupera output via `fetchOutputs`
- scarica asset in `./data/outputs/<jobId>/`
- salva asset e log strutturati su SQLite

### Tracking

- `GET /api/jobs`: lista job
- `GET /api/jobs/:id`: dettaglio con log, asset e workflow JSON
- `GET /api/jobs/:id/stream`: SSE con aggiornamenti live di stato/progress
- `POST /api/jobs/:id/rerun`: crea un nuovo job dai parametri precedenti
- `GET /api/assets`: galleria asset
- `GET /api/health`: check API, Ollama, ComfyUI e Redis

## Placeholder workflow supportati

Nel JSON workflow puoi usare:

- `{{prompt}}`
- `{{negative_prompt}}`
- `{{seed}}`
- `{{steps}}`
- `{{cfg}}`
- `{{width}}`
- `{{height}}`
- `{{denoise}}`
- `{{strength}}`
- `{{input_image}}`
- `{{source_image}}`
- `{{mask_image}}`
- `{{control_image}}`

## Note importanti

- `sdxl_text2img.json`, `sdxl_img2img.json`, `pose_controlnet.json`, `sdxl_inpaint_fix.json`, `qwen_anime_text2img.json`, `3d_hunyuan3d_image_to_model.json` e `upscale.json` sono i workflow attivi. Verifica nomi checkpoint/modello e custom node rispetto alla tua installazione reale.
- FLUX è attualmente legacy nel codice: il database e la learning memory possono contenere vecchi job `flux_text2img`, ma il workflow non è più esposto tra i workflow attivi e non c'è un template FLUX operativo nel repository corrente.
- `sdxl_inpaint_fix.json` è una lane SDXL inpaint supportata per repair localizzati. Gli auto-repair di volto, occhi/bocca, mani, piedi e testo generano una maschera locale, caricano sorgente/maschera nella input folder di ComfyUI e correggono solo l'area debole con denoise basso.
- La lane umana strutturata usa `sdxl_openpose_text2img` risolto su `pose_controlnet.json`: imposta `COMFY_CONTROLNET_OPENPOSE` su un ControlNet/OpenPose compatibile con SDXL. Se il job non riceve un'immagine di posa, l'API genera automaticamente una pose map preset e la carica nella input folder di ComfyUI.
- `video_basic.json` è uno stub esplicito, non viene mostrato nella UI Generate e l'API lo rifiuta con un errore chiaro finché non viene sostituito con un workflow ComfyUI reale.
- Il frontend Angular usa `apps/web-angular/src/environments/environment.ts`; se cambi porta API aggiorna `apiBaseUrl`.
- Gli asset vengono serviti da Fastify sotto `/data/<relativePath>`.

## FLUX.1-schnell legacy

Le note seguenti sono una traccia per riattivare FLUX in futuro, non lo stato attivo del codice corrente. La strada consigliata resta mantenere `FLUX.1-schnell` come ramo separato dal ramo SDXL, ma prima bisogna reintrodurre:

- un workflow kind attivo in `packages/shared`
- un template ComfyUI reale, ad esempio `flux_schnell_text2image.json`
- le variabili env e il registry modelli per UNET, CLIP-L, T5 e VAE
- la UI di selezione/preset dedicata
- il ramo worker che risolve i placeholder FLUX

Setup consigliato nel progetto:

- `COMFY_CHECKPOINT_PHOTOREAL_SDXL`: usa qui il tuo miglior checkpoint SDXL realistico; la configurazione consigliata e testata per questa lane e `RealVisXL_V5.0_fp16.safetensors`
- `COMFY_FLUX_UNET`: usa qui il diffusion model FLUX principale
- `COMFY_FLUX_CLIP_L`: usa qui `clip_l.safetensors`
- `COMFY_FLUX_T5`: usa qui `t5xxl_fp16.safetensors`
- `COMFY_FLUX_VAE`: usa qui il VAE richiesto dal workflow FLUX

Cartelle ComfyUI Desktop:

- `~/Documents/ComfyUI/models/checkpoints/` per `COMFY_CHECKPOINT_PHOTOREAL_SDXL`
- `~/Documents/ComfyUI/models/unet/` per `COMFY_FLUX_UNET`
- `~/Documents/ComfyUI/models/text_encoders/` per `COMFY_FLUX_CLIP_L`
- `~/Documents/ComfyUI/models/text_encoders/` per `COMFY_FLUX_T5`
- `~/Documents/ComfyUI/models/vae/` per `COMFY_FLUX_VAE`

Quando FLUX verrà riabilitato, il repository dovrebbe tornare a:

- inventariare i file FLUX nella pagina `/models`
- mostrare il ramo FLUX nella UI
- usare il workflow FLUX.1-schnell esportato da ComfyUI come ramo separato da SDXL

Questo evita di mischiare FLUX e SDXL nello stesso workflow e rende il tuning molto più governabile.

## Troubleshooting

### `POST /prompt` fallisce su ComfyUI

- controlla che il workflow JSON sia valido per i nodi installati
- verifica i nomi dei modelli nel template
- apri ComfyUI e testa prima il workflow manualmente

### Ollama non ritorna JSON valido

- cambia `OLLAMA_MODEL` con un modello più stabile nelle istruzioni strutturate
- riduci lunghezza del prompt utente
- controlla i log API

### Il worker prende il job ma non salva asset

- verifica l’endpoint `/history/<promptId>` su ComfyUI
- controlla che gli output siano effettivamente in `SaveImage` o nodi video equivalenti
- controlla permessi di scrittura su `./data`

### BullMQ non parte

- conferma che Redis sia attivo su `REDIS_URL`
- prova `docker ps` e `docker logs local-gen-redis`

## Comandi utili

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```
