# Export format

`string-theory/1`. One JSON file per application. The app writes it from its own string catalogue; String Theory reads it and writes the same shape back with new values.

## Envelope

| Field | Type | Notes |
| --- | --- | --- |
| `format` | string | `string-theory/1`. Optional on input, always written on output. |
| `app` | string | Application name. Shown in the header and used for the export filename. |
| `context` | string | Optional one-liner about the screen or module. Sent to the model with every prompt. |
| `font` | object | The font the pixel numbers are measured in. See below. |
| `defaultMaxPx` | number | Fallback pixel budget for strings without their own `maxPx`. |
| `strings` | array | The strings. A bare array also loads. |

`font` accepts `family`, `size` (px), `weight` (numeric or `bold`/`semibold`), and `letterSpacing` (px, default 0). Aliases: `metrics` or `typography` for the object itself, `fontFamily`, `fontSize`, `fontWeight`, `tracking` inside it.

Get this wrong and every pixel number in the tool is wrong, because the browser measures the string in that font. Match what the app actually renders with, including the weight.

## String fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Required. Stable id from the app's catalogue. Duplicates are suffixed `#2`, `#3` so they stay editable. |
| `text` | string | Required. The string as it ships today. |
| `where` | string | The line of UI where it appears. Shown on hover and sent to the model, so be specific: "Panel header, left of the refresh button" beats "header". |
| `maxPx` | number | Pixel width the line must not exceed. Without it the row cannot go red. `220px` is parsed as 220. |
| `maxChars` | number | Character ceiling, only when the app enforces one itself. |

Aliases, all optional:

- id: `key`, `name`, `textId`, `stringId`
- text: `value`, `string`, `source`, `current`, `content`, `en`, `default`
- where: `info`, `place`, `location`, `context`, `usedIn`, `note`
- maxPx: `maxPIL`, `maxPil`, `max_px`, `max_pil`, `pilMax`, `pil_max`, `maxWidth`, `max_width`, `max`
- maxChars: `max_chars`, `maxLength`, `max_length`, `charLimit`, `char_limit`, `limit`

Any entry may also carry `px` (the app's own measurement). When `maxPx` is absent it is used as the budget; otherwise it is ignored. Snake_case works for every documented field.

## What the app gets back

```json
{
  "format": "string-theory/1",
  "app": "Session Transcripts",
  "exportedAt": "2026-10-30T11:38:32.830Z",
  "font": { "family": "Segoe UI", "size": 14, "weight": 400, "letterSpacing": 0 },
  "changed": 1,
  "strings": [
    {
      "id": "transcripts.panel.title",
      "text": "Transcripts for this session",
      "previous": "Session Transcripts",
      "where": "Transcript panel header, left of the refresh button",
      "maxPx": 180,
      "maxChars": null,
      "changed": true
    }
  ]
}
```

Merge rule on the app side: map by `id`, take `text`. Skip entries where `changed` is false if you only want to touch what was rewritten. `previous` lets an importer show a diff or support an undo.

## How the numbers are produced

Character count is `text.length`, code units, not grapheme clusters. Close enough for UI copy; a flag emoji or a combining accent can differ from what a designer counts.

Pixel length is what this tool calls PIL: a canvas `measureText` call with the declared font, rounded to one decimal and displayed as a whole number. It is a good model of a single-line label in the same font at the same size; it cannot know about kerning pairs between a font's fallback glyphs, subpixel positioning, or a container that pads the text.

Verdict per string:

- `ok` below the amber threshold
- `near` at or above it, up to the budget
- `over` past `maxPx`

The amber threshold is a setting, 90% by default. `maxChars`, when present, produces its own verdict for the chars meter; otherwise the chars meter shows the pixel verdict.

## Prompt budget

The model cannot measure pixels, so the prompt converts the budget into characters: roughly `maxPx / (fontSize * 0.52)` for regular weights, with a 6% widening for weights 600 and up. It is told both the hard ceiling and a comfortable target at 94% of it. The reply is measured on arrival like any other edit.

## Writing an exporter

```js
// Node or browser. Walk the app's catalogue, measure each label where it renders,
// and emit one entry per visible string.
const strings = Object.entries(catalogue).map(([id, text]) => ({
  id,
  text,
  where: locations[id] ?? '',
  maxPx: budgets[id] ?? 200,
  maxChars: characterLimits[id]
}))

await writeFile('session-transcripts.strings.json', JSON.stringify({
  format: 'string-theory/1',
  app: 'Session Transcripts',
  context: 'Foundry VTT module settings and transcript panel',
  font: { family: 'Segoe UI', size: 14, weight: 400, letterSpacing: 0 },
  defaultMaxPx: 200,
  strings
}, null, 2))
```

`maxPx` should come from the layout, not from the current text: it is the width the container gives the label. If a label sits in a fixed 180px column with 12px of padding on each side, the budget is 156.
