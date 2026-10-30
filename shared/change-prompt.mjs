// Turns the rewrites in a working set into instructions another agent can follow.
//
// The operator should not have to build a converter or hand over a metadata file
// to see their changes land: the changes are the deliverable. One line per
// changed string, in a shape a model can act on without judgement, grouped by
// the section the tags describe.

import { tagLabel } from './tags.mjs'

const TITLE = (tag) =>
  tag
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')

/** Quotes, backslashes and breaks are escaped the way JSON escapes them. */
export function quoted(text) {
  return `"${String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')}"`
}

/**
 * The area a string belongs to, described only by what the file says about it.
 * The first tag is the role; the rest name the part of the app.
 */
export function sectionOf(row) {
  const tags = Array.isArray(row?.tags) ? row.tags.filter(Boolean) : []
  if (tags.length) {
    const role = tagLabel(tags[0])
    const areas = tags.slice(1).map(TITLE)
    return areas.length ? `${areas.join(' / ')} · ${role}` : role
  }
  const where = String(row?.where ?? '').split(',')[0].trim()
  return where || 'Unsorted'
}

/** The part of the app a string belongs to, without its role. */
export function areaOf(row) {
  const tags = Array.isArray(row?.tags) ? row.tags.filter(Boolean) : []
  if (tags.length > 1) return tags.slice(1).map(TITLE).join(' / ')
  const where = String(row?.where ?? '').split(',')[0].trim()
  return where ? TITLE(where) : 'Unsorted'
}

/** The role a string plays: its first tag, or the whole section when untagged. */
export function roleOf(row) {
  const tags = Array.isArray(row?.tags) ? row.tags.filter(Boolean) : []
  return tags.length ? tagLabel(tags[0]) : sectionOf(row)
}

export function changeLine(row, { includeIds = true, section } = {}) {
  const where = section ?? sectionOf(row)
  const id = includeIds && row?.id ? ` (id: ${row.id})` : ''
  return `Replace ${quoted(row.source)} with ${quoted(row.text)} in ${where}${id}`
}

/**
 * @returns {{ text: string, lines: string[], stats: { changed: number, sections: number, ambiguous: number, untagged: number } }}
 */
export function buildChangePrompt(rows, options = {}) {
  const { app = 'the app', group = true, includeIds = true, linesOnly = false } = options
  const changed = (rows ?? []).filter((row) => row && row.text !== row.source)

  // A source text that appears twice with different rewrites needs its id, not
  // just its section, or the agent has to guess which one the line means.
  const bySource = new Map()
  for (const row of changed) {
    bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1)
  }
  const ambiguous = [...bySource.values()].filter((count) => count > 1).length

  const ordered = [...changed].sort((a, b) => {
    const left = group ? `${areaOf(a)}\u0000${roleOf(a)}` : sectionOf(a)
    const right = group ? `${areaOf(b)}\u0000${roleOf(b)}` : sectionOf(b)
    if (left !== right) return left.localeCompare(right)
    return String(a.id).localeCompare(String(b.id))
  })

  const lines = ordered.map((row) =>
    changeLine(row, {
      includeIds: includeIds || (bySource.get(row.source) ?? 0) > 1,
      // Under a heading the area is already stated, so the line names the role.
      section: group ? roleOf(row) : undefined
    })
  )
  const sections = new Set(ordered.map((row) => (group ? areaOf(row) : sectionOf(row))))

  if (linesOnly) {
    return {
      text: lines.join('\n'),
      lines,
      stats: { changed: changed.length, sections: sections.size, ambiguous, untagged: ordered.filter((row) => !(row.tags ?? []).length).length }
    }
  }

  const body = []
  if (group && lines.length) {
    let current = null
    ordered.forEach((row, index) => {
      const section = areaOf(row)
      if (section !== current) {
        if (current !== null) body.push('')
        body.push(`## ${section}`)
        current = section
      }
      body.push(`- ${lines[index]}`)
    })
  } else {
    for (const line of lines) body.push(`- ${line}`)
  }

  const header = [
    `Apply ${lines.length} string change${lines.length === 1 ? '' : 's'} in ${app}.`,
    '',
    'Each line names the text as it is now, the text it must become, and where it appears.',
    '',
    'Rules:',
    '- Match the current text exactly inside the named section. Where a line carries an id, prefer the string with that id.',
    '- Change only these strings. Do not reword, reformat or reorder anything else, and do not touch translations of them.',
    '- Keep placeholders ({name}, %s, :count), keyboard shortcuts, file paths and punctuation byte for byte.',
    '- Quoted text is escaped the way JSON escapes it: \\" is a quote inside the string, \\n is a line break.',
    '- If a line has no match in the code, leave the code alone and say so in your report instead of guessing.'
  ]

  const footer = [
    '',
    'When you are done, report how many of these changes you applied, and list every line you could not find.'
  ]

  return {
    text: [...header, '', ...body, ...footer].join('\n'),
    lines,
    stats: { changed: changed.length, sections: sections.size, ambiguous, untagged: ordered.filter((row) => !(row.tags ?? []).length).length }
  }
}
