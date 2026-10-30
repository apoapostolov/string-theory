# Changelog

Notable changes, newest first. Every version here is a public release; the format
itself is documented in [docs/format.md](docs/format.md).

## 1.0.0 — 2026-10-30

The first public release. String Theory is a local studio for rewriting an
application's interface strings against the width the layout actually gives them,
and for the prose a project publishes beside that app. It runs on your machine,
listens on loopback, and uses an AI provider only when you ask it to.

### Added

- **Measured budgets, not character counts.** Every string carries a line budget
  (`maxPxPerLine`), a line allowance (`maxLines`) and the font the app renders it
  in. A rewrite is wrapped greedily at spaces in that font and judged on three
  numbers: lines against the allowance, the widest line against the box, and the
  last line against the box. A wrapped last line holding one stranded word, or
  less than 40% of the box, is an orphan — amber, with the percentage it fills.
  Verdicts are a left border and a tint; the characters meter is separate, for
  apps that enforce their own cap.
- **One applied provider and one model.** Settings shows every provider with a
  checkbox; ticking one applies it and unticks the rest. The applied pair names
  itself in the header chip (`OpenAI · gpt-5.6-luna · $0.008`), and that is what
  the Polish control on any row uses. Each provider remembers its last model, so
  switching back restores your pick instead of the head of a catalogue.
- **Model catalogues fetched, not hardcoded.** A catalogue is pulled when a key
  is saved, when a sign-in finishes, when an endpoint changes, when the cached
  copy is stale (24 hours by default, adjustable), and on demand. The listing
  doubles as the health check: 200 proves the credential, a rejected key is told
  apart from an unreachable provider, and a credential that may chat but not read
  a catalogue is reported as limited rather than dead. A failed check never
  discards the last good list.
- **Eleven providers, three real sign-ins.** OpenAI, Anthropic, Google Gemini,
  DeepSeek, OpenRouter, Mistral, Qwen, Z.ai, OpenCode Go, xAI and a local
  OpenAI-compatible server for Ollama or LM Studio. Sign-in instead of a key is
  wired for xAI and ChatGPT (device code) and Claude (approve in the browser,
  paste the code). Sessions are sealed on disk, refresh before they expire, and a
  ChatGPT session is sent to the Codex endpoint rather than `api.openai.com`.
  Every call lands in a usage ledger with tokens and an estimated cost, and daily
  and monthly budgets stop the calls when they are reached.
- **Documents beside an app.** App strings are half of what a project says. A
  project folder can hold both: a docs export declares `surface: "docs"`, carries
  no font or wrap box, and gets tall paragraph rows with character, word and
  length counts instead of fit meters. Documents are ordered the way a reader
  meets them — README, changelog, release notes, then the README's links —
  because the order is data in the file, never guessed from the name.
- **Projects, not files.** The picker has one row per project with its file order
  and total string count; opening it loads every export in the folder in one
  working set. A lane rail above the tags switches between the app's internal
  strings and the project's documents, each lane carrying its own progress, and a
  project with more lanes than fit scrolls with a caret pair. Several projects
  stay open at once.
- **Large files stay fast.** The list is windowed: only the rows around the
  viewport are mounted, each absolutely positioned inside a spacer as tall as the
  file, with measured row heights so a jump to row 900 still lands. On the
  1,604-string export in this repository, opening the file went from 3,139 ms to
  149 ms and the document from 105,671 elements to 1,099. A row being edited
  stays mounted while it scrolls out of view, so focus is never stolen
  mid-sentence.
- **Passes, voices and your profile.** Grammar, Style and Fit run one string at a
  time from the control beside its input; there is no polish-all, by design. The
  menu is two columns: passes on the left, and on the right five editorial voices
  — Humanizer, Product strings, Short pass, Simple English, Prose — all
  subtraction-only and all bound by the same budget and placeholder rules. The
  switch beneath them applies a writing profile read from a file on this machine,
  which you name in Settings; its text never enters the repository, the browser or
  any call except the prompt you asked for. Settings decides whether the menu
  offers the voices, your profile, or only the passes.
- **Style analyst.** After you have completed rewrites, the analyst compares each
  shipped string with your version and writes the differences down as rules:
  voice, sentence shape, word swaps, length discipline, punctuation, and what you
  never write. It needs three pairs, samples evenly across a large file, and
  saves a markdown profile per app, shaped as a skill reference so a writing agent
  can load your house style with its skill.
- **Changes written as instructions.** `Generate Prompt` turns the working set
  into lines an agent can apply: `Replace "Start recording" with "Start capture"
  in Button text (id: transcripts.record.start)`. A row emptied and marked
  complete becomes `Remove "…" in Hint (id: app.hint)`, with the rules spelling
  out that the line, its key and its entry go, and that an emptied row still in
  progress is a draft and stays out of the list. Grouping and ids are switchable,
  and quotes and line breaks are escaped so a change stays one line.
- **The format is the product.** `string-theory/1` is documented in
  `docs/format.md`, machine-readable in `docs/string-theory.schema.json`, readable
  inside the app from the info control, and checkable with
  `node scripts/validate-export.mjs <file>`. Input is tolerant — bare arrays,
  aliases, missing budgets — and every repair is reported as a warning or an
  error instead of being applied silently. Rewrites merge by `id`, and `previous`
  is always written so a merge can see that the source moved.
- **Built to be read, not just looked at.** Every verdict pairs its colour with a
  number and a word; meters are progress bars with spoken values; each row
  carries a screen-reader sentence with its budget, lines and orphan percentage;
  dialogs trap focus and hand it back; a closed drawer is inert; reduced motion
  removes the entrance animation. Contrast is computed from the tokens —
  21 text and border pairs — and the build keeps all of them passing.
- **Local by default.** The server listens on `127.0.0.1` only. API keys and
  sessions are sealed with AES-256-GCM under `data/master.key` and never returned
  to the browser; working sets live in the browser; nothing is uploaded except
  the AI calls you trigger. One URL serves both modes: `http://127.0.0.1:4317`,
  with Vite and hot reload in dev and `dist/` in prod.
- **Runs without a console window.** A supervisor owns the ports, restarts a
  crashed child with backoff, rotates `data/server.log` at 5 MB, and answers
  `serve:status`, `serve:restart` and `serve:stop`. On Windows,
  `scripts/install-startup.ps1` registers a hidden logon task with
  restart-on-failure and a desktop shortcut that starts the server when it is
  down and opens the browser when it is up.

### Limits

- The keep-it-running helper is Windows PowerShell. On macOS and Linux the app
  runs wherever Node 22 does, started with `npm run serve`.
- An AI pass needs a key or a session you supply; nothing is bundled, and no
  provider is proxied.
- Model catalogues are confirmed against live endpoints for the key-based
  providers, OpenRouter, Ollama and a ChatGPT session. A Claude session's
  catalogue path is exercised against stubs, not a live subscription.
- There is no batch polish, no rewrite of a string you have not opened, and no
  automatic application of a change to your repository. Rewrites leave as a
  download or as a prompt.
