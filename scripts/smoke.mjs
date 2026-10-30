// End-to-end smoke test against a running String Theory server.
// Starts an inline OpenAI-compatible stub, runs real polish calls through the
// server's provider path, checks usage accounting and the budget guard,
// then restores the config it changed.
//
//   node scripts/smoke.mjs            (server on 4317)
//   ST_URL=http://127.0.0.1:4317 node scripts/smoke.mjs

import { createServer } from 'node:http'
import { unlinkSync } from 'node:fs'

const BASE = process.env.ST_URL ?? 'http://127.0.0.1:4317'
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 4566)

let lastRequest = null

const mock = createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }] }))
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

// Model discovery through the provider adapter.
const models = await call('/api/providers/openai/models', { method: 'POST', body: JSON.stringify({}) })
check('models come from the provider', models.body?.source === 'remote' && models.body.models.includes('gpt-4.1-mini'))

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
  body: JSON.stringify({ dailyUsd: savedConfig.dailyUsd, monthlyUsd: savedConfig.monthlyUsd, activeProvider: null })
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
    dailyUsd: savedConfig.dailyUsd,
    monthlyUsd: savedConfig.monthlyUsd
  })
})

mock.close()
const failed = checks.filter((entry) => !entry.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
