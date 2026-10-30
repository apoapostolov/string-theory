import { useId, useState } from 'react'
import { useDialog } from '../lib/useDialog'
import { Check, Copy, X } from '@phosphor-icons/react'

type Props = {
  open: boolean
  onClose: () => void
}

const EXAMPLE = `{
  "format": "string-theory/1",
  "app": "Session Transcripts",
  "context": "Foundry VTT module settings and transcript panel",
  "font": { "family": "Segoe UI", "size": 14, "weight": 400, "letterSpacing": 0 },
  "defaultMaxPxPerLine": 200,
  "strings": [
    {
      "id": "transcripts.panel.title",
      "text": "Session Transcripts",
      "where": "Panel header, left of the refresh button",
      "maxPxPerLine": 150,
      "maxLines": 1,
      "maxPxTotal": 150,
      "maxChars": 22
    }
  ]
}`

const ENVELOPE: Array<[string, string, string, string]> = [
  ['format', 'string', 'optional', 'string-theory/1. An unknown value loads with a warning and the v1 rules.'],
  ['app', 'string', 'recommended', 'Application name. Shown in the header, used for the export filename.'],
  ['context', 'string', 'optional', 'One line about the screen or feature. Sent with every AI prompt.'],
  ['font', 'object', 'required', 'The font the pixel figures mean. Required for correct numbers: without it the tool falls back to 14px system text and says so.'],
  ['defaultMaxPxPerLine', 'number', 'optional', 'Line budget for strings that do not carry their own.'],
  ['strings', 'array', 'required', 'The strings. A bare array also loads.']
]

const FIELDS: Array<[string, string, string, string]> = [
  ['id', 'string', 'required', 'Stable id from the app catalogue. Unique per file.'],
  ['text', 'string', 'required', 'The string as it ships today. A newline is a hard break.'],
  ['where', 'string', 'recommended', 'The line of UI where it appears. Hover shows it; prompts carry it.'],
  ['maxPxPerLine', 'number', 'required', 'Width of one line: the box the text wraps inside, in the file font.'],
  ['maxLines', 'number', 'recommended', 'How many lines the layout allows. 1 for labels, 2 or 3 for hints.'],
  ['maxPxTotal', 'number', 'optional', 'maxPxPerLine x maxLines. Recomputed when it disagrees.'],
  ['font', 'object', 'optional', 'Override for a string that is not in the file font, for example a 16px title.'],
  ['maxChars', 'number', 'optional', 'Character ceiling, only when the app enforces one itself.'],
  ['tags', 'string[]', 'recommended', 'What the string does: heading, button, hint, plus grouping tags such as settings. The tag rail is built from these.'],
  ['note', 'string', 'optional', 'A free sentence of context. It carries no rewrite.'],
  ['state', 'string', 'output', 'normal, wip or done. Written by the tool; importers may ignore it.']
]

const ALIASES =
  'key, name, textId · value, string, source · info, place, location · maxPx, maxPIL, pil_max · lines, wrapLines · totalMaxPx · maxLength, charLimit'

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="text-[12px] font-semibold text-fg">{title}</h3>
      {hint ? <p className="mt-0.5 mb-2.5 text-[11.5px] leading-relaxed text-fg-faint">{hint}</p> : <div className="mb-2.5" />}
      {children}
    </section>
  )
}

function Table({ rows }: { rows: Array<[string, string, string, string]> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {rows.map(([field, type, status, note], index) => (
        <div
          key={field}
          className={`grid grid-cols-[104px_52px_74px_1fr] items-baseline gap-2 px-3 py-1.5 ${index ? 'border-t border-line' : ''}`}
        >
          <span className="font-mono text-[11px] text-fg">{field}</span>
          <span className="font-mono text-[10px] text-fg-faint">{type}</span>
          <span
            className={`font-mono text-[10px] uppercase ${
              status === 'required' ? 'text-fg-dim' : status === 'recommended' ? 'text-fg-faint' : 'text-fg-faint/70'
            }`}
          >
            {status}
          </span>
          <span className="text-[11.5px] leading-snug text-fg-dim">{note}</span>
        </div>
      ))}
    </div>
  )
}

export function FormatSpec({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const titleId = useId()
  const dialogRef = useDialog<HTMLDivElement>(open, onClose)
  if (!open) return null

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(`${EXAMPLE}\n`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="st-scrim fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="st-dialog w-full max-w-[780px] rounded-[14px] border border-line bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 id={titleId} className="text-[13.5px] font-semibold text-fg">Export format</h2>
            <p className="font-mono text-[10.5px] text-fg-faint">string-theory/1 · one JSON file per application</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={copyExample}
              className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-ink-850 px-2 text-[11.5px] text-fg-dim hover:border-line-strong hover:text-fg"
            >
              {copied ? <Check size={11} weight="bold" className="text-ok" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy example'}
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-fg-faint hover:bg-ink-800 hover:text-fg"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="text-[12.5px] leading-relaxed text-fg-dim">
          <Section
            title="The shape of the exchange"
            hint="The app writes this file from its own string catalogue. String Theory reads it, a human rewrites each string, and the rewritten file comes back with the same ids plus a previous copy of the old text."
          >
            <pre className="overflow-x-auto rounded-lg border border-line bg-ink-950 px-3.5 py-3 font-mono text-[11px] leading-[1.7] text-fg-dim">
              {EXAMPLE}
            </pre>
          </Section>

          <Section title="Envelope" hint="Everything above strings. Only font and strings are load-bearing.">
            <Table rows={ENVELOPE} />
            <p className="mt-2 text-[11.5px] leading-relaxed text-fg-faint">
              <span className="font-mono text-fg-dim">font</span> takes{' '}
              <span className="font-mono">family</span>, <span className="font-mono">size</span>,{' '}
              <span className="font-mono">weight</span> and <span className="font-mono">letterSpacing</span>. Pixel figures come from
              measuring in that font, so it has to be the font the app renders with, at the weight it uses. A wrong family makes
              every budget a guess, and the settings panel says when the family is not installed on this machine.
            </p>
          </Section>

          <Section title="String fields">
            <Table rows={FIELDS} />
            <p className="mt-2 text-[11.5px] leading-relaxed text-fg-faint">
              Aliases, all optional: <span className="font-mono">{ALIASES}</span>, plus snake_case of any of them. Numbers accept a
              trailing <span className="font-mono">px</span> or <span className="font-mono">ch</span>.
            </p>
          </Section>

          <Section title="Rules the tool holds you to">
            <ul className="space-y-1.5">
              <li>
                <span className="text-fg">Ids are unique per file.</span> A duplicate is suffixed <span className="font-mono">#2</span>{' '}
                so both stay editable, and the import says so, because only the first can merge back.
              </li>
              <li>
                <span className="text-fg">Order is preserved.</span> Rows keep the catalogue order in, and the export keeps it out.
              </li>
              <li>
                <span className="text-fg">maxPxPerLine is a width, not a character count.</span> Use the container width minus its
                padding, and set <span className="font-mono">maxLines</span> from the layout, not from how the current text
                happens to render.
              </li>
              <li>
                <span className="text-fg">Newlines are hard breaks.</span> Each paragraph then wraps on its own inside the line
                budget, so a deliberate break stays where the app will show it.
              </li>
              <li>
                <span className="text-fg">Placeholders are copied byte for byte.</span> <span className="font-mono">{'{0}'}</span>,{' '}
                <span className="font-mono">%s</span>, <span className="font-mono">:count</span>,{' '}
                <span className="font-mono">{'{name}'}</span>, shortcuts and file extensions are structure, not prose.
              </li>
              <li>
                <span className="text-fg">UTF-8, no BOM.</span> Newlines in JSON are escaped the normal way.
              </li>
            </ul>
          </Section>

          <Section
            title="Lines, not a total"
            hint="The budget is the box a line wraps inside, and how many lines the layout gives it. The total is just the product."
          >
            <ul className="space-y-1.5">
              <li>
                <span className="text-fg">A wrap is measured, not guessed.</span> The text is wrapped at spaces inside{' '}
                <span className="font-mono">maxPxPerLine</span> in the file font, and the tool reports the line count, the
                widest line and the width of the last line.
              </li>
              <li>
                <span className="text-fg">Over is a spill.</span> A line wider than the box, or more lines than{' '}
                <span className="font-mono">maxLines</span>, turns the row red however short the widest line is.
              </li>
              <li>
                <span className="text-fg">The last line must fill 40% of the box.</span> One stranded word is an orphan, and
                so is a last line that fills less than 40%: the row goes amber and prints{' '}
                <span className="font-mono">orphan 23%</span>. Rebalance the words; never shrink the type or hyphenate to
                hide it.
              </li>
              <li>
                <span className="text-fg">Single lines are exempt.</span> With one line there is no last line to judge.
              </li>
            </ul>
          </Section>

          <Section title="How the numbers read">
            <ul className="space-y-1.5">
              <li>
                <span className="text-ok">Green</span>: fits, and either one line or a last line over 40%.
              </li>
              <li>
                <span className="text-near">Amber</span>: fits, but the last line is an orphan, or a line is at the amber
                threshold of the box.
              </li>
              <li>
                <span className="text-over">Red</span>: a line is wider than <span className="font-mono">maxPxPerLine</span>{' '}
                or the text needs more lines than <span className="font-mono">maxLines</span>. The meter prints the overflow in
                pixels and the row prints how many lines it needs.
              </li>
              <li>
                The chars meter uses <span className="font-mono">maxChars</span> when the export has one, otherwise it mirrors
                the wrap verdict.
              </li>
            </ul>
          </Section>

          <Section
            title="What comes back"
            hint="Same envelope, new text, plus previous and changed. Merge by id."
          >
            <pre className="overflow-x-auto rounded-lg border border-line bg-ink-950 px-3.5 py-3 font-mono text-[11px] leading-[1.7] text-fg-dim">
{`strings: [
  {
    "id": "transcripts.panel.title",
    "text": "Transcripts for this session",   // the rewrite
    "previous": "Session Transcripts",         // what it replaced
    "where": "...", "maxPxPerLine": 150, "maxLines": 1,
    "maxPxTotal": 150, "maxChars": 22,
    "changed": true, "state": "done"
  }
]`}
            </pre>
            <p className="mt-2 text-[11.5px] leading-relaxed text-fg-faint">
              Importers map by <span className="font-mono">id</span>, take <span className="font-mono">text</span>, and may skip
              entries where <span className="font-mono">changed</span> is false. <span className="font-mono">previous</span> is there
              for a diff or an undo.
            </p>
          </Section>

          <Section title="Validation" hint="The machine-readable contract is docs/string-theory.schema.json. Before handing a file over:">
            <pre className="overflow-x-auto rounded-lg border border-line bg-ink-950 px-3.5 py-2.5 font-mono text-[11px] text-fg-dim">
              node scripts/validate-export.mjs path/to/app.strings.json
            </pre>
            <p className="mt-2 text-[11.5px] leading-relaxed text-fg-faint">
              Errors block an export: no strings array, an id that is not a string, a budget that is not a number. Warnings still
              load: missing font, missing maxPxPerLine, generated ids, duplicate ids.
            </p>
          </Section>

          <Section title="Versioning" hint="v1 is additive. This build ignores fields it does not know.">
            <p className="text-[11.5px] leading-relaxed text-fg-faint">
              Adding a field is a v1 change. Changing what an existing field means, or removing one, needs{' '}
              <span className="font-mono">string-theory/2</span> and a note in the changelog of{' '}
              <span className="font-mono">docs/format.md</span>. Never reuse a field name with a new meaning.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}
