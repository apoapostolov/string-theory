#!/usr/bin/env node
// Validates a String Theory export against the documented v1 contract.
// Zero dependencies, so a foreign agent can run it without installing anything.
//
//   node scripts/validate-export.mjs app.strings.json
//   node scripts/validate-export.mjs app.strings.json --strict   (warnings fail too)
//
// Exit codes: 0 valid, 1 errors (or warnings with --strict), 2 unreadable file.

import { readFileSync } from 'node:fs'

const FORMAT = 'string-theory/1'
const args = process.argv.slice(2)
const strict = args.includes('--strict')
const target = args.find((arg) => !arg.startsWith('--'))

if (!target) {
  console.error('usage: node scripts/validate-export.mjs <file.json> [--strict]')
  process.exit(2)
}

let raw
try {
  raw = readFileSync(target, 'utf8')
} catch (error) {
  console.error(`cannot read ${target}: ${error.message}`)
  process.exit(2)
}

let doc
try {
  doc = JSON.parse(raw.replace(/^\uFEFF/, ''))
} catch (error) {
  console.error(`${target}: invalid JSON: ${error.message}`)
  process.exit(1)
}

const items = []
const add = (level, path, message) => items.push({ level, path, message })

const envelope = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null
const list = Array.isArray(doc)
  ? doc
  : envelope && Array.isArray(envelope.strings)
    ? envelope.strings
    : envelope && Array.isArray(envelope.entries)
      ? envelope.entries
      : null

if (!list) {
  add('error', '$', 'no strings array: expected { strings: [...] } or a bare array')
}

if (envelope) {
  const declared = envelope.format ?? envelope.schemaVersion ?? envelope.version
  if (declared !== undefined) {
    if (typeof declared !== 'string') add('error', 'format', 'must be a string')
    else if (declared !== FORMAT) add('warn', 'format', `declares "${declared}", this validator checks ${FORMAT}`)
  }
  if (envelope.app !== undefined) {
    if (typeof envelope.app !== 'string') add('error', 'app', 'must be a string')
    else if (!envelope.app.trim()) add('warn', 'app', 'empty: the export filename and header fall back to the file name')
  }
  if (envelope.context !== undefined && typeof envelope.context !== 'string') add('error', 'context', 'must be a string')

  if (envelope.font === undefined) {
    add('warn', 'font', 'missing: the tool falls back to 14px system text, so every budget is an estimate')
  } else {
    const font = envelope.font
    if (!font || typeof font !== 'object' || Array.isArray(font)) add('error', 'font', 'must be an object')
    else {
      if (typeof font.family !== 'string' || !font.family.trim()) add('error', 'font.family', 'required non-empty string')
      if (typeof font.size !== 'number' || !(font.size > 0)) add('error', 'font.size', 'required number greater than zero (CSS px)')
      if (font.weight !== undefined) {
        const weight = font.weight
        const numeric = typeof weight === 'number' && weight >= 100 && weight <= 900
        const named = typeof weight === 'string' && /^(regular|normal|medium|semibold|bold)$/i.test(weight)
        if (!numeric && !named) add('error', 'font.weight', 'must be 100-900 or regular/medium/semibold/bold')
      }
      if (font.letterSpacing !== undefined && typeof font.letterSpacing !== 'number') {
        add('error', 'font.letterSpacing', 'must be a number')
      }
    }
  }

  if (envelope.defaultMaxPx !== undefined) {
    if (typeof envelope.defaultMaxPx !== 'number' || !(envelope.defaultMaxPx > 0)) {
      add('error', 'defaultMaxPx', 'must be a number greater than zero')
    }
  }
  if (envelope.defaultMaxPxPerLine !== undefined) {
    if (typeof envelope.defaultMaxPxPerLine !== 'number' || !(envelope.defaultMaxPxPerLine > 0)) {
      add('error', 'defaultMaxPxPerLine', 'must be a number greater than zero')
    }
  }
}

const ids = new Map()
let missingBudget = 0
let missingWhere = 0
const defaultBudget =
  envelope && typeof envelope.defaultMaxPxPerLine === 'number' && envelope.defaultMaxPxPerLine > 0
    ? envelope.defaultMaxPxPerLine
    : envelope && typeof envelope.defaultMaxPx === 'number' && envelope.defaultMaxPx > 0
      ? envelope.defaultMaxPx
      : undefined

if (list) {
  if (!list.length) add('error', 'strings', 'array is empty')

  list.forEach((entry, index) => {
    const path = `strings[${index}]`
    if (typeof entry === 'string') {
      add('warn', path, 'bare string entry: add an object with id and text so the rewrite can merge back')
      return
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      add('error', path, 'must be an object')
      return
    }

    const id = entry.id ?? entry.key ?? entry.name
    const text = entry.text ?? entry.value ?? entry.string ?? entry.source

    if (typeof id !== 'string' || !id.trim()) add('error', `${path}.id`, 'required non-empty string')
    else if (ids.has(id)) add('error', `${path}.id`, `duplicate id "${id}", already used at strings[${ids.get(id)}]`)
    else ids.set(id, index)

    if (typeof text !== 'string') add('error', `${path}.text`, 'required string')
    else if (!text.trim()) add('warn', `${path}.text`, 'empty string')
    else if (text.length > 2000) add('warn', `${path}.text`, `${text.length} characters: that is body copy, not a UI string`)

    if (entry.where !== undefined && typeof entry.where !== 'string') add('error', `${path}.where`, 'must be a string')
    if (!entry.where) missingWhere += 1

    const maxPx = entry.maxPxPerLine ?? entry.maxPx ?? entry.maxPIL ?? entry.pilMax
    if (maxPx !== undefined) {
      if (typeof maxPx !== 'number' || !(maxPx > 0)) add('error', `${path}.maxPxPerLine`, 'must be a number greater than zero')
    } else if (defaultBudget === undefined) {
      missingBudget += 1
    }

    const maxLines = entry.maxLines ?? entry.lines
    if (maxLines !== undefined) {
      if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 20) {
        add('error', `${path}.maxLines`, 'must be a whole number from 1 to 20')
      }
    }

    if (entry.maxPxTotal !== undefined) {
      if (typeof entry.maxPxTotal !== 'number' || !(entry.maxPxTotal > 0)) {
        add('error', `${path}.maxPxTotal`, 'must be a number greater than zero')
      } else if (typeof maxPx === 'number' && typeof maxLines === 'number') {
        const derived = maxPx * maxLines
        if (Math.abs(entry.maxPxTotal - derived) > 2) {
          add('warn', `${path}.maxPxTotal`, `is ${entry.maxPxTotal} but maxPxPerLine × maxLines is ${derived}; the tool recomputes it`)
        }
      }
    }

    if (entry.font !== undefined) {
      const font = entry.font
      if (!font || typeof font !== 'object' || Array.isArray(font)) add('error', `${path}.font`, 'must be an object')
      else {
        if (font.family !== undefined && (typeof font.family !== 'string' || !font.family.trim())) {
          add('error', `${path}.font.family`, 'must be a non-empty string')
        }
        if (font.size !== undefined && (typeof font.size !== 'number' || !(font.size > 0))) {
          add('error', `${path}.font.size`, 'must be a number greater than zero')
        }
        if (font.family === undefined && font.size === undefined) {
          add('warn', `${path}.font`, 'an override needs a family or a size to mean anything')
        }
      }
    }

    const maxChars = entry.maxChars ?? entry.maxLength ?? entry.limit
    if (maxChars !== undefined) {
      if (!Number.isInteger(maxChars) || maxChars < 1) add('error', `${path}.maxChars`, 'must be a positive integer')
    }

    if (entry.state !== undefined && !['normal', 'wip', 'done'].includes(entry.state)) {
      add('error', `${path}.state`, 'must be normal, wip or done')
    }
  })

  if (missingBudget) {
    add('warn', 'strings', `${missingBudget} of ${list.length} strings have no maxPx and no defaultMaxPx: nothing can be flagged as wrapping`)
  }
  if (missingWhere && missingWhere === list.length) {
    add('warn', 'strings', 'no where line anywhere: the operator loses the "where is this shown" context')
  }
}

const errors = items.filter((item) => item.level === 'error')
const warnings = items.filter((item) => item.level === 'warn')

const name = target.split(/[\\/]/).pop()
for (const item of items) {
  console.log(`${item.level === 'error' ? 'error' : 'warn '}  ${item.path}  ${item.message}`)
}

const counts = list ? `${list.length} strings` : 'no strings'
if (errors.length) {
  console.log(`\n${name}: FAIL, ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (${counts})`)
  process.exit(1)
}
if (warnings.length) {
  console.log(`\n${name}: valid with ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (${counts})`)
  process.exit(strict ? 1 : 0)
}
console.log(`\n${name}: valid (${counts})`)
