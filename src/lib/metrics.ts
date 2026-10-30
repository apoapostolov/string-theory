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
  if (!text.includes('\n')) return measureLine(text, font)
  // A multi-line string can only wrap at its own breaks, so the widest line is
  // the width that matters against the budget.
  return text
    .split('\n')
    .reduce((widest, line) => Math.max(widest, measureLine(line, font)), 0)
}

function measureLine(text: string, font: FontMetrics): number {
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

// ---------------------------------------------------------------- wrapping
//
// The budget is a line width, not a total width. What matters is how the string
// actually wraps inside that box: too many lines is a spill, a single word wider
// than the box is a spill, and a last line that carries one word or less than
// 40% of the box is the orphan the Foundry string law calls a leak.

export const WRAP_LAW = { minLastLineRatio: 0.4 }

export type WrapResult = {
  lines: string[]
  widths: number[]
  words: number[]
  widest: number
  last: number
}

export type WrapFit = {
  fit: Fit
  leak: boolean
  lastRatio: number
  lines: number
  maxLines: number
  widest: number
  overBy: number
  tooManyLines: boolean
}

/** Greedy word wrap at the box width, in the declared font. */
export function wrapText(text: string, maxPxPerLine: number | null, font: FontMetrics): WrapResult {
  const limit = maxPxPerLine && maxPxPerLine > 0 ? maxPxPerLine : null
  const lines: string[] = []
  const widths: number[] = []
  const words: number[] = []

  for (const paragraph of String(text ?? '').split('\n')) {
    const parts = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) {
      lines.push('')
      widths.push(0)
      words.push(0)
      continue
    }
    if (!limit) {
      const line = parts.join(' ')
      lines.push(line)
      widths.push(measureLine(line, font))
      words.push(parts.length)
      continue
    }
    let current = parts[0]
    let count = 1
    for (let index = 1; index < parts.length; index += 1) {
      const candidate = `${current} ${parts[index]}`
      if (measureLine(candidate, font) <= limit) {
        current = candidate
        count += 1
      } else {
        lines.push(current)
        widths.push(measureLine(current, font))
        words.push(count)
        current = parts[index]
        count = 1
      }
    }
    lines.push(current)
    widths.push(measureLine(current, font))
    words.push(count)
  }

  return {
    lines,
    widths,
    words,
    widest: widths.reduce((widest, width) => Math.max(widest, width), 0),
    last: widths[widths.length - 1] ?? 0
  }
}

export function wrapFit(
  wrap: WrapResult,
  budget: { maxPxPerLine: number | null; maxLines: number },
  warnRatio: number
): WrapFit {
  const limit = budget.maxPxPerLine && budget.maxPxPerLine > 0 ? budget.maxPxPerLine : null
  const maxLines = Math.max(1, budget.maxLines || 1)
  const lines = wrap.lines.length
  const lastRatio = limit ? wrap.last / limit : 0
  const overBy = limit ? Math.max(0, wrap.widest - limit) : 0
  const tooManyLines = lines > maxLines
  // A thin last line only matters when the string otherwise fits: once it needs
  // more lines than the layout allows, the spill is the headline, not the orphan.
  const leak =
    !tooManyLines && lines > 1 && limit !== null && (wrap.words[lines - 1] <= 1 || lastRatio < WRAP_LAW.minLastLineRatio)

  let fit: Fit = 'none'
  if (limit) {
    if (tooManyLines || overBy > 0.5) fit = 'over'
    else if (leak || wrap.widest / limit >= warnRatio) fit = 'near'
    else fit = 'ok'
  }

  return { fit, leak, lastRatio, lines, maxLines, widest: wrap.widest, overBy, tooManyLines }
}

export function px(value: number | null): string {
  if (value === null) return '--'
  return `${Math.round(value)}`
}

export function signed(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : `${value}`
}
