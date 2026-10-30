// OAuth sessions: providers that issue tokens rather than API keys.
//
// The xAI flow is ported from Lingarr Next's XaiOAuthSessionService, because
// those are the client id, scope and endpoints the provider actually accepts.
// Everything else here is provider-agnostic: a device code, a token exchange, a
// refresh, and a sealed session. Providers without a documented flow are absent
// on purpose instead of showing a button that cannot work.

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { clearOAuthSession, getOAuthSession, saveOAuthSession } from './store.mjs'

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const MIN_INTERVAL = 3
const AUTHORIZE_TTL = 15 * 60 * 1000

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
  },
  anthropic: {
    label: 'Claude',
    kind: 'authorize',
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    scope: 'org:create_api_key user:profile user:inference',
    authorizeEndpoint: 'https://claude.ai/oauth/authorize',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token',
    // The browser hands back a code, so there is no local listener and no device code.
    authorizeParams: { code: 'true' },
    tokenStyle: 'json',
    note: 'Sign in with the Claude account behind your subscription, approve in the browser, and paste the code it shows you. The access token is used as a bearer token against api.anthropic.com.',
    allowsTokenImport: true
  },
  openai: {
    label: 'ChatGPT',
    kind: 'codex',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    // Codex device auth: a user code, then an authorization code handed back by
    // the poll, which is exchanged once at the token endpoint.
    deviceEndpoint: 'https://auth.openai.com/api/accounts/deviceauth/usercode',
    pollEndpoint: 'https://auth.openai.com/api/accounts/deviceauth/token',
    tokenEndpoint: 'https://auth.openai.com/oauth/token',
    redirectUri: 'https://auth.openai.com/deviceauth/callback',
    verificationFallback: 'https://auth.openai.com/codex/device',
    note: 'Sign in with the ChatGPT account behind a Codex subscription. Requests go to the Codex endpoint with that session, not to a platform API key.',
    allowsTokenImport: true
  }
}

/** In-flight device codes. They live in memory: a restart means starting again. */
const pending = new Map()

export function oauthProviderIds() {
  return Object.keys(OAUTH_PROVIDERS)
}

/**
 * The ChatGPT account id travels as its own header on Codex requests. It sits in
 * the access token claims; when it is absent the request still works, so this
 * returns an empty string rather than throwing.
 */
export function accountIdFromToken(token) {
  const parts = String(token ?? '').split('.')
  if (parts.length < 2) return ''
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const auth = claims['https://api.openai.com/auth']
    return String(auth?.chatgpt_account_id ?? '')
  } catch {
    return ''
  }
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

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify(payload),
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

function postToken(config, payload) {
  return config.tokenStyle === 'json' ? postJson(config.tokenEndpoint, payload) : postForm(config.tokenEndpoint, payload)
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
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
  // Some providers describe the account beside the tokens instead of inside an
  // id_token; the console returns { uuid, email_address }.
  const described = body?.account
  if (described && typeof described === 'object') {
    const label = described.email_address ?? described.email ?? described.uuid ?? ''
    if (label) return String(label)
  }
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
  if (!config || (config.kind !== 'device' && config.kind !== 'codex')) {
    throw fail(`${providerId} has no device login`, 400, 'no-oauth')
  }

  const result =
    config.kind === 'codex'
      ? await postJson(config.deviceEndpoint, { client_id: config.clientId })
      : await postForm(config.deviceEndpoint, {
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

  const deviceCode = result.body.device_code ?? result.body.deviceCode ?? result.body.device_auth_id
  const userCode = result.body.user_code ?? result.body.userCode ?? result.body.usercode
  if (!deviceCode || !userCode) throw fail(`${config.label} did not return a device code.`, 502, 'device-start')

  const interval = Math.max(MIN_INTERVAL, Number(result.body.interval) || 5)
  const expiresIn = Math.max(60, Number(result.body.expires_in) || 1800)
  const flowId = randomUUID()
  const expiresAt = Date.now() + expiresIn * 1000
  pending.set(flowId, { providerId, deviceCode, userCode, interval, expiresAt })

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

  if (config.kind === 'codex') {
    const polled = await postJson(config.pollEndpoint, {
      device_auth_id: flow.deviceCode,
      user_code: flow.userCode
    })
    const authorizationCode = polled.body?.authorization_code
    if (polled.ok && authorizationCode) {
      const exchanged = await postForm(config.tokenEndpoint, {
        grant_type: 'authorization_code',
        code: authorizationCode,
        code_verifier: polled.body.code_verifier ?? '',
        redirect_uri: config.redirectUri,
        client_id: config.clientId
      })
      const token = exchanged.body?.access_token
      if (!exchanged.ok || !token) {
        pending.delete(flowId)
        return { status: 'error', message: `${config.label} refused the sign-in (${exchanged.status}).` }
      }
      pending.delete(flowId)
      const saved = {
        access: token,
        refresh: exchanged.body.refresh_token ?? '',
        expiresAt: expiresAtFrom(exchanged.body),
        account: accountFromTokens(exchanged.body),
        mode: 'device'
      }
      await saveOAuthSession(providerId, saved)
      return { status: 'connected', account: saved.account, expiresAt: saved.expiresAt }
    }
    const pendingError = String(polled.body?.error ?? '')
    if (polled.status === 403 || polled.status === 404 || pendingError === 'authorization_pending') {
      return { status: 'pending', interval: flow.interval }
    }
    if (pendingError === 'slow_down') {
      flow.interval += 5
      return { status: 'pending', interval: flow.interval }
    }
    if (pendingError === 'access_denied' || pendingError === 'expired_token') {
      pending.delete(flowId)
      return { status: 'denied', message: 'The code was declined or expired. Start again.' }
    }
    return { status: 'error', message: `Sign-in failed (${polled.status}).` }
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
 * Browser sign-in. The provider approves in its own page and then shows a code
 * instead of calling back to this machine, so the flow ends with the operator
 * pasting that code. PKCE with S256, and the state is the verifier, which is the
 * shape the desktop client already uses for this provider.
 */
export function startAuthorizeFlow(providerId) {
  const config = oauthConfig(providerId)
  if (!config || config.kind !== 'authorize') throw fail(`${providerId} has no browser sign-in`, 400, 'no-oauth')

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const url = new URL(config.authorizeEndpoint)
  for (const [name, value] of Object.entries(config.authorizeParams ?? {})) url.searchParams.set(name, value)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', verifier)

  const flowId = randomUUID()
  const expiresAt = Date.now() + AUTHORIZE_TTL
  pending.set(flowId, { providerId, verifier, kind: 'authorize', expiresAt })
  return { flowId, url: url.toString(), expiresAt: new Date(expiresAt).toISOString() }
}

export async function completeAuthorizeFlow(providerId, flowId, pasted) {
  const config = oauthConfig(providerId)
  if (!config || config.kind !== 'authorize') throw fail(`${providerId} has no browser sign-in`, 400, 'no-oauth')

  const flow = pending.get(flowId)
  if (!flow || flow.providerId !== providerId || flow.kind !== 'authorize') {
    throw fail('That sign-in attempt is gone. Start again.', 400, 'flow-gone')
  }
  if (flow.expiresAt <= Date.now()) {
    pending.delete(flowId)
    throw fail('The sign-in expired before it was finished. Start again.', 400, 'flow-expired')
  }

  const raw = String(pasted ?? '').trim()
  if (!raw) throw fail('Paste the code the browser showed you.', 400, 'no-code')
  const [code, state] = raw.split('#', 2)
  if (!code) throw fail('That does not look like an authorization code.', 400, 'bad-code')
  if (state && state !== flow.verifier) {
    throw fail('The authorization state does not match. Start sign-in again.', 400, 'state-mismatch')
  }

  const result = await postToken(config, {
    grant_type: 'authorization_code',
    code,
    state: flow.verifier,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_verifier: flow.verifier
  })

  const access = result.body?.access_token
  if (!result.ok || !access) {
    const detail = String(result.body?.error_description ?? result.body?.error ?? result.text ?? '').slice(0, 200)
    throw fail(`${config.label} did not accept that code (${result.status}): ${detail}`, 502, 'exchange-failed')
  }

  pending.delete(flowId)
  const session = {
    access,
    refresh: result.body.refresh_token ?? '',
    expiresAt: expiresAtFrom(result.body),
    account: accountFromTokens(result.body),
    mode: 'authorize'
  }
  await saveOAuthSession(providerId, session)
  return { status: 'connected', account: session.account, expiresAt: session.expiresAt }
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
  const result = await postToken(config, {
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
