import type { Fit, FontMetrics } from '../types'

let context: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

function ctx(): CanvasRenderingContext2D | null {
  if (context) return context
  const canvas = document.createElement('canvas')
  context = canvas.getContext('2d')
  return context
}

export function fontString(font: FontMetrics): string {
  const family = /[^a-zA-Z0-9]/.test(font.family) && !/^["'].*["']$/.test(font.family) ? `"${font.family}"` : font.family
  return `${font.weight} ${font.size}px ${family}, system-ui, sans-serif`
}

/** Rendered width of the string in the app's own font, in CSS pixels. */
export function measurePx(text: string, font: FontMetrics): number {
  if (!text) return 0
  const shorthand = fontString(font)
  const key = `${shorthand}|${font.letterSpacing}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const drawing = ctx()
  if (!drawing) return Math.round(text.length * font.size * 0.52)
  drawing.font = shorthand
  if (font.letterSpacing) {
    const spaced = drawing as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in spaced) spaced.letterSpacing = `${font.letterSpacing}px`
  }
  const width = drawing.measureText(text).width
  const total = font.letterSpacing && !('letterSpacing' in drawing) ? width + font.letterSpacing * Math.max(0, text.length - 1) : width
  const rounded = Math.round(total * 10) / 10
  cache.set(key, rounded)
  return rounded
}

export function fontInstalled(font: FontMetrics): boolean {
  if (typeof document === 'undefined' || !document.fonts?.check) return true
  try {
    return document.fonts.check(fontString(font))
  } catch {
    return true
  }
}

export function fitOf(px: number | null, maxPx: number | null, warnRatio: number): Fit {
  if (px === null || !maxPx) return 'none'
  const ratio = px / maxPx
  if (ratio > 1.0005) return 'over'
  if (ratio >= warnRatio) return 'near'
  return 'ok'
}

export function charFit(chars: number, maxChars: number | null, fallback: Fit, warnRatio: number): Fit {
  if (!maxChars) return fallback
  return fitOf(chars, maxChars, warnRatio)
}

const ORDER: Record<Fit, number> = { none: 0, ok: 1, near: 2, over: 3 }

export function worstFit(a: Fit, b: Fit): Fit {
  return ORDER[a] >= ORDER[b] ? a : b
}

export function px(value: number | null): string {
  if (value === null) return '--'
  return `${Math.round(value)}`
}

export function signed(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : `${value}`
}
