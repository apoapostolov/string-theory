import { useEffect, useState } from 'react'
import { CheckCircle, Copy, Key, SignIn, WarningCircle, X } from '@phosphor-icons/react'
import type { ConfigPayload, ProviderInfo } from '../types'
import { api } from '../lib/api'
import { Button } from './Button'

type Props = {
  provider: ProviderInfo
  payload: ConfigPayload | null
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  onToast: (kind: 'ok' | 'error', message: string) => void
}

function relative(iso: string): string {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  const diff = time - Date.now()
  if (diff <= 0) return 'expired'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h`
  return `${Math.round(diff / 86_400_000)} d`
}

/**
 * Credentials for one provider: an API key, or an OAuth sign-in where the
 * provider actually publishes a flow. Providers without one never show this.
 */
export function ProviderAuth({ provider, payload, onPatch, onToast }: Props) {
  const oauthConfig = payload?.oauth.providers.find((entry) => entry.id === provider.id) ?? null
  const session = payload?.oauth.sessions?.[provider.id] ?? null
  const explicit = payload?.config.authModes?.[provider.id]
  const mode: 'key' | 'oauth' = explicit ?? (session?.present ? 'oauth' : 'key')

  const [flow, setFlow] = useState<{ flowId: string; userCode: string; uri: string; interval: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')
  const [refreshDraft, setRefreshDraft] = useState('')

  useEffect(() => {
    setFlow(null)
    setError(null)
    setPasteOpen(false)
    setTokenDraft('')
    setRefreshDraft('')
  }, [provider.id])

  useEffect(() => {
    if (!flow) return
    let cancelled = false
    let timer: number

    const tick = async () => {
      try {
        const result = await api.pollDevice(provider.id, flow.flowId)
        if (cancelled) return
        if (result.status === 'connected') {
          setFlow(null)
          onToast('ok', `${provider.label} connected`)
          await onPatch({})
          return
        }
        if (result.status === 'pending') {
          timer = window.setTimeout(tick, (result.interval ?? flow.interval) * 1000)
          return
        }
        setFlow(null)
        setError(result.message ?? `Sign-in ${result.status}.`)
      } catch (failure) {
        if (cancelled) return
        setFlow(null)
        setError((failure as Error).message)
      }
    }

    timer = window.setTimeout(tick, flow.interval * 1000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [flow, onPatch, onToast, provider.id, provider.label])

  if (!oauthConfig) return null

  async function setMode(next: 'key' | 'oauth') {
    await onPatch({ authModes: { ...(payload?.config.authModes ?? {}), [provider.id]: next } })
    setError(null)
    if (next === 'key') setFlow(null)
  }

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const started = await api.startDevice(provider.id)
      setFlow({
        flowId: started.flowId,
        userCode: started.userCode,
        uri: started.verificationUriComplete || started.verificationUri,
        interval: started.interval
      })
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await api.disconnectOAuth(provider.id)
      await onPatch({})
      onToast('ok', `${provider.label} disconnected`)
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function importToken() {
    setBusy(true)
    setError(null)
    try {
      await api.importOAuthToken(provider.id, {
        access: tokenDraft.trim(),
        refresh: refreshDraft.trim() || undefined
      })
      setPasteOpen(false)
      setTokenDraft('')
      setRefreshDraft('')
      onToast('ok', `${provider.label} token saved`)
      await onPatch({ authModes: { ...(payload?.config.authModes ?? {}), [provider.id]: 'oauth' } })
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-ink-900 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] tracking-[0.07em] text-fg-faint uppercase">Credentials</span>
      </div>

      <div role="group" aria-label="How String Theory authenticates to this provider" className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-line bg-ink-850 p-1">
        <button
          type="button"
          onClick={() => void setMode('key')}
          aria-pressed={mode === 'key'}
          className={`flex h-7 items-center justify-center gap-1.5 rounded-md text-[11.5px] transition-colors ${
            mode === 'key' ? 'bg-ink-750 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-fg-faint hover:bg-ink-800 hover:text-fg-dim'
          }`}
        >
          <Key size={11} />
          API key
        </button>
        <button
          type="button"
          onClick={() => void setMode('oauth')}
          aria-pressed={mode === 'oauth'}
          className={`flex h-7 items-center justify-center gap-1.5 rounded-md text-[11.5px] transition-colors ${
            mode === 'oauth' ? 'bg-ink-750 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-fg-faint hover:bg-ink-800 hover:text-fg-dim'
          }`}
        >
          <SignIn size={11} />
          Sign in
        </button>
      </div>

      {mode === 'key' ? (
        <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
          Paste a key below. {oauthConfig.allowsTokenImport ? `Or sign in with a ${oauthConfig.label} account that already has access, and String Theory keeps the session sealed on this machine.` : ''}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {session?.present ? (
            <div className="flex items-center gap-2 rounded-md border border-line bg-ink-850 px-2 py-1.5">
              <CheckCircle size={12} weight="fill" className="shrink-0 text-ok" />
              <span className="min-w-0 truncate text-[11.5px] text-fg">
                {session.account || `${oauthConfig.label} account`}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-fg-faint">
                {session.expiresAt ? `expires in ${relative(session.expiresAt)}` : 'no expiry recorded'}
              </span>
              <button
                type="button"
                onClick={() => void disconnect()}
                disabled={busy}
                className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10.5px] text-fg-faint hover:bg-ink-800 hover:text-fg disabled:opacity-40"
              >
                Disconnect
              </button>
            </div>
          ) : flow ? (
            <div className="rounded-md border border-line bg-ink-850 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-fg-dim">Open this link and approve the code:</span>
                <a
                  href={flow.uri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg"
                >
                  {new URL(flow.uri).host}
                </a>
                <button
                  type="button"
                  aria-label="Copy code"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(flow.userCode)
                      onToast('ok', 'Code copied')
                    } catch {
                      onToast('error', 'Clipboard blocked by the browser')
                    }
                  }}
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded text-fg-faint hover:bg-ink-800 hover:text-fg"
                >
                  <Copy size={10} />
                </button>
                <button
                  type="button"
                  aria-label="Cancel sign-in"
                  onClick={() => setFlow(null)}
                  className="flex h-5 w-5 items-center justify-center rounded text-fg-faint hover:bg-ink-800 hover:text-fg"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-[18px] tracking-[0.18em] text-fg">{flow.userCode}</span>
                <span className="flex items-center gap-1 text-[10.5px] text-fg-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-near st-shimmer" />
                  waiting for approval
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => void start()} disabled={busy} className="h-7">
                <SignIn size={12} />
                {busy ? 'Starting…' : `Sign in with ${oauthConfig.label}`}
              </Button>
              {oauthConfig.allowsTokenImport ? (
                <button
                  type="button"
                  onClick={() => setPasteOpen((value) => !value)}
                  className="text-[11px] text-fg-faint underline decoration-line-strong underline-offset-2 hover:text-fg-dim"
                >
                  or paste a token
                </button>
              ) : null}
            </div>
          )}

          {pasteOpen && !session?.present ? (
            <div className="space-y-1.5 rounded-md border border-line bg-ink-850 px-2 py-2">
              <textarea
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                rows={2}
                spellCheck={false}
                placeholder="access token"
                className="st-input w-full resize-none rounded border border-line bg-ink-900 px-2 py-1 font-mono text-[10.5px] text-fg outline-none placeholder:text-fg-faint/60 focus:border-line-strong"
              />
              <input
                value={refreshDraft}
                onChange={(event) => setRefreshDraft(event.target.value)}
                spellCheck={false}
                placeholder="refresh token (optional, keeps it alive)"
                className="st-input w-full rounded border border-line bg-ink-900 px-2 py-1 font-mono text-[10.5px] text-fg outline-none placeholder:text-fg-faint/60 focus:border-line-strong"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => void importToken()} disabled={!tokenDraft.trim() || busy} className="h-6">
                  Save token
                </Button>
                <span className="text-[10px] text-fg-faint">Stored sealed in data/oauth.enc.json, never sent to the browser.</span>
              </div>
            </div>
          ) : null}

          <p className="text-[10.5px] leading-relaxed text-fg-faint">{oauthConfig.note}</p>
        </div>
      )}

      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-over">
          <WarningCircle size={11} weight="fill" className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
