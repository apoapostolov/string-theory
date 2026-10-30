# Repo instructions: String Theory

An internal tool that takes an app's exported UI strings, lets a human rewrite each one against a pixel budget, and exports the replacements. One operator, one machine, loopback only.

Read [`docs/format.md`](docs/format.md) before touching the loader, the measurement or the export. The format is the product; the UI is a view of it.

## Commands

```powershell
npm install
npm run dev          # supervisor, dev mode: Vite 4317 with HMR, API 4318 behind /api
npm run build        # tsc --noEmit && vite build
npm run serve        # supervisor in the mode from serve.config.json
npm run serve:status # mode, url, pid, health
npm run serve:restart
npm run serve:stop
npm start            # API only, prod assets, no supervisor
npm run smoke        # end-to-end provider path, needs the server up
node scripts/validate-export.mjs <file.json> [--strict]
```

The app has one URL in both modes: <http://127.0.0.1:4317>. `scripts/serve.mjs` supervises both children, logs to `data/server.log`, restarts a crashed child with backoff, and refuses to start a second copy. `scripts/install-startup.ps1` registers the hidden logon task and the desktop shortcut, and runs `serve-hidden.vbs`, so nothing opens a console window.

There is no test framework. `scripts/smoke.mjs` is the integration test: it starts a stub OpenAI-compatible provider, runs real polish and style-analyst calls through the server, checks prompt contents, token and cost accounting, the budget 402, the missing-provider 400, the analyst's three-pair floor and the profile listing, then restores the config it changed and deletes the profile it wrote. It must stay at 19/19.

## Map

| Path | Responsibility |
| --- | --- |
| `shared/parse-export.mjs` | Loader. Implements every repair and issue code in `docs/format.md`. Loaded by the client and by the server, which needs the same verdict to describe an inbox file. Never fork it. |
| `src/lib/format.ts` | Typed face of the shared loader, for the client. |
| `src/lib/metrics.ts` | Canvas measurement, fit bands, cached. The only place pixels are computed in the client. |
| `src/lib/api.ts` | Typed wrapper over the local API. |
| `src/App.tsx` | Library of working sets, per-file editing state, filters, export payload. |
| `src/components/SourcePicker.tsx` | The source dropdown: inbox files, open working sets, per-file progress. |
| `src/components/StringRow.tsx` | One string: source, where line, input, both meters, per-row passes. |
| `src/components/FormatSpec.tsx` | In-app format reference. Must match `docs/format.md`. |
| `src/components/ImportReport.tsx` | Shows what the import repaired. |
| `src/components/SettingsPanel.tsx` | Providers, credentials, passes, budgets, inbox folder, measurement font, usage. |
| `server/index.mjs` | Routes, static serving, edit-free orchestration. |
| `scripts/serve.mjs` | Supervisor: mode, ports, child restarts, log rotation, pid file, status/stop/restart/mode/open. |
| `scripts/serve-hidden.vbs` | Hidden launcher used by the logon task and the desktop shortcut. |
| `scripts/install-startup.ps1` | Registers the logon task and the shortcut; `-Remove` undoes both. |
| `serve.config.json` | `mode` (dev or prod) and `open`, read by every entry point. |
| `server/inbox.mjs` | Inbox scan and read. Lists exports with app name, string count and issue counts. |
| `server/style.mjs` | Style analyst: pair selection, the prompt, and reading and writing profiles. |
| `server/oauth.mjs` | OAuth sessions: device flow, token exchange, refresh, token import. |
| `src/components/StylePanel.tsx` | The analyst modal: evidence count, run, preview, saved profiles. |
| `src/components/ProviderAuth.tsx` | Credentials per provider: API key or sign-in, with the device code UI. |
| `server/providers.mjs` | Provider registry and the three wire formats (OpenAI-compatible, Anthropic, Gemini). |
| `server/store.mjs` | Config, AES-256-GCM key vault, usage ledger. |
| `server/polish.mjs` | Prompt building, character-budget estimate, output sanitising. |
| `server/pricing.mjs` | USD per million tokens, ported from Lingarr Next. |
| `samples/demo.strings.json` | The sample the empty state loads. Keep one row in each band (ok, near, over). |
| `inbox/` | Inputs written by other projects. Gitignored except `inbox/README.md`. |

## Contract rules

- `string-theory/1` is additive. Adding an optional field or an alias is v1; changing what a field means needs `/2` and a changelog entry in `docs/format.md`.
- The loader is more forgiving than the exporter: accept documented aliases, bare arrays, string entries and numbers with units. Repair with an issue, never silently.
- One parser. `shared/parse-export.mjs` is imported by the client and by the server's inbox listing; a second implementation of the format is a defect even if it agrees today.
- Working sets are per file, keyed by `inbox:<relative path>` or `file:<name>:<size>:<mtime>`, and persisted under `string-theory.library.v2`. Switching sources must never drop another file's edits. A file that leaves the inbox keeps its working set until the operator discards it.
- Issue codes in `src/types.ts` are a closed set. A new repair needs a code, a message in the loader, and a row in the validity table in `docs/format.md`.
- Never merge by position or by text. Rewrites join on `id`; `previous` is what makes conflict detection possible, so it is always written.
- Measurement lives in `src/lib/metrics.ts`. No second `measureText` call anywhere, and no character-count approximation dressed up as a pixel figure.
- The budget is a box, not a total. `maxPxPerLine` is the line width, `maxLines` the allowance, `maxPxTotal` their product. A string that needs more lines than allowed is `over`; so is a line wider than the box.
- The 40% last-line rule in `wrapFit` is the authoring standard, not a preference: a last line of one word, or under 40% of the box, is an orphan. Never soften it to make a row green, and never fix it by shrinking type or hyphenating.
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
- One URL, two modes. 4317 is the app in both: Vite owns it in dev and proxies `/api` to 4318; the API process owns it in prod and serves `dist/`. Never add a third port or move the app off 4317.
- The supervisor owns the ports. Do not run `npm start` or a bare `vite` while it is up; stop it with `npm run serve:stop` first, and start it detached, never as a child of a shell that will exit.
- Nothing starts a visible console window. Background starts go through `serve-hidden.vbs` or a scheduled task, never `cmd /c start` in a script.
- Provider keys are sealed with AES-256-GCM under `data/master.key` and never returned to the browser. Only a masked hint may cross the wire.
- OAuth sessions are sealed the same way in `data/oauth.enc.json`; only expiry and the account label stay readable. Never log a token, never send one to the client, and never write one into a profile, an export or a toast.
- OAuth is offered only where the provider publishes a flow we can actually complete. No fake sign-in buttons: a provider without a flow stays key-only, and the table in `server/oauth.mjs` is the list.
- String state is client-side workflow, not data the app owns: `normal`, `wip`, `done`. Typing a change promotes a row to `done`, a click cycles, a right-click clears, and reverting the text clears the state. Exports carry it as informational; no code may treat it as truth about the app.
- `data/` is runtime state and gitignored. Do not commit a config, a ledger or a key file.
- `inbox/` is input only. Never write to it from the tool, never delete from it, never commit its contents. A rewritten file leaves as a download.
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
2. `npm run serve:status` healthy, then `npm run smoke` at 19/19.
3. `node scripts/validate-export.mjs samples/demo.strings.json` valid.
4. Load the app, load the sample, and check the bands: one red row (lay out the lines), one amber orphan with its percentage, green rows with a clean two-line wrap, and the per-string 16px title measuring wider than the 14px rows.
5. Put two files in `inbox/`, open both, edit one, switch, reload: the picker must show both progress numbers and the edits must survive.
6. Any format change: re-read the four homes above and diff them against each other.
