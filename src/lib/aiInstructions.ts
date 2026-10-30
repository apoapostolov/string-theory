export type InstructionContext = {
  inboxDir: string
  app?: string
  samplePath?: string
}

function slugFor(app?: string): string {
  const slug = (app || '<app>')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || '<app>'
}

/** The file the instructions ask for: one export per app, inside the inbox. */
export function instructionTarget({ inboxDir, app }: InstructionContext): string {
  return `${inboxDir}\\<project>\\${slugFor(app)}.strings.json`
}

/**
 * The prompt an operator pastes into whatever agent owns another project.
 *
 * Two things went wrong without saying them out loud: an agent that cannot find
 * the app's strings hands back String Theory's own demo catalogue, and an agent
 * shown a sample row produces a sample file. So the prompt names the sources to
 * read, forbids the demo by path, and demands a count it has to reconcile with
 * the project it read.
 */
export function aiInstructions(context: InstructionContext): string {
  const target = instructionTarget(context)
  const app = context.app || '<app>'
  const sample = context.samplePath || 'samples/demo.strings.json'

  return `Produce a String Theory export for ${app}: every user-visible string that app ships, not a sample of them.

Write one JSON file to:
${target}

Two things to get right before you write anything.

1. Do not copy String Theory's demo catalogue. It sits at ${sample} and may also appear in this inbox as a file whose ids begin with transcripts. It describes a different, invented app and holds 16 rows. A file built from it is worthless here however well formed it is.
2. Take the strings from ${app}'s own source of truth, all of them: locale files (i18n JSON, ARB, .resx, strings.xml, .po/.pot, .strings) or, where there is no locale file, the literals in the UI definitions (text nodes in JSX/TSX, Content/Header/Text in XAML, labels in layout XML). Keep the ids that project already uses. If a string exists in the app and a person can read it, it belongs in the file.

Coverage is part of the job:
- Count the strings in the source of truth. The export carries that many rows: a catalogue of hundreds produces hundreds, not sixteen.
- Fewer than twenty user-visible strings is unusual for a real app. If that is actually the case, name the screens you inspected and say so in the report.
- Out-of-scope screens get listed in the report, not silently dropped.

Format id: string-theory/1. Shape shown with three invented rows; your file carries every string:

{
  "format": "string-theory/1",
  "app": "${app}",
  "context": "<one line: the screen or feature this set covers>",
  "font": { "family": "<the font ${app} renders with>", "size": 14, "weight": 400, "letterSpacing": 0 },
  "defaultMaxPxPerLine": 200,
  "strings": [
    {
      "id": "<id from the project's own catalogue>",
      "text": "<string exactly as it ships today>",
      "where": "<the screen and the line of UI where it appears>",
      "maxPxPerLine": 150,
      "maxLines": 1,
      "maxChars": 22
    }
  ]
}

Rules the file has to keep to:

1. id and text are required, and one row is one string. Do not merge a label and its hint into one row, and do not invent ids for strings that already have them.
2. maxPxPerLine is the wrap box for that string: the container's inner width in the app's own font, not a character count. Read it from the layout definition and subtract horizontal padding. Where a width is genuinely unavailable, reuse the nearest measured container and state that assumption in the report instead of guessing per string.
3. maxLines is how many lines the layout allows. 1 for labels, buttons and tab titles; 2 or 3 for hints and body copy. maxPxTotal is derived from the two and may be left out.
4. font is required at the top level because every pixel figure depends on it. Add a per-string font wherever the size or weight differs, such as a 16px 600 title.
5. A newline inside text is a hard break; each paragraph then wraps at spaces on its own.
6. The last line of a wrapped string must fill at least 40% of the box and carry two words or more, or it reads as an orphan. Fix an orphan with words, never by shrinking type or hyphenating.
7. Absolute pixels only, measured in the app's own font. Do not estimate from character counts and do not substitute a font the app does not render with.
8. Older field names still load (maxPx, PIL, maxWidth for maxPxPerLine; lines for maxLines; maxLength for maxChars) and a bare array loads too, but write the envelope above so the font travels with the file.

Validate before handing over, and again after any fix:

  node scripts/validate-export.mjs "<the file you wrote>"

Exit code 0 means valid; anything else prints the repairs, and --strict makes warnings fail. A warning that the file matches the demo catalogue means the first step was skipped.

Then report, in this shape:
- the absolute path you wrote
- how many rows the file has, against how many strings the source of truth holds
- which files or folders you read them from
- every string or screen you left out, and why

String Theory picks the file up from its inbox without a restart.`
}
