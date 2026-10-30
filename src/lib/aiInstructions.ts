export type InstructionContext = {
  inboxDir: string
  app?: string
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
 * The prompt an operator pastes into whatever agent owns another project, so it
 * can produce a file String Theory accepts on the first try. Kept beside the
 * format rules it quotes, and short enough to read before pasting.
 */
export function aiInstructions(context: InstructionContext): string {
  const target = instructionTarget(context)

  return `Prepare a String Theory export for one app.

Write exactly one JSON file to:
${target}

String Theory measures every string in the app's own font, wraps it at spaces inside the line budget the layout gives it, and marks each row green, amber or red. It cannot do any of that unless the file carries the fields below, so read them before you write.

Format id: string-theory/1

{
  "format": "string-theory/1",
  "app": "<app name as its UI shows it>",
  "context": "<one line: the screen or feature this set covers>",
  "font": { "family": "<font the app renders with>", "size": 14, "weight": 400, "letterSpacing": 0 },
  "defaultMaxPxPerLine": 200,
  "strings": [
    {
      "id": "<stable id from the app's string table>",
      "text": "<the string exactly as it ships today>",
      "where": "<the line of UI where it appears>",
      "maxPxPerLine": 150,
      "maxLines": 1,
      "maxChars": 22
    }
  ]
}

Rules the file has to keep to:

1. id and text are required. A string without maxPxPerLine has no line budget and cannot be judged, so give every string one.
2. maxPxPerLine is the width of one line: the container's inner width in the app's own font, not a character count. Subtract the horizontal padding.
3. maxLines is how many lines the layout allows. 1 for labels and buttons, 2 or 3 for hints and body copy. maxPxTotal is derived from the two and may be left out.
4. font is required at the top level, because every pixel figure depends on it. Add a per-string font anywhere the size differs, such as a 16px section title with weight 600.
5. A newline inside text is a hard break. Each paragraph then wraps at spaces on its own.
6. The last line of a wrapped string must fill at least 40% of the box and carry two words or more, or it reads as an orphan. Do not fix an orphan by shrinking type or hyphenating: change the words.
7. Absolute pixels only. Do not estimate from character counts, and do not invent a font the app does not render with.
8. Older field names still load (maxPx, PIL, maxWidth for maxPxPerLine; lines for maxLines; maxLength for maxChars), but write the current names. A bare array also loads; the envelope above is preferred because it carries the font.

Before you hand it over, validate it:

  node scripts/validate-export.mjs "<the file you wrote>"

Exit code 0 means valid. Anything else prints the repairs and warnings it found; fix what it reports and run it again.

Then tell me the absolute path you wrote. String Theory picks the file up from its inbox without a restart.`
}
