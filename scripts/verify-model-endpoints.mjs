// Every provider must be able to answer "what models do you have".
//
// This is a live check: it asks each provider's catalogue endpoint with a
// deliberately invalid credential. A 401/403 means the endpoint and the header
// shape are right and only the key is missing; a 404 means the path is wrong and
// the picker would silently fall back to the curated list; a network error means
// the host is wrong. OpenRouter and the ChatGPT session are asked for real.
//
//   node scripts/verify-model-endpoints.mjs

import { PROVIDERS, listModels } from '../server/providers.mjs'
import { validAccessToken } from '../server/oauth.mjs'

const rows = []

function describe(error) {
  const status = Number(error?.upstreamStatus) || null
  if (status === 401 || status === 403) return { verdict: 'endpoint ok', detail: `${status}, credential refused as expected` }
  if (status === 404 || status === 405) return { verdict: 'WRONG PATH', detail: `${status}: ${error.message.slice(0, 90)}` }
  if (status) return { verdict: 'reachable', detail: `${status}: ${error.message.slice(0, 90)}` }
  return { verdict: 'UNREACHABLE', detail: String(error?.message ?? error).slice(0, 90) }
}

for (const provider of PROVIDERS) {
  const label = provider.label
  try {
    // A syntactically valid but unissued credential: we want the auth answer,
    // not a schema answer.
    const models = await listModels(provider, { endpoint: '', key: 'st-probe-invalid-key', auth: 'key' })
    rows.push({ label, verdict: 'live, no credential needed', detail: `${models.length} models` })
  } catch (error) {
    rows.push({ label, ...describe(error) })
  }
}

// A public catalogue is a real end-to-end read of the OpenAI-compatible path.
try {
  const openrouter = PROVIDERS.find((provider) => provider.id === 'openrouter')
  const models = await listModels(openrouter, { endpoint: '', key: '', auth: 'key' })
  rows.push({ label: 'OpenRouter (public read)', verdict: 'live', detail: `${models.length} models, first ${models[0]}` })
} catch (error) {
  rows.push({ label: 'OpenRouter (public read)', verdict: 'FAILED', detail: String(error.message).slice(0, 90) })
}

// The ChatGPT session is the case that used to be impossible.
try {
  const token = await validAccessToken('openai')
  if (!token) {
    rows.push({ label: 'ChatGPT session', verdict: 'no session', detail: 'sign in to check' })
  } else {
    const openai = PROVIDERS.find((provider) => provider.id === 'openai')
    const models = await listModels(openai, { endpoint: '', key: token, auth: 'oauth' })
    rows.push({ label: 'ChatGPT session', verdict: 'live', detail: `${models.length} models, first ${models[0]}` })
  }
} catch (error) {
  rows.push({ label: 'ChatGPT session', ...describe(error) })
}

const width = Math.max(...rows.map((row) => row.label.length))
for (const row of rows) {
  console.log(`${row.label.padEnd(width)}  ${row.verdict.padEnd(28)} ${row.detail}`)
}
