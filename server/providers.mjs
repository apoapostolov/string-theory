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

export async function listModels(provider, { endpoint, key }) {
  const base = endpoint || provider.endpoint
  const headers = { Accept: 'application/json' }

  if (provider.kind === 'anthropic') {
    const res = await fetch(joinUrl(base, 'models?limit=100'), {
      headers: { ...headers, 'x-api-key': key, 'anthropic-version': '2023-06-01' }
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
export async function chat(provider, opts) {
  const { endpoint, key, model, system, user, temperature = 0.4, maxTokens = 700 } = opts
  const base = endpoint || provider.endpoint
  const started = Date.now()

  if (provider.kind === 'anthropic') {
    const res = await fetch(joinUrl(base, 'messages'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
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
