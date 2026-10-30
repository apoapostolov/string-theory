// Local persistence: config, encrypted provider keys, usage ledger.
// Nothing here leaves the machine except the provider calls themselves.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = resolve(process.env.ST_DATA_DIR ?? join(HERE, '..', 'data'))

const CONFIG_FILE = join(DATA_DIR, 'config.json')
const KEYS_FILE = join(DATA_DIR, 'keys.enc.json')
const USAGE_FILE = join(DATA_DIR, 'usage.json')
const MASTER_FILE = join(DATA_DIR, 'master.key')

const CONFIG_DEFAULTS = {
  activeProvider: null,
  model: '',
  mode: 'style',
  warnRatio: 0.9,
  dailyUsd: 1.5,
  monthlyUsd: 12,
  endpoints: {},
  polishPrompt: '',
  contextLine: true,
  inboxDir: ''
}

function ensureData() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  ensureData()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}

let queue = Promise.resolve()
function serialised(fn) {
  const next = queue.then(fn, fn)
  queue = next.catch(() => {})
  return next
}

function masterKey() {
  ensureData()
  if (existsSync(MASTER_FILE)) {
    const raw = readFileSync(MASTER_FILE, 'utf8').trim()
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  }
  const key = randomBytes(32)
  writeFileSync(MASTER_FILE, `${key.toString('hex')}\n`, 'utf8')
  try {
    chmodSync(MASTER_FILE, 0o600)
  } catch {
    /* Windows ACLs; chmod is best effort */
  }
  return key
}

function seal(plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64')
  }
}

function open(record) {
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(record.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(record.ct, 'base64')),
    decipher.final()
  ]).toString('utf8')
}

// ---------------------------------------------------------------- config

export function getConfig() {
  const saved = readJson(CONFIG_FILE, {})
  return { ...CONFIG_DEFAULTS, ...saved, endpoints: { ...(saved.endpoints ?? {}) } }
}

export function patchConfig(patch) {
  return serialised(() => {
    const current = getConfig()
    const next = { ...current }
    for (const key of Object.keys(CONFIG_DEFAULTS)) {
      if (patch[key] !== undefined) next[key] = patch[key]
    }
    if (patch.providerId && patch.endpoint !== undefined) {
      const clean = String(patch.endpoint).trim()
      next.endpoints = { ...next.endpoints }
      if (clean) next.endpoints[patch.providerId] = clean
      else delete next.endpoints[patch.providerId]
    }
    writeJson(CONFIG_FILE, next)
    return next
  })
}

export function endpointFor(providerId, fallback) {
  const saved = getConfig().endpoints?.[providerId]
  return saved && String(saved).trim() ? String(saved).trim() : fallback
}

// ---------------------------------------------------------------- keys

function readKeyFile() {
  return readJson(KEYS_FILE, {})
}

export function hasKey(providerId) {
  return Boolean(readKeyFile()[providerId]?.ct)
}

export function getKey(providerId) {
  const record = readKeyFile()[providerId]
  if (!record?.ct) return ''
  try {
    return open(record)
  } catch {
    return ''
  }
}

export function setKey(providerId, key) {
  return serialised(() => {
    const all = readKeyFile()
    all[providerId] = seal(String(key).trim())
    writeJson(KEYS_FILE, all)
  })
}

export function deleteKey(providerId) {
  return serialised(() => {
    const all = readKeyFile()
    delete all[providerId]
    writeJson(KEYS_FILE, all)
  })
}

export function keyHints() {
  const out = {}
  for (const [providerId, record] of Object.entries(readKeyFile())) {
    if (!record?.ct) continue
    try {
      const raw = open(record)
      out[providerId] = { present: true, hint: maskKey(raw) }
    } catch {
      out[providerId] = { present: false, hint: '' }
    }
  }
  return out
}

function maskKey(key) {
  if (key.length <= 10) return '•'.repeat(key.length)
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(12, key.length - 8))}${key.slice(-4)}`
}

// ---------------------------------------------------------------- usage

const MAX_ENTRIES = 5000

export function recordUsage(entry) {
  return serialised(() => {
    const ledger = readJson(USAGE_FILE, { entries: [] })
    ledger.entries.push(entry)
    if (ledger.entries.length > MAX_ENTRIES) {
      ledger.entries = ledger.entries.slice(ledger.entries.length - MAX_ENTRIES)
    }
    writeJson(USAGE_FILE, ledger)
    return entry
  })
}

function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function usageSummary() {
  const { entries } = readJson(USAGE_FILE, { entries: [] })
  const now = new Date()
  const today = dayKey(now)
  const month = today.slice(0, 7)
  const blank = () => ({ requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, unpriced: 0 })
  const day = blank()
  const monthTotals = blank()
  const byProvider = {}

  for (const entry of entries) {
    const stamp = new Date(entry.ts)
    const buckets = []
    if (dayKey(stamp) === today) buckets.push(day)
    if (dayKey(stamp).slice(0, 7) === month) buckets.push(monthTotals)
    for (const bucket of buckets) {
      bucket.requests += 1
      bucket.inputTokens += entry.inputTokens ?? 0
      bucket.outputTokens += entry.outputTokens ?? 0
      if (typeof entry.costUsd === 'number') bucket.costUsd += entry.costUsd
      else bucket.unpriced += 1
    }
    if (dayKey(stamp).slice(0, 7) === month) {
      const key = entry.provider ?? 'unknown'
      byProvider[key] ??= { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
      byProvider[key].requests += 1
      byProvider[key].inputTokens += entry.inputTokens ?? 0
      byProvider[key].outputTokens += entry.outputTokens ?? 0
      if (typeof entry.costUsd === 'number') byProvider[key].costUsd += entry.costUsd
    }
  }

  return {
    day,
    month: monthTotals,
    byProvider,
    recent: entries.slice(-12).reverse()
  }
}
