import { memo, useEffect, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  CaretDown,
  CheckCircle,
  Sparkle,
  WarningCircle
} from '@phosphor-icons/react'
import type { Fit, FontMetrics, ModeId, Row } from '../types'
import { charFit, fitOf, measurePx, px, worstFit } from '../lib/metrics'
import { Meter } from './Meter'
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
  warnRatio: number
  canPolish: boolean
  onEdit: (key: string, text: string) => void
  onPolish: (key: string, mode?: ModeId) => void
  onRevert: (key: string) => void
}

function RowShell({
  row,
  font,
  warnRatio,
  canPolish,
  onEdit,
  onPolish,
  onRevert
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const beforePx = measurePx(row.source, font)
  const afterPx = measurePx(row.text, font)
  const pxFit = fitOf(afterPx, row.maxPx, warnRatio)
  const chFit = charFit(row.text.length, row.maxChars, pxFit, warnRatio)
  const fit = worstFit(pxFit, chFit)
  const changed = row.text !== row.source
  const overBy = row.maxPx && afterPx > row.maxPx ? Math.round(afterPx - row.maxPx) : 0

  const info = (
    <span className="block">
      <span className="mb-1 block text-[10px] tracking-[0.08em] text-fg-faint uppercase">Shown at</span>
      <span className="block text-fg">{row.where || 'No location given in the export'}</span>
      <span className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-fg-faint">
        <span>id {row.id}</span>
        <span>max {row.maxPx ? `${px(row.maxPx)} px` : 'unset'}</span>
        <span>font {font.family} {font.size}px</span>
        <span>{row.maxChars ? `limit ${row.maxChars} ch` : 'no char limit'}</span>
      </span>
      {overBy > 0 ? (
        <span className="mt-2 block text-over">Over budget by {overBy} px, this line will wrap.</span>
      ) : null}
    </span>
  )

  return (
    <div
      id={`row-${row.key}`}
      className={`${BORDER[fit]} border-b border-b-line/70 transition-colors hover:bg-ink-900/70`}
    >
      <div className="flex items-center gap-2.5 px-4 pt-2.5">
        <HoverInfo content={info} className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px] text-fg-faint hover:text-fg-dim">{row.id}</span>
        </HoverInfo>

        {row.ai ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-800 px-1.5 py-[1px] text-[9.5px] tracking-[0.06em] text-fg-dim uppercase">
            <Sparkle size={9} weight="fill" />
            AI
          </span>
        ) : null}

        {row.busy ? (
          <span className="flex items-center gap-1 text-[10.5px] text-fg-faint">
            <span className="h-2.5 w-2.5 rounded-full border border-fg-faint/40 border-t-fg-dim st-shimmer" />
            polishing
          </span>
        ) : null}

        {row.error ? (
          <span className="flex min-w-0 items-center gap-1 truncate text-[10.5px] text-over">
            <WarningCircle size={11} weight="bold" className="shrink-0" />
            <span className="truncate">{row.error}</span>
          </span>
        ) : null}

        <div className="relative ml-auto flex shrink-0 items-center gap-1">
          {canPolish ? (
            <button
              type="button"
              onClick={() => onPolish(row.key)}
              disabled={row.busy}
              title="Grammar and style pass (Ctrl+Enter)"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-ink-800 px-2 text-[11.5px] text-fg transition-colors hover:bg-ink-750 disabled:pointer-events-none disabled:opacity-40"
            >
              <Sparkle size={11} weight="fill" />
              Polish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPolish(row.key)}
              title="Connect an AI provider to polish this row"
              aria-label="Connect an AI provider"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-ink-800 hover:text-fg"
            >
              <Sparkle size={12} />
            </button>
          )}
          <button
            type="button"
            aria-label="Choose pass"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={!canPolish || row.busy}
            className="inline-flex h-6.5 w-5 items-center justify-center rounded-md border border-line bg-ink-850 text-fg-faint transition-colors hover:bg-ink-800 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          >
            <CaretDown size={9} weight="bold" />
          </button>
          {menuOpen ? (
            <div
              ref={menuRef}
              className="absolute top-8 right-0 z-30 w-52 overflow-hidden rounded-[10px] border border-line bg-ink-800 py-1 shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
            >
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onPolish(row.key, mode.id)
                  }}
                  className="block w-full px-3 py-1.5 text-left transition-colors hover:bg-ink-750"
                >
                  <span className="block text-[12px] text-fg">{mode.label}</span>
                  <span className="block text-[10.5px] text-fg-faint">{mode.hint}</span>
                </button>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            aria-label="Revert to source"
            title="Revert to source"
            onClick={() => onRevert(row.key)}
            disabled={!changed}
            className="inline-flex h-6.5 w-6.5 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-ink-800 hover:text-fg disabled:pointer-events-none disabled:opacity-25"
          >
            <ArrowCounterClockwise size={12} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 pt-1.5 pb-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-7">
        <div className="min-w-0">
          <HoverInfo content={info} className="block" width={400}>
            <span className="block text-[13.5px] leading-snug text-fg/95">{row.source}</span>
            <span className="mt-1 block truncate font-mono text-[10.5px] text-fg-faint">
              {row.where || 'location not exported'}
            </span>
          </HoverInfo>
          <div className="mt-1.5 flex items-center gap-2.5 font-mono text-[10.5px] text-fg-faint">
            <span>{row.maxPx ? `max ${px(row.maxPx)} px` : 'no px limit'}</span>
            <span className="text-line-strong">·</span>
            <span>{px(beforePx)} px</span>
            {row.maxChars ? (
              <>
                <span className="text-line-strong">·</span>
                <span>{row.maxChars} ch</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <textarea
            ref={areaRef}
            value={row.text}
            rows={1}
            spellCheck
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
            className={`st-input block w-full rounded-lg border bg-ink-850/80 px-3 py-2 text-[13.5px] leading-snug text-fg outline-none transition-colors placeholder:text-fg-faint/70 focus:border-line-strong focus:bg-ink-850 ${
              fit === 'over' ? 'border-over/45' : fit === 'near' ? 'border-near/35' : 'border-line'
            }`}
          />
          <div className="mt-2 flex items-start gap-5">
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
              label="PIL"
              before={beforePx}
              after={afterPx}
              limit={row.maxPx}
              unit="px"
              warnRatio={warnRatio}
              fit={pxFit}
              title={`${px(afterPx)} px against a ${row.maxPx ?? 'unset'} px budget in ${font.family} ${font.size}px`}
            />
          </div>
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
