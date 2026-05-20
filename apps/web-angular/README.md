# Web Angular

Frontend principale Angular Material del progetto.

## Avvio

```bash
pnpm dev
```

URL locale: `http://127.0.0.1:4200`

La API viene letta da `src/environments/environment.ts`, di default `http://127.0.0.1:4000`.

Per avviare solo il frontend Angular:

```bash
pnpm --filter @repo/web-angular dev
```

## Pagine

- `/generate`: generazione, preset, diagnostica prompt, batch candidati e guardrail
- `/studio`: composizione prompt guidata
- `/jobs`: lista job con polling e stream live
- `/jobs/:id`: dettaglio job, evaluation, repair, learning, telemetry e logs
- `/gallery`: asset generati con filtri
- `/models`: registry modelli locali
- `/learning`: memoria statistica e override
- `/quality-lab`: benchmark controllati per categorie critiche

## Controlli

```bash
pnpm typecheck
pnpm lint
pnpm build

pnpm --filter @repo/web-angular typecheck
pnpm --filter @repo/web-angular lint
pnpm --filter @repo/web-angular build
```
