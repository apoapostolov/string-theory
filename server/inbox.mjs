// The inbox: a folder of exports written by other projects and agents.
// Every file is parsed with the same loader the client uses, so a listing can
// show the app name, the string count and whether the file is broken before
// anyone opens it.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseExport } from '../shared/parse-export.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_INBOX = join(ROOT, 'inbox')

const MAX_FILES = 400
const MAX_BYTES = 8 * 1024 * 1024
const MAX_DEPTH = 3
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'data'])

export function resolveInbox(configured) {
  const value = String(configured ?? '').trim()
  if (!value) return DEFAULT_INBOX
  return resolve(ROOT, value)
}

export function ensureInbox(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    return true
  }
  return false
}

function walk(dir, base, depth, out) {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, base, depth + 1, out)
      continue
    }
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue
    out.push(full)
  }
}

function describe(file, dir) {
  const rel = relative(dir, file)
  const id = rel.split(sep).join('/')
  const name = basename(file)
  const entry = {
    id,
    name,
    group: dirname(id) === '.' ? '' : dirname(id),
    bytes: 0,
    mtime: 0,
    app: '',
    version: '',
    surface: 'app',
    source: '',
    order: null,
    title: '',
    count: 0,
    errors: 0,
    warnings: 0,
    broken: ''
  }
  try {
    const info = statSync(file)
    entry.bytes = info.size
    entry.mtime = info.mtimeMs
    if (info.size > MAX_BYTES) {
      entry.broken = `File is ${(info.size / 1024 / 1024).toFixed(1)} MB; the inbox reads files up to ${MAX_BYTES / 1024 / 1024} MB.`
      entry.errors = 1
      return entry
    }
    const parsed = parseExport(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), name)
    entry.app = parsed.app
    entry.version = parsed.version
    entry.count = parsed.rows.length
    // Which surface the file belongs to, and where it sits in a project's
    // reading order, so a listing can be grouped by project without loading it.
    entry.surface = parsed.surface === 'docs' ? 'docs' : 'app'
    entry.source = parsed.source ?? ''
    entry.order = parsed.order ?? null
    entry.title = parsed.title ?? ''
    entry.errors = parsed.issues.filter((issue) => issue.level === 'error').length
    entry.warnings = parsed.issues.filter((issue) => issue.level === 'warn').length
  } catch (error) {
    entry.broken = `Cannot read: ${error.message}`
    entry.errors = 1
  }
  return entry
}

export function listInbox(dir) {
  const exists = existsSync(dir)
  if (!exists) return { dir, exists: false, files: [] }
  const paths = []
  walk(dir, dir, 0, paths)
  const files = paths.map((file) => describe(file, dir))
  files.sort((a, b) => b.mtime - a.mtime)
  return { dir, exists: true, files }
}

export function readInboxFile(dir, id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw Object.assign(new Error('Missing file id'), { status: 400 })
  }
  if (id.includes('\0')) throw Object.assign(new Error('Invalid file id'), { status: 400 })
  const full = resolve(dir, id)
  const root = resolve(dir)
  if (full !== root && !full.startsWith(root + sep)) {
    throw Object.assign(new Error('File id escapes the inbox'), { status: 400, code: 'outside-inbox' })
  }
  if (!/\.json$/i.test(full)) {
    throw Object.assign(new Error('Only .json exports can be opened'), { status: 400 })
  }
  if (!existsSync(full)) {
    throw Object.assign(new Error('That file is gone. Rescan the inbox.'), { status: 404, code: 'missing' })
  }
  const info = statSync(full)
  if (info.size > MAX_BYTES) {
    throw Object.assign(new Error('File is larger than the inbox limit.'), { status: 413 })
  }
  const text = readFileSync(full, 'utf8').replace(/^\uFEFF/, '')
  let json
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw Object.assign(new Error(`Invalid JSON: ${error.message}`), { status: 422, code: 'bad-json' })
  }
  return {
    id: relative(dir, full).split(sep).join('/'),
    name: basename(full),
    dir,
    bytes: info.size,
    mtime: info.mtimeMs,
    json
  }
}
