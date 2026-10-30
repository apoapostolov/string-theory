# String Theory

An internal tool for rewriting an application's own UI strings. An app exports its strings with an id, the line of UI where each one appears, and the pixel width that line must not exceed. String Theory shows the source on the left and a prefilled input on the right, counts characters and measured pixels as you type, and exports the replacements in the same shape.

It is built for one operator on one machine, not for a team or a public site. The local server binds to `127.0.0.1`; nothing is uploaded except the AI polish requests you trigger yourself.

![String Theory editing a Foundry module export](docs/screenshot.png)

## Run it

Node 22 or newer.

```powershell
npm install
npm run build
npm start
```

`npm start` serves the built client and the API on <http://127.0.0.1:4317>. For development, `npm run dev` runs the API with `--watch` on 4317 and Vite on 5477 with `/api` proxied.

To launch it without a console window, run `start-hidden.vbs`. It starts the server, writes its output to `data/server.log`, and opens the app in the default browser. Point a shortcut at that file if you want it in the Start menu.

## Use it

1. Drop a `.json` export on the window, or use **Open export**. **Load the sample file** shows the tool with illustrative Foundry module strings.
2. Read the source on the left. Hovering it shows the full location line, the pixel budget and the font the measurement uses.
3. Type the rewrite on the right. The **chars** and **PIL** counters under the input compare the source value with the current one:
   - green, comfortably inside the budget
   - amber, past the threshold (90% by default), close enough that a translation or a bigger UI scale will spill
   - red, measured past `maxPx`, so the line will wrap where the app expected one line
   The PIL meter prints how many pixels over the limit you are when it goes red.

   ![Close to limit filter showing a single amber row](docs/screenshot-close-to-limit.png)
4. **Polish** sends one string to the connected AI provider for a grammar and style pass. The caret beside it runs Grammar, Style or Fit instead of the default pass. `Ctrl+Enter` inside an input does the same, `Esc` reverts that row.
5. **Export JSON** downloads `<app>.rewritten.json` with the current text, the previous text and a `changed` flag per string. **Copy JSON** puts the same payload on the clipboard.

Filters, search, `Next issue` and the status bar exist to get you to the two strings that will wrap, not to browse. The working set is saved in the browser, so a reload keeps your rewrites.

## Export format

The full field reference, accepted aliases and the merge rule are in [docs/format.md](docs/format.md). The short version:

```json
{
  "format": "string-theory/1",
  "app": "Session Transcripts",
  "font": { "family": "Segoe UI", "size": 14, "weight": 400 },
  "defaultMaxPx": 200,
  "strings": [
    {
      "id": "panel.title",
      "text": "Session Transcripts",
      "where": "Panel header, left of the refresh button",
      "maxPx": 180,
      "maxChars": 24
    }
  ]
}
```

`font` is not decoration. The pixel figures come from measuring each string in that font with a canvas, so the export has to declare what the app really renders with. If the family is not installed on this machine the browser substitutes one, and the settings panel says so.

The contract, the aliases a rough exporter can get away with, the validity rules and the merge algorithm are in [docs/format.md](docs/format.md). The machine-readable version is [docs/string-theory.schema.json](docs/string-theory.schema.json), and any file can be checked before it is handed over:

```powershell
node scripts/validate-export.mjs path/to/app.strings.json
```

Errors block an export; warnings still load and show up in a dismissible strip above the list, along with anything the import had to repair. The same reference is available inside the app from the **info** button in the header.

## AI providers

The provider set matches the one Lingarr Next exposes for AI work: OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, Mistral, Qwen (DashScope), Z.ai, OpenCode Go, xAI, and a local OpenAI-compatible server for Ollama or LM Studio. Pick one in Settings, paste the key, fetch the model list (or type a model id), and it becomes the polish engine.

- Keys are written to `data/keys.enc.json`, encrypted with AES-256-GCM under `data/master.key`. The browser never receives them; requests are proxied by the local server.
- Each provider keeps its own endpoint override, so a gateway or proxy works without code changes.
- xAI is API key only. The OAuth session Lingarr Next holds is its own and is not reusable here.

Every call is logged to `data/usage.json` with token counts and an estimated cost. The pricing table covers OpenAI, Anthropic, DeepSeek and `openrouter/free`; other providers record tokens but no cost, and the settings panel warns when today's calls cannot be priced. Daily and monthly USD budgets stop the polish calls when they are reached.

The prompt sends the string, its id, the location line, the measured width and a character budget derived from `maxPx`. Placeholders, shortcuts and product names are copied byte for byte, and the answer is trimmed of fences and stray quotes before it lands in the input. A rewrite is never trusted to fit: it is measured again, and goes red like any manual edit.

## Data and privacy

Everything lives under `data/` and is gitignored: `config.json`, `keys.enc.json`, `master.key`, `usage.json`, `server.log`. Delete the folder to reset. The working set lives in the browser's local storage under `string-theory.workspace.v1`.

The server has no authentication because it only listens on loopback. Do not expose port 4317 to a network.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API on 4317 with reload, Vite on 5477 |
| `npm run build` | Typecheck and build the client into `dist/` |
| `npm start` | Serve `dist/` and the API on 4317 |
| `node scripts/smoke.mjs` | End-to-end check against a running server: provider round trip, prompt contents, usage accounting, budget guard, credential errors |
| `node scripts/validate-export.mjs <file>` | Check an export against the format contract. `--strict` fails on warnings too |

## Known limits

- One app export at a time, one locale. There is no multi-language string table.
- Pixel numbers depend on the declared font being installed and on canvas measuring text the way the app lays it out. Letter spacing and weight are honoured; kerning-only differences and platform font hinting are not.
- The AI is per string, deliberately. There is no "polish all" because an unreviewed batch defeats the point of rewriting in your own words.
- Cost estimates are a local price table, not provider billing. Treat them as a guardrail, not an invoice.
