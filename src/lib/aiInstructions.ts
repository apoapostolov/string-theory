export type InstructionContext = {
  inboxDir: string
  app?: string
  projectRoot?: string
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
  const root = (context.projectRoot || '').trim()
  const readHere = root
    ? `Read the project here: ${root}\n\nDo not read String Theory's own repository for them, even if that is where this conversation started.`
    : `Read them from ${app}'s own project, not from String Theory's repository, even if that is where this conversation started.`

  return `Produce a String Theory export for ${app}: every user-visible string that app ships, not a sample of them.

Write the file at this exact absolute path:

  ${target}

That path is the deliverable, verbatim. Not a folder beside it, not the folder that holds the demo, and never inside String Theory's own repository: its samples/ and src/ are the tool's source, while an export is data for the tool. If you happen to be running inside the String Theory checkout, read the strings from the target project and still write the export to the path above.

${readHere}

Two things to get right before you write anything.

1. Do not copy String Theory's demo catalogue. It sits at ${sample} and may also appear in this inbox as a file whose ids begin with transcripts. It describes a different, invented app and holds 16 rows. A file built from it is worthless here however well formed it is.
2. Take the strings from ${app}'s own source of truth, all of them: locale files (i18n JSON, ARB, .resx, strings.xml, .po/.pot, .strings) or, where there is no locale file, the literals in the UI definitions (text nodes in JSX/TSX, Content/Header/Text in XAML, labels in layout XML). Keep the ids that project already uses. If a string exists in the app and a person can read it, it belongs in the file.

Coverage is part of the job:
- Count the strings in the source of truth. The export carries that many rows: a catalogue of hundreds produces hundreds, not sixteen.
- Fewer than twenty user-visible strings is unusual for a real app. If that is actually the case, name the screens you inspected and say so in the report.
- Out-of-scope screens get listed in the report, not silently dropped.

Format id: string-theory/1. The block below shows the shape with three invented rows. It is an illustration: do not save it, and do not copy its values. Your file carries every string the app ships:

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
      "maxChars": 22,
      "tags": ["label", "settings"]
    }
  ]
}

Tags are not decoration: they are how the person rewriting these strings works on one kind at a time.

\`tags\` is a list. The first name says what the string does, chosen from this vocabulary:

structure: page-title, heading, subheading, section-title, overline, caption, dialog-title, dialog-body
controls: label, placeholder, button, action, link, tab, menu-item, dropdown, checkbox, radio, switch, slider, stepper, search, shortcut
help: hint, tooltip, help-paragraph, empty-state, onboarding
feedback: error, warning, success, info, status, toast, confirmation, progress, count
navigation: nav-item, breadcrumb, footer, sidebar
data: table-header, table-cell, column-label, filter, sort, summary, badge, banner
content: paragraph, list-item, quote, legal, marketing, accessibility
literals: number-unit, unit, date-time, variable, brand, proper-noun, code, url, email

Further names group strings that belong together, and you should invent those for this app: settings, onboarding, checkout, widget, editor, the screen's own name. Two or three tags per string is usually right, one role plus one or two groups. Lowercase and hyphens, and reuse the same tag across the file instead of close variants (settings, never Setting or settings-screen).

Use number-unit for a bare count with its unit, brand for a name that must never be translated, and add variable to anything containing {placeholders}.

Rules the file has to keep to:

1. id and text are required, and one row is one string. Do not merge a label and its hint into one row, and do not invent ids for strings that already have them.
2. maxPxPerLine is the wrap box for that string: the container's inner width in the app's own font, not a character count. Read it from the layout definition and subtract horizontal padding. Where a width is genuinely unavailable, reuse the nearest measured container and state that assumption in the report instead of guessing per string.
3. maxLines is how many lines the layout allows. 1 for labels, buttons and tab titles; 2 or 3 for hints and body copy. maxPxTotal is derived from the two and may be left out.
4. font is required at the top level because every pixel figure depends on it. Add a per-string font wherever the size or weight differs, such as a 16px 600 title.
5. A newline inside text is a hard break; each paragraph then wraps at spaces on its own.
6. The last line of a wrapped string must fill at least 40% of the box and carry two words or more, or it reads as an orphan. Fix an orphan with words, never by shrinking type or hyphenating.
7. Absolute pixels only, measured in the app's own font. Do not estimate from character counts and do not substitute a font the app does not render with.
8. Older field names still load (maxPx, PIL, maxWidth for maxPxPerLine; lines for maxLines; maxLength for maxChars) and a bare array loads too, but write the envelope above so the font travels with the file.

Then the second half of the job: the project's own prose.

The file above is the app speaking to its users. The project also speaks about itself, in documents a player, a user or a contributor reads: the README, the changelog, the latest release notes and the guides those link to. Those paragraphs are where sloppy language lives longest, because nobody measures them and everybody writes them in a hurry. Give them their own exports, one file per document, beside the app export in the same folder.

Write them here:

  <the same inbox folder as the app export>\\README.md -> readme.strings.json
  ...\\CHANGELOG.md -> changelog.strings.json
  ...\\<doc-slug>.strings.json for every further document

Cover, in this order:
1. README.md, order 0.
2. CHANGELOG.md, order 1.
3. The latest release notes, order 2: the newest release body from the repository's releases, or the newest section of the changelog when there are no releases.
4. Every further document a reader is meant to read, in the order the README links to them, numbered from 3 upward: guides, docs/*.md, FAQ, getting started, contributing where it explains the product. Skip links to a licence, a code of conduct, an issue tracker, a chat server, a download, and anything that leaves the repository.

A docs file has no layout, so it carries no font, no maxPxPerLine, no maxLines and no maxChars. Do not invent them and do not copy them from the app export: a README paragraph is not measured against a button, and pretending otherwise produces a file full of false failures. Its box in the tool is tall, because the string is often a whole paragraph.

One row per heading, paragraph, bullet, table cell, link text or code caption, never one row per sentence. A five-hundred-word README produces dozens of rows, not five.

{
  "format": "string-theory/1",
  "surface": "docs",
  "source": "README.md",
  "order": 0,
  "title": "README.md",
  "app": "${app}",
  "strings": [
    {
      "id": "readme.intro.1",
      "text": "<the paragraph exactly as it reads today>",
      "where": "README.md › <heading> › <subheading>",
      "tags": ["doc-lead", "intro"]
    }
  ]
}

- source is the document's path inside the repository, exactly as a reader would find it, so docs/guide.md not guide.md.
- order is 0 for the README, 1 for the changelog, 2 for the release notes, then the README's links in link order.
- id is stable and readable: document, heading, number. Never the first words of the paragraph, which change the moment the paragraph does.
- where is the heading path, so the passage can be found again by a person.
- tags start with a role from the documents group, then a group per section: docs: doc-lead, doc-paragraph, doc-heading, doc-list-item, doc-table-cell, doc-link-text, doc-note, doc-code-caption, changelog-entry, release-title, release-body, migration-note. Then group by section: install, usage, privacy, faq, and so on.

What belongs in text and what does not:
- Prose only. Skip code blocks, badges, shields, image alt text, HTML comments, front matter and link targets.
- Keep a paragraph whole and keep its markdown emphasis, links and \`code\` spans: **bold** stays bold, [text](url) stays a link, \`npm start\` stays code. A rewrite that strips them has changed the document.
- A heading's text is the heading without its #, ## or ### markers.
- A bullet's text is the bullet without its marker, and it stays a single row even when it wraps in the source.

Validate before handing over, and again after any fix:

  node scripts/validate-export.mjs "<the file you wrote>"

Exit code 0 means valid; anything else prints the repairs, and --strict makes warnings fail. A warning that the file matches the demo catalogue means the first step was skipped; a warning that strings carry no tag means the tag list above was skipped.

A project is several files, so validate every one you wrote, the app export and each docs file, with --strict so a warning is not ignored:

  node scripts/validate-export.mjs "<each file>" --strict

Then report, in this shape:
- the absolute path you wrote for the app export, checked against the one above, and its row count against how many strings the source of truth holds
- one line per document: path, row count, order, and the headings it covers
- the README links you followed, in order, and the ones you skipped with the reason
- which files or folders you read the strings from
- the tags you used across all the files, and how many strings carry each
- every string, screen or document you left out, and why

String Theory picks the file up from its inbox without a restart.`
}
