import type { ConfigPayload, ModeId, UsageSummary, InboxListing } from '../types'

export type PolishRequest = {
  item: {
    id: string
    text: string
    where: string
    maxPx: number | null
    maxChars: number | null
    px: number
    appContext?: string
  }
  mode?: ModeId
  app?: string
  font?: { family: string; size: number; weight: number; letterSpacing: number }
  providerId?: string
  model?: string
}

export type PolishResponse = {
  text: string
  provider: string
  model: string
  mode: ModeId
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null; ms: number }
  summary: UsageSummary
  promptChars: number
}

class ApiError extends Error {
  status: number
  code: string | null

  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
  })
  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok) {
    const record = (payload ?? {}) as { error?: string; code?: string }
    throw new ApiError(record.error ?? `Request failed (${response.status})`, response.status, record.code ?? null)
  }
  return payload as T
}

export const api = {
  config: () => request<ConfigPayload>('/api/config'),
  patchConfig: (patch: Record<string, unknown>) =>
    request<ConfigPayload>('/api/config', { method: 'PATCH', body: JSON.stringify(patch) }),
  setKey: (providerId: string, key: string) =>
    request<ConfigPayload>(`/api/keys/${providerId}`, { method: 'PUT', body: JSON.stringify({ key }) }),
  clearKey: (providerId: string) => request<ConfigPayload>(`/api/keys/${providerId}`, { method: 'DELETE' }),
  models: (providerId: string, key?: string) =>
    request<{ models: string[]; source: 'remote' | 'curated'; message: string }>(
      `/api/providers/${providerId}/models`,
      { method: 'POST', body: JSON.stringify({ key: key ?? '' }) }
    ),
  polish: (body: PolishRequest) =>
    request<PolishResponse>('/api/polish', { method: 'POST', body: JSON.stringify(body) }),
  usage: () => request<UsageSummary>('/api/usage'),
  inbox: () => request<InboxListing>('/api/files'),
  openInboxFile: (id: string) =>
    request<{ id: string; name: string; dir: string; bytes: number; mtime: number; json: unknown }>(
      `/api/files/open?id=${encodeURIComponent(id)}`
    )
}

export { ApiError }
