import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

type Options = {
  /** Stable key per row, in render order. */
  keys: string[]
  /** Height to assume before a row has been measured. */
  estimate: number
  /** Rows rendered above and below the viewport, so scrolling never shows a gap. */
  overscan?: number
  /** The element that scrolls the list. */
  scrollRef: RefObject<HTMLElement | null>
  /** A row that must stay mounted even when scrolled away, such as the focused one. */
  pinnedKey?: string | null
}

export type VirtualRows = {
  start: number
  end: number
  /** Indices rendered outside the window, because something in them has focus. */
  extra: number[]
  totalHeight: number
  offsetOf: (index: number) => number
  /** Attach to each row so its real height is measured, whatever the wrap did. */
  register: (key: string, node: HTMLElement | null) => void
  scrollToIndex: (index: number) => void
}

/**
 * Windowed rendering for a list whose rows are tall, variable and expensive.
 *
 * A thousand strings at ninety pixels is a hundred thousand pixels of layout that
 * nobody is looking at. Only the rows around the viewport are mounted, each one
 * absolutely positioned inside a spacer as tall as the whole list, so the
 * scrollbar keeps telling the truth and `scrollToIndex` can still reach row 900.
 *
 * Heights are measured, never assumed: a row grows when the text wraps or a tag
 * is added, and the rows below it have to move by exactly that much.
 */
export function useVirtualRows({ keys, estimate, overscan = 6, scrollRef, pinnedKey }: Options): VirtualRows {
  const heights = useRef(new Map<string, number>())
  const [version, setVersion] = useState(0)
  const [viewport, setViewport] = useState({ top: 0, height: 0 })

  const measure = useCallback((key: string, node: HTMLElement | null) => {
    if (!node) return
    const height = node.getBoundingClientRect().height
    if (!height) return
    const previous = heights.current.get(key)
    if (previous !== undefined && Math.abs(previous - height) < 0.5) return
    heights.current.set(key, height)
    setVersion((value) => value + 1)
  }, [])

  const observers = useRef(new Map<string, ResizeObserver>())

  const register = useCallback(
    (key: string, node: HTMLElement | null) => {
      const existing = observers.current.get(key)
      if (existing) {
        existing.disconnect()
        observers.current.delete(key)
      }
      if (!node) return

      measure(key, node)
      const observer = new ResizeObserver(() => measure(key, node))
      observer.observe(node)
      observers.current.set(key, observer)
    },
    [measure]
  )

  useEffect(() => {
    const active = observers.current
    return () => {
      for (const observer of active.values()) observer.disconnect()
      active.clear()
    }
  }, [])

  const offsets = useMemo(() => {
    // Unmeasured rows use the median of what has been measured, so the scrollbar
    // does not creep while the reader scrolls: 96 guessed against 102 real would
    // move the thumb on every measurement.
    const measured = [...heights.current.values()].sort((a, b) => a - b)
    const typical = measured.length ? measured[Math.floor(measured.length / 2)] : estimate
    const list = new Array<number>(keys.length)
    let cursor = 0
    for (let index = 0; index < keys.length; index += 1) {
      list[index] = cursor
      cursor += heights.current.get(keys[index]) ?? typical
    }
    return { list, total: cursor }
    // version is the signal that a measured height changed
  }, [keys, estimate, version])

  // Follow the scroller. The window is cheap to recompute (a thousand additions)
  // and reading it on the event itself means the list is correct even where
  // requestAnimationFrame is throttled, as it is in a hidden window.
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const sync = () => {
      const top = scroller.scrollTop
      const height = scroller.clientHeight
      setViewport((current) => (current.top === top && current.height === height ? current : { top, height }))
    }
    sync()
    scroller.addEventListener('scroll', sync, { passive: true })
    const resize = new ResizeObserver(sync)
    resize.observe(scroller)
    const onVisible = () => {
      if (!document.hidden) sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      scroller.removeEventListener('scroll', sync)
      resize.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [scrollRef, keys.length])

  const { start, end, extra } = useMemo(() => {
    const count = keys.length
    if (!count) return { start: 0, end: 0, extra: [] as number[] }

    const pad = overscan * estimate
    const top = viewport.top - pad
    const bottom = viewport.top + (viewport.height || 800) + pad

    let first = 0
    while (first < count - 1 && offsets.list[first] + (heights.current.get(keys[first]) ?? estimate) < top) {
      first += 1
    }
    let last = first
    while (last < count - 1 && offsets.list[last] < bottom) last += 1

    const extra: number[] = []
    if (pinnedKey) {
      const pinned = keys.indexOf(pinnedKey)
      if (pinned >= 0 && (pinned < first || pinned > last)) extra.push(pinned)
    }
    return { start: first, end: Math.min(count, last + 1), extra }
  }, [keys, offsets, viewport, overscan, estimate, pinnedKey])

  const offsetOf = useCallback((index: number) => offsets.list[index] ?? 0, [offsets])

  const scrollToIndex = useCallback(
    (index: number) => {
      const scroller = scrollRef.current
      if (!scroller) return
      scroller.scrollTop = Math.max(0, (offsets.list[index] ?? 0) - 8)
    },
    [offsets, scrollRef]
  )

  return { start, end, extra, totalHeight: offsets.total, offsetOf, register, scrollToIndex }
}
