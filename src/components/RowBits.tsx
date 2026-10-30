// Shared row furniture: the state glyph and the pass control appear in both the
// app-string row and the document row, so they live here rather than in either.
import { useEffect, useRef, useState } from 'react'
import { CaretDown, CheckCircle, Circle, CircleHalf, Sparkle } from '@phosphor-icons/react'
import type { ModeId, RowState } from '../types'

const STATE_HINT: Record<RowState, string> = {
  normal: 'Untouched. Click to mark completed, right-click to clear.',
  wip: 'In progress. Click for completed, right-click for untouched.',
  done: 'Completed. Click to send back to in progress, right-click for untouched.'
}

/** One glyph carries the whole workflow: click to move forward, right-click to clear. */
export function StateGlyph({ state, onCycle, onReset }: { state: RowState; onCycle: () => void; onReset: () => void }) {
  const tone =
    state === 'done' ? 'text-ok' : state === 'wip' ? 'text-near' : 'text-fg-faint/70 hover:text-fg-faint'
  return (
    <button
      type="button"
      aria-label={`State: ${state === 'done' ? 'completed' : state === 'wip' ? 'in progress' : 'untouched'}`}
      title={STATE_HINT[state]}
      onClick={onCycle}
      onContextMenu={(event) => {
        event.preventDefault()
        onReset()
      }}
      data-state={state}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-ink-800 ${tone}`}
    >
      <span key={state} className="st-pop flex items-center justify-center">
        {state === 'done' ? (
          <CheckCircle size={16} weight="fill" />
        ) : state === 'wip' ? (
          <CircleHalf size={16} weight="bold" />
        ) : (
          <Circle size={15} />
        )}
      </span>
    </button>
  )
}

export const MODES: Array<{ id: ModeId; label: string; hint: string }> = [
  { id: 'grammar', label: 'Grammar', hint: 'Fix errors only, keep the wording' },
  { id: 'style', label: 'Style', hint: 'Rewrite clearer and tighter' },
  { id: 'fit', label: 'Fit', hint: 'Shorten until it fits the budget' }
]

/** The pass control sits beside the input: one shape, icon on the left, menu on the right. */
export function PassControl({
  busy,
  connected,
  onRun,
  onPick,
  modes = MODES
}: {
  busy: boolean
  connected: boolean
  onRun: () => void
  onPick: (mode: ModeId) => void
  modes?: Array<{ id: ModeId; label: string; hint: string }>
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={root} className="relative flex shrink-0 items-stretch self-stretch rounded-lg border border-line-strong bg-ink-800">
      <button
        type="button"
        onClick={onRun}
        disabled={busy || !connected}
        aria-label="Polish this string"
        title={connected ? 'Grammar and style pass (Ctrl+Enter)' : 'Connect an AI provider to polish this row'}
        className={`flex w-8 items-center justify-center rounded-l-lg transition-colors ${
          connected ? 'text-fg hover:bg-ink-750' : 'cursor-not-allowed text-fg-faint/50'
        } disabled:pointer-events-none`}
      >
        <Sparkle size={13} weight="fill" />
      </button>
      <span className="w-px bg-line-strong" />
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        aria-label="Choose pass"
        aria-haspopup="menu"
        aria-expanded={open}
        title={connected ? 'Choose the pass' : 'Passes need an AI provider'}
        className="flex w-6 items-center justify-center rounded-r-lg text-fg-faint transition-colors hover:bg-ink-750 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <CaretDown size={10} weight="bold" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Choose the pass"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setOpen(false)
            }
          }}
          className="st-dialog absolute top-full right-0 z-30 mt-1 w-56 overflow-hidden rounded-[10px] border border-line bg-ink-800 py-1 shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
        >
          {!connected ? (
            <p className="border-b border-line px-3 py-1.5 text-[10.5px] leading-snug text-fg-faint">
              Connect an AI provider to run a pass.
            </p>
          ) : null}
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitem"
              disabled={!connected}
              onClick={() => {
                setOpen(false)
                onPick(mode.id)
              }}
              className={`block w-full px-3 py-1.5 text-left transition-colors ${
                connected ? 'hover:bg-ink-750' : 'cursor-not-allowed opacity-40'
              }`}
            >
              <span className="block text-[12px] text-fg">{mode.label}</span>
              <span className="block text-[10.5px] text-fg-faint">{mode.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
