import { useCallback, useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import type { StandardTag } from '../lib/tags'
import { tagLabel } from '../lib/tags'

export type TagCount = {
  id: string
  total: number
  done: number
  wip: number
  group: string
}

type Props = {
  tags: TagCount[]
  active: string[]
  mode: 'any' | 'all'
  untagged: number
  onToggle: (id: string) => void
  onMode: (mode: 'any' | 'all') => void
  onClear: () => void
}

/**
 * The tag rail under the status filters.
 *
 * A file with hundreds of strings needs a way to work on one kind of string at a
 * time, so every tag in the file gets a pill with its own progress and a click
 * that narrows the list. The rail scrolls sideways with the wheel, because a
 * real catalogue carries far more tags than fit on a screen.
 */
export function TagBar({ tags, active, mode, untagged, onToggle, onMode, onClear }: Props) {
  const railRef = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const max = rail.scrollWidth - rail.clientWidth
    setEdges({ left: rail.scrollLeft > 2, right: max - rail.scrollLeft > 2 })
  }, [])

  useEffect(() => {
    measure()
    const rail = railRef.current
    if (!rail) return
    const observer = new ResizeObserver(measure)
    observer.observe(rail)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, tags.length])

  // A vertical wheel over a horizontal rail is the one gesture everyone tries.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return
      const max = rail.scrollWidth - rail.clientWidth
      if (max <= 0) return
      const next = rail.scrollLeft + event.deltaY
      const clamped = Math.max(0, Math.min(max, next))
      if (clamped === rail.scrollLeft) return
      event.preventDefault()
      rail.scrollLeft = clamped
    }
    rail.addEventListener('wheel', onWheel, { passive: false })
    rail.addEventListener('scroll', measure, { passive: true })
    return () => {
      rail.removeEventListener('wheel', onWheel)
      rail.removeEventListener('scroll', measure)
    }
  }, [measure])

  if (!tags.length && !untagged) return null

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line py-1.5 pr-3 pl-3">
      <span className="shrink-0 text-[10px] tracking-[0.08em] text-fg-faint uppercase">Tags</span>

      <button
        type="button"
        aria-label="Scroll tags left"
        onClick={() => railRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
        className={`flex h-5 w-4 shrink-0 items-center justify-center rounded text-fg-faint transition-opacity hover:text-fg ${
          edges.left ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <CaretLeft size={9} />
      </button>

      <div ref={railRef} role="group" aria-label="Filter by tag" className="st-tagbar min-w-0 flex-1">
        {tags.map((tag) => {
          const pressed = active.includes(tag.id)
          const complete = tag.done === tag.total && tag.total > 0
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggle(tag.id)}
              aria-pressed={pressed}
              title={`${tag.group}: ${tag.done} of ${tag.total} done`}
              className="st-pill"
            >
              <span className="st-pill-name">{tagLabel(tag.id)}</span>
              <span className={`st-pill-count ${complete ? 'text-ok' : ''}`}>
                {tag.done}/{tag.total}
              </span>
            </button>
          )
        })}

        {untagged > 0 ? (
          <button
            type="button"
            onClick={() => onToggle('~untagged')}
            aria-pressed={active.includes('~untagged')}
            title="Strings with no tag"
            className="st-pill st-pill-quiet"
          >
            <span className="st-pill-name">Untagged</span>
            <span className="st-pill-count">{untagged}</span>
          </button>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Scroll tags right"
        onClick={() => railRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
        className={`flex h-5 w-4 shrink-0 items-center justify-center rounded text-fg-faint transition-opacity hover:text-fg ${
          edges.right ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <CaretRight size={9} />
      </button>

      {active.length > 1 ? (
        <div role="group" aria-label="How to combine the selected tags" className="flex shrink-0 items-center rounded-md border border-line p-0.5">
          {(['any', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onMode(option)}
              aria-pressed={mode === option}
              className={`h-5 rounded px-1.5 text-[10px] tracking-[0.04em] uppercase transition-colors ${
                mode === option ? 'bg-ink-750 text-fg' : 'text-fg-faint hover:text-fg-dim'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {active.length ? (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 border-l border-line pl-2 text-[10.5px] text-fg-faint underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg-dim"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}

export type { StandardTag }
