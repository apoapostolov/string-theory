import { X } from '@phosphor-icons/react'

type Props = {
  open: boolean
  onClose: () => void
}

const FIELDS = [
  ['id', 'required', 'Stable string id the app uses in its own catalogue.'],
  ['text', 'required', 'The internal string as it ships today.'],
  ['where', 'recommended', 'The line of UI where it appears. Shown on hover and sent to the model.'],
  ['maxPx', 'recommended', 'Pixel width the string must not exceed, measured in the file font.'],
  ['maxChars', 'optional', 'Character ceiling, when the app enforces one itself.']
]

export function FormatSpec({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10">
      <div className="w-full max-w-[720px] rounded-[14px] border border-line bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-[13.5px] font-semibold text-fg">Export format</h2>
            <p className="font-mono text-[10.5px] text-fg-faint">string-theory/1</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-faint hover:bg-ink-800 hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4 text-[12.5px] leading-relaxed text-fg-dim">
          <p>
            One JSON file per application. The app writes it from its own string catalogue, String Theory reads it, and the rewritten
            file comes back in the same shape with a new <span className="font-mono text-fg">text</span> plus a{' '}
            <span className="font-mono text-fg">previous</span> copy of the old value.
          </p>

          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold text-fg">Envelope</h3>
            <pre className="overflow-x-auto rounded-lg border border-line bg-ink-950 px-3.5 py-3 font-mono text-[11px] leading-[1.7] text-fg-dim">
{`{
  "format": "string-theory/1",
  "app": "Session Transcripts",
  "context": "Foundry module settings",
  "font": { "family": "Segoe UI", "size": 14, "weight": 400, "letterSpacing": 0 },
  "defaultMaxPx": 200,
  "strings": [ ... ]
}`}
            </pre>
            <p className="mt-1.5 text-[11.5px] text-fg-faint">
              A bare array of string objects also loads. <span className="font-mono">font</span> is what the pixel figures are measured
              in, so it must match what the app renders with.
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold text-fg">String fields</h3>
            <div className="overflow-hidden rounded-lg border border-line">
              {FIELDS.map(([field, status, note], index) => (
                <div
                  key={field}
                  className={`grid grid-cols-[110px_88px_1fr] items-baseline gap-3 px-3 py-2 ${
                    index ? 'border-t border-line' : ''
                  }`}
                >
                  <span className="font-mono text-[11px] text-fg">{field}</span>
                  <span className={`font-mono text-[10px] uppercase ${status === 'required' ? 'text-fg-dim' : 'text-fg-faint'}`}>
                    {status}
                  </span>
                  <span className="text-[11.5px] text-fg-dim">{note}</span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-fg-faint">
              Aliases accepted: <span className="font-mono">key/name</span> for id, <span className="font-mono">value/string/source</span>{' '}
              for text, <span className="font-mono">info/place/location</span> for where, <span className="font-mono">maxPIL/pil_max/maxWidth</span>{' '}
              for maxPx, and snake_case variants of all of them.
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold text-fg">How the numbers read</h3>
            <ul className="space-y-1.5">
              <li>
                <span className="text-ok">Green</span> means the rewrite sits below the amber threshold, 90% of the pixel budget by
                default.
              </li>
              <li>
                <span className="text-near">Amber</span> means it is close enough that a translation, a longer word or a larger UI scale
                will push it over.
              </li>
              <li>
                <span className="text-over">Red</span> means the measured width is past the budget and the line will wrap where the app
                expected one line.
              </li>
              <li>
                The chars meter uses <span className="font-mono">maxChars</span> when the export has one, otherwise it mirrors the pixel
                verdict.
              </li>
            </ul>
          </div>

          <p className="border-t border-line pt-3 text-[11.5px] text-fg-faint">
            Merge rule for the app side: read <span className="font-mono">strings[].text</span> by{' '}
            <span className="font-mono">id</span>. Entries carry <span className="font-mono">changed</span> so an importer can skip
            untouched rows.
          </p>
        </div>
      </div>
    </div>
  )
}
