// End-to-end smoke test against a running String Theory server.
// Starts an inline OpenAI-compatible stub, runs real polish calls through the
// server's provider path, checks usage accounting and the budget guard,
// then restores the config it changed.
//
//   node scripts/smoke.mjs            (server on 4317)
//   ST_URL=http://127.0.0.1:4317 node scripts/smoke.mjs

import { createServer } from 'node:http'
import { readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.ST_URL ?? 'http://127.0.0.1:4317'
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 4566)

let lastRequest = null
/** How the stub answers GET /models: a good catalogue, a dead key, or a key
 *  that may chat but not read the catalogue. */
let catalogue = 'ok'
let catalogueHits = 0

const mock = createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    if (req.method === 'GET') {
      catalogueHits += 1
      if (catalogue === '401') {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Incorrect API key provided.' } }))
        return
      }
      if (catalogue === 'limited') {
        res
          .writeHead(403, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: { message: 'Missing scopes: api.model.read.' } }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-5.6-luna' }] }))
      return
    }
    const payload = JSON.parse(raw || '{}')
    lastRequest = payload
    const user = payload.messages?.find((message) => message.role === 'user')?.content ?? ''
    const current = /^current: (.*)$/m.exec(user)?.[1] ?? ''
    const body = {
      model: payload.model,
      choices: [{ message: { role: 'assistant', content: `POLISHED ${current.trim()}` } }],
      usage: { prompt_tokens: 180, completion_tokens: 24 }
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
})

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

async function call(path, init) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body }
}

await new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve))

const health = await call('/api/health')
check('server is up', health.status === 200 && health.body?.ok === true)

const before = (await call('/api/usage')).body

// Point a priced provider at the stub so cost and budget accounting are exercised.
const savedConfig = (await call('/api/config')).body.config
// A crashed run leaves the budget guard's 1e-7 caps behind, and restoring them
// would brick polish for the operator. Treat an absurd cap as absent.
const saneUsd = (value, fallback) => (Number.isFinite(value) && value >= 0.01 ? value : fallback)
const configured = await call('/api/config', {
  method: 'PATCH',
  body: JSON.stringify({
    activeProvider: 'openai',
    model: 'gpt-4.1-mini',
    providerId: 'openai',
    endpoint: `http://127.0.0.1:${MOCK_PORT}/v1`,
    authModes: { ...(savedConfig.authModes ?? {}), openai: 'key' },
    dailyUsd: 5,
    monthlyUsd: 50
  })
})
check('config accepts provider and endpoint override', configured.status === 200)
check('endpoint override stored', configured.body?.config?.endpoints?.openai === `http://127.0.0.1:${MOCK_PORT}/v1`)

await call('/api/keys/openai', { method: 'PUT', body: JSON.stringify({ key: 'sk-smoke-test-key' }) })
const keyed = (await call('/api/config')).body
check('key stored and masked', keyed.keys?.openai?.present === true && keyed.keys.openai.hint.includes('••••'))

const polish = await call('/api/polish', {
  method: 'POST',
  body: JSON.stringify({
    app: 'Smoke Harness',
    mode: 'style',
    font: { family: 'Segoe UI', size: 14, weight: 400, letterSpacing: 0 },
    item: {
      id: 'smoke.title',
      text: 'Session Transcripts',
      where: 'Panel header, left of the refresh button',
      maxPx: 150,
      maxChars: null,
      px: 116
    }
  })
})

check('polish returns 200', polish.status === 200, `status ${polish.status}`)
check('model output is sanitised', polish.body?.text === 'POLISHED Session Transcripts', JSON.stringify(polish.body?.text))
check('prompt carries the location line', String(lastRequest?.messages?.[1]?.content ?? '').includes('Panel header'))
check('prompt carries the pixel budget', String(lastRequest?.messages?.[0]?.content ?? '').includes('150px'))
check('usage is priced', typeof polish.body?.usage?.costUsd === 'number' && polish.body.usage.costUsd > 0, `$${polish.body?.usage?.costUsd}`)
check('tokens recorded', polish.body?.usage?.inputTokens === 180 && polish.body?.usage?.outputTokens === 24)
check(
  'ledger gained one request',
  polish.body?.summary?.day?.requests === before.day.requests + 1,
  `${before.day.requests} -> ${polish.body?.summary?.day?.requests}`
)

// Changing a provider's endpoint is a credential change in disguise: the
// catalogue that came from the old host must be re-fetched, not reused.
const endpointRefresh = await call('/api/config', {
  method: 'PATCH',
  body: JSON.stringify({ providerId: 'openai', endpoint: `http://127.0.0.1:${MOCK_PORT}/v1` })
})
check(
  'changing the endpoint re-fetches the catalogue',
  endpointRefresh.body?.models?.providers?.openai?.ok === true,
  JSON.stringify(endpointRefresh.body?.models?.providers?.openai?.state)
)

// Model discovery through the provider adapter.
const models = await call('/api/providers/openai/models', { method: 'POST', body: JSON.stringify({}) })
check('models come from the provider', models.body?.source === 'remote' && models.body.models.includes('gpt-4.1-mini'))

// ---------------------------------------------------------------- catalogue cache
// The catalogue is data: fetched, cached on disk, and refreshed when it ages out
// or when a credential changes, with the listing doubling as the health check.
const dataDir = (await call('/api/health')).body.dataDir
const cachePath = join(dataDir, 'models-cache.json')
const cachedAfterKey = JSON.parse(readFileSync(cachePath, 'utf8'))
check(
  'saving a key fetched and cached the catalogue',
  cachedAfterKey.openai?.ok === true && cachedAfterKey.openai.models.includes('gpt-5.6-luna'),
  JSON.stringify(cachedAfterKey.openai?.models?.slice(0, 3))
)
check('the cache records when it was fetched', Boolean(Date.parse(cachedAfterKey.openai?.fetchedAt ?? '')))
check('the cache records the credential that proved it', cachedAfterKey.openai?.state === 'ok')

// A dead credential is a rejected check, not a silent empty picker.
catalogue = '401'
const rejected = await call('/api/providers/openai/models', { method: 'POST', body: JSON.stringify({}) })
const rejectedEntry = rejected.body?.modelsIndex?.providers?.openai
check('a 401 is reported as a rejected credential', rejectedEntry?.state === 'rejected', JSON.stringify(rejectedEntry?.state))
check('a rejected credential falls back to the curated list', rejectedEntry?.models?.length === 5, `${rejectedEntry?.models?.length} models`)
check('the rejection keeps the provider message', /401|Incorrect API key/.test(String(rejectedEntry?.error ?? '')), rejectedEntry?.error)

// A key allowed to polish but not to read the catalogue is a different fault.
catalogue = 'limited'
const limited = await call('/api/providers/openai/models', { method: 'POST', body: JSON.stringify({}) })
const limitedEntry = limited.body?.modelsIndex?.providers?.openai
check('a key without model.read is limited, not rejected', limitedEntry?.state === 'limited', JSON.stringify(limitedEntry?.state))
check('a limited key does not read as a dead key', limitedEntry?.state !== 'rejected')

// Back to a good catalogue, then prove the TTL drives an automatic refresh.
catalogue = 'ok'
await call('/api/providers/openai/models', { method: 'POST', body: JSON.stringify({}) })
const savedTtl = (await call('/api/config')).body.config.modelsTtlHours
await call('/api/config', { method: 'PATCH', body: JSON.stringify({ modelsTtlHours: 0 }) })
const hitsBefore = catalogueHits
await call('/api/config')
await new Promise((resolve) => setTimeout(resolve, 900))
await call('/api/config')
check('a stale catalogue is refreshed automatically on load', catalogueHits > hitsBefore, `${hitsBefore} -> ${catalogueHits} fetches`)
const warm = (await call('/api/config')).body.models?.providers?.openai
check('the payload carries the cached catalogue', warm?.ok === true && Array.isArray(warm.models), `${warm?.count} models`)
await call('/api/config', { method: 'PATCH', body: JSON.stringify({ modelsTtlHours: savedTtl }) })

// Deleting the credential drops the catalogue with it.
await call('/api/keys/openai', { method: 'DELETE' })
const afterDelete = JSON.parse(readFileSync(cachePath, 'utf8'))
check('deleting a key drops its catalogue', afterDelete.openai === undefined, JSON.stringify(Object.keys(afterDelete)))
// Put the harness key back for the checks that follow; the restore block at the
// end deletes it, so a run never leaves a junk credential in Settings.
await call('/api/keys/openai', { method: 'PUT', body: JSON.stringify({ key: '***' }) })

// Budget guard: shove both caps below the recorded spend.
await call('/api/config', { method: 'PATCH', body: JSON.stringify({ dailyUsd: 0.0000001, monthlyUsd: 0.0000001 }) })
const blocked = await call('/api/polish', {
  method: 'POST',
  body: JSON.stringify({ item: { id: 'again', text: 'Later', where: 'x', maxPx: 100, px: 40 } })
})
check('budget guard blocks the call', blocked.status === 402, `status ${blocked.status}`)

// Missing provider is reported clearly. Restore the budgets first so the
// cheaper budget guard does not answer before the credential check.
await call('/api/config', {
  method: 'PATCH',
  body: JSON.stringify({
    dailyUsd: saneUsd(savedConfig.dailyUsd, 1.5),
    monthlyUsd: saneUsd(savedConfig.monthlyUsd, 12),
    activeProvider: null
  })
})
const noProvider = await call('/api/polish', {
  method: 'POST',
  body: JSON.stringify({ item: { id: 'again', text: 'Later', where: 'x', maxPx: 100, px: 40 } })
})
check('missing provider is a 400 with a message', noProvider.status === 400 && /provider/i.test(noProvider.body?.error ?? ''))

// Style analyst: evidence rule, then a real run through the same provider path.
await call('/api/config', {
  method: 'PATCH',
  body: JSON.stringify({
    activeProvider: 'openai',
    model: 'gpt-4.1-mini',
    providerId: 'openai',
    endpoint: `http://127.0.0.1:${MOCK_PORT}/v1`
  })
})

const tooFew = await call('/api/style/run', {
  method: 'POST',
  body: JSON.stringify({
    app: 'Probe',
    context: 'test',
    pairs: [
      { id: 'a', where: 'x', original: 'Start', rewrite: 'Begin' },
      { id: 'b', where: 'y', original: 'Stop', rewrite: 'Halt' }
    ]
  })
})
check('style analyst refuses fewer than three pairs', tooFew.status === 400 && tooFew.body?.code === 'not-enough-pairs')

const styleRun = await call('/api/style/run', {
  method: 'POST',
  body: JSON.stringify({
    app: 'Smoke Probe',
    context: 'settings panel',
    pairs: [
      { id: 'a', where: 'x', original: 'Start recording', rewrite: 'Begin capture' },
      { id: 'b', where: 'y', original: 'Stop recording', rewrite: 'Stop' },
      { id: 'c', where: 'z', original: 'Save changes', rewrite: 'Save' }
    ]
  })
})
check(
  'style analyst returns a profile and saves it',
  styleRun.status === 200 && typeof styleRun.body?.markdown === 'string' && /profiles/.test(styleRun.body?.path ?? '')
)
check('style profile is a markdown document', /^#|^---/.test((styleRun.body?.markdown ?? '').trim()))

const listing = await call('/api/profiles')
check(
  'saved profile shows up in the listing',
  listing.status === 200 && (listing.body?.files ?? []).some((file) => file.name === styleRun.body?.name)
)

const oauth = await call('/api/oauth', {})
check(
  'oauth advertises the providers it can actually run',
  typeof oauth.body === 'object' && !Array.isArray(oauth.body)
)

// Restore.
await call('/api/keys/openai', { method: 'DELETE' })
if (styleRun.body?.path) {
  try {
    unlinkSync(styleRun.body.path)
  } catch {
    /* already gone */
  }
}
await call('/api/config', {
  method: 'PATCH',
  body: JSON.stringify({
    activeProvider: savedConfig.activeProvider,
    model: savedConfig.model,
    providerId: 'openai',
    endpoint: '',
    authModes: savedConfig.authModes ?? {},
    dailyUsd: saneUsd(savedConfig.dailyUsd, 1.5),
    monthlyUsd: saneUsd(savedConfig.monthlyUsd, 12)
  })
})

mock.close()
const failed = checks.filter((entry) => !entry.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
