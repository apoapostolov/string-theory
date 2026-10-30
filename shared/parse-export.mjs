// Single implementation of the string-theory/1 loader.
// Imported by the client (through src/lib/format.ts) and by the server, which
// needs the same verdict when it lists the inbox. Plain ESM so Node can load it
// without a build step; types live in parse-export.d.mts.

export const FORMAT_ID = 'string-theory/1'

export const DEFAULT_FONT = { family: 'Segoe UI', size: 14, weight: 400, letterSpacing: 0 }

const ID_KEYS = ['id', 'key', 'name', 'textId', 'text_id', 'stringId', 'string_id']
const TEXT_KEYS = ['text', 'value', 'string', 'source', 'current', 'content', 'en', 'default']
const WHERE_KEYS = ['where', 'info', 'place', 'location', 'context', 'usedIn', 'used_in', 'note']
// maxPx is the v1 name for the per-line budget and still reads as one.
const PER_LINE_KEYS = [
  'maxPxPerLine',
  'max_px_per_line',
  'maxPx',
  'maxPIL',
  'maxPil',
  'max_pil',
  'max_px',
  'pilMax',
  'pil_max',
  'maxWidth',
  'max_width',
  'max'
]
const LINES_KEYS = ['maxLines', 'max_lines', 'lines', 'wrapLines', 'wrap_lines']
const TOTAL_PX_KEYS = ['maxPxTotal', 'max_px_total', 'totalMaxPx', 'total_max_px', 'maxPxString', 'max_px_string']
const MAX_CHARS_KEYS = ['maxChars', 'max_chars', 'maxLength', 'max_length', 'charLimit', 'char_limit', 'limit']
const PX_KEYS = ['px', 'pil', 'PIL', 'width', 'measuredPx', 'measured_px']
const FONT_KEYS = ['font', 'textFont', 'text_font', 'typography']

function pick(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return undefined
}

export function num(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = String(value).replace(/(px|ch|em)\s*$/i, '').trim()
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export function str(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function readFont(raw, issues) {
  if (raw === undefined || raw === null) {
    issues.push({
      level: 'warn',
      code: 'no-font',
      message: `No font block. Measuring in ${DEFAULT_FONT.family} ${DEFAULT_FONT.size}px, so the pixel budget is an estimate until the export declares the real one.`
    })
    return { ...DEFAULT_FONT }
  }
  if (typeof raw !== 'object') {
    issues.push({
      level: 'warn',
      code: 'no-font',
      message: 'The font block is not an object and was ignored. Measuring in the default font.'
    })
    return { ...DEFAULT_FONT }
  }
  const f = raw
  const family = str(f.family ?? f.fontFamily ?? f.font_family ?? f.name) || DEFAULT_FONT.family
  const sizeRaw = num(f.size ?? f.fontSize ?? f.font_size ?? f.px)
  const weightRaw = f.weight ?? f.fontWeight ?? f.font_weight
  let weight = DEFAULT_FONT.weight
  if (typeof weightRaw === 'number') weight = weightRaw
  else if (typeof weightRaw === 'string' && /^\d+$/.test(weightRaw)) weight = Number(weightRaw)
  else if (typeof weightRaw === 'string' && /semibold|bold/i.test(weightRaw)) weight = 600
  const letterSpacing = num(f.letterSpacing ?? f.letter_spacing ?? f.tracking) ?? 0
  if (!sizeRaw || sizeRaw <= 0) {
    issues.push({
      level: 'warn',
      code: 'bad-font-size',
      message: `Font size is missing or invalid, using ${DEFAULT_FONT.size}px. Pixel budgets will be off.`
    })
  }
  return {
    family,
    size: sizeRaw && sizeRaw > 0 ? sizeRaw : DEFAULT_FONT.size,
    weight,
    letterSpacing
  }
}

function readFontOverride(raw) {
  if (!raw || typeof raw !== 'object') return null
  const family = str(raw.family ?? raw.fontFamily ?? raw.font_family)
  const size = num(raw.size ?? raw.fontSize ?? raw.font_size ?? raw.px)
  if (!family && !size) return null
  const weightRaw = raw.weight ?? raw.fontWeight ?? raw.font_weight
  let weight = DEFAULT_FONT.weight
  if (typeof weightRaw === 'number') weight = weightRaw
  else if (typeof weightRaw === 'string' && /^\d+$/.test(weightRaw)) weight = Number(weightRaw)
  else if (typeof weightRaw === 'string' && /semibold|bold/i.test(weightRaw)) weight = 600
  return {
    family: family || DEFAULT_FONT.family,
    size: size && size > 0 ? size : DEFAULT_FONT.size,
    weight,
    letterSpacing: num(raw.letterSpacing ?? raw.letter_spacing ?? raw.tracking) ?? 0
  }
}

function entriesOf(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    for (const key of ['strings', 'entries', 'items', 'messages', 'rows']) {
      if (Array.isArray(raw[key])) return raw[key]
    }
  }
  return []
}

/**
 * Reads an app export and reports what it had to repair. The format contract
 * lives in docs/format.md and docs/string-theory.schema.json; this function is
 * deliberately more forgiving than the schema so a rough exporter still loads.
 */
export function parseExport(raw, name) {
  const issues = []
  const envelope = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const declared = str(envelope.format ?? envelope.schemaVersion ?? envelope.version).trim()
  const version = declared || FORMAT_ID

  if (declared && declared !== FORMAT_ID) {
    issues.push({
      level: 'warn',
      code: 'unknown-format',
      message: `Export says "${declared}"; this build reads ${FORMAT_ID}. Loaded with the v1 rules.`
    })
  }

  const list = entriesOf(raw)
  const app = str(envelope.app ?? envelope.application ?? envelope.product ?? envelope.project ?? '')
  const context = str(envelope.context ?? envelope.screen ?? envelope.feature ?? '')
  const font = readFont(envelope.font ?? envelope.metrics ?? envelope.typography, issues)
  const defaultMaxPx = num(
    envelope.defaultMaxPxPerLine ??
      envelope.default_max_px_per_line ??
      envelope.defaultMaxPx ??
      envelope.default_max_px ??
      envelope.maxPx
  )
  if (defaultMaxPx !== null && defaultMaxPx <= 0) {
    issues.push({
      level: 'warn',
      code: 'bad-default-max-px',
      message: 'defaultMaxPx must be greater than zero; treated as absent.'
    })
  }

  const rows = []
  const seen = new Map()
  let syntheticIds = 0
  let emptyText = 0
  let duplicates = 0
  let badMaxPx = 0
  let badMaxLines = 0
  let inconsistentTotals = 0
  let badMaxChars = 0
  let skipped = 0
  let longText = 0

  list.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const id = `string.${index + 1}`
      syntheticIds += 1
      const fallback = defaultMaxPx && defaultMaxPx > 0 ? defaultMaxPx : null
      rows.push({
        key: `${index}:${id}`,
        id,
        source: entry,
        where: '',
        maxPxPerLine: fallback,
        maxLines: 1,
        maxPxTotal: fallback,
        maxChars: null,
        font: null
      })
      return
    }
    if (!entry || typeof entry !== 'object') {
      skipped += 1
      return
    }
    const rawId = str(pick(entry, ID_KEYS)).trim()
    const text = str(pick(entry, TEXT_KEYS))
    if (!rawId && !text) {
      skipped += 1
      return
    }
    const baseId = rawId || `string.${index + 1}`
    if (!rawId) syntheticIds += 1
    if (!text) emptyText += 1
    if (text.length > 2000) longText += 1

    const count = (seen.get(baseId) ?? 0) + 1
    seen.set(baseId, count)
    if (count > 1) duplicates += 1

    const lineValue = num(pick(entry, PER_LINE_KEYS))
    let maxPxPerLine = lineValue
    if (lineValue !== null && lineValue <= 0) {
      badMaxPx += 1
      maxPxPerLine = null
    }
    if (maxPxPerLine === null) maxPxPerLine = defaultMaxPx && defaultMaxPx > 0 ? defaultMaxPx : null

    const linesValue = num(pick(entry, LINES_KEYS))
    let maxLines = 1
    if (linesValue !== null) {
      if (!Number.isInteger(linesValue) || linesValue < 1 || linesValue > 20) badMaxLines += 1
      else maxLines = linesValue
    }

    const totalValue = num(pick(entry, TOTAL_PX_KEYS))
    if (totalValue !== null && totalValue <= 0) badMaxPx += 1
    const cleanTotal = totalValue !== null && totalValue > 0 ? totalValue : null
    const derivedTotal = maxPxPerLine ? maxPxPerLine * maxLines : null
    if (cleanTotal !== null && derivedTotal !== null && Math.abs(cleanTotal - derivedTotal) > 2) {
      inconsistentTotals += 1
    }

    const charsRaw = num(pick(entry, MAX_CHARS_KEYS))
    let maxChars = charsRaw
    if (charsRaw !== null && (charsRaw < 1 || !Number.isFinite(charsRaw))) {
      badMaxChars += 1
      maxChars = null
    }

    const px = num(pick(entry, PX_KEYS))
    rows.push({
      key: `${index}:${baseId}:${count}`,
      id: count > 1 ? `${baseId} #${count}` : baseId,
      source: text,
      where: str(pick(entry, WHERE_KEYS)),
      maxPxPerLine: px && !maxPxPerLine ? px : maxPxPerLine,
      maxLines,
      // The line count times the line width is the budget that matters; a
      // declared total that disagrees is reported and recomputed.
      maxPxTotal: maxPxPerLine ? maxPxPerLine * maxLines : cleanTotal,
      maxChars,
      font: readFontOverride(pick(entry, FONT_KEYS))
    })
  })

  // Aggregated repairs, one line each instead of one per string.
  if (!list.length) {
    issues.push({
      level: 'error',
      code: 'no-strings',
      message: 'No string array found. The file needs a `strings` array or a bare array of string objects.'
    })
  }
  if (skipped) {
    issues.push({
      level: 'warn',
      code: 'entry-skipped',
      message: `${skipped} entr${skipped === 1 ? 'y was' : 'ies were'} skipped: not an object with an id or text.`
    })
  }
  if (syntheticIds) {
    issues.push({
      level: 'warn',
      code: 'missing-id',
      message: `${syntheticIds} string${syntheticIds === 1 ? '' : 's'} had no id and got a generated one. Rewrites cannot be merged back by id.`
    })
  }
  if (emptyText) {
    issues.push({
      level: 'warn',
      code: 'missing-text',
      message: `${emptyText} string${emptyText === 1 ? '' : 's'} had no text and started empty.`
    })
  }
  if (duplicates) {
    issues.push({
      level: 'warn',
      code: 'duplicate-id',
      message: `${duplicates} duplicate id${duplicates === 1 ? ' was' : 's were'} suffixed with #2, #3 so each row stays editable.`
    })
  }
  if (badMaxPx) {
    issues.push({
      level: 'warn',
      code: 'bad-max-px',
      message: `${badMaxPx} invalid maxPxPerLine value${badMaxPx === 1 ? '' : 's'} cleared (must be greater than zero).`
    })
  }
  if (badMaxLines) {
    issues.push({
      level: 'warn',
      code: 'bad-max-lines',
      message: `${badMaxLines} invalid maxLines value${badMaxLines === 1 ? '' : 's'} treated as one line (must be a whole number from 1 to 20).`
    })
  }
  if (inconsistentTotals) {
    issues.push({
      level: 'warn',
      code: 'inconsistent-max-px',
      message: `${inconsistentTotals} string${inconsistentTotals === 1 ? ' declares' : 's declare'} a maxPxTotal that is not maxPxPerLine × maxLines. The total was recomputed from the line budget.`
    })
  }
  if (badMaxChars) {
    issues.push({
      level: 'warn',
      code: 'bad-max-chars',
      message: `${badMaxChars} invalid maxChars value${badMaxChars === 1 ? '' : 's'} cleared (must be a whole number of at least 1).`
    })
  }
  if (longText) {
    issues.push({
      level: 'warn',
      code: 'long-text',
      message: `${longText} string${longText === 1 ? '' : 's'} longer than 2000 characters. That is body copy, not a UI string.`
    })
  }

  const unconstrained = rows.filter((row) => !row.maxPxPerLine).length
  if (rows.length && unconstrained === rows.length) {
    issues.push({
      level: 'warn',
      code: 'no-max-px',
      message: 'No pixel budget anywhere. Add `maxPxPerLine` per string or a `defaultMaxPx`, otherwise no row can be flagged as wrapping.'
    })
  } else if (unconstrained > 0) {
    issues.push({
      level: 'warn',
      code: 'partial-max-px',
      message: `${unconstrained} string${unconstrained === 1 ? ' has' : 's have'} no maxPxPerLine and cannot go over a limit.`
    })
  }

  return {
    name,
    app: app || name.replace(/\.json$/i, ''),
    context,
    font,
    version,
    rows,
    issues
  }
}
