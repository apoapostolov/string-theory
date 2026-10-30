// String Theory local server: static client, provider proxy, usage ledger.
// Binds to loopback only. Provider keys never reach the browser.

import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { PROVIDERS, chat, getProvider, listModels, publicProvider } from './providers.mjs'
import { ensureInbox, listInbox, readInboxFile, resolveInbox } from './inbox.mjs'
import { estimateCost } from './pricing.mjs'
import { buildPrompt, getMode, modeList, sanitiseOutput } from './polish.mjs'
import {
  DATA_DIR,
  deleteKey,
  endpointFor,
  getConfig,
  getKey,
  hasKey,
  keyHints,
  patchConfig,
  recordUsage,
  setKey,
  usageSummary
} from './store.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(HERE, '..', 'dist')
const HOST = process.env.ST_HOST ?? '127.0.0.1'
const PORT = Number(process.env.ST_PORT ?? 4317)
const VERSION = '0.1.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  })
  res.end(body)
}

function fail(res, status, message, code) {
  json(res, status, { error: message, code: code ?? null })
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(raw))
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function configPayload() {
  const config = getConfig()
  return {
    config: {
      ...config,
      keys: undefined
    },
    providers: PROVIDERS.map(publicProvider),
    keys: keyHints(),
    usage: usageSummary(),
    modes: modeList(),
    inbox: { dir: resolveInbox(config.inboxDir) }
  }
}

async function resolveCredentials(bodyProvider) {
  const config = getConfig()
  const providerId = bodyProvider ?? config.activeProvider
  const provider = getProvider(providerId)
  if (!provider) {
    throw Object.assign(new Error('No AI provider selected. Open Settings and connect one.'), {
      status: 400,
      code: 'no-provider'
    })
  }
  const key = getKey(provider.id)
  if (provider.needsKey && !key) {
    throw Object.assign(
      new Error(`${provider.label} needs an API key before it can polish.`),
      { status: 400, code: 'no-key' }
    )
  }
  return {
    provider,
    key,
    endpoint: endpointFor(provider.id, provider.endpoint),
    model: config.model || provider.models[0]
  }
}

async function handlePolish(body) {
  const item = body.item
  if (!item || typeof item.text !== 'string' || !item.text.trim()) {
    throw Object.assign(new Error('polish needs an item with text'), {
      status: 400,
      code: 'bad-item'
    })
  }

  const config = getConfig()
  const summary = usageSummary()
  if (config.dailyUsd > 0 && summary.day.costUsd >= config.dailyUsd) {
    throw Object.assign(
      new Error(
        `Daily budget reached: $${summary.day.costUsd.toFixed(4)} of $${Number(config.dailyUsd).toFixed(2)}. Raise it in Settings or wait for tomorrow.`
      ),
      { status: 402, code: 'budget' }
    )
  }
  if (config.monthlyUsd > 0 && summary.month.costUsd >= config.monthlyUsd) {
    throw Object.assign(
      new Error(
        `Monthly budget reached: $${summary.month.costUsd.toFixed(2)} of $${Number(config.monthlyUsd).toFixed(2)}. Raise it in Settings.`
      ),
      { status: 402, code: 'budget' }
    )
  }

  const { provider, key, endpoint, model: configModel } = await resolveCredentials(body.providerId)
  const model = String(body.model || configModel || provider.models[0])
  const mode = body.mode ?? config.mode ?? 'style'
  const prompt = buildPrompt({
    item,
    mode,
    app: body.app,
    font: body.font,
    contextLine: config.contextLine,
    extraPrompt: config.polishPrompt
  })

  const result = await chat(provider, {
    endpoint,
    key,
    model,
    system: prompt.system,
    user: prompt.user,
    temperature: prompt.temperature,
    maxTokens: 600
  })

  const text = sanitiseOutput(result.text, item.text)
  if (!text) {
    throw Object.assign(new Error(`${provider.label} returned an empty string.`), {
      status: 502,
      code: 'empty'
    })
  }

  const costUsd = estimateCost(provider.id, model, result.inputTokens, result.outputTokens)
  const entry = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    provider: provider.id,
    model,
    mode,
    stringId: item.id ?? '',
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd,
    ms: result.ms
  }
  await recordUsage(entry)

  return {
    text,
    provider: provider.id,
    model,
    mode,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      ms: result.ms
    },
    summary: usageSummary(),
    promptChars: prompt.system.length + prompt.user.length
  }
}

async function routes(req, res, url) {
  const { pathname } = url
  const method = req.method ?? 'GET'

  if (pathname === '/api/health') {
    return json(res, 200, { ok: true, version: VERSION, dataDir: DATA_DIR })
  }

  if (pathname === '/api/config' && method === 'GET') {
    return json(res, 200, configPayload())
  }

  if (pathname === '/api/config' && method === 'PATCH') {
    const body = await readBody(req)
    await patchConfig(body)
    return json(res, 200, configPayload())
  }

  if (pathname === '/api/usage' && method === 'GET') {
    return json(res, 200, usageSummary())
  }

  if (pathname === '/api/files' && method === 'GET') {
    const dir = resolveInbox(getConfig().inboxDir)
    return json(res, 200, listInbox(dir))
  }

  if (pathname === '/api/files/open' && method === 'GET') {
    const dir = resolveInbox(getConfig().inboxDir)
    return json(res, 200, readInboxFile(dir, url.searchParams.get('id') ?? ''))
  }

  const keyMatch = pathname.match(/^\/api\/keys\/([a-z0-9-]+)$/)
  if (keyMatch) {
    const provider = getProvider(keyMatch[1])
    if (!provider) return fail(res, 404, 'Unknown provider')
    if (method === 'PUT') {
      const body = await readBody(req)
      const key = String(body.key ?? '').trim()
      if (!key) return fail(res, 400, 'Empty key')
      if (key.length > 4000) return fail(res, 400, 'Key looks wrong')
      await setKey(provider.id, key)
      return json(res, 200, configPayload())
    }
    if (method === 'DELETE') {
      await deleteKey(provider.id)
      return json(res, 200, configPayload())
    }
  }

  const modelsMatch = pathname.match(/^\/api\/providers\/([a-z0-9-]+)\/models$/)
  if (modelsMatch && method === 'POST') {
    const provider = getProvider(modelsMatch[1])
    if (!provider) return fail(res, 404, 'Unknown provider')
    const body = await readBody(req)
    const key = String(body.key ?? '').trim() || getKey(provider.id)
    if (provider.needsKey && !key) {
      return json(res, 200, {
        models: provider.models,
        source: 'curated',
        message: 'Add a key to query the provider catalogue.'
      })
    }
    try {
      const endpoint = endpointFor(provider.id, provider.endpoint)
      const models = await listModels(provider, { endpoint, key })
      if (!models.length) {
        return json(res, 200, {
          models: provider.models,
          source: 'curated',
          message: 'Provider returned no models; showing the curated list.'
        })
      }
      return json(res, 200, { models, source: 'remote', message: `${models.length} models from ${provider.label}` })
    } catch (error) {
      return json(res, 200, {
        models: provider.models,
        source: 'curated',
        message: `${error.message}. Showing the curated list.`
      })
    }
  }

  if (pathname === '/api/polish' && method === 'POST') {
    const body = await readBody(req)
    const payload = await handlePolish(body)
    return json(res, 200, payload)
  }

  if (pathname.startsWith('/api/')) {
    return fail(res, 404, `No route for ${method} ${pathname}`)
  }

  return serveStatic(req, res, pathname)
}

function serveStatic(req, res, pathname) {
  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Client build missing. Run `npm run build` (or `npm run dev` for the Vite dev server).')
    return
  }
  const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^([/\\])+/, '')
  let file = join(DIST, relative)
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html')
  }
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, {
    'content-type': type,
    'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable'
  })
  createReadStream(file).pipe(res)
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`)
  routes(req, res, url).catch((error) => {
    const status = error.status ?? 500
    if (status >= 500) console.error('[string-theory]', error)
    if (!res.headersSent) fail(res, status, error.message ?? 'Server error', error.code)
    else res.end()
  })
})

server.listen(PORT, HOST, () => {
  const config = getConfig()
  const modeText = getMode(config.mode).label
  const inbox = resolveInbox(config.inboxDir)
  const created = ensureInbox(inbox)
  console.log(`String Theory ${VERSION}`)
  console.log(`  http://${HOST}:${PORT}`)
  console.log(`  data ${DATA_DIR}`)
  console.log(`  inbox ${inbox}${created ? ' (created)' : ''}`)
  console.log(`  ${PROVIDERS.length} providers, default pass ${modeText}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
