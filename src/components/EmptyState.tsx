import { FileArrowUp, FloppyDisk } from '@phosphor-icons/react'
import { Button } from './Button'

const SAMPLE = `{
  "format": "string-theory/1",
  "app": "Session Transcripts",
  "font": { "family": "Segoe UI", "size": 14, "weight": 400 },
  "defaultMaxPx": 220,
  "strings": [
    {
      "id": "panel.title",
      "text": "Session Transcripts",
      "where": "Panel header, left of the refresh button",
      "maxPx": 180
    }
  ]
}`

type Props = {
  onOpen: () => void
  onSample: () => void
  onFormat: () => void
}

export function EmptyState({ onOpen, onSample, onFormat }: Props) {
  return (
    <div className="mx-auto flex h-full max-w-[880px] flex-col justify-center px-8 py-12">
      <p className="font-mono text-[10.5px] tracking-[0.08em] text-fg-faint uppercase">Internal tool</p>
      <h1 className="mt-2 text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] text-fg">
        Drop an app export to start rewriting.
      </h1>
      <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-fg-dim">
        Each string arrives with its id, the line where it is shown, and the pixel width it must not exceed. Rewrite it on the right,
        watch the counters, export the replacements.
      </p>

      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-[14px] border border-line bg-ink-900">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-fg-dim uppercase">Export shape</span>
            <button
              type="button"
              onClick={onFormat}
              className="font-mono text-[10.5px] text-fg-faint underline decoration-line-strong underline-offset-2 hover:text-fg"
            >
              full spec
            </button>
          </div>
          <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[11px] leading-[1.65] text-fg-dim">
            {SAMPLE}
          </pre>
        </div>

        <div className="flex flex-col gap-2 rounded-[14px] border border-line bg-ink-900 p-3.5">
          <Button variant="primary" onClick={onOpen} className="justify-start">
            <FileArrowUp size={14} />
            Open an export
          </Button>
          <Button onClick={onSample} className="justify-start">
            <FloppyDisk size={14} />
            Load the sample file
          </Button>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-faint">
            A bare array of objects works too. Field aliases and snake_case are tolerated, so most exporters can dump straight into it.
          </p>
          <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-fg-faint">
            Several projects at once? The <span className="text-fg-dim">Sources</span> picker in the header lists every export in the
            inbox folder, with your rewrite progress per file.
          </p>
        </div>
      </div>
    </div>
  )
}
