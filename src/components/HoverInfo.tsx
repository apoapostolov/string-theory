import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  content: ReactNode
  children: ReactNode
  className?: string
  width?: number
}

type Position = { x: number; y: number; flip: boolean }

/**
 * Floating info panel. Rendered in a portal so the table's scroll container
 * cannot clip it, and flipped above the anchor when there is no room below.
 */
export function HoverInfo({ content, children, className = '', width = 380 }: Props) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<Position | null>(null)

  function show() {
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    const flip = rect.bottom + 180 > window.innerHeight
    setPos({
      x: Math.max(12, Math.min(rect.left, window.innerWidth - width - 16)),
      y: flip ? rect.top - 8 : rect.bottom + 8,
      flip
    })
  }

  function hide() {
    setPos(null)
  }

  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [pos])

  return (
    <span
      ref={anchor}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      {children}
      {pos
        ? createPortal(
            <span
              role="tooltip"
              style={{
                left: pos.x,
                top: pos.y,
                width,
                transform: pos.flip ? 'translateY(-100%)' : undefined
              }}
              className="pointer-events-none fixed z-50 block rounded-[10px] border border-line bg-ink-800 px-3.5 py-3 text-[12px] leading-relaxed text-fg-dim shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
            >
              {content}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}
