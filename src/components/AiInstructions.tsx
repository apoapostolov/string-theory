import { useId, useState } from 'react'
import { Check, Copy, X } from '@phosphor-icons/react'
import { useDialog } from '../lib/useDialog'
import { aiInstructions, instructionTarget } from '../lib/aiInstructions'
import { Button } from './Button'

type Props = {
  open: boolean
  onClose: () => void
  inboxDir: string
  defaultApp?: string
  onToast: (kind: 'ok' | 'error', message: string) => void
}

/**
 * The instructions an operator hands to another agent. The text is generated
 * from the live inbox path so the folder it names is the folder this app reads.
 */
export function AiInstructions({ open, onClose, inboxDir, defaultApp, onToast }: Props) {
  const titleId = useId()
  const dialogRef = useDialog<HTMLDivElement>(open, onClose)
  const [copied, setCopied] = useState(false)
  const [app, setApp] = useState(defaultApp ?? '')

  if (!open) return null

  const named = app.trim() || undefined
  const prompt = aiInstructions({ inboxDir, app: named })
  const target = instructionTarget({ inboxDir, app: named })

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      onToast('ok', 'Instructions copied')
      window.setTimeout(() => setCopied(false), 1600)
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
        className="st-dialog w-full max-w-[760px] overflow-hidden rounded-[14px] border border-line bg-ink-925 shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[13.5px] font-semibold text-fg">
              Instructions for an AI agent
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-fg-faint">
              Paste this into the agent that owns the other project. It writes one export into{' '}
              <span className="font-mono text-fg-dim">inbox</span>, where this app finds it.
            </p>
          </div>
          <Button size="sm" variant="quiet" onClick={onClose} className="ml-auto h-8 w-8 shrink-0">
            <X size={14} />
          </Button>
        </div>

        <div className="space-y-2 border-b border-line px-5 py-3">
          <label className="block">
            <span className="text-[10px] tracking-[0.07em] text-fg-faint uppercase">App the prompt is about</span>
            <input
              value={app}
              onChange={(event) => setApp(event.target.value)}
              placeholder="name of the project the agent should read"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-line bg-ink-850 px-2.5 py-1.5 text-[12px] text-fg outline-none placeholder:text-fg-faint/60 focus:border-line-strong"
            />
          </label>
          <div>
            <span className="text-[10px] tracking-[0.07em] text-fg-faint uppercase">Writes to</span>
            <div className="mt-0.5 font-mono text-[11px] break-all text-fg-dim">{target}</div>
          </div>
        </div>

        <pre className="max-h-[46vh] overflow-auto px-5 py-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-fg-dim">
          {prompt}
        </pre>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          <Button size="sm" variant="primary" onClick={() => void copy()} className="h-8">
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy instructions'}
          </Button>
          <span className="text-[10.5px] text-fg-faint">
            The agent needs the validator, so give it the repository or the command above.
          </span>
        </div>
      </div>
    </div>
  )
}
