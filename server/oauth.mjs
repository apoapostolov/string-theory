// OAuth sessions: providers that issue tokens rather than API keys.
//
// The xAI flow is ported from Lingarr Next's XaiOAuthSessionService, because
// those are the client id, scope and endpoints the provider actually accepts.
// Everything else here is provider-agnostic: a device code, a token exchange, a
// refresh, and a sealed session. Providers without a documented flow are absent
// on purpose instead of showing a button that cannot work.

import { randomUUID } from 'node:crypto'
import { clearOAuthSession, getOAuthSession, saveOAuthSession } from './store.mjs'

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const MIN_INTERVAL = 3

export const OAUTH_PROVIDERS = {
  xai: {
    label: 'xAI',
    kind: 'device',
    clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
    scope: 'openid profile email offline_access grok-cli:access api:access',
    deviceEndpoint: 'https://auth.x.ai/oauth2/device/code',
    tokenEndpoint: 'https://auth.x.ai/oauth2/token',
    verificationFallback: 'https://accounts.x.ai/oauth2/device',
    note: 'Sign in with the xAI account that has Grok access. The access token is used as a bearer token against api.x.ai.',
    allowsTokenImport: true
  }
}

/** In-flight device codes. They live in memory: a restart means starting again. */
const pending = new Map()

export function oauthProviderIds() {
  return Object.keys(OAUTH_PROVIDERS)
}

export function oauthConfig(providerId) {
  return OAUTH_PROVIDERS[providerId] ?? null
}

export function publicOAuthProviders() {
  return Object.entries(OAUTH_PROVIDERS).map(([id, config]) => ({
    id,
    label: config.label,
    kind: config.kind,
    note: config.note,
    allowsTokenImport: Boolean(config.allowsTokenImport)
  }))
}

function fail(message, status = 400, code = null) {
  return Object.assign(new Error(message), { status, code })
}

async function postForm(url, fields) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(20_000)
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  return { ok: response.ok, status: response.status, body, text }
}

/** Best-effort label for the account, read from the id token without verifying it. */
function accountFromTokens(body) {
  const jwt = body?.id_token
  if (typeof jwt !== 'string' || jwt.split('.').length < 2) return ''
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
    return String(payload.email ?? payload.preferred_username ?? payload.sub ?? '')
  } catch {
    return ''
  }
}

function expiresAtFrom(body, fallbackSeconds = 3600) {
  const seconds = Number(body?.expires_in ?? fallbackSeconds)
  return new Date(Date.now() + Math.max(60, Number.isFinite(seconds) ? seconds : fallbackSeconds) * 1000).toISOString()
}

export async function startDeviceFlow(providerId) {
  const config = oauthConfig(providerId)
  if (!config || config.kind !== 'device') throw fail(`${providerId} has no device login`, 400, 'no-oauth')

  const result = await postForm(config.deviceEndpoint, {
    client_id: config.clientId,
    scope: config.scope
  })

  if (!result.ok || !result.body) {
    throw fail(
      `${config.label} device login could not start (${result.status}): ${result.text.slice(0, 200)}`,
      502,
      'device-start'
    )
  }

  const deviceCode = result.body.device_code ?? result.body.deviceCode
  const userCode = result.body.user_code ?? result.body.userCode
  if (!deviceCode || !userCode) throw fail(`${config.label} did not return a device code.`, 502, 'device-start')

  const interval = Math.max(MIN_INTERVAL, Number(result.body.interval) || 5)
  const expiresIn = Math.max(60, Number(result.body.expires_in) || 1800)
  const flowId = randomUUID()
  const expiresAt = Date.now() + expiresIn * 1000
  pending.set(flowId, { providerId, deviceCode, interval, expiresAt })

  return {
    flowId,
    userCode,
    verificationUri:
      result.body.verification_uri ??
      result.body.verificationUri ??
      result.body.verification_url ??
      config.verificationFallback,
    verificationUriComplete: result.body.verification_uri_complete ?? result.body.verificationUriComplete ?? '',
    interval,
    expiresAt: new Date(expiresAt).toISOString()
  }
}

export async function pollDeviceFlow(providerId, flowId) {
  const config = oauthConfig(providerId)
  if (!config) throw fail(`${providerId} has no OAuth login`, 400, 'no-oauth')

  const flow = pending.get(flowId)
  if (!flow || flow.providerId !== providerId) {
    return { status: 'expired', message: 'That login attempt is gone. Start again.' }
  }
  if (flow.expiresAt <= Date.now()) {
    pending.delete(flowId)
    return { status: 'expired', message: 'The code expired before it was approved. Start again.' }
  }

  const result = await postForm(config.tokenEndpoint, {
    grant_type: DEVICE_GRANT,
    device_code: flow.deviceCode,
    client_id: config.clientId
  })

  const access = result.body?.access_token
  if (result.ok && access) {
    pending.delete(flowId)
    await saveOAuthSession(providerId, {
      access,
      refresh: result.body.refresh_token ?? '',
      expiresAt: expiresAtFrom(result.body),
      account: accountFromTokens(result.body),
      mode: 'device'
    })
    return { status: 'connected', account: accountFromTokens(result.body), expiresAt: expiresAtFrom(result.body) }
  }

  const error = String(result.body?.error ?? '')
  const description = result.body?.error_description ?? result.body?.message ?? ''
  switch (error) {
    case 'authorization_pending':
      return { status: 'pending', interval: flow.interval }
    case 'slow_down':
      flow.interval += 5
      return { status: 'pending', interval: flow.interval }
    case 'expired_token':
      pending.delete(flowId)
      return { status: 'expired', message: 'The code expired. Start again.' }
    case 'access_denied':
      pending.delete(flowId)
      return { status: 'denied', message: description || 'The login was denied.' }
    default:
      return {
        status: 'error',
        message: description || error || `${config.label} login failed (${result.status}).`
      }
  }
}

/**
 * A token the operator already holds, for providers with no public device flow
 * or when the browser handoff is not available. Stored the same way as a device
 * session, and refreshed with the same rules when a refresh token is supplied.
 */
export async function importToken(providerId, { access, refresh, expiresAt }) {
  const config = oauthConfig(providerId)
  if (!config) throw fail(`${providerId} has no OAuth login`, 400, 'no-oauth')
  const token = String(access ?? '').trim()
  if (token.length < 20) throw fail('That does not look like an access token.', 400, 'bad-token')

  let expires = String(expiresAt ?? '').trim()
  if (expires) {
    const parsed = Date.parse(expires)
    expires = Number.isFinite(parsed) ? new Date(parsed).toISOString() : ''
  }
  if (!expires) expires = new Date(Date.now() + 3600 * 1000).toISOString()

  await saveOAuthSession(providerId, {
    access: token,
    refresh: String(refresh ?? '').trim(),
    expiresAt: expires,
    account: '',
    mode: 'token'
  })
  return { connected: true, expiresAt: expires }
}

async function refreshSession(providerId, session) {
  const config = oauthConfig(providerId)
  if (!config || !session.refresh) return null
  const result = await postForm(config.tokenEndpoint, {
    grant_type: 'refresh_token',
    refresh_token: session.refresh,
    client_id: config.clientId
  })
  const access = result.body?.access_token
  if (!result.ok || !access) {
    await clearOAuthSession(providerId)
    return null
  }
  const next = {
    access,
    refresh: result.body.refresh_token ?? session.refresh,
    expiresAt: expiresAtFrom(result.body),
    account: session.account || accountFromTokens(result.body),
    mode: session.mode
  }
  await saveOAuthSession(providerId, next)
  return next.access
}

/** The access token to use right now, refreshed when it is about to expire. */
export async function validAccessToken(providerId) {
  const session = getOAuthSession(providerId)
  if (!session) return null
  const expires = session.expiresAt ? Date.parse(session.expiresAt) : 0
  if (session.access && (!expires || expires > Date.now() + 60_000)) return session.access
  if (session.refresh) return refreshSession(providerId, session)
  return session.access || null
}

export async function disconnect(providerId) {
  await clearOAuthSession(providerId)
}
