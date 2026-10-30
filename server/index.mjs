// String Theory local server: static client, provider proxy, usage ledger.
// Binds to loopback only. Provider keys never reach the browser.

import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { PROVIDERS, chat, getProvider, listModels, publicProvider } from './providers.mjs'
import { ensureInbox, listInbox, readInboxFile, resolveInbox } from './inbox.mjs'
import { disconnect, importToken, oauthConfig, pollDeviceFlow, publicOAuthProviders, startDeviceFlow, validAccessToken } from './oauth.mjs'
import { estimateCost } from './pricing.mjs'
import { buildPrompt, getMode, modeList, sanitiseOutput } from './polish.mjs'
import {
  buildStylePrompt,
  listProfiles,
  MIN_PAIRS,
  readProfile,
  saveProfile,
  selectPairs,
  tidyMarkdown
} from './style.mjs'
import {
  DATA_DIR,
  deleteKey,
  endpointFor,
  getConfig,
  getKey,
  hasKey,
  keyHints,
  oauthHints,
  patchConfig,
  recordUsage,
  setKey,
  usageSummary
} from './store.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DIST = resolve(HERE, '..', 'dist')
const PROFILES = join(ROOT, 'profiles')
const HOST = process.env.ST_HOST ?? '127.0.0.1'
const PORT = Number(process.env.ST_PORT ?? 4317)
const VERSION = '0.1.0'

function stylesDir() {
  const configured = String(getConfig().styleDir ?? '').trim()
  return configured ? resolve(ROOT, configured) : PROFILES
}

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
    inbox: { dir: resolveInbox(config.inboxDir) },
    profiles: { dir: stylesDir() },
    oauth: { providers: publicOAuthProviders(), sessions: oauthHints() }
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

  const endpoint = endpointFor(provider.id, provider.endpoint)
  const model = config.model || provider.models[0]
  const oauth = oauthConfig(provider.id)
  const explicit = config.authModes?.[provider.id]
  const mode = explicit === 'key' || explicit === 'oauth' ? explicit : oauth ? 'auto' : 'key'

  // A signed-in session wins over an API key unless the operator pinned the key.
  if (oauth && mode !== 'key') {
    const token = await validAccessToken(provider.id)
    if (token) return { provider, key: token, endpoint, model, auth: 'oauth' }
    if (mode === 'oauth') {
      throw Object.assign(
        new Error(`${provider.label} sign-in has expired. Reconnect it in Settings, or switch to an API key.`),
        { status: 401, code: 'oauth-expired' }
      )
    }
  }

  const key = getKey(provider.id)
  if (provider.needsKey && !key) {
    throw Object.assign(
      new Error(
        oauth
          ? `${provider.label} needs an API key or a sign-in before it can polish.`
          : `${provider.label} needs an API key before it can polish.`
      ),
      { status: 400, code: 'no-key' }
    )
  }
  return { provider, key, endpoint, model, auth: 'key' }
}

function assertBudget(config) {
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
  assertBudget(config)

  const { provider, key, endpoint, model: configModel, auth } = await resolveCredentials(body.providerId)
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
  }).catch((error) => {
    // A rejected OAuth token looks like any other 401; say which one it is.
    if (auth === 'oauth' && (error.status === 401 || error.status === 403)) {
      throw Object.assign(
        new Error(`${provider.label} rejected the sign-in. Reconnect it in Settings, or switch to an API key.`),
        { status: 401, code: 'oauth-rejected' }
      )
    }
    throw error
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

/**
 * Builds a house-style profile from the pairs the operator has finished.
 * Deliberately whole-file: it is a deliberate, reviewable spend, not a per-row
 * button, and it never touches the strings themselves.
 */
async function handleStyleRun(body) {
  const pairs = selectPairs(body?.pairs)
  if (pairs.length < MIN_PAIRS) {
    throw Object.assign(
      new Error(`Mark at least ${MIN_PAIRS} rewrites as completed first: the analyst needs evidence to compare.`),
      { status: 400, code: 'not-enough-pairs' }
    )
  }

  const config = getConfig()
  assertBudget(config)

  const { provider, key, endpoint, model: configModel } = await resolveCredentials(body.providerId)
  const model = String(body.model || configModel || provider.models[0])
  const prompt = buildStylePrompt({ app: body.app, context: body.context, pairs })

  const result = await chat(provider, {
    endpoint,
    key,
    model,
    system: prompt.system,
    user: prompt.user,
    temperature: prompt.temperature,
    maxTokens: prompt.maxTokens
  })

  const markdown = tidyMarkdown(result.text, body.app)
  if (!markdown) {
    throw Object.assign(new Error(`${provider.label} returned an empty profile.`), { status: 502, code: 'empty' })
  }

  const saved = saveProfile(stylesDir(), {
    app: body.app,
    markdown,
    pairs: pairs.length,
    model,
    provider: provider.id
  })

  const costUsd = estimateCost(provider.id, model, result.inputTokens, result.outputTokens)
  await recordUsage({
    id: randomUUID(),
    ts: new Date().toISOString(),
    provider: provider.id,
    model,
    mode: 'style-profile',
    stringId: `profile:${saved.name}`,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd,
    ms: result.ms
  })

  return {
    markdown,
    path: saved.path,
    name: saved.name,
    pairs: pairs.length,
    provider: provider.id,
    model,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      ms: result.ms
    },
    summary: usageSummary()
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

  if (pathname === '/api/style/run' && method === 'POST') {
    const body = await readBody(req)
    return json(res, 200, await handleStyleRun(body))
  }

  if (pathname === '/api/profiles' && method === 'GET') {
    return json(res, 200, listProfiles(stylesDir()))
  }

  const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/)
  if (profileMatch && method === 'GET') {
    return json(res, 200, readProfile(stylesDir(), decodeURIComponent(profileMatch[1])))
  }

  const deviceStart = pathname.match(/^\/api\/oauth\/([a-z0-9-]+)\/device$/)
  if (deviceStart && method === 'POST') {
    return json(res, 200, await startDeviceFlow(deviceStart[1]))
  }

  const devicePoll = pathname.match(/^\/api\/oauth\/([a-z0-9-]+)\/device\/([A-Za-z0-9-]+)\/poll$/)
  if (devicePoll && method === 'POST') {
    return json(res, 200, await pollDeviceFlow(devicePoll[1], devicePoll[2]))
  }

  const tokenImport = pathname.match(/^\/api\/oauth\/([a-z0-9-]+)\/token$/)
  if (tokenImport && method === 'POST') {
    const body = await readBody(req)
    return json(res, 200, await importToken(tokenImport[1], body))
  }

  const oauthSession = pathname.match(/^\/api\/oauth\/([a-z0-9-]+)$/)
  if (oauthSession && method === 'DELETE') {
    await disconnect(oauthSession[1])
    return json(res, 200, configPayload())
  }

  if (pathname === '/api/oauth' && method === 'GET') {
    return json(res, 200, { providers: publicOAuthProviders(), sessions: oauthHints() })
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
