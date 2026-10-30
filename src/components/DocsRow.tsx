import { memo } from 'react'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import type { ModeId, Row } from '../types'
import { RowTags } from './RowTags'
import { HoverInfo } from './HoverInfo'
import { MODES, PassControl, StateGlyph } from './RowBits'

type Props = {
  row: Row
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
  even?: boolean
  setsize?: number
  posinset?: number
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

const PROSE_MODES = MODES.filter((mode) => mode.id !== 'fit')

function words(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/**
 * A row for the project's prose.
 *
 * README and changelog strings have no wrap box and no line allowance, so the
 * fit meters would be noise: the row is a paragraph editor instead. The box is
 * tall on purpose, because the string is often a whole paragraph and rewriting
 * one in a one-line field is where sloppy language survives.
 */
function DocsShell({
  row,
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
  const changed = row.text !== row.source
  const chars = row.text.length
  const paragraphLines = row.text.split('\n').length
  // A paragraph needs room; the box grows with the text rather than scrolling it.
  const rows = Math.min(16, Math.max(4, Math.ceil(chars / 90) + 1))

  return (
    <div
      id={`row-${row.key}`}
      role="listitem"
      data-even={even ? 'true' : 'false'}
      data-surface="docs"
      aria-setsize={setsize}
      aria-posinset={posinset}
      aria-labelledby={`row-label-${row.key}`}
      className={`st-row border-l-[3px] border-l-transparent ${changed ? 'st-row-docs-changed' : ''}`}
    >
      {changed ? (
        <button
          type="button"
          aria-label="Revert to source"
          title="Revert to source (Esc)"
          onClick={() => onRevert(row.key)}
          className="st-revert absolute top-2 left-1 flex h-6 w-6 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-ink-800 hover:text-fg"
        >
          <ArrowCounterClockwise size={12} />
        </button>
      ) : null}
      <div className="flex items-start gap-2.5 px-3 pt-2">
        <StateGlyph state={row.state} onCycle={() => onCycleState(row.key)} onReset={() => onResetState(row.key)} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 font-mono text-[11px]">
            <span id={`row-label-${row.key}`} className="truncate text-fg-dim">
              {row.id}
            </span>
            {row.where ? (
              <>
                <span className="shrink-0 text-fg-faint/50">·</span>
                <span className="truncate text-[10.5px] text-fg-faint">{row.where}</span>
              </>
            ) : null}
            {row.note ? (
              <>
                <span className="shrink-0 text-fg-faint/50">·</span>
                <span className="truncate text-[10.5px] text-fg-faint">note · {row.note}</span>
              </>
            ) : null}
          </div>

          <div className="mt-1 flex items-start gap-3">
            <RowTags
              tags={row.tags ?? []}
              custom={customTags}
              active={activeTags}
              onFilter={onFilterTag}
              onToggle={(tag) => onToggleTag(row.key, tag)}
            />
          </div>
        </div>

        <div className="mt-0.5 flex shrink-0 items-stretch gap-1.5">
          <PassControl
            busy={row.busy}
            connected={canPolish}
            modes={PROSE_MODES}
            voices={(voices ?? []).filter((entry) => entry.applies !== 'app')}
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
      </div>

      <div className="px-3 pt-1.5 pb-3">
        <HoverInfo
          className="mb-1.5 block"
          width={460}
          content={<span className="block whitespace-pre-wrap">{row.source || 'Empty in the document'}</span>}
        >
          <span className="line-clamp-2 block text-[12px] leading-relaxed text-fg-faint">{row.source}</span>
        </HoverInfo>

        <textarea
          value={row.text}
          rows={rows}
          spellCheck
          aria-label={`Rewrite ${row.id}`}
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
          placeholder="Rewrite this paragraph in your own words"
          className="st-input block w-full resize-y rounded-lg border border-line-input bg-ink-850/80 px-3 py-2 text-[12.5px] leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-faint/70 focus:border-fg-dim focus:bg-ink-850"
        />

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-fg-faint">
          <span className="tabular-nums text-fg-dim">{chars} ch</span>
          <span className="tabular-nums">{words(row.text)} words</span>
          {changed ? (
            <span className="tabular-nums">
              was {row.source.length} ch · {words(row.source)} words
              <span className={chars > row.source.length ? 'text-near' : 'text-ok'}>
                {' '}
                {chars === row.source.length ? 'same length' : `${chars > row.source.length ? '+' : ''}${chars - row.source.length} ch`}
              </span>
            </span>
          ) : null}
          {paragraphLines > 1 ? <span className="tabular-nums">{paragraphLines} lines</span> : null}
          {!row.text.trim() && row.state === 'done' ? (
            <span className="text-over">removes this passage</span>
          ) : !row.text.trim() ? (
            <span className="text-fg-faint">empty draft, not sent until it is marked complete</span>
          ) : null}
          {row.busy ? <span className="text-fg-dim">polishing</span> : null}
          {row.error ? <span className="truncate text-over">{row.error}</span> : null}
        </div>
      </div>
    </div>
  )
}

export const DocsRow = memo(DocsShell)
