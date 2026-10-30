// Style analyst: turn the human's completed rewrites into a house-style profile.
//
// The pairs are the evidence. The model's only job is to name the differences in
// a form another writer can follow, so every rule has to point at an id that was
// actually changed. No pair, no rule.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, sep } from 'node:path'

export const MIN_PAIRS = 3
export const MAX_PAIRS = 80
export const MAX_PAIR_CHARS = 1600

export function slug(value) {
  return (
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'profile'
  )
}

/**
 * Keeps pairs that carry evidence and samples evenly when there are too many,
 * so the profile reflects the whole file instead of its first screen.
 */
export function selectPairs(pairs, limit = MAX_PAIRS) {
  const clean = []
  const seen = new Set()
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    if (!pair || typeof pair !== 'object') continue
    const original = String(pair.original ?? '').trim()
    const rewrite = String(pair.rewrite ?? '').trim()
    if (!original || !rewrite || original === rewrite) continue
    if (original.length > MAX_PAIR_CHARS || rewrite.length > MAX_PAIR_CHARS) continue
    const key = `${original}\u0000${rewrite}`
    if (seen.has(key)) continue
    seen.add(key)
    clean.push({
      id: String(pair.id ?? '').slice(0, 120),
      where: String(pair.where ?? '').slice(0, 200),
      original,
      rewrite
    })
  }
  if (clean.length <= limit) return clean
  const step = clean.length / limit
  const sampled = []
  for (let index = 0; index < limit; index += 1) sampled.push(clean[Math.floor(index * step)])
  return sampled
}

const SYSTEM = `You are a copy editor analysing how one particular person edits the interface strings of an app. You get pairs: the string as it ships, and the revision that person wrote for it.

Your job is to state, as rules, what that person consistently changes, so another writer can produce revisions they would accept.

Evidence rules:
- Describe a difference only when it appears in at least two pairs, or when it is unmistakable and consequential in one.
- Name the id for every rule, so it can be checked against the pair.
- Never claim a preference for a word or construction that does not appear in the revisions.
- Treat ids, placeholders, keys, product names and file extensions as fixed structure, not style.
- If the pairs show no consistent pattern, say so in one line and stop. Do not pad with general writing advice.

Output markdown only, in this order, with these exact headings:

## Voice
Two or three sentences on how these strings sound.

## Sentence shape
How the revisions differ in length, clause count and word order.

## Replacements
A markdown table with the header | Instead of | Write | Why | and four to twelve rows whose pairs come from the evidence.

## Length discipline
Whether the person cuts, keeps or expands, and by how much.

## Punctuation and capitalisation
Commas, full stops, dashes, case, contractions, exclamation marks.

## Never
Three to six things this person removed or would not write.

## Before and after
Two examples: id, shipped text, revision, and one line on what changed.

Stay under 700 words. No preamble, no closing summary, no score.`

export function buildStylePrompt({ app, context, pairs }) {
  const lines = [
    `App: ${app || 'unnamed application'}`,
    context ? `Context: ${context}` : '',
    `${pairs.length} pairs, one JSON object per line:`,
    ...pairs.map((pair) =>
      JSON.stringify({ id: pair.id, where: pair.where, shipped: pair.original, revision: pair.rewrite })
    )
  ].filter(Boolean)

  return { system: SYSTEM, user: lines.join('\n'), temperature: 0.3, maxTokens: 1800 }
}

/** Trims fences and makes sure the document starts with a title. */
export function tidyMarkdown(raw, app) {
  let text = String(raw ?? '').trim()
  text = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim()
  if (!text) return ''
  if (!/^#\s/.test(text)) text = `# House style: ${app || 'untitled app'}\n\n${text}`
  return `${text}\n`
}

export function profileFile(app) {
  return `${slug(app)}.md`
}

function frontmatter({ app, pairs, model, provider, created }) {
  return [
    '---',
    `app: ${app || 'untitled'}`,
    `pairs: ${pairs}`,
    `model: ${model}`,
    `provider: ${provider}`,
    `created: ${created}`,
    '---',
    ''
  ].join('\n')
}

export function saveProfile(dir, { app, markdown, pairs, model, provider }) {
  mkdirSync(dir, { recursive: true })
  const name = profileFile(app)
  const created = new Date().toISOString()
  const body = `${frontmatter({ app, pairs, model, provider, created })}${markdown}`
  const path = join(dir, name)
  writeFileSync(path, body)
  return { name, path, bytes: Buffer.byteLength(body), created }
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/

function readField(block, key) {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return match ? match[1].trim() : ''
}

export function listProfiles(dir) {
  if (!existsSync(dir)) return { dir, exists: false, files: [] }
  const files = []
  for (const entry of readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.md')) continue
    const path = join(dir, entry)
    try {
      const info = statSync(path)
      const text = readFileSync(path, 'utf8')
      const block = text.match(FRONTMATTER)?.[1] ?? ''
      // Only files the analyst wrote: a stray README in the folder is not a profile.
      if (!block) continue
      files.push({
        name: entry,
        app: readField(block, 'app') || basename(entry, '.md'),
        pairs: Number(readField(block, 'pairs')) || 0,
        model: readField(block, 'model'),
        created: readField(block, 'created'),
        bytes: info.size
      })
    } catch {
      /* skip unreadable files */
    }
  }
  files.sort((a, b) => String(b.created).localeCompare(String(a.created)))
  return { dir, exists: true, files }
}

export function readProfile(dir, name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw Object.assign(new Error('Missing profile name'), { status: 400 })
  }
  if (name.includes('\0') || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw Object.assign(new Error('Invalid profile name'), { status: 400 })
  }
  const file = name.toLowerCase().endsWith('.md') ? name : `${name}.md`
  const path = join(dir, file)
  if (!path.startsWith(dir + sep)) throw Object.assign(new Error('Invalid profile name'), { status: 400 })
  if (!existsSync(path)) throw Object.assign(new Error('That profile is gone'), { status: 404 })
  return { name: file, markdown: readFileSync(path, 'utf8'), bytes: statSync(path).size }
}
