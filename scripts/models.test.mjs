// Unit checks for the model catalogue: freshness rules, failure classification,
// and the header each credential shape sends. No server, no network.
//
//   node scripts/models.test.mjs

import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The cache writes into the data dir, so point it at a throwaway one before the
// module loads. store.mjs reads ST_DATA_DIR at import time.
const sandbox = mkdtempSync(join(tmpdir(), 'st-models-'))
process.env.ST_DATA_DIR = sandbox

const { listModels } = await import('../server/providers.mjs')
const { isStale, refreshModels, ensureModels, cacheSnapshot, entryFor, dropProvider, ttlMs } = await import(
  '../server/models-cache.mjs'
)

const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---------------------------------------------------------------- freshness
const now = new Date().toISOString()
const older = new Date(Date.now() - 26 * 3600_000).toISOString()
const recent = new Date(Date.now() - 60_000).toISOString()

check('no entry is stale', isStale(null, 24))
check('an entry inside the window is fresh', !isStale({ ok: true, fetchedAt: recent }, 24))
check('an entry past the window is stale', isStale({ ok: true, fetchedAt: older }, 24))
check('zero hours means always stale', isStale({ ok: true, fetchedAt: now }, 0))
check('a failure retries after its backoff, not before', !isStale({ ok: false, checkedAt: now }, 24))
check(
  'a failure older than the backoff is retried',
  isStale({ ok: false, checkedAt: new Date(Date.now() - 6 * 60_000).toISOString() }, 24)
)
check('a real TTL converts to hours', ttlMs(6) === 6 * 3600_000)

// ---------------------------------------------------------------- a stub provider
let mode = 'ok'
let seen = []
const stub = createServer((req, res) => {
  seen.push({ url: req.url, headers: req.headers })
  const send = (status, body) =>
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  if (mode === '401') return send(401, { error: { message: 'Incorrect API key provided.' } })
  if (mode === 'limited') return send(403, { error: { message: 'Missing scopes: api.model.read.' } })
  if (mode === 'down') return res.destroy()
  return send(200, { data: [{ id: 'gpt-5.6-luna' }, { id: 'gpt-4.1-mini' }] })
})
await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${stub.address().port}`

const openai = { id: 'openai', label: 'OpenAI', kind: 'openai', endpoint: base, models: ['curated-model', 'curated-other'] }
const anthropic = { id: 'anthropic', label: 'Anthropic', kind: 'anthropic', endpoint: base, models: ['curated-model'] }
const gemini = { id: 'gemini', label: 'Gemini', kind: 'gemini', endpoint: base }

// ---------------------------------------------------------------- happy path
const good = await listModels(openai, { key: 'sk-test', endpoint: base })
check('an OpenAI-compatible catalogue is read', good.join(',') === 'gpt-4.1-mini,gpt-5.6-luna', good.join(','))
check('the key travels as a bearer token', seen.at(-1)?.headers?.authorization === 'Bearer sk-test')

// ---------------------------------------------------------------- failure shapes
await listModels(openai, { key: 'sk-test', endpoint: base }).catch(() => {})
const entry = await refreshModels(openai, { key: 'sk-test', endpoint: base, reason: 'test' })
check('a good fetch is cached as ok', entry.ok === true && entry.state === 'ok', JSON.stringify(entry.state))
check('the cache records the count', entry.count === 2, String(entry.count))
check('the cache round-trips through disk', entryFor('openai')?.models?.length === 2)

mode = '401'
const rejected = await refreshModels(openai, { key: 'sk-test', endpoint: base, reason: 'test' })
check('a 401 is a rejected credential', rejected.state === 'rejected', rejected.state)
check('a rejected credential drops the cached list', rejected.source === 'curated' && rejected.models.includes('curated-model'), rejected.models.join(','))
check('the provider message survives', /Incorrect API key/.test(rejected.error), rejected.error.slice(0, 40))

mode = 'limited'
const limited = await refreshModels(openai, { key: 'sk-test', endpoint: base, reason: 'test' })
check('a 403 on the catalogue is limited, not rejected', limited.state === 'limited', limited.state)

mode = 'down'
const down = await refreshModels(openai, { key: 'sk-test', endpoint: base, reason: 'test' })
check('an unreachable provider is its own state', down.state === 'unreachable', down.state)

// ---------------------------------------------------------------- a good cache survives a bad check
process.env.ST_DATA_DIR = sandbox
mode = 'ok'
await refreshModels(anthropic, { key: 'sk-ant', endpoint: base, reason: 'test' })
mode = 'down'
const kept = await refreshModels(anthropic, { key: 'sk-ant', endpoint: base, reason: 'test' })
check('a temporary failure keeps the last good catalogue', kept.models.length === 2 && kept.fetchedAt !== null, kept.source)

// ---------------------------------------------------------------- credential shapes
mode = 'ok'
seen = []
await listModels(anthropic, { key: 'sk-ant', endpoint: base, auth: 'key' })
check('an Anthropic key uses x-api-key', seen.at(-1)?.headers?.['x-api-key'] === 'sk-ant')
check('an Anthropic key sends no bearer', seen.at(-1)?.headers?.authorization === undefined)

await listModels(anthropic, { key: 'session-token', endpoint: base, auth: 'oauth' })
check('a Claude session uses a bearer token', seen.at(-1)?.headers?.authorization === 'Bearer session-token')
check('a Claude session sends the oauth beta header', seen.at(-1)?.headers?.['anthropic-beta'] === 'oauth-2025-04-20')
check('a Claude session sends no api key header', seen.at(-1)?.headers?.['x-api-key'] === undefined)

let codexError = null
try {
  await listModels({ id: 'openai', label: 'OpenAI', kind: 'openai', endpoint: base }, { key: 'tok', auth: 'oauth' })
} catch (error) {
  codexError = error
}
check('a ChatGPT session has no catalogue to read', codexError?.code === 'no-catalogue', codexError?.message?.slice(0, 40))

seen = []
await listModels(gemini, { key: 'AIza', endpoint: base })
check('Gemini sends its key in the query', String(seen.at(-1)?.url).includes('key=AIza'), seen.at(-1)?.url)

// ---------------------------------------------------------------- ttl-driven ensure
mode = 'ok'
const before = (await refreshModels(gemini, { key: 'AIza', endpoint: base, reason: 'test' })).count
const fresh = await ensureModels(gemini, { key: 'AIza', endpoint: base, ttlHours: 24 })
check('ensure returns the cache while it is fresh', fresh.count === before && fresh.reason === 'test')
const forced = await ensureModels(gemini, { key: 'AIza', endpoint: base, ttlHours: 24, force: true })
check('force ignores the cache', forced.reason === 'manual' || forced.reason === 'stale', forced.reason)

// ---------------------------------------------------------------- snapshot and drop
const snapshot = cacheSnapshot(24)
check('the snapshot lists the cached providers', Object.keys(snapshot.providers).length >= 2, Object.keys(snapshot.providers).join(','))
check('the snapshot says how stale each entry is', typeof snapshot.providers.openai?.stale === 'boolean')
check('the snapshot carries the ttl in force', snapshot.ttlHours === 24)

dropProvider('openai')
check('dropping a provider removes its entry', entryFor('openai') === null)
check('dropping leaves the others alone', entryFor('gemini') !== null)

stub.close()
rmSync(sandbox, { recursive: true, force: true })
check('the sandbox leaves nothing behind', !existsSync(join(sandbox, 'models-cache.json')))

const failed = checks.filter((entry) => !entry.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
