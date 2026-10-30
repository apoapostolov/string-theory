# String Theory export format

`string-theory/1`. This is the contract between an application that owns UI strings and the human who rewrites them. One file per application.

The app exports its strings with an id, the line of UI each one appears in, and the pixel width that line must not exceed. String Theory shows the source, measures the rewrite, and exports the same shape back with new text. Nothing in the exchange depends on the tool's own database: the file is the whole state.

Machine-readable contract: [`string-theory.schema.json`](string-theory.schema.json). Checker: `node scripts/validate-export.mjs <file>`. In-app reference: the **info** button in the header.

## Tags

`tags` is a list of short names saying what the string does. One is enough; two or three make a string findable from both directions:

```json
{ "id": "settings.retention", "text": "Keep recordings for 30 days", "tags": ["label", "settings"] }
```

The first tag is the string's role, taken from the standard vocabulary below. Further tags group strings that belong together, and a project is free to invent them: `settings`, `checkout`, `onboarding`, `widget`. A custom tag is written the same way as a standard one, lowercase and hyphenated.

The tool builds a rail of every tag in the file, each with its own progress (`3/12 done`). Clicking one narrows the list to those strings; several at once can mean any or all of them. That is how a person works through only the hints, only the help paragraphs, or only one screen's worth of strings.

| Group | Tags |
| --- | --- |
| Structure | `page-title` `heading` `subheading` `section-title` `overline` `caption` `dialog-title` `dialog-body` |
| Controls | `label` `placeholder` `button` `action` `link` `tab` `menu-item` `dropdown` `checkbox` `radio` `switch` `slider` `stepper` `search` `shortcut` |
| Help | `hint` `tooltip` `help-paragraph` `empty-state` `onboarding` |
| Feedback | `error` `warning` `success` `info` `status` `toast` `confirmation` `progress` `count` |
| Navigation | `nav-item` `breadcrumb` `footer` `sidebar` |
| Data display | `table-header` `table-cell` `column-label` `filter` `sort` `summary` `badge` `banner` |
| Content | `paragraph` `list-item` `quote` `legal` `marketing` `accessibility` |
| Literals | `number-unit` `unit` `date-time` `variable` `brand` `proper-noun` `code` `url` `email` |

Names outside the table are custom tags and are kept as written. A known alias (`header` for `heading`, `btn` for `button`) still loads, and the validator says which standard tag it belongs to.

`note` is an optional free sentence about the string, shown with its details. It is for context the layout cannot express, such as "only appears when a recording fails". It never contains a rewrite.

## Exchange model

```
app catalogue ──export──▶ app.strings.json ──▶ String Theory ──▶ app.rewritten.json ──▶ app catalogue
                                │                                        │
                          ids, text, where,                        text, previous,
                  maxPxPerLine, maxLines, font                changed, by id
```

Three guarantees the tool relies on:

1. **Ids survive the round trip.** A rewrite merges back by `id`, never by position or by matching text.
2. **Budgets are absolute pixels, not relative to the current text.** `maxPxPerLine` is the box the layout gives one line, and `maxLines` is how many of them the layout allows.
3. **One font per file.** Every pixel figure in that file means the same thing.

### Where files are picked up

Drop the file in `inbox/` at the root of the String Theory checkout, or in a subfolder named after the project. The **Sources** picker lists every `.json` there, with the app name, the string count and any import notes, so several applications can be in progress at once without renaming anything. The folder is configurable in Settings, and each open file keeps its own working set and progress.

The inbox is input only. The tool never writes to it: a finished file leaves as a download, and the app that owns the strings merges it back.

## Versioning

| Change | Version |
| --- | --- |
| Add an optional field | `string-theory/1` |
| Add an alias the loader accepts | `string-theory/1` |
| Change what an existing field means, remove one, or require one | `string-theory/2` |

The loader is deliberately more permissive than the schema: it accepts documented aliases, a bare array, and strings instead of objects, and it repairs what it can while saying so. The exporter should emit the canonical names only. An unknown `format` value loads with a warning under the v1 rules; a file that declares `string-theory/2` is still attempted, never silently refused.

### Changelog

- `string-theory/1` initial. Envelope `format`, `app`, `context`, `font`, `defaultMaxPx`, `strings`; string fields `id`, `text`, `where`, `maxPx`, `maxChars`, `px`.
- `string-theory/1` lines and per-string font: `maxPxPerLine` is the canonical line budget, `maxLines` and `maxPxTotal` carry the vertical budget, and a string may declare its own `font`. `maxPx` still reads as `maxPxPerLine` for older exporters, and `defaultMaxPx` reads as `defaultMaxPxPerLine`. Export always writes the new names.

## Envelope

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `format` | string | optional | `string-theory/1`. Written on output even when absent on input. |
| `app` | string | recommended | Application name. Header label, export filename, AI prompt context. |
| `context` | string | optional | One line about the screen or feature set. Sent with every AI prompt. |
| `font` | object | required | The font the pixel figures are measured in. See below. |
| `defaultMaxPxPerLine` | number | optional | Line budget applied to strings that do not carry `maxPxPerLine`. `defaultMaxPx` is the older name for the same thing. |
| `strings` | array | required | The strings. A bare array is also accepted as the whole document. |

Nothing else is required. Unknown envelope fields are preserved by no one and read by no one: they are ignored.

## Font block

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `family` | string | `Segoe UI` (fallback only) | Font family the app renders with. A stack such as `Inter, sans-serif` is allowed. |
| `size` | number | 14 | Font size in CSS pixels. |
| `weight` | number \| string | 400 | 100 to 900, or `regular`, `medium`, `semibold`, `bold`. |
| `letterSpacing` | number | 0 | Extra tracking in CSS pixels, added per character. |

This block is load-bearing. Every PIL number in the tool comes from measuring the string in this font with a canvas `measureText` call. A file with no font block still loads, measured in 14px system text, and the import strip says the budget is an estimate.

Measurement is done on the machine that runs the tool. If the family is not installed there, the browser substitutes a face and the numbers drift, so:

- Prefer a font the app actually ships, not a system nickname.
- Record the weight honestly. Bold UI labels are 6% wider than regular at the same size.
- When the app already measures text in its own layout, still export `maxPxPerLine` from the container, and put the app's own figure in `px` for comparison.

## String fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | required | Stable id from the app catalogue. Unique within the file. |
| `text` | string | required | The string as it ships today. Single line. |
| `where` | string | recommended | Where it is shown, in words a reviewer can act on. |
| `maxPxPerLine` | number | required | Width of one line: the box the text wraps inside. Greater than zero. |
| `maxLines` | integer | recommended | How many lines the layout allows. Default 1. |
| `maxPxTotal` | number | optional | Total budget, normally `maxPxPerLine × maxLines`. Recomputed when it disagrees. |
| `maxChars` | integer | optional | Character ceiling, only when the app enforces one itself. |
| `px` | number | optional | The app's own measurement. Only used as a line budget when `maxPxPerLine` is absent. |
| `font` | object | optional | Measurement override for this string: `family`, `size`, `weight`, `letterSpacing`. |
| `state` | string | output only | `normal`, `wip` or `done`, written by the tool. Importers may ignore it; it exists so a diff shows what was reviewed. |

Guidance that decides whether the export is useful:

- **`id`** is a machine key, not a label. `transcripts.panel.title` merges; `Session Transcripts` does not.
- **`where`** is the difference between a rewrite that fits and one that fits the wrong place. "Panel header, left of the refresh button" beats "header". It is shown on hover and included in the AI prompt.
- **`maxPxPerLine`** is the width of the box the text wraps inside: container width minus horizontal padding, in the file font. Not the current text width. A label in a 180px column with 12px of padding on each side has `maxPxPerLine: 156`.
- **`maxLines`** is how many lines the layout gives the string. A single-line label is 1; a settings hint that may reflow is 2 or 3. Get it from the layout, never from how the current text happens to render: if the shipped string fits on one line and the layout allows two, `maxLines` is 2.
- **`maxPxTotal`** is derived: `maxPxPerLine × maxLines`. Write it if the app already has a different total, and the tool reports the disagreement rather than silently believing it.
- **`font`** per string is for the case where one string is not in the file font, for example a 16px semibold panel title in a file of 14px body labels. Omit it and the file font applies.
- **`text`** may contain `\n` for a hard break. Each paragraph then wraps on its own.
- Escape quotes and backslashes as JSON requires. Do not HTML-escape: `&amp;` is content, not syntax.

### Aliases

The loader accepts these in place of the canonical name. An exporter should not need them; they exist so an app that already has a string dump does not have to be rewritten before its strings can be improved.

| Canonical | Also accepted |
| --- | --- |
| `id` | `key`, `name`, `textId`, `text_id`, `stringId`, `string_id` |
| `text` | `value`, `string`, `source`, `current`, `content`, `en`, `default` |
| `where` | `info`, `place`, `location`, `context`, `usedIn`, `used_in`, `note` |
| `maxPxPerLine` | `maxPx`, `maxPIL`, `maxPil`, `max_pil`, `max_px`, `pilMax`, `pil_max`, `maxWidth`, `max_width`, `max` |
| `maxLines` | `max_lines`, `lines`, `wrapLines`, `wrap_lines` |
| `maxPxTotal` | `max_px_total`, `totalMaxPx`, `total_max_px`, `maxPxString`, `max_px_string` |
| `maxChars` | `max_chars`, `maxLength`, `max_length`, `charLimit`, `char_limit`, `limit` |
| `px` | `pil`, `PIL`, `width`, `measuredPx`, `measured_px` |
| `font` | `textFont`, `text_font`, `typography` |
| envelope `font` | `metrics`, `typography` |
| envelope `strings` | `entries`, `items`, `messages`, `rows` |

Numbers accept a trailing `px` or `ch`. Snake_case works for every documented field.

## Validity

**Errors** (the file is not a usable export):

- No strings array at all.
- An entry that is not an object and not a string.
- `id` missing, empty, or not a string.
- Duplicate `id`.
- `text` missing or not a string.
- `maxPxPerLine` present but not a number greater than zero.
- `maxLines` present but not a whole number from 1 to 20.
- `maxPxTotal` present but not a number greater than zero.
- A per-string `font` with neither a family nor a size.
- `maxChars` present but not a positive integer.
- `font` present but `family` or `size` invalid.

**Warnings** (loads, but say so):

- No `font` block, so measurement is an estimate.
- No `maxPxPerLine` and no `defaultMaxPxPerLine`, so nothing can be flagged as wrapping.
- Some strings without a line budget while others have one.
- `maxPxTotal` that is not `maxPxPerLine × maxLines`: the total is recomputed from the line budget.
- Generated ids for entries that had none: those rewrites cannot merge back.
- Duplicate ids suffixed `#2`, `#3` in the tool: only the first merges at the original id.
- Empty `text`, or `text` longer than 2000 characters.
- A `format` value this build does not know.
- No `where` on any string.

## How the numbers are produced

Character count is `text.length`: UTF-16 code units. That is what the app's own length checks usually compare against. Grapheme clusters can differ for flags, combining accents and emoji sequences; if the app counts graphemes, expect off-by-one differences.

PIL is rendered pixel length: a canvas `measureText` call with the declared font at the declared size and weight, letter spacing applied per character, rounded to one decimal. The tool does not measure the whole string as one run. It wraps the text at spaces inside `maxPxPerLine`, exactly as the layout would, and then reports three things: the number of lines, the width of the widest line, and the width of the last line.

It models a single run of text well. It cannot know about:

- kerning between glyphs that fall back to a different face,
- subpixel positioning and font hinting on the target OS,
- container padding, borders, or an ellipsis the app adds itself,
- a layout that hyphenates or breaks inside words. A word wider than the box is reported as an overflow, because that is what happens without hyphenation.

Treat PIL as a tight guardrail, not a promise. A string at 100% of its budget in this tool may still wrap if the app renders with a different face.

## Lines and the wrap law

The budget is a box, not a total. `maxPxPerLine` is the width available to a line, `maxLines` is how many lines the layout allows, and `maxPxTotal` is `maxPxPerLine × maxLines` for convenience. A string that needs more lines than `maxLines` spills, however short its widest line is.

Wrapping is greedy at word boundaries, in the declared font. On top of the line count, the tool applies the rule from the string authoring work:

- **The last line must fill at least 40% of the box.** A last line at 12% of 320px is an orphan: the reader sees one stranded word.
- **A last line of one word is a leak even when that word is wide.** Put another word on it, or do not wrap at all.
- Fixing an orphan means rebalancing the words, not shrinking the type, hyphenating, or padding with filler.
- A single-line string is exempt: there is no last line to judge.

The row shows the line count against the allowance (`2 / 2`) and, when the last line is thin, the percentage it fills (`orphan 23%`). A red row means it spills: either a line is wider than the box or the text needs more lines than the layout gives.

Verdicts:

| Verdict | Condition | Meaning |
| --- | --- | --- |
| `ok` (green) | fits, and either one line or a last line over 40% | Fine as it is. |
| `near` (amber) | fits, but the last line is an orphan, or a line is at or above the amber threshold of the box | Fits now; reads badly at a line break, or a longer word spills it. |
| `over` (red) | a line is wider than `maxPxPerLine`, or the text needs more lines than `maxLines` | It will wrap where the app expected otherwise. |
| `none` | no line budget | No verdict possible. |

The amber threshold for line width is a tool setting, 90% by default. The 40% last-line rule is not configurable: it is the authoring standard the strings are expected to meet.

## What comes back

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
      "maxPxPerLine": 150,
      "maxLines": 1,
      "maxPxTotal": 150,
      "maxChars": 22,
      "changed": true,
      "state": "done"
    }
  ]
}
```

The exported strings keep the order they had in the working set, which is the order they were imported in. Every row is written, including untouched ones, so the importer can diff the whole catalogue.

### Merge algorithm

```
for entry in rewritten.strings:
    if entry.changed is false: continue          # nothing to apply
    record = catalogue[entry.id]                 # ids are the join key
    if record is missing: log and skip           # renamed or deleted since export
    if record.text != entry.previous: conflict   # edited elsewhere meanwhile
    record.text = entry.text
```

`previous` is what makes the third check possible. Do not drop it during import, and do not merge by position.

## Validating

```bash
node scripts/validate-export.mjs samples/demo.strings.json
node scripts/validate-export.mjs path/to/app.strings.json --strict
```

Exit code 0 for a valid file, 1 for errors (or for warnings under `--strict`), 2 for an unreadable file. Warnings are printed with the field path.

For schema validation in another toolchain, point it at [`string-theory.schema.json`](string-theory.schema.json) (JSON Schema 2020-12). The schema describes the canonical form; the aliases table above is a loader convenience that the schema does not model.

## Writing an exporter

The work is enumeration and measurement, not formatting.

```js
const strings = catalogue.map(({ id, text, where, maxPxPerLine, maxLines, maxChars, font }) => ({
  id,
  text,
  where,
  maxPxPerLine,
  maxLines,
  maxPxTotal: maxPxPerLine * maxLines,
  ...(maxChars ? { maxChars } : {}),
  ...(font ? { font } : {})
}))

const file = {
  format: 'string-theory/1',
  app: 'Session Transcripts',
  context: 'Foundry VTT module settings and transcript panel',
  font: { family: 'Segoe UI', size: 14, weight: 400, letterSpacing: 0 },
  defaultMaxPxPerLine: 200,
  strings
}

await writeFile('session-transcripts.strings.json', JSON.stringify(file, null, 2))
```

Where the values come from:

- **id**: whatever the app already uses to look strings up. If it has none, derive a stable one from the feature and the role (`settings.retention`) and never rename it afterwards.
- **text**: the shipped value, not the designer's copy in another document.
- **where**: written by whoever built the screen. A one-line comment per string is enough; inventing a location is worse than leaving it out.
- **maxPxPerLine**: from the layout. Fixed column widths give a number directly. Responsive layouts give the narrowest breakpoint's width, because that is where it wraps first.
- **maxLines**: from the layout too. A single-line control is 1. A hint under a settings row that may reflow is 2, occasionally 3. Look at the container's height and line-height, not at how the current text renders.
- **maxPxTotal**: `maxPxPerLine × maxLines`. Write it when a downstream consumer wants a single number.
- **maxChars**: only if the app itself rejects longer strings.
- **font**: the same family, size and weight the widget uses. Read it from the theme, do not retype it. Per string only when that string differs from the file font.

### Anti-patterns

- **Character budgets dressed as pixels.** `maxPxPerLine: text.length * 7` guarantees the tool approves what already exists.
- **`maxLines` from the current render.** If the text happens to fit on one line today, that is not evidence the layout only allows one.
- **A total without a line budget.** `maxPxTotal` alone cannot be checked for wrap; the line width is what decides.
- **A single global font when the app uses several.** Split into one file per surface, or use the dominant font and say so in `context`.
- **`where` copied from the key.** `transcripts.panel.title` is not a location.
- **Every string, including debug and log messages.** They do not have a layout budget, so they cannot be judged. Export what a user reads.
- **Regenerating ids on every export.** The merge breaks silently and the next person trusts a diff that means nothing.

## Maintenance

A change to this contract touches four homes, and they must agree:

1. `docs/format.md` and `docs/string-theory.schema.json`: canonical.
2. `shared/parse-export.mjs`: the loader that implements the repairs above, and the only implementation (the client and the server's inbox listing both use it).
3. `src/components/FormatSpec.tsx`: the in-app reference a user reads.
4. `AGENTS.md` for the repo and the Hermes skill `string-theory-handoff`, which other agents follow when Apo says he dislikes a set of strings.
