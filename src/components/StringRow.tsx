import { memo } from 'react'
import { ArrowCounterClockwise, CheckCircle, Sparkle, WarningCircle, X } from '@phosphor-icons/react'
import type { Fit, FontMetrics, ModeId, Row } from '../types'
import { charFit, px, wrapText, worstFit, type WrapFit, type WrapResult } from '../lib/metrics'
import { Meter } from './Meter'
import { RowTags } from './RowTags'
import { DocsRow } from './DocsRow'
import { PassControl, StateGlyph } from './RowBits'
import { HoverInfo } from './HoverInfo'

const BORDER: Record<Fit, string> = {
  ok: 'border-l-[3px] border-l-transparent',
  near: 'border-l-[3px] border-l-near',
  over: 'border-l-[3px] border-l-over',
  none: 'border-l-[3px] border-l-transparent'
}

type Props = {
  row: Row
  font: FontMetrics
  wrap: WrapResult
  wrapFit: WrapFit
  warnRatio: number
  canPolish: boolean
  onEdit: (key: string, text: string) => void
  onPolish: (key: string, mode?: ModeId, voice?: string) => void
  onRevert: (key: string) => void
  onCycleState: (key: string) => void
  onResetState: (key: string) => void
  customTags: string[]
  activeTags: string[]
  onToggleTag: (key: string, tag: string) => void
  onFilterTag: (tag: string) => void
  /** Zebra striping follows the row's place in the list, not the DOM position. */
  even?: boolean
  /** Only the rows near the viewport are mounted, so the list states its size. */
  setsize?: number
  posinset?: number
  /** True for a README or changelog row: prose, with no layout to fit. */
  docs?: boolean
  /** The voices offered in the pass menu, and the profile switch beside them. */
  voices?: Array<{ id: string; label: string; blurb: string; applies: 'app' | 'docs' | 'both' }>
  voice?: string
  useProfile?: boolean
  profileReady?: boolean
  profilePath?: string
  profileName?: string
  showVoices?: boolean
  showProfile?: boolean
  onToggleProfile?: () => void
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
  onFilterTag,
  even = false,
  setsize,
  posinset,
  docs = false,
  voices,
  voice,
  useProfile,
  profileReady,
  profilePath,
  profileName,
  showVoices = true,
  showProfile = true,
  onToggleProfile
}: Props) {
  if (docs) {
    return (
      <DocsRow
        row={row}
        canPolish={canPolish}
        onEdit={onEdit}
        onPolish={onPolish}
        voices={voices}
        voice={voice}
        useProfile={useProfile}
        profileReady={profileReady}
        profilePath={profilePath}
        profileName={profileName}
        showVoices={showVoices}
        showProfile={showProfile}
        onToggleProfile={onToggleProfile}
        onRevert={onRevert}
        onCycleState={onCycleState}
        onResetState={onResetState}
        customTags={customTags}
        activeTags={activeTags}
        onToggleTag={onToggleTag}
        onFilterTag={onFilterTag}
        even={even}
        setsize={setsize}
        posinset={posinset}
      />
    )
  }
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
      data-even={even ? 'true' : 'false'}
      aria-setsize={setsize}
      aria-posinset={posinset}
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
                {!row.text.trim() && row.state === 'done' ? (
                  <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-over/40 bg-over/10 px-1.5 py-[1px] text-[9.5px] tracking-[0.06em] text-over uppercase">
                    <X size={9} weight="bold" />
                    removes
                  </span>
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
        <div className="relative min-w-0 pl-5 lg:pl-0">
          {/* Spills left out of the input, not from the row's other furniture: the
              rail is reserved at narrow widths, and at wide widths the control sits
              in the column gap so the input never moves. */}
          {changed ? (
            <button
              type="button"
              aria-label="Revert to source"
              title="Revert to source (Esc)"
              onClick={() => onRevert(row.key)}
              className="st-revert absolute top-[5px] left-0 flex h-6 w-5 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-ink-800 hover:text-fg lg:-left-6 lg:w-6"
            >
              <ArrowCounterClockwise size={12} />
            </button>
          ) : null}
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
              voices={(voices ?? []).filter((entry) => entry.applies !== 'docs')}
              voice={voice}
              useProfile={useProfile}
              profileReady={profileReady}
              profilePath={profilePath}
              profileName={profileName}
              showVoices={showVoices}
              showProfile={showProfile}
              onToggleProfile={onToggleProfile}
              onRun={() => onPolish(row.key)}
              onPick={(mode, picked) => onPolish(row.key, mode, picked)}
            />
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
