import type {
  ConfigPayload,
  AuthorizeStart,
  DevicePoll,
  DeviceStart,
  ModeId,
  UsageSummary,
  InboxListing,
  StylePair,
  StyleProfile,
  ProfileEntry
} from '../types'

export type PolishRequest = {
  item: {
    id: string
    text: string
    where: string
    maxPx: number | null
    maxPxPerLine?: number | null
    maxLines?: number
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
    ),
  runStyle: (body: { app: string; context: string; pairs: StylePair[]; providerId?: string; model?: string }) =>
    request<StyleProfile>('/api/style/run', { method: 'POST', body: JSON.stringify(body) }),
  profiles: () => request<{ dir: string; exists: boolean; files: ProfileEntry[] }>('/api/profiles'),
  profile: (name: string) =>
    request<{ name: string; markdown: string; bytes: number }>(`/api/profiles/${encodeURIComponent(name)}`),
  startDevice: (providerId: string) =>
    request<DeviceStart>(`/api/oauth/${providerId}/device`, { method: 'POST' }),
  pollDevice: (providerId: string, flowId: string) =>
    request<DevicePoll>(`/api/oauth/${providerId}/device/${encodeURIComponent(flowId)}/poll`, { method: 'POST' }),
  startAuthorize: (providerId: string) =>
    request<AuthorizeStart>(`/api/oauth/${providerId}/authorize`, { method: 'POST' }),
  completeAuthorize: (providerId: string, flowId: string, code: string) =>
    request<{ status: string; account: string; expiresAt: string }>(
      `/api/oauth/${providerId}/authorize/${encodeURIComponent(flowId)}`,
      { method: 'POST', body: JSON.stringify({ code }) }
    ),
  importOAuthToken: (providerId: string, body: { access: string; refresh?: string; expiresAt?: string }) =>
    request<{ connected: boolean; expiresAt: string }>(`/api/oauth/${providerId}/token`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  disconnectOAuth: (providerId: string) =>
    request<ConfigPayload>(`/api/oauth/${providerId}`, { method: 'DELETE' })
}

export { ApiError }
