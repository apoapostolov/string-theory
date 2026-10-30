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
| `docs/format.md` | Canonical format, the wrap law, and the exporter guidance. |
| `samples/demo.strings.json` | The sample the empty state loads. Keep one row in each verdict: one spill, one orphan, clean two-line wraps. |
| `docs/banner.png`, `docs/icon.png`, `docs/icon.svg`, `docs/app-*.png`, `docs/screenshot*.png` | README assets. Regenerate from `brand/` at the sizes noted there, never by hand. |
| `brand/banner.html`, `brand/icon.html` | The sources the assets are rendered from: 1600×600 banner, 512×512 icon. |
| `profiles/README.md` | Explains where style profiles go; the generated profiles themselves are gitignored. |
| `LICENSE` | MIT. |
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

## Sign-in rules

- A provider gets a sign-in only when a flow really exists, and the shape is recorded in `server/oauth.mjs`: `device` posts a form, `codex` posts JSON and hands back an authorization code to exchange once, `authorize` is PKCE in the browser with the code pasted back.
- A ChatGPT session authenticates against `https://chatgpt.com/backend-api/codex`, never `api.openai.com`. The account id rides in the token claims and becomes the `chatgpt-account-id` header; it is optional, so a missing claim never fails a request.
- A Codex session must not travel with the provider's platform endpoint. `resolveCredentials` returns the operator's override or nothing for that kind, and `chat()` falls back to the Codex base; sending `api.openai.com` with a session fails with a scope error that looks like a bad token.
- A session is a bearer token and an API key is not: `chat()` takes `auth`, and the Anthropic branch sends `anthropic-beta: oauth-2025-04-20` only for a session.
- `npm run smoke:oauth` must pass before a sign-in change ships. It stubs the endpoints, so it proves the request shapes and the refresh path without an account; it cannot prove a provider still accepts them.

## Agent instructions

- `src/lib/aiInstructions.ts` is the only copy of the prompt handed to another agent. It restates the rules in `docs/format.md` in paste-sized form, and it builds the target path from the live inbox so the folder it names is the folder this app reads.
- The prompt has to forbid the demo catalogue by path and demand a row count reconciled against the project's own source of truth. Without both, an agent that cannot find the app's strings hands back `samples/demo.strings.json` with sixteen rows and calls it done, which is exactly what happened.
- `scripts/validate-export.mjs` recognises that demo by its id set and warns when an export carries it. The sample itself is exempt by path, so the warning keeps its meaning.
- The prompt leads with the destination as an absolute path and forbids writing anywhere inside this repository. An agent that can only see the String Theory checkout will otherwise leave its export beside the demo in `samples/`, which is how `samples/moo.strings.json` happened.
- Two fields exist for the same reason: the app name, because the prompt should address the operator's project rather than whichever set is open, and the project folder, because an agent told where the strings live stops searching this repository for them.
- The validator warns when a file sits inside this repository outside `inbox/`, the demo excepted. That is the cheap catch for a misplaced export, which otherwise looks perfectly valid and never appears in the app.
- A format change touches `docs/format.md`, the schema, `FormatSpec` and this prompt in the same commit. `scripts/validate-export.mjs` is the arbiter: an export produced from the prompt must exit 0 or the prompt is wrong.
- The instructions open from two places on purpose: the inbox empty state, and an AI Instructions button in the picker header, which must work when files are already present.

## Popovers inside a row

- A row's popover cannot outrank the rows below it from the inside: every windowed row is an absolutely positioned wrapper carrying a transform to place it, and a transform makes its own stacking context. Lift the wrapper with `.st-rowwrap:has([aria-expanded='true'])` / `:has(.st-tagpanel)`; a `z-30` on the menu alone changes nothing.
- A menu opened from a row near the bottom of the list would be clipped by the scroller, so it flips above the trigger when there is less than roughly 230px of viewport below it. Measure at open time.
- Test this by hit-testing the point inside the menu with `document.elementFromPoint`: before the fix it returns an element from the row underneath, and the last menu item is unclickable.

## One applied provider and model

- The applied pair is `(config.activeProvider, config.model)`. Settings renders the provider grid as a `radiogroup` of `radio` rows with a real checkbox; ticking one patches both fields at once and there is never more than one ticked. Nothing else in the UI may change `activeProvider` on its own.
- `patchConfig` remembers the outgoing pair in `modelByProvider` before applying a change, and the incoming one after, so switching providers restores the model last used with each instead of the first entry in its catalogue.
- The header chip names the pair — `Provider · model · $spend today` — and the per-row Polish button inherits it, because the client sends no model and the server resolves `config.model`. Prove that wiring by setting a bogus model and reading the provider's rejection, never by assuming.

## Model catalogues

- `server/models-cache.mjs` owns the cache: `data/models-cache.json`, one entry per provider with the models, the time it was fetched, and whether the last check passed. The curated array in `server/providers.mjs` is a seed, never the answer.
- The catalogue fetch is the health check. `/models` answers 200 only to an accepted credential, so a save, a completed sign-in or an endpoint change refreshes it, and a stale entry is refreshed behind the next `GET /api/config`. Never block a response on it: warm in the background on load, await only on an explicit action.
- `state` is the verdict, not `ok`: `ok`, `limited` (the credential works but may not read the catalogue), `rejected` (401), `unreachable`. A limited key must not read as a dead one, and a failure never overwrites a good catalogue unless the credential was rejected.
- A session and a key do not share headers here either: `listModels` takes `auth`, sends a bearer and the oauth beta header for a Claude session, and for a ChatGPT session reads `https://chatgpt.com/backend-api/codex/models?client_version=1.0.0` with `originator: codex_cli_rs` — without `client_version` that endpoint answers 400, and the session must never travel to the platform base.
- `npm run verify:models` asks every provider's catalogue endpoint with an invalid credential: 401/403 means the path and headers are right and only the key is missing, 404 means the path is wrong. OpenRouter and a local Ollama answer without a key, which proves the OpenAI-compatible path end to end.
- The refresh control lives with the model picker, not in the key-only block, because a sign-in has a catalogue too.
- `scripts/models.test.mjs` pins freshness, classification, the header shapes and the cache lifecycle against a local stub; `scripts/smoke.mjs` drives the same paths through the running server.

## Two surfaces

- A file is either `surface: "app"` (the default) or `surface: "docs"`. Never mix them: a docs row has no wrap box, and a budget on one is a warning, not a convenience.
- `shared/parse-export.mjs` strips budgets on a docs file and reports it once (`docs-budgets`), because measuring a paragraph against a button manufactures failures. Docs rows keep `maxPxPerLine: null` and `maxLines: 0`.
- `src/lib/lanes.ts` orders the lanes: internal first, then `order` (README 0, changelog 1, release notes 2, then the README's links), then label. The order is data from the file, never guessed from the name.
- Opening a file opens its folder. `loadInboxFile` collects every export in the same group and commits one library write: adding docs one at a time let each activation flush the previous document into a library that did not contain it yet, which silently dropped the first file of every project.
- Prose rows are `src/components/DocsRow.tsx` (with `RowBits` for the glyph and pass control). They show the source paragraph, a tall textarea, and chars/words; no meters, no orphan rule, no fit filter.
- The polish prompt branches on `item.surface`: prose gets a paragraph instruction and never hears about pixels or the 40% last-line law.

## Projects, files and lanes

- The picker lists **projects**, one row per inbox folder: the folder name, the file count and age, the file names in lane order (the app first, then `order`), and the total number of strings — or the project's progress once it is open. Never list every file of every project in it; that is what made it unreadable.
- The lane row inside the editor is the file switcher: `Internal` first, then the documents by `order`, then name. It sits directly above the tag rail and stays visible for a one-file project, because it is where the editor says which file the list came from.
- A long project overflows that row. The rail scrolls on the wheel and shows a caret at an end only while there is something in that direction; measure with a `ResizeObserver` and a scroll listener, not once on mount, and take the caret out of the tab order when it is hidden.
- Opening a project loads every export in its folder in one commit and activates the app export; `src/lib/projects.ts` owns the grouping and the sort, and `server/inbox.mjs` must expose `surface`, `source`, `order` and `title` for it.
- A listing entry that silently lacks those fields reads as `undefined` and every file looks like a separate project: check `/api/files` before believing the UI.

## Windowing

- `src/lib/useVirtualRows.ts` renders only the rows around the viewport inside a spacer of the full height. Never render the whole list to fix a scrolling bug; fix the window.
- Heights are measured with a ResizeObserver per mounted row, never assumed from a constant. A row changes height when the text wraps, a tag is added or the layout narrows, and the rows below must move by that amount.
- Unmeasured rows take the median of the measured ones, not the starting estimate: guessing 96 against a measured 102 moves the scrollbar thumb on every measurement.
- Read the scroller on the scroll event itself. `requestAnimationFrame` does not fire in a hidden window, so a deferred update leaves the list stale until the window is shown; there is also a `visibilitychange` resync.
- The row with focus is always mounted, outside the window when necessary, so a textarea never loses focus or its caret.
- Only mounted rows exist in the DOM, so every row carries `aria-setsize` and `aria-posinset`, and zebra striping comes from the row's index (`data-even`), not `nth-child`.
- `.st-rows` exposes `data-start`, `data-end` and `data-count` so windowing can be asserted without pixels; `scrollToIndex` reaches a row that is not mounted yet.

## Change prompt

- `shared/change-prompt.mjs` builds the instructions from the working set, and `scripts/change-prompt.test.mjs` checks it without a browser (`npm run test:changes`). One line per changed string, in the shape `Replace "old" with "new" in <section> (id: …)`.
- A line must survive being pasted alone: it names its own area and role unless the group heading above it already says the area, and quotes and line breaks are escaped the JSON way so the line never wraps.
- An emptied row marked complete is a removal, and its line is `Remove "<old>" in <section>`, never `Replace … with ""`. `isRemoval()` and `isPendingEmpty()` in `shared/change-prompt.mjs` are the only definition; an empty row that is not complete is a draft and is excluded, then reported in the stats.
- An id is dropped only when the source text is unique in the file. Two rows with one source and two rewrites would otherwise be indistinguishable lines.
- The section comes from the tags, never from an invented grouping: first tag is the role, the rest are the area. An untagged row falls back to the first segment of its `where` line rather than being hidden.
- The export marks the same case: an emptied, completed row writes `removed: true` beside `state: "done"`, so a merge tool does not have to infer a deletion from an empty string.
- `Generate Prompt` sits last in the footer, after `Export JSON`, with the same primary (ink) treatment. Nothing about this feature requires an exporter, a converter or a file round trip.

## Tags

- The vocabulary lives in `shared/tags.mjs` and nowhere else. The app, the parser, the validator and the prompt all read it, so a new standard tag is one entry plus the docs table.
- A tag is metadata, not a rewrite: it never changes `text`. `tags` is an array of lowercase hyphenated names; the first is the string's role, the rest group strings that belong together, and a project may invent its own.
- Counting is per tag and comes from the same decorated list the rows use, so a pill cannot disagree with the row it filters. `~untagged` is a UI sentinel for the empty case and is never written to a file.
- Several selected tags combine with `any` by default, with a visible switch for `all`. The status filter and the search still apply on top, because the tag rail narrows a list rather than replacing it.
- A working set saved before tags existed has no `tags` field; `revive()` supplies an empty list rather than letting `undefined` reach the rail.

## Settings layout

- Settings is two tabs, Provider and Workspace, as a real `tablist` with arrow keys. Provider holds the provider grid and that provider's credentials. Workspace holds the default pass, fit bands and budgets, the extra instruction, the sources inbox, style profiles, the measurement font and usage. A new control belongs in Workspace unless it is about connecting a provider.
- The key-only options (key field, endpoint override, fetch models) render only while the key side of a provider is selected. The model choice stays on both sides, because it applies to either credential.
- `authModeFor()` in `src/lib/auth.ts` is the only place that decides key or sign-in. The credentials block and the options beside it read the same function, so they cannot disagree about which mode is active.

## Design and access rules

- Rows alternate with `.st-row:nth-child(even)`. Do not add per-row backgrounds from JSX; the stripe is one rule so the list stays even when a filter hides rows.
- Motion comes from `src/styles.css`: one curve (`--ease-out`) and three durations. Animate transform, opacity and colour only, and cover every new animation with the reduced-motion block.
- Focus is one shape everywhere: the global `:focus-visible` ring, plus `:focus-within` on a row so the row being edited reads as active.
- A row is one two-column block from its first pixel. The identity line belongs to the left column so the input starts flush at the row top; never reintroduce a full-width header strip above both columns.
- A verdict is never colour alone. Meters are `role="progressbar"` with `aria-valuetext`, and each row carries an `sr-only` sentence with its budget, line count and orphan percentage.
- Dialogs go through `src/lib/useDialog.ts` for Escape, focus trapping and focus restore. A drawer that stays mounted needs `inert` while closed.
- `npm run check:contrast` computes every text and border pair. All pairs pass before a UI change ships; a new token joins that table in the same commit.

## Verifying a change

1. `npm run build` clean, and `npm run check:contrast` at 17/17.
2. `npm run serve:status` healthy, then `npm run smoke` at 19/19 and `npm run smoke:oauth` at 47/47.
3. `node scripts/validate-export.mjs samples/demo.strings.json` valid.
4. Load the app, load the sample, and check the bands: one red row (lay out the lines), one amber orphan with its percentage, green rows with a clean two-line wrap, and the per-string 16px title measuring wider than the 14px rows.
5. Put two files in `inbox/`, open both, edit one, switch, reload: the picker must show both progress numbers and the edits must survive.
6. Any format change: re-read the four homes above and diff them against each other.
