import { memo, useEffect, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  CaretDown,
  CheckCircle,
  Circle,
  CircleHalf,
  Sparkle,
  WarningCircle
} from '@phosphor-icons/react'
import type { Fit, FontMetrics, ModeId, Row, RowState } from '../types'
import { charFit, px, wrapText, worstFit, type WrapFit, type WrapResult } from '../lib/metrics'
import { Meter } from './Meter'
import { RowTags } from './RowTags'
import { HoverInfo } from './HoverInfo'

const BORDER: Record<Fit, string> = {
  ok: 'border-l-[3px] border-l-transparent',
  near: 'border-l-[3px] border-l-near',
  over: 'border-l-[3px] border-l-over',
  none: 'border-l-[3px] border-l-transparent'
}

const MODES: Array<{ id: ModeId; label: string; hint: string }> = [
  { id: 'grammar', label: 'Grammar', hint: 'Fix errors only, keep the wording' },
  { id: 'style', label: 'Style', hint: 'Rewrite clearer and tighter' },
  { id: 'fit', label: 'Fit', hint: 'Shorten until it fits the budget' }
]

type Props = {
  row: Row
  font: FontMetrics
  wrap: WrapResult
  wrapFit: WrapFit
  warnRatio: number
  canPolish: boolean
  onEdit: (key: string, text: string) => void
  onPolish: (key: string, mode?: ModeId) => void
  onRevert: (key: string) => void
  onCycleState: (key: string) => void
  onResetState: (key: string) => void
  customTags: string[]
  activeTags: string[]
  onToggleTag: (key: string, tag: string) => void
  onFilterTag: (tag: string) => void
}

const STATE_HINT: Record<RowState, string> = {
  normal: 'Untouched. Click to mark completed, right-click to clear.',
  wip: 'In progress. Click for completed, right-click for untouched.',
  done: 'Completed. Click to send back to in progress, right-click for untouched.'
}

/** One glyph carries the whole workflow: click to move forward, right-click to clear. */
function StateGlyph({ state, onCycle, onReset }: { state: RowState; onCycle: () => void; onReset: () => void }) {
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

/** The pass control sits beside the input: one shape, icon on the left, menu on the right. */
function PassControl({
  busy,
  connected,
  onRun,
  onPick
}: {
  busy: boolean
  connected: boolean
  onRun: () => void
  onPick: (mode: ModeId) => void
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
    <div
      ref={root}
      className="relative flex shrink-0 items-stretch self-stretch rounded-lg border border-line-strong bg-ink-800"
    >
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
          {MODES.map((mode) => (
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

function RowShell({
  row,
  font,
  wrap,
  wrapFit,
  warnRatio,
  canPolish,
  onEdit,
  onPolish,
  onRevert,
  onCycleState,
  onResetState,
  customTags,
  activeTags,
  onToggleTag,
  onFilterTag
}: Props) {
  const beforeWrap = wrapText(row.source, row.maxPxPerLine, font)
  const beforePx = beforeWrap.widest
  const afterPx = wrap.widest
  const chFit = charFit(row.text.length, row.maxChars, wrapFit.fit, warnRatio)
  const fit = worstFit(wrapFit.fit, chFit)
  const changed = row.text !== row.source
  const overBy = wrapFit.overBy
  const linesOver = wrapFit.lines - wrapFit.maxLines

  const info = (
    <span className="block">
      <span className="mb-1 block text-[10px] tracking-[0.08em] text-fg-faint uppercase">Shown at</span>
      <span className="block text-fg">{row.where || 'No location given in the export'}</span>
      <span className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-fg-faint">
        <span>id {row.id}</span>
        <span>font {font.family} {font.size}px</span>
        <span>{row.maxPxPerLine ? `${px(row.maxPxPerLine)} px/line` : 'no line budget'}</span>
        <span>{wrapFit.maxLines} line{wrapFit.maxLines === 1 ? '' : 's'} allowed</span>
        <span>{row.maxPxTotal ? `${px(row.maxPxTotal)} px total` : 'no total'}</span>
        <span>{row.maxChars ? `limit ${row.maxChars} ch` : 'no char limit'}</span>
      </span>
      {row.note ? <span className="mt-2 block text-fg-dim">note · {row.note}</span> : null}
      {overBy > 0 ? (
        <span className="mt-2 block text-over">Widest line is {Math.round(overBy)} px past the budget; it cannot fit.</span>
      ) : null}
      {linesOver > 0 ? (
        <span className="mt-1 block text-over">Needs {wrapFit.lines} lines, the layout gives {wrapFit.maxLines}.</span>
      ) : null}
      {wrapFit.leak ? (
        <span className="mt-1 block text-near">
          Last line fills {Math.round(wrapFit.lastRatio * 100)}% of the box. Under 40% is an orphan, so rebalance the words.
        </span>
      ) : null}
    </span>
  )

  return (
    <div
      id={`row-${row.key}`}
      role="listitem"
      aria-labelledby={`row-label-${row.key}`}
      aria-describedby={`row-verdict-${row.key}`}
      className={`st-row ${BORDER[fit]}`}
    >
      <div className="grid grid-cols-1 gap-x-7 gap-y-2 pr-4 pb-3 pl-3 pt-2 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        {/* Left: the glyph, the identity line and the source. Nothing above it. */}
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-[1px] shrink-0">
            <StateGlyph state={row.state} onCycle={() => onCycleState(row.key)} onReset={() => onResetState(row.key)} />
          </span>

          <div className="min-w-0 flex-1">
            <HoverInfo content={info} className="block">
              <span className="st-num flex items-baseline gap-1.5 truncate font-mono text-[11px]">
                <span id={`row-label-${row.key}`} className="truncate text-fg-faint hover:text-fg-dim">
                  {row.id}
                </span>
                <span className="shrink-0 text-fg-faint/50">·</span>
                <span className="shrink-0 text-[10.5px] text-fg-faint">
                  {row.maxPxPerLine ? `${px(row.maxPxPerLine)} px/line` : 'no px limit'}
                </span>
                <span className="shrink-0 text-fg-faint/50">·</span>
                <span className="shrink-0 text-[10.5px] text-fg-faint">{px(beforePx)} px wide</span>
                {row.maxLines > 1 ? (
                  <>
                    <span className="shrink-0 text-fg-faint/50">·</span>
                    <span className="shrink-0 text-[10.5px] text-fg-faint">{row.maxLines} lines</span>
                  </>
                ) : null}
                {row.maxChars ? (
                  <>
                    <span className="shrink-0 text-fg-faint/50">·</span>
                    <span className="shrink-0 text-[10.5px] text-fg-faint">{row.maxChars} ch</span>
                  </>
                ) : null}
                {row.ai ? (
                  <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-ink-800 px-1.5 py-[1px] text-[9.5px] tracking-[0.06em] text-fg-dim uppercase">
                    <Sparkle size={9} weight="fill" />
                    AI
                  </span>
                ) : null}
              </span>
            </HoverInfo>

            <HoverInfo content={info} className="mt-1 block" width={400}>
              <span className="block text-[13.5px] leading-snug text-fg/95">{row.source}</span>
              <span className="mt-1 block truncate font-mono text-[10.5px] text-fg-faint">
                {row.where || 'location not exported'}
              </span>
            </HoverInfo>

            <RowTags
              tags={row.tags ?? []}
              custom={customTags}
              active={activeTags}
              onFilter={onFilterTag}
              onToggle={(tag) => onToggleTag(row.key, tag)}
            />
          </div>
        </div>

        {/* Right: the input sits at the top of the row, meters hang under it. */}
        <div className="min-w-0">
          <div className="flex items-stretch gap-1.5">
            <textarea
              value={row.text}
              rows={1}
              spellCheck
              aria-label={`Rewrite ${row.id}`}
              aria-invalid={fit === 'over' || undefined}
              aria-describedby={`row-verdict-${row.key}`}
              onChange={(event) => onEdit(row.key, event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  onPolish(row.key)
                }
                if (event.key === 'Escape' && changed) {
                  event.preventDefault()
                  onRevert(row.key)
                }
              }}
              placeholder="Rewrite this string in your own words"
              className={`st-input block min-w-0 flex-1 rounded-lg border bg-ink-850/80 px-3 py-2 text-[13.5px] leading-snug text-fg outline-none transition-colors placeholder:text-fg-faint/70 focus:border-fg-dim focus:bg-ink-850 ${
                fit === 'over' ? 'border-over/70' : 'border-line-input'
              }`}
            />
            <PassControl
              busy={row.busy}
              connected={canPolish}
              onRun={() => onPolish(row.key)}
              onPick={(mode) => onPolish(row.key, mode)}
            />
            <button
              type="button"
              aria-label="Revert to source"
              title="Revert to source"
              onClick={() => onRevert(row.key)}
              disabled={!changed}
              className="inline-flex w-8 shrink-0 items-center justify-center self-stretch rounded-lg border border-transparent text-fg-faint transition-colors hover:border-line hover:bg-ink-800 hover:text-fg disabled:pointer-events-none disabled:opacity-20"
            >
              <ArrowCounterClockwise size={13} />
            </button>
          </div>

          {row.busy || row.error ? (
            <div className="mt-1.5 flex min-w-0 items-center gap-3 text-[10.5px]">
              {row.busy ? (
                <span className="flex shrink-0 items-center gap-1 text-fg-faint">
                  <span className="h-2.5 w-2.5 rounded-full border border-fg-faint/40 border-t-fg-dim st-shimmer" />
                  polishing
                </span>
              ) : null}
              {row.error ? (
                <span className="flex min-w-0 items-center gap-1 truncate text-over">
                  <WarningCircle size={11} weight="bold" className="shrink-0" />
                  <span className="truncate">{row.error}</span>
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-start gap-x-6 gap-y-2">
            <Meter
              label="chars"
              before={row.source.length}
              after={row.text.length}
              limit={row.maxChars}
              unit="ch"
              warnRatio={warnRatio}
              fit={chFit}
              title={`${row.text.length} of ${row.maxChars ?? 'no'} characters`}
            />
            <Meter
              label="line"
              before={beforePx}
              after={afterPx}
              limit={row.maxPxPerLine}
              unit="px"
              warnRatio={warnRatio}
              fit={wrapFit.fit}
              title={`widest line ${px(afterPx)} px against a ${row.maxPxPerLine ?? 'unset'} px box in ${font.family} ${font.size}px`}
            />
            <span
              className="flex items-center gap-1.5 font-mono text-[10.5px]"
              title={
                row.maxPxTotal
                  ? `Budget ${px(row.maxPxTotal)} px total: ${row.maxLines} line${row.maxLines === 1 ? '' : 's'} of ${row.maxPxPerLine} px`
                  : 'No line budget'
              }
            >
              <span className="text-[9.5px] tracking-[0.08em] text-fg-faint uppercase">lines</span>
              <span
                className={`tabular-nums ${
                  linesOver > 0 ? 'text-over' : wrapFit.lines > 1 ? 'text-fg' : 'text-fg-dim'
                }`}
              >
                {wrapFit.lines}
              </span>
              <span className="text-fg-faint tabular-nums">/ {wrapFit.maxLines}</span>
              {wrapFit.leak ? (
                <span className="tabular-nums text-near">orphan {Math.round(wrapFit.lastRatio * 100)}%</span>
              ) : null}
            </span>
          </div>
          <p id={`row-verdict-${row.key}`} className="sr-only">
            {row.where ? `Shown at ${row.where}. ` : ''}
            {`${wrapFit.maxLines === 1 ? 'One line' : `${wrapFit.maxLines} lines`} allowed, needs ${wrapFit.lines}. `}
            {`Widest line ${Math.round(afterPx)} of ${row.maxPxPerLine ?? 'no'} pixels.`}
            {wrapFit.leak
              ? ` Last line is an orphan, filling ${Math.round(wrapFit.lastRatio * 100)} percent of the box.`
              : ''}
          </p>
        </div>
      </div>

      {row.busy ? (
        <div className="h-[2px] w-full bg-ink-800">
          <div className="h-full w-1/3 bg-fg-dim/40 st-shimmer" />
        </div>
      ) : null}
    </div>
  )
}

export const StringRow = memo(RowShell)

export function RowTail({ overCount, warnCount }: { overCount: number; warnCount: number }) {
  if (!overCount && !warnCount) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-fg-faint">
        <CheckCircle size={14} className="text-ok" />
        Every string fits its budget.
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center gap-4 py-8 font-mono text-[11px]">
      {overCount ? <span className="text-over">{overCount} will wrap</span> : null}
      {warnCount ? <span className="text-near">{warnCount} close</span> : null}
    </div>
  )
}
