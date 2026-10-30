import { useCallback, useEffect, useRef, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import type { Lane } from '../lib/lanes'

type Props = {
  lanes: Lane[]
  activeId: string | null
  onPick: (id: string) => void
}

/**
 * The files of one project, in the order a reader meets them.
 *
 * The app's own strings lead, because they are what the app says; the README,
 * the changelog and the documents the README links to follow, each with its own
 * progress. A project of one file still shows the row: it is where the editor
 * says which file the list came from.
 *
 * A project with a dozen documents does not fit on one screen, so the rail
 * scrolls sideways — with the wheel, and with the caret pair that appears only
 * while there is something in that direction to reach.
 */
export function LaneBar({ lanes, activeId, onPick }: Props) {
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
  }, [measure, lanes.length])

  // A wheel over a horizontal rail is the gesture everyone tries first.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return
      const max = rail.scrollWidth - rail.clientWidth
      if (max <= 0) return
      const clamped = Math.max(0, Math.min(max, rail.scrollLeft + event.deltaY))
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

  const ids = lanes.map((lane) => lane.id).join('|')

  // Another project means another set of pills: the rail starts at its edge.
  useEffect(() => {
    if (railRef.current) railRef.current.scrollLeft = 0
    measure()
  }, [measure, ids])

  if (!lanes.length) return null

  const scrollBy = (delta: number) => railRef.current?.scrollBy({ left: delta, behavior: 'smooth' })

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line px-3">
      <span className="mr-1 shrink-0 text-[10px] tracking-[0.08em] text-fg-faint uppercase">Files</span>

      <button
        type="button"
        aria-label="Scroll files left"
        tabIndex={edges.left ? 0 : -1}
        onClick={() => scrollBy(-220)}
        className={`flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-fg-dim transition-opacity hover:bg-ink-800 hover:text-fg ${
          edges.left ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <CaretLeft size={10} weight="bold" />
      </button>

      <div
        ref={railRef}
        role="group"
        aria-label="Files in this project"
        className="st-lanebar min-w-0 flex-1 overflow-x-auto"
      >
        {lanes.map((lane) => {
          const active = lane.id === activeId
          return (
            <button
              key={lane.id}
              type="button"
              aria-pressed={active}
              title={lane.surface === 'docs' ? `Prose from ${lane.source || lane.label}` : 'The app’s own strings'}
              onClick={() => onPick(lane.id)}
              className={`st-pill shrink-0 ${lane.surface === 'docs' ? '' : 'st-pill-app'}`}
            >
              <span className="max-w-[180px] truncate">{lane.label}</span>
              <span className="st-pill-count tabular-nums">
                {lane.done}/{lane.total}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-label="Scroll files right"
        tabIndex={edges.right ? 0 : -1}
        onClick={() => scrollBy(220)}
        className={`flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-fg-dim transition-opacity hover:bg-ink-800 hover:text-fg ${
          edges.right ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <CaretRight size={10} weight="bold" />
      </button>
    </div>
  )
}
