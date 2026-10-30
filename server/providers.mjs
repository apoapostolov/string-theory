// Provider registry. Same provider set Lingarr Next exposes for AI work:
// every one is a chat provider that can be used as a grammar and style polisher.
// `kind` picks the wire format (OpenAI-compatible, Anthropic, Gemini).

export const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    endpoint: 'https://api.openai.com/v1',
    needsKey: true,
    hint: 'sk-... from platform.openai.com',
    models: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini']
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    needsKey: true,
    hint: 'sk-ant-... from console.anthropic.com',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5']
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    hint: 'AIza... from aistudio.google.com',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro']
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    endpoint: 'https://api.deepseek.com/v1',
    needsKey: true,
    hint: 'sk-... from platform.deepseek.com',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat']
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    endpoint: 'https://openrouter.ai/api/v1',
    needsKey: true,
    hint: 'sk-or-v1-... from openrouter.ai/keys',
    models: ['openrouter/free']
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    kind: 'openai',
    endpoint: 'https://api.mistral.ai/v1',
    needsKey: true,
    hint: 'from console.mistral.ai',
    models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest']
  },
  {
    id: 'qwen',
    label: 'Qwen (DashScope)',
    kind: 'openai',
    endpoint: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
    needsKey: true,
    hint: 'sk-... from Model Studio',
    models: ['qwen3.7-plus', 'qwen3.7-max', 'qwen3.6-flash']
  },
  {
    id: 'zai',
    label: 'Z.ai',
    kind: 'openai',
    endpoint: 'https://api.z.ai/api/paas/v4',
    needsKey: true,
    hint: 'coding or general plan key from z.ai',
    models: ['glm-4.7', 'glm-5']
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    kind: 'openai',
    endpoint: 'https://opencode.ai/zen/go/v1',
    needsKey: true,
    hint: 'gateway key from opencode.ai',
    models: [
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'glm-5.1',
      'glm-5.2',
      'kimi-k2.6',
      'minimax-m2.7',
      'qwen3.6-plus',
      'mimo-v2.5'
    ]
  },
  {
    id: 'xai',
    label: 'xAI',
    kind: 'openai',
    endpoint: 'https://api.x.ai/v1',
    needsKey: true,
    hint: 'An API key from console.x.ai, or sign in with the xAI account that has Grok access.',
    models: ['grok-4.5', 'grok-4', 'grok-3-mini']
  },
  {
    id: 'local',
    label: 'Local (Ollama / LM Studio)',
    kind: 'openai',
    endpoint: 'http://127.0.0.1:11434/v1',
    needsKey: false,
    hint: 'OpenAI-compatible local server, no key needed',
    models: ['llama3.2', 'qwen3:8b']
  }
]

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

export function publicProvider(p) {
  return {
    id: p.id,
    label: p.label,
    endpoint: p.endpoint,
    needsKey: p.needsKey,
    hint: p.hint,
    models: p.models,
    kind: p.kind
  }
}

function joinUrl(base, path) {
  return `${String(base).replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function providerError(label, status, body) {
  let detail = ''
  try {
    const parsed = JSON.parse(body)
    detail =
      parsed?.error?.message ??
      (typeof parsed?.error === 'string' ? parsed.error : '') ??
      parsed?.message ??
      parsed?.error?.[0]?.message ??
      parsed?.errors?.[0]?.message ??
      parsed?.detail ??
      ''
  } catch {
    detail = String(body ?? '').slice(0, 300)
  }
  const err = new Error(`${label} returned ${status}${detail ? `: ${detail}` : ''}`)
  err.status = status === 401 || status === 403 ? 401 : 502
  err.upstreamStatus = status
  return err
}

export async function listModels(provider, { endpoint, key, auth = 'key' }) {
  const base = endpoint || provider.endpoint
  const headers = { Accept: 'application/json' }

  // A session is a bearer token, not an API key, and the two never share headers.
  if (auth === 'oauth' && provider.kind === 'openai' && provider.id === 'openai') {
    throw Object.assign(
      new Error('A ChatGPT session has no model catalogue to read; the model list comes from the platform API key.'),
      { code: 'no-catalogue' }
    )
  }

  if (provider.kind === 'anthropic') {
    const credentialHeaders =
      auth === 'oauth'
        ? { Authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20' }
        : { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    const res = await fetch(joinUrl(base, 'models?limit=100'), {
      headers: { ...headers, ...credentialHeaders }
    })
    const body = await res.text()
    if (!res.ok) throw providerError(provider.label, res.status, body)
    const data = JSON.parse(body)
    return (data.data ?? []).map((m) => m.id).filter(Boolean)
  }

  if (provider.kind === 'gemini') {
    const res = await fetch(joinUrl(base, `models?key=${encodeURIComponent(key)}`), { headers })
    const body = await res.text()
    if (!res.ok) throw providerError(provider.label, res.status, body)
    const data = JSON.parse(body)
    return (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => String(m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
  }

  if (key) headers.Authorization = `Bearer ${key}`
  const res = await fetch(joinUrl(base, 'models'), { headers })
  const body = await res.text()
  if (!res.ok) throw providerError(provider.label, res.status, body)
  const data = JSON.parse(body)
  return (data.data ?? data.models ?? [])
    .map((m) => (typeof m === 'string' ? m : m.id ?? m.name))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)))
}

/**
 * One chat completion. Returns { text, inputTokens, outputTokens, model }.
 * Token counts are 0 when the provider does not report usage.
 */
const CODEX_BASE = 'https://chatgpt.com/backend-api/codex'

export async function chat(provider, opts) {
  const { endpoint, key, model, system, user, temperature = 0.4, maxTokens = 700, auth = 'key', accountId = '' } = opts
  const base = endpoint || provider.endpoint
  const started = Date.now()

  if (provider.kind === 'anthropic') {
    // A subscription session authenticates with a bearer token and the beta
    // header that provider requires for OAuth traffic; an API key does not.
    const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }
    if (auth === 'oauth') {
      headers.Authorization = `Bearer ${key}`
      headers['anthropic-beta'] = 'oauth-2025-04-20'
    } else {
      headers['x-api-key'] = key
    }
    const res = await fetch(joinUrl(base, 'messages'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }]
      })
    })
    const body = await res.text()
    if (!res.ok) throw providerError(provider.label, res.status, body)
    const data = JSON.parse(body)
    const text = (data.content ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: data.model ?? model,
      ms: Date.now() - started
    }
  }

  if (provider.kind === 'gemini') {
    const res = await fetch(
      joinUrl(base, `models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens }
        })
      }
    )
    const body = await res.text()
    if (!res.ok) throw providerError(provider.label, res.status, body)
    const data = JSON.parse(body)
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
    return {
      text,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      model,
      ms: Date.now() - started
    }
  }

  // A ChatGPT session is not a platform key: it is only accepted by the Codex
  // endpoint, and it wants the account id beside the bearer token.
  if (provider.id === 'openai' && auth === 'oauth') {
    // provider.endpoint points at the platform API, which does not accept this
    // session; only an explicit override or the Codex base will do.
    const codexBase = endpoint || CODEX_BASE
    const headers = {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      Authorization: `Bearer ${key}`,
      originator: 'codex_cli_rs',
      'OpenAI-Beta': 'responses=experimental'
    }
    if (accountId) headers['chatgpt-account-id'] = accountId

    const res = await fetch(joinUrl(codexBase, 'responses'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        instructions: system,
        input: [{ role: 'user', content: [{ type: 'input_text', text: user }] }],
        store: false,
        stream: true
      })
    })
    const raw = await res.text()
    if (!res.ok) throw providerError(provider.label, res.status, raw)

    // The endpoint streams server-sent events; a plain JSON body is accepted too.
    let text = ''
    let inputTokens = 0
    let outputTokens = 0
    const collected = []
    const lines = raw.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        collected.push(JSON.parse(payload))
      } catch {
        // A partial frame is not worth failing the request over.
      }
    }
    if (!collected.length) {
      try {
        collected.push(JSON.parse(raw))
      } catch {
        throw providerError(provider.label, res.status, raw)
      }
    }
    for (const event of collected) {
      const kind = event.type ?? ''
      if (kind === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta
      const usage = event.usage ?? event.response?.usage
      if (usage) {
        inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? inputTokens
        outputTokens = usage.output_tokens ?? usage.completion_tokens ?? outputTokens
      }
      const output = event.output ?? event.response?.output
      if (Array.isArray(output)) {
        for (const item of output) {
          for (const part of item.content ?? []) {
            if (typeof part.text === 'string' && !text.includes(part.text)) text += part.text
          }
        }
      }
    }
    if (!text.trim()) throw providerError(provider.label, res.status, raw.slice(0, 400))
    return { text, inputTokens, outputTokens, model, ms: Date.now() - started }
  }

  const headers = { 'content-type': 'application/json', Accept: 'application/json' }
  if (key) headers.Authorization = `Bearer ${key}`
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'http://127.0.0.1:4317'
    headers['X-Title'] = 'String Theory'
  }

  const res = await fetch(joinUrl(base, 'chat/completions'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  const body = await res.text()
  if (!res.ok) throw providerError(provider.label, res.status, body)
  const data = JSON.parse(body)
  const choice = data.choices?.[0]
  return {
    text: choice?.message?.content ?? choice?.text ?? '',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    model: data.model ?? model,
    ms: Date.now() - started
  }
}
