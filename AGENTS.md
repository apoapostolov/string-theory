# Repo instructions: String Theory

An internal tool that takes an app's exported UI strings, lets a human rewrite each one against a pixel budget, and exports the replacements. One operator, one machine, loopback only.

Read [`docs/format.md`](docs/format.md) before touching the loader, the measurement or the export. The format is the product; the UI is a view of it.

## Commands

```powershell
npm install
npm run dev        # API 4317 with --watch, Vite 5477 proxying /api
npm run build      # tsc --noEmit && vite build
npm start          # serve dist + API on 4317
npm run smoke      # end-to-end provider path, needs the server running
node scripts/validate-export.mjs <file.json> [--strict]
```

There is no test framework. `scripts/smoke.mjs` is the integration test: it starts a stub OpenAI-compatible provider, runs real polish calls through the server, checks prompt contents, token and cost accounting, the budget 402 and the missing-provider 400, then restores the config it changed. It must stay at 14/14.

## Map

| Path | Responsibility |
| --- | --- |
| `src/lib/format.ts` | Loader. Implements every repair and issue code listed in `docs/format.md`. The only place that interprets an export. |
| `src/lib/metrics.ts` | Canvas measurement, fit bands, cached. The only place pixels are computed in the client. |
| `src/lib/api.ts` | Typed wrapper over the local API. |
| `src/App.tsx` | Working set, filters, persistence, export payload. |
| `src/components/StringRow.tsx` | One string: source, where line, input, both meters, per-row passes. |
| `src/components/FormatSpec.tsx` | In-app format reference. Must match `docs/format.md`. |
| `src/components/ImportReport.tsx` | Shows what the import repaired. |
| `src/components/SettingsPanel.tsx` | Providers, credentials, passes, budgets, measurement font, usage. |
| `server/index.mjs` | Routes, static serving, edit-free orchestration. |
| `server/providers.mjs` | Provider registry and the three wire formats (OpenAI-compatible, Anthropic, Gemini). |
| `server/store.mjs` | Config, AES-256-GCM key vault, usage ledger. |
| `server/polish.mjs` | Prompt building, character-budget estimate, output sanitising. |
| `server/pricing.mjs` | USD per million tokens, ported from Lingarr Next. |
| `samples/demo.strings.json` | The sample the empty state loads. Keep one row in each band (ok, near, over). |

## Contract rules

- `string-theory/1` is additive. Adding an optional field or an alias is v1; changing what a field means needs `/2` and a changelog entry in `docs/format.md`.
- The loader is more forgiving than the exporter: accept documented aliases, bare arrays, string entries and numbers with units. Repair with an issue, never silently.
- Issue codes in `src/types.ts` are a closed set. A new repair needs a code, a message in the loader, and a row in the validity table in `docs/format.md`.
- Never merge by position or by text. Rewrites join on `id`; `previous` is what makes conflict detection possible, so it is always written.
- Measurement lives in `src/lib/metrics.ts`. No second `measureText` call anywhere, and no character-count approximation dressed up as a pixel figure.
- The AI result is measured like any manual edit. Never trust a model to have respected a budget.

## Docs live in four places

`docs/format.md` is canonical. It is quoted to four audiences, and they have to agree after every change:

1. `docs/format.md` + `docs/string-theory.schema.json` (canonical, for a human reading the repo).
2. `src/components/FormatSpec.tsx` (operative subset, for the operator inside the app, offline).
3. This file (rules and map, for an agent changing the repo).
4. Hermes skill `string-theory-handoff` (workflow, for an agent asked to prepare strings for this tool).

Do not copy the whole spec into all four. Each home carries what its reader needs and points at the canonical file.

## Invariants

- Loopback only. No auth on the API because it never leaves `127.0.0.1`; do not add a public bind, a tunnel, or a CORS opener.
- Provider keys are sealed with AES-256-GCM under `data/master.key` and never returned to the browser. Only a masked hint may cross the wire.
- `data/` is runtime state and gitignored. Do not commit a config, a ledger or a key file.
- The client is built offline: no CDN fonts, no remote scripts, no analytics.
- Budgets are a guardrail, not billing. Keep the "unpriced" warning honest rather than inventing rates.
- Per-string AI passes only. There is no "polish all": an unreviewed batch defeats the purpose of rewriting in a human's own words.

## Conventions

- TypeScript strict with `noUnusedLocals`. Tailwind v4 tokens come from `@theme` in `src/styles.css`; do not put raw hex into components.
- Shape scale: controls 8px (`rounded-lg`), panels 14px (`rounded-[14px]`), pills full. Two values, applied everywhere.
- Colours: one monochrome ink accent. Green, amber and red are semantic only (fit bands, errors) and never decorative.
- Copy is plain and concrete, never promotional. No em-dashes anywhere in UI strings or docs.
- New dependency only for a job the platform cannot do. The server currently has none.

## Verifying a change

1. `npm run build` clean.
2. `npm start`, then `npm run smoke` at 14/14.
3. `node scripts/validate-export.mjs samples/demo.strings.json` valid.
4. Load the app, load the sample, and check the three bands still render: green row, amber row, red row with an overflow figure.
5. Any format change: re-read the four homes above and diff them against each other.
