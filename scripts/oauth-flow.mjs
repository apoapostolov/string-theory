// OAuth flow checks for the server, without touching a real provider.
//
// The token endpoint is pointed at a local stub and the store at a throwaway
// data dir, so this runs anywhere and proves: the authorize URL carries the
// right PKCE parameters, the code exchange posts what the provider expects, the
// session is sealed and refreshed, and an OAuth session is sent as a bearer
// token with the beta header while a key is sent as x-api-key.
//
// Run: node scripts/oauth-flow.mjs

import { createServer } from 'node:http'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'data', 'oauth-test')
rmSync(dataDir, { recursive: true, force: true })
mkdirSync(dataDir, { recursive: true })
process.env.ST_DATA_DIR = dataDir

const { OAUTH_PROVIDERS, accountIdFromToken, startAuthorizeFlow, completeAuthorizeFlow, startDeviceFlow, pollDeviceFlow, validAccessToken } =
  await import('../server/oauth.mjs')
const { getOAuthSession, clearOAuthSession } = await import('../server/store.mjs')
const { chat } = await import('../server/providers.mjs')

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`PASS  ${name}`)
  } else {
    failed += 1
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ------------------------------------------------------------------ stub provider
const seen = []
let accessCount = 0

const stub = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body })
    const json = (payload, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }

    if (req.url === '/v1/oauth/token') {
      const parsed = JSON.parse(body || '{}')
      if (parsed.grant_type === 'refresh_token') {
        return json({ access_token: 'refreshed-access-token-abcdefghij', refresh_token: 'refresh-2', expires_in: 3600 })
      }
      return json({
        access_token: 'oauth-access-token-abcdefghij',
        refresh_token: 'refresh-1',
        expires_in: 28800,
        account: { email_address: 'operator@example.test' }
      })
    }

    if (req.url === '/backend-api/codex/deviceauth/usercode') {
      return json({ usercode: 'ABCD-1234', device_auth_id: 'dev_1', interval: 1, expires_in: 60 })
    }

    if (req.url === '/backend-api/codex/deviceauth/token') {
      const parsed = JSON.parse(body || '{}')
      if (parsed.device_auth_id !== 'dev_1' || parsed.user_code !== 'ABCD-1234') return json({ error: 'access_denied' }, 403)
      return json({ authorization_code: 'ac_1', code_verifier: 'cv_1' })
    }

    if (req.url === '/backend-api/codex/oauth/token') {
      const form = new URLSearchParams(body || '')
      if (form.get('grant_type') !== 'authorization_code' || form.get('code') !== 'ac_1') return json({ error: 'invalid_grant' }, 400)
      return json({ access_token: 'codex-access-token', refresh_token: 'codex-refresh', expires_in: 3600 })
    }

    if (req.url === '/backend-api/codex/responses') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"type":"response.output_text.delta","delta":"Hello"}\n\n')
      res.write('data: {"type":"response.output_text.delta","delta":" there"}\n\n')
      res.write('data: {"type":"response.completed","response":{"usage":{"input_tokens":9,"output_tokens":2}}}\n\n')
      return res.end('data: [DONE]\n\n')
    }

    if (req.url === '/v1/messages') {
      accessCount += 1
      return json({ content: [{ type: 'text', text: 'got it' }], usage: { input_tokens: 11, output_tokens: 4 }, model: 'claude-test' })
    }

    json({ error: 'not found' }, 404)
  })
})

await new Promise((resolve) => stub.listen(4567, '127.0.0.1', resolve))
const tokenUrl = 'http://127.0.0.1:4567/v1/oauth/token'
const originalToken = OAUTH_PROVIDERS.anthropic.tokenEndpoint
OAUTH_PROVIDERS.anthropic.tokenEndpoint = tokenUrl

try {
  // 1. the authorize URL is the shape the provider expects
  const started = startAuthorizeFlow('anthropic')
  const url = new URL(started.url)
  const state = url.searchParams.get('state') ?? ''
  const challenge = url.searchParams.get('code_challenge') ?? ''

  check('authorize URL targets the provider', url.origin + url.pathname === 'https://claude.ai/oauth/authorize')
  check('authorize URL carries the client id', url.searchParams.get('client_id') === OAUTH_PROVIDERS.anthropic.clientId)
  check('authorize URL requests a code', url.searchParams.get('response_type') === 'code')
  check('authorize URL uses the console callback', url.searchParams.get('redirect_uri') === 'https://console.anthropic.com/oauth/code/callback')
  check('authorize URL asks for inference scope', (url.searchParams.get('scope') ?? '').includes('user:inference'))
  check('PKCE method is S256', url.searchParams.get('code_challenge_method') === 'S256')
  check('state and challenge are 43-char base64url', state.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(state) && /^[A-Za-z0-9_-]{43}$/.test(challenge))

  // 2. the code exchange posts the verifier and the callback
  let mismatch = null
  try {
    await completeAuthorizeFlow('anthropic', started.flowId, 'the-code#not-the-verifier')
  } catch (error) {
    mismatch = error
  }
  check('state mismatch raises a named error', mismatch?.code === 'state-mismatch', String(mismatch?.message))

  const exchanged = await completeAuthorizeFlow('anthropic', started.flowId, 'the-code')
  check('exchange reports connected', exchanged.status === 'connected')
  check('exchange names the account', Boolean(exchanged.account), exchanged.account)

  const tokenPost = seen.find((entry) => entry.url === '/v1/oauth/token')
  const tokenBody = JSON.parse(tokenPost?.body ?? '{}')
  check('exchange posts form-free JSON', String(tokenPost?.headers['content-type'] ?? '').includes('application/json'))
  check('exchange sends grant_type authorization_code', tokenBody.grant_type === 'authorization_code')
  check('exchange sends the verifier', tokenBody.code_verifier === state)
  check('exchange sends the state back', tokenBody.state === state)
  check('exchange sends the redirect uri', tokenBody.redirect_uri === 'https://console.anthropic.com/oauth/code/callback')

  // 3. the session is sealed in the store
  const session = getOAuthSession('anthropic')
  check('session stores the access token', session?.access === 'oauth-access-token-abcdefghij')
  check('session stores the refresh token', session?.refresh === 'refresh-1')
  check('session records its mode', session?.mode === 'authorize')

  // 4. an expired session refreshes itself
  const { saveOAuthSession } = await import('../server/store.mjs')
  await saveOAuthSession('anthropic', { ...session, expiresAt: new Date(Date.now() - 1000).toISOString() })
  const fresh = await validAccessToken('anthropic')
  check('an expired session refreshes', fresh === 'refreshed-access-token-abcdefghij', String(fresh))
  const refreshed = getOAuthSession('anthropic')
  check('refresh rotates the refresh token', refreshed?.refresh === 'refresh-2')

  // 5. the wire: a session is a bearer token, a key is not
  const provider = { id: 'anthropic', label: 'Anthropic', kind: 'anthropic', endpoint: 'http://127.0.0.1:4567/v1' }
  seen.length = 0
  const oauthChat = await chat(provider, {
    endpoint: 'http://127.0.0.1:4567/v1',
    key: fresh,
    auth: 'oauth',
    model: 'claude-test',
    system: 'system',
    user: 'user'
  })
  const oauthHeaders = seen.find((entry) => entry.url === '/v1/messages')?.headers ?? {}
  check('oauth call answers with text', oauthChat.text === 'got it', oauthChat.text)
  check('oauth call sends a bearer token', oauthHeaders.authorization === `Bearer ${fresh}`)
  check('oauth call sends the beta header', oauthHeaders['anthropic-beta'] === 'oauth-2025-04-20')
  check('oauth call sends no x-api-key', oauthHeaders['x-api-key'] === undefined)

  seen.length = 0
  await chat(provider, { endpoint: 'http://127.0.0.1:4567/v1', key: 'sk-ant-test', auth: 'key', model: 'claude-test', system: 's', user: 'u' })
  const keyHeaders = seen.find((entry) => entry.url === '/v1/messages')?.headers ?? {}
  check('key call sends x-api-key', keyHeaders['x-api-key'] === 'sk-ant-test')
  check('key call sends no bearer token', keyHeaders.authorization === undefined)
  check('the model counted use', accessCount === 2, String(accessCount))

  // 6. the Codex device flow: user code, then an authorization code to exchange
  const codexBase = 'http://127.0.0.1:4567/backend-api/codex'
  const originalCodex = { ...OAUTH_PROVIDERS.openai }
  OAUTH_PROVIDERS.openai.deviceEndpoint = `${codexBase}/deviceauth/usercode`
  OAUTH_PROVIDERS.openai.pollEndpoint = `${codexBase}/deviceauth/token`
  OAUTH_PROVIDERS.openai.tokenEndpoint = `${codexBase}/oauth/token`

  const codexFlow = startDeviceFlow('openai')
  const codexStarted = await codexFlow
  check('codex sign-in returns a user code', codexStarted.userCode === 'ABCD-1234', codexStarted.userCode)
  check('codex sign-in points at the approval page', codexStarted.verificationUri === 'https://auth.openai.com/codex/device')
  check('codex sign-in does not expose the device id', !String(codexStarted.verificationUri).includes('dev_1'))

  const codexPending = await pollDeviceFlow('openai', codexStarted.flowId)
  check('codex poll connects after approval', codexPending.status === 'connected', JSON.stringify(codexPending))

  const codexExchange = seen.find((entry) => entry.url === '/backend-api/codex/oauth/token')
  const codexForm = new URLSearchParams(codexExchange?.body ?? '')
  check('codex exchange posts a form', String(codexExchange?.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded'))
  check('codex exchange sends the handed-back code', codexForm.get('code') === 'ac_1')
  check('codex exchange sends the handed-back verifier', codexForm.get('code_verifier') === 'cv_1')
  check('codex exchange sends the codex callback', codexForm.get('redirect_uri') === 'https://auth.openai.com/deviceauth/callback')

  // 7. the Codex wire: session token, account header, Responses payload, SSE out
  const accountClaim = `eyJhbGciOiJub25lIn0.${Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct_42' } })
  ).toString('base64url')}.`
  check('the account id is read from the token', accountIdFromToken(accountClaim) === 'acct_42', accountIdFromToken(accountClaim))
  check('a non-JWT token yields no account id', accountIdFromToken('codex-access-token') === '')

  seen.length = 0
  const codexChat = await chat(
    { id: 'openai', label: 'OpenAI', kind: 'openai', endpoint: 'https://api.openai.com/v1' },
    {
      endpoint: codexBase,
      key: 'codex-access-token',
      auth: 'oauth',
      accountId: 'acct_42',
      model: 'gpt-5-codex',
      system: 'be terse',
      user: 'rewrite this'
    }
  )
  const codexPost = seen.find((entry) => entry.url === '/backend-api/codex/responses')
  const codexBody = JSON.parse(codexPost?.body ?? '{}')
  check('the codex call reaches the responses route', Boolean(codexPost))
  check('the codex call sends a bearer token', codexPost?.headers.authorization === 'Bearer codex-access-token')
  check('the codex call identifies the client', codexPost?.headers.originator === 'codex_cli_rs')
  check('the codex call carries the account header', codexPost?.headers['chatgpt-account-id'] === 'acct_42')
  check('the codex call sends instructions', codexBody.instructions === 'be terse')
  check('the codex call sends input text', codexBody.input?.[0]?.content?.[0]?.text === 'rewrite this')
  check('the codex stream is assembled into text', codexChat.text === 'Hello there', codexChat.text)
  check('the codex usage is read', codexChat.inputTokens === 9 && codexChat.outputTokens === 2, `${codexChat.inputTokens}/${codexChat.outputTokens}`)

  Object.assign(OAUTH_PROVIDERS.openai, originalCodex)
  await clearOAuthSession('openai')

  // 8. a flow is single-use
  let replay = null
  try {
    await completeAuthorizeFlow('anthropic', started.flowId, 'the-code')
  } catch (error) {
    replay = error
  }
  check('a spent flow cannot be replayed', replay?.code === 'flow-gone', String(replay?.message))

  // 9. providers stay separated
  let wrongKind = null
  try {
    startAuthorizeFlow('xai')
  } catch (error) {
    wrongKind = error
  }
  check('a device provider has no browser sign-in', wrongKind?.code === 'no-oauth', String(wrongKind?.message))
} finally {
  OAUTH_PROVIDERS.anthropic.tokenEndpoint = originalToken
  await clearOAuthSession('anthropic')
  stub.close()
  rmSync(dataDir, { recursive: true, force: true })
}

console.log(`\n${passed}/${passed + failed} checks passed`)
process.exit(failed ? 1 : 0)
