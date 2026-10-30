import type { FontMetrics, ParsedFile, ParsedRow } from '../types'

const DEFAULT_FONT: FontMetrics = { family: 'Segoe UI', size: 14, weight: 400, letterSpacing: 0 }

const ID_KEYS = ['id', 'key', 'name', 'textId', 'text_id', 'stringId', 'string_id']
const TEXT_KEYS = ['text', 'value', 'string', 'source', 'current', 'content', 'en', 'default']
const WHERE_KEYS = ['where', 'info', 'place', 'location', 'context', 'usedIn', 'used_in', 'note']
const MAX_PX_KEYS = ['maxPx', 'maxPIL', 'maxPil', 'max_pil', 'max_px', 'pilMax', 'pil_max', 'maxWidth', 'max_width', 'max']
const MAX_CHARS_KEYS = ['maxChars', 'max_chars', 'maxLength', 'max_length', 'charLimit', 'char_limit', 'limit']
const PX_KEYS = ['px', 'pil', 'PIL', 'width', 'measuredPx', 'measured_px']

function pick(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return undefined
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = String(value).replace(/(px|ch|em)\s*$/i, '').trim()
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function str(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

function readFont(raw: unknown): FontMetrics {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FONT }
  const f = raw as Record<string, unknown>
  const family = str(f.family ?? f.fontFamily ?? f.font_family ?? f.name) || DEFAULT_FONT.family
  const size = num(f.size ?? f.fontSize ?? f.font_size ?? f.px) ?? DEFAULT_FONT.size
  const weightRaw = f.weight ?? f.fontWeight ?? f.font_weight
  let weight = DEFAULT_FONT.weight
  if (typeof weightRaw === 'number') weight = weightRaw
  else if (typeof weightRaw === 'string' && /^\d+$/.test(weightRaw)) weight = Number(weightRaw)
  else if (typeof weightRaw === 'string' && /semibold|bold/i.test(weightRaw)) weight = 600
  const letterSpacing = num(f.letterSpacing ?? f.letter_spacing ?? f.tracking) ?? 0
  return { family, size, weight, letterSpacing }
}

function entriesOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    for (const key of ['strings', 'entries', 'items', 'messages', 'rows']) {
      if (Array.isArray(record[key])) return record[key] as unknown[]
    }
  }
  return []
}

/**
 * Reads an app export. Accepts either the documented envelope or a bare array,
 * and tolerates the snake_case / alias field names other exporters tend to emit.
 */
export function parseExport(raw: unknown, name: string): ParsedFile {
  const warnings: string[] = []
  const envelope = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const list = entriesOf(raw)
  const app = str(envelope.app ?? envelope.application ?? envelope.product ?? envelope.project ?? '')
  const context = str(envelope.context ?? envelope.screen ?? envelope.feature ?? '')
  const font = readFont(envelope.font ?? envelope.metrics ?? envelope.typography)
  const defaultMaxPx = num(envelope.defaultMaxPx ?? envelope.default_max_px ?? envelope.maxPx)

  const rows: ParsedRow[] = []
  const seen = new Map<string, number>()

  list.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const id = `string.${index + 1}`
      rows.push({ key: `${index}:${id}`, id, source: entry, where: '', maxPx: defaultMaxPx, maxChars: null })
      return
    }
    if (!entry || typeof entry !== 'object') {
      warnings.push(`Entry ${index + 1} is not an object and was skipped.`)
      return
    }
    const record = entry as Record<string, unknown>
    const id = str(pick(record, ID_KEYS)).trim()
    const text = str(pick(record, TEXT_KEYS))
    if (!id && !text) {
      warnings.push(`Entry ${index + 1} has no id and no text; skipped.`)
      return
    }
    const finalId = id || `string.${index + 1}`
    const count = (seen.get(finalId) ?? 0) + 1
    seen.set(finalId, count)
    const maxPx = num(pick(record, MAX_PX_KEYS)) ?? defaultMaxPx
    const maxChars = num(pick(record, MAX_CHARS_KEYS))
    const px = num(pick(record, PX_KEYS))
    rows.push({
      key: `${index}:${finalId}:${count}`,
      id: count > 1 ? `${finalId} #${count}` : finalId,
      source: text,
      where: str(pick(record, WHERE_KEYS)),
      maxPx: px && !maxPx ? px : maxPx,
      maxChars
    })
  })

  const withoutLimit = rows.filter((row) => !row.maxPx).length
  if (rows.length && withoutLimit === rows.length) {
    warnings.push('No pixel budget found. Add "maxPx" per string or a "defaultMaxPx" to the export.')
  } else if (withoutLimit > 0) {
    warnings.push(`${withoutLimit} string${withoutLimit === 1 ? '' : 's'} have no maxPx and cannot go over a limit.`)
  }

  return {
    name,
    app: app || name.replace(/\.json$/i, ''),
    context,
    font,
    rows,
    warnings
  }
}

export { DEFAULT_FONT, num, str }
