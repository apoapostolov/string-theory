// The provider catalogues, kept as data instead of a hardcoded list.
//
// Every provider publishes its models at its own endpoint, and a curated array
// in this repository goes stale the week it is written: a new model is invisible
// until someone edits code and ships a release. So the catalogue is fetched,
// cached on disk, and re-fetched when it ages out or when credentials change.
//
// The fetch is also the health check. `GET /models` answers 200 only to a key
// the provider accepts, so a successful listing proves the credential works; a
// 401 is recorded as a failed check and never overwrites a good cache.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './store.mjs'
import { listModels } from './providers.mjs'

const CACHE_FILE = join(DATA_DIR, 'models-cache.json')
export const DEFAULT_TTL_HOURS = 24
/** A rejected credential is not retried on every keystroke in Settings. */
const FAILURE_BACKOFF_MS = 5 * 60 * 1000

/**
 * Why a fetch failed matters more than that it failed.
 *
 * A 401 is a dead credential. A 403 asking for `api.model.read` is a key that
 * works for polishing and is simply not allowed to read the catalogue, and an
 * OpenAI key issued for a project often has exactly that shape. Calling both of
 * them "rejected" would send the operator chasing a working key.
 */
function classify(error) {
  const upstream = Number(error?.upstreamStatus) || null
  if (upstream === 401) return 'rejected'
  if (error?.code === 'no-catalogue') return 'limited'
  if (upstream === 403 || upstream === 404 || upstream === 405) return 'limited'
  return 'unreachable'
}

/** One fetch per provider at a time: a key save and a page load often collide. */
const inflight = new Map()

function readCache() {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(value) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${CACHE_FILE}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmp, CACHE_FILE)
}

export function ttlMs(hours) {
  const value = Number(hours)
  if (!Number.isFinite(value)) return DEFAULT_TTL_HOURS * 3600_000
  if (value <= 0) return 0
  return value * 3600_000
}

export function entryFor(providerId) {
  return readCache()[providerId] ?? null
}

export function isStale(entry, ttlHours) {
  if (!entry) return true
  const ttl = ttlMs(ttlHours)
  if (!entry.ok) {
    // A failed check keeps the curated list but retries after a short backoff.
    const checked = Date.parse(entry.checkedAt ?? '') || 0
    return Date.now() - checked > FAILURE_BACKOFF_MS
  }
  if (!ttl) return true
  const fetched = Date.parse(entry.fetchedAt ?? '') || 0
  return Date.now() - fetched > ttl
}

export function dropProvider(providerId) {
  const cache = readCache()
  if (!(providerId in cache)) return
  delete cache[providerId]
  writeCache(cache)
}

/**
 * Fetch a provider's catalogue and cache it.
 *
 * Resolves with the entry either way: a failure is information the Settings panel
 * needs, not an exception the caller has to catch in four places.
 */
export function refreshModels(provider, { key = '', endpoint = '', auth = 'key', reason = 'manual' } = {}) {
  const existing = inflight.get(provider.id)
  if (existing) return existing

  const run = (async () => {
    const checkedAt = new Date().toISOString()
    try {
      const models = await listModels(provider, { key, endpoint, auth })
      if (!models?.length) {
        throw Object.assign(new Error(`${provider.label} returned an empty catalogue`), { code: 'empty-catalogue' })
      }
      const entry = {
        models,
        source: 'remote',
        ok: true,
        state: 'ok',
        fetchedAt: checkedAt,
        checkedAt,
        error: '',
        reason,
        count: models.length
      }
      writeCache({ ...readCache(), [provider.id]: entry })
      return entry
    } catch (error) {
      const previous = entryFor(provider.id)
      const state = classify(error)
      const keep = previous?.ok && state !== 'rejected'
      // A provider registered without a curated list still has to produce a
      // usable entry; the picker renders an empty catalogue rather than crashing.
      const curated = Array.isArray(provider.models) ? provider.models : []
      const entry = {
        // A 502 from the provider, or a key that cannot read the catalogue, must
        // not empty a picker that already held a good list. A rejected key does.
        models: keep ? previous.models : curated,
        source: keep ? previous.source : 'curated',
        ok: false,
        state,
        fetchedAt: keep ? previous.fetchedAt : null,
        checkedAt,
        error: error.message,
        status: error.status ?? null,
        upstreamStatus: error.upstreamStatus ?? null,
        reason,
        count: (keep ? previous.models : curated).length
      }
      writeCache({ ...readCache(), [provider.id]: entry })
      return entry
    } finally {
      inflight.delete(provider.id)
    }
  })()

  inflight.set(provider.id, run)
  return run
}

/** Refresh only when the cache is old, unless forced. */
export async function ensureModels(provider, { key, endpoint, auth, ttlHours, force = false } = {}) {
  const entry = entryFor(provider.id)
  if (!force && !isStale(entry, ttlHours)) return entry
  return refreshModels(provider, { key, endpoint, auth, reason: force ? 'manual' : 'stale' })
}

export function cacheSnapshot(ttlHours) {
  const cache = readCache()
  const providers = {}
  for (const [id, entry] of Object.entries(cache)) {
    providers[id] = { ...entry, stale: isStale(entry, ttlHours) }
  }
  return { ttlHours: Number(ttlHours ?? DEFAULT_TTL_HOURS), providers }
}
