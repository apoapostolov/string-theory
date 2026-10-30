import type { ReactNode } from 'react'
import { Cpu, GearSix, Info, MagnifyingGlass, X } from '@phosphor-icons/react'
import type { Fit, FontMetrics, ProviderInfo, UsageSummary } from '../types'
import { IconButton } from './Button'

export type FilterId = 'all' | 'changed' | 'near' | 'over' | 'untouched'

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'changed', label: 'Rewritten' },
  { id: 'near', label: 'Close to limit' },
  { id: 'over', label: 'Will wrap' },
  { id: 'untouched', label: 'Untouched' }
]

type TopBarProps = {
  source: ReactNode
  count: number
  font: FontMetrics | null
  query: string
  onQuery: (value: string) => void
  provider: ProviderInfo | null
  providerReady: boolean
  usage: UsageSummary | null
  onSettings: () => void
  onSpec: () => void
}

export function TopBar({
  source,
  count,
  font,
  query,
  onQuery,
  provider,
  providerReady,
  usage,
  onSettings,
  onSpec
}: TopBarProps) {
  const dot = provider && providerReady ? 'bg-ok' : provider ? 'bg-near' : 'bg-fg-faint/50'

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="flex h-6.5 w-6.5 items-center justify-center rounded-[7px] bg-fg font-mono text-[10.5px] font-bold text-ink-950">
          ST
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-fg">String Theory</span>
      </div>

      <span className="h-4 w-px shrink-0 bg-line" />

      <div className="flex min-w-0 items-center gap-2.5">
        {source}
        {count ? (
          <span className="shrink-0 font-mono text-[10.5px] text-fg-faint">
            {count} strings{font ? ` · ${font.family} ${font.size}px` : ''}
          </span>
        ) : null}
      </div>

      <div className="relative ml-auto hidden w-[240px] shrink-0 items-center md:flex">
        <MagnifyingGlass size={13} className="absolute left-2.5 text-fg-faint" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Find id, text or screen"
          className="h-8 w-full rounded-lg border border-line bg-ink-850 pr-7 pl-7.5 text-[12.5px] text-fg outline-none transition-colors placeholder:text-fg-faint/70 focus:border-line-strong"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQuery('')}
            className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-fg-faint hover:text-fg"
          >
            <X size={11} />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onSettings}
        title="AI provider, budget and measurement"
        className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line bg-ink-850 px-2.5 text-[11.5px] text-fg-dim transition-colors hover:border-line-strong hover:text-fg"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <Cpu size={12} />
        <span className="max-w-[130px] truncate">
          {provider ? provider.label : 'No provider'}
          {provider && usage ? <span className="text-fg-faint"> · ${usage.day.costUsd.toFixed(3)}</span> : null}
        </span>
      </button>

      <IconButton label="Export format" onClick={onSpec} className="h-8 w-8">
        <Info size={15} />
      </IconButton>
      <IconButton label="Settings" onClick={onSettings} className="h-8 w-8">
        <GearSix size={15} />
      </IconButton>
    </header>
  )
}

type FilterBarProps = {
  filter: FilterId
  onFilter: (id: FilterId) => void
  counts: Record<FilterId, number>
  fitCounts: Record<Fit, number>
  total: number
  showAllHint?: string
}

export function FilterBar({ filter, onFilter, counts, fitCounts, total, showAllHint }: FilterBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-3">
      {FILTERS.map((entry) => {
        const active = filter === entry.id
        const value =
          entry.id === 'over' ? fitCounts.over : entry.id === 'near' ? fitCounts.near : counts[entry.id]
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onFilter(entry.id)}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors ${
              active ? 'bg-ink-800 text-fg' : 'text-fg-dim hover:bg-ink-900 hover:text-fg'
            }`}
          >
            {entry.label}
            <span
              className={`font-mono text-[10px] tabular-nums ${
                entry.id === 'over' && value > 0 ? 'text-over' : entry.id === 'near' && value > 0 ? 'text-near' : 'text-fg-faint'
              }`}
            >
              {value}
            </span>
          </button>
        )
      })}
      <div className="ml-auto flex items-center gap-3 pr-1 font-mono text-[10.5px] text-fg-faint">
        {showAllHint ? <span>{showAllHint}</span> : null}
        <span>
          {counts.changed} / {total} rewritten
        </span>
      </div>
    </div>
  )
}
