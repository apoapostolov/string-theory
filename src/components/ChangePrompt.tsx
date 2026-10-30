import { useId, useState } from 'react'
import { Check, Copy, Sparkle, X } from '@phosphor-icons/react'
import { useDialog } from '../lib/useDialog'
import { buildChangePrompt } from '../lib/changePrompt'
import type { Row } from '../types'
import { Button } from './Button'

type Props = {
  open: boolean
  onClose: () => void
  rows: Row[]
  app: string
  onToast: (kind: 'ok' | 'error', message: string) => void
}

/**
 * The changes, written as instructions.
 *
 * The point is to skip the converter step: whoever owns the app gets one line
 * per changed string — the text as it is, the text it must become, and the
 * section the tags name — and applies them. Nothing here needs a metadata file.
 */
export function ChangePrompt({ open, onClose, rows, app, onToast }: Props) {
  const titleId = useId()
  const dialogRef = useDialog<HTMLDivElement>(open, onClose)
  const [group, setGroup] = useState(true)
  const [includeIds, setIncludeIds] = useState(true)
  const [copied, setCopied] = useState<'prompt' | 'lines' | null>(null)

  if (!open) return null

  const result = buildChangePrompt(rows, { app, group, includeIds })
  const { stats } = result

  async function copy(kind: 'prompt' | 'lines') {
    const text = kind === 'prompt' ? result.text : result.lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      onToast('ok', kind === 'prompt' ? `Prompt copied · ${stats.changed} changes` : `${stats.changed} lines copied`)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      onToast('error', 'Clipboard blocked by the browser')
    }
  }

  return (
    <div
      className="st-scrim fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="st-dialog w-full max-w-[780px] overflow-hidden rounded-[14px] border border-line bg-ink-925 shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[13.5px] font-semibold text-fg">
              Changes, written as instructions
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-fg-faint">
              One line per change for the agent that owns {app}. Nothing else has to be exported or converted.
            </p>
          </div>
          <Button size="sm" variant="quiet" onClick={onClose} className="ml-auto h-8 w-8 shrink-0">
            <X size={14} />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-2.5">
          <span className="st-num font-mono text-[11px] text-fg-dim">
            {stats.changed} change{stats.changed === 1 ? '' : 's'}
            {stats.removals ? ` · ${stats.removals} removal${stats.removals === 1 ? '' : 's'}` : ''} · {stats.sections} section
            {stats.sections === 1 ? '' : 's'}
          </span>
          {stats.pending ? (
            <span className="text-[11px] text-fg-faint">
              {stats.pending} emptied row{stats.pending === 1 ? ' is' : 's are'} still in progress, so {stats.pending === 1 ? 'it is' : 'they are'} left out
            </span>
          ) : null}
          {stats.ambiguous ? (
            <span className="text-[11px] text-near">
              {stats.ambiguous} source text{stats.ambiguous === 1 ? '' : 's'} repeated, so those lines keep their id
            </span>
          ) : null}
          {stats.untagged ? (
            <span className="text-[11px] text-fg-faint">
              {stats.untagged} changed string{stats.untagged === 1 ? '' : 's'} carry no tag, so those lines use the where line
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-fg-dim">
              <input
                type="checkbox"
                checked={group}
                onChange={(event) => setGroup(event.target.checked)}
                disabled={stats.sections < 2}
                className="h-3 w-3 accent-fg disabled:opacity-40"
              />
              <span className={stats.sections < 2 ? 'text-fg-faint/70' : undefined}>Group by section</span>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-fg-dim">
              <input
                type="checkbox"
                checked={includeIds}
                onChange={(event) => setIncludeIds(event.target.checked)}
                className="h-3 w-3 accent-fg"
              />
              Include ids
            </label>
          </div>
        </div>

        {stats.changed ? (
          <pre className="max-h-[52vh] overflow-auto px-5 py-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-dim">
            {result.text}
          </pre>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-[12.5px] text-fg-dim">Nothing rewritten yet.</p>
            <p className="mt-1 text-[11px] text-fg-faint">
              A string counts as changed when your text differs from the source. Make one edit and this list fills itself.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5 border-t border-line px-5 py-3">
          <Button size="sm" variant="primary" onClick={() => void copy('prompt')} disabled={!stats.changed} className="h-8">
            {copied === 'prompt' ? <Check size={12} /> : <Sparkle size={12} />}
            {copied === 'prompt' ? 'Copied' : 'Copy prompt'}
          </Button>
          <Button size="sm" onClick={() => void copy('lines')} disabled={!stats.changed} className="h-8">
            {copied === 'lines' ? <Check size={12} /> : <Copy size={12} />}
            {copied === 'lines' ? 'Copied' : 'Copy lines only'}
          </Button>
          <span className="ml-1 text-[10.5px] text-fg-faint">
            Lines only drops the rules, for an agent that already knows the job.
          </span>
        </div>
      </div>
    </div>
  )
}
