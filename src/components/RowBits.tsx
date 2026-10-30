// Shared row furniture: the state glyph and the pass control appear in both the
// app-string row and the document row, so they live here rather than in either.
import { useEffect, useRef, useState } from 'react'
import { CaretDown, Check, CheckCircle, Circle, CircleHalf, Sparkle } from '@phosphor-icons/react'
import type { Voice } from '../types'
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
  modes = MODES,
  voices = [],
  voice = '',
  useProfile = true,
  profileReady = false,
  profilePath = '',
  profileName = 'Your profile',
  showVoices = true,
  showProfile = true,
  onToggleProfile
}: {
  busy: boolean
  connected: boolean
  onRun: () => void
  onPick: (mode: ModeId, voice?: string) => void
  modes?: Array<{ id: ModeId; label: string; hint: string }>
  /** The voices that suit this surface: a prose voice on a button is noise. */
  voices?: Voice[]
  voice?: string
  useProfile?: boolean
  profileReady?: boolean
  profilePath?: string
  profileName?: string
  /** Settings decides what the menu offers beyond the three passes. */
  showVoices?: boolean
  showProfile?: boolean
  onToggleProfile?: () => void
}) {
  const [open, setOpen] = useState(false)
  // A menu this tall rarely fits on both sides of a row, so it also takes the
  // height the chosen side actually has and scrolls inside that.
  const [maxHeight, setMaxHeight] = useState(320)
  const [flip, setFlip] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const secondColumn = showVoices || (showProfile && Boolean(onToggleProfile))

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
        onClick={() => {
          const rect = root.current?.getBoundingClientRect()
          if (rect) {
            const below = window.innerHeight - rect.bottom - 10
            const above = rect.top - 10
            const goUp = below < 320 && above > below
            setFlip(goUp)
            setMaxHeight(Math.max(200, Math.min(340, goUp ? above : below)))
          }
          setOpen((value) => !value)
        }}
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
          style={{ maxHeight }}
          className={`st-dialog absolute right-0 z-30 overflow-y-auto rounded-[10px] border border-line bg-ink-800 py-1 shadow-[0_18px_40px_rgba(0,0,0,0.6)] ${
            secondColumn ? 'w-[27rem]' : 'w-60'
          } ${flip ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {!connected ? (
            <p className="border-b border-line px-3 py-1.5 text-[10.5px] leading-snug text-fg-faint">
              Connect an AI provider to run a pass.
            </p>
          ) : null}
          <div className={secondColumn ? 'grid grid-cols-2' : ''}>
            <div className={secondColumn ? 'border-r border-line' : ''}>
              <div className="px-3 pt-0.5 pb-1 text-[9.5px] tracking-[0.08em] text-fg-faint uppercase">Pass</div>
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
                  <span className="block text-[10.5px] leading-snug text-fg-faint">{mode.hint}</span>
                </button>
              ))}
            </div>

            {secondColumn ? (
              <div>
                {showVoices && voices.length ? (
                  <>
                    <div className="px-3 pt-0.5 pb-1 text-[9.5px] tracking-[0.08em] text-fg-faint uppercase">Voice</div>
                    {voices.map((entry) => {
                      const chosen = entry.id === voice
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          role="menuitem"
                          disabled={!connected}
                          onClick={() => {
                            setOpen(false)
                            onPick('humanize', entry.id)
                          }}
                          className={`flex w-full items-start gap-1.5 px-3 py-1.5 text-left transition-colors ${
                            connected ? 'hover:bg-ink-750' : 'cursor-not-allowed opacity-40'
                          }`}
                        >
                          <span className="mt-[3px] flex w-3 shrink-0 justify-center text-fg">
                            {chosen ? <Check size={9} weight="bold" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[12px] text-fg">{entry.label}</span>
                            <span className="block text-[10px] leading-snug text-fg-faint">{entry.blurb}</span>
                          </span>
                        </button>
                      )
                    })}
                  </>
                ) : null}

                {showProfile && onToggleProfile ? (
                  <>
                    <div
                      className={`px-3 pt-1.5 pb-1 text-[9.5px] tracking-[0.08em] text-fg-faint uppercase ${
                        showVoices && voices.length ? 'mt-1 border-t border-line' : 'pt-0.5'
                      }`}
                    >
                      Profile
                    </div>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={profileReady ? useProfile : false}
                      disabled={!profileReady}
                      onClick={() => onToggleProfile()}
                      title={
                        profileReady
                          ? `${profileName} rides along with every humanize pass`
                          : `No profile file at ${profilePath || 'the configured path'}`
                      }
                      className="flex w-full items-start gap-1.5 px-3 pt-0.5 pb-1.5 text-left transition-colors hover:bg-ink-750 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-[2px] flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border ${
                          profileReady && useProfile ? 'border-fg bg-fg text-ink-950' : 'border-line-strong'
                        }`}
                      >
                        {profileReady && useProfile ? <Check size={8} weight="bold" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] text-fg-dim">{profileName}</span>
                        <span className="block text-[10px] leading-snug text-fg-faint">
                          {profileReady ? 'Applies with whichever voice you pick' : 'Profile file not found'}
                        </span>
                      </span>
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
