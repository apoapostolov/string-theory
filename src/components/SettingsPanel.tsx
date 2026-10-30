import { useEffect, useState } from 'react'
import {
  ArrowClockwise,
  Check,
  Key,
  Plugs,
  Trash,
  Warning,
  X
} from '@phosphor-icons/react'
import type { ConfigPayload, FontMetrics, ModeId, ProviderInfo } from '../types'
import { api } from '../lib/api'
import { fontInstalled } from '../lib/metrics'
import { Button } from './Button'

type Props = {
  open: boolean
  onClose: () => void
  payload: ConfigPayload | null
  font: FontMetrics | null
  onPatch: (patch: Record<string, unknown>) => Promise<void>
  onSetKey: (providerId: string, key: string) => Promise<void>
  onClearKey: (providerId: string) => Promise<void>
  onFont: (font: FontMetrics) => void
  onToast: (kind: 'ok' | 'error', message: string) => void
}

const PASSES: Array<{ id: ModeId; label: string; hint: string }> = [
  { id: 'grammar', label: 'Grammar', hint: 'Spelling, grammar and punctuation only.' },
  { id: 'style', label: 'Style', hint: 'Rewrite for clarity and tightness, same voice.' },
  { id: 'fit', label: 'Fit', hint: 'Shorten until it fits the pixel budget.' }
]

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="text-[12px] font-semibold tracking-[0.01em] text-fg">{title}</h3>
      {hint ? <p className="mt-0.5 mb-3 text-[11.5px] leading-relaxed text-fg-faint">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  )
}

function Field({
  label,
  children,
  hint
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-fg-dim">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10.5px] text-fg-faint">{hint}</span> : null}
    </label>
  )
}

const inputClass =
  'h-8 w-full rounded-lg border border-line bg-ink-850 px-2.5 text-[12.5px] text-fg outline-none transition-colors placeholder:text-fg-faint/50 focus:border-line-strong'

/** Commits on blur or Enter so a patch is not sent on every keystroke. */
function DraftInput({
  value,
  onCommit,
  placeholder,
  type = 'text',
  min,
  step
}: {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password' | 'number'
  min?: number
  step?: number
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      type={type}
      min={min}
      step={step}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
      className={inputClass}
    />
  )
}

export function SettingsPanel({
  open,
  onClose,
  payload,
  font,
  onPatch,
  onSetKey,
  onClearKey,
  onFont,
  onToast
}: Props) {
  const config = payload?.config
  const providers = payload?.providers ?? []
  const active = providers.find((entry) => entry.id === config?.activeProvider) ?? null
  const keyInfo = active ? payload?.keys[active.id] : undefined

  const [keyDraft, setKeyDraft] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsNote, setModelsNote] = useState('')
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    setModels([])
    setModelsNote('')
    setKeyDraft('')
  }, [active?.id])

  useEffect(() => {
    setPromptDraft(config?.polishPrompt ?? '')
  }, [open, config?.polishPrompt])

  useEffect(() => {
    if (!open) return
    if (promptDraft === (config?.polishPrompt ?? '')) return
    const timer = window.setTimeout(() => {
      void onPatch({ polishPrompt: promptDraft })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [promptDraft, config?.polishPrompt, onPatch, open])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open, onClose])

  async function saveKey() {
    if (!active) return
    const value = keyDraft.trim()
    if (!value) return
    setSavingKey(true)
    try {
      await onSetKey(active.id, value)
      setKeyDraft('')
      onToast('ok', `${active.label} key saved`)
      await fetchModels(value)
    } catch (error) {
      onToast('error', (error as Error).message)
    } finally {
      setSavingKey(false)
    }
  }

  async function fetchModels(key?: string) {
    if (!active) return
    setFetching(true)
    setModelsNote('')
    try {
      const result = await api.models(active.id, key)
      setModels(result.models)
      setModelsNote(result.message)
      if (!config?.model && result.models[0]) await onPatch({ model: result.models[0] })
    } catch (error) {
      setModelsNote((error as Error).message)
    } finally {
      setFetching(false)
    }
  }

  const usage = payload?.usage
  const options = models.length ? models : (active?.models ?? [])
  const modelValue = config?.model ?? ''

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/55 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-50 flex h-full w-[min(560px,100vw)] flex-col border-l border-line bg-ink-925 shadow-[-24px_0_60px_rgba(0,0,0,0.55)] transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
          <div>
            <h2 className="text-[13.5px] font-semibold text-fg">Settings</h2>
            <p className="text-[11px] text-fg-faint">Provider credentials, pass defaults, budgets</p>
          </div>
          <Button size="sm" variant="quiet" onClick={onClose} className="h-8 w-8">
            <X size={14} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="AI provider" hint="Same provider set as Lingarr Next. Keys live in an encrypted local file, never in the browser.">
            <div className="grid grid-cols-2 gap-1.5">
              {providers.map((provider: ProviderInfo) => {
                const connected = payload?.keys[provider.id]?.present
                const selected = provider.id === config?.activeProvider
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => onPatch({ activeProvider: provider.id, model: provider.models[0] ?? '' })}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      selected
                        ? 'border-line-strong bg-ink-750 shadow-[inset_2px_0_0_var(--color-fg-dim)]'
                        : 'border-line bg-ink-900 hover:border-line-strong hover:bg-ink-850'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        connected ? 'bg-ok' : provider.needsKey ? 'bg-fg-faint/40' : 'bg-fg-faint/25'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-fg">{provider.label}</span>
                      <span className="block truncate text-[10px] text-fg-faint">
                        {connected ? 'key saved' : provider.needsKey ? 'no key' : 'no key needed'}
                      </span>
                    </span>
                    {selected ? <Check size={11} className="shrink-0 text-fg-dim" weight="bold" /> : null}
                  </button>
                )
              })}
            </div>
          </Section>

          {active ? (
            <>
              <Section
                title={`${active.label} credentials`}
                hint={active.needsKey ? active.hint : 'Local server, no credential needed.'}
              >
                <div className="space-y-2.5">
                  {active.needsKey ? (
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <Key size={12} className="absolute top-2.5 left-2.5 text-fg-faint" />
                        <input
                          type="password"
                          value={keyDraft}
                          onChange={(event) => setKeyDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void saveKey()
                          }}
                          placeholder={keyInfo?.present ? `saved ${keyInfo.hint}` : 'paste API key'}
                          className={`${inputClass} pl-7`}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <Button size="sm" variant="primary" onClick={saveKey} disabled={!keyDraft.trim() || savingKey} className="h-8">
                        Save
                      </Button>
                      {keyInfo?.present ? (
                        <Button
                          size="sm"
                          variant="danger"
                          className="h-8 px-2"
                          onClick={async () => {
                            await onClearKey(active.id)
                            onToast('ok', `${active.label} key removed`)
                          }}
                        >
                          <Trash size={12} />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  <Field label="Endpoint" hint="Override the default base URL when you use a proxy or a self-hosted gateway.">
                    <DraftInput
                      value={config?.endpoints[active.id] ?? active.endpoint}
                      onCommit={(value) =>
                        onPatch({ providerId: active.id, endpoint: value.trim() === active.endpoint ? '' : value.trim() })
                      }
                    />
                  </Field>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => void fetchModels()} disabled={fetching} className="h-7">
                      <ArrowClockwise size={11} className={fetching ? 'animate-spin' : ''} />
                      {fetching ? 'Fetching' : 'Fetch models'}
                    </Button>
                    {modelsNote ? (
                      <span className="min-w-0 flex-1 text-[10.5px] leading-snug text-fg-faint">{modelsNote}</span>
                    ) : null}
                  </div>

                  <Field label="Model" hint="Pick from the catalogue, or type any model id the provider accepts.">
                    <div className="space-y-2">
                      <select
                        value={options.includes(modelValue) ? modelValue : ''}
                        onChange={(event) => onPatch({ model: event.target.value })}
                        className={`${inputClass} w-full`}
                      >
                        <option value="">{options.length ? 'Pick a model' : 'Fetch models first'}</option>
                        {options.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                      <DraftInput
                        value={modelValue}
                        onCommit={(value) => onPatch({ model: value.trim() })}
                        placeholder="or type a model id"
                      />
                    </div>
                  </Field>
                </div>
              </Section>

              <Section title="Default pass" hint="Used by the Polish button. The caret on any row runs a one-off pass instead.">
                <div className="grid grid-cols-3 gap-1.5">
                  {PASSES.map((pass) => {
                    const selected = (config?.mode ?? 'style') === pass.id
                    return (
                      <button
                        key={pass.id}
                        type="button"
                        onClick={() => onPatch({ mode: pass.id })}
                        className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          selected ? 'border-line-strong bg-ink-800' : 'border-line bg-ink-900 hover:bg-ink-850'
                        }`}
                      >
                        <span className="block text-[12px] text-fg">{pass.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-fg-faint">{pass.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </Section>

              <Section title="Fit bands and budget" hint="Amber starts here; red is measured overflow past maxPx.">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[11px] text-fg-dim">Amber threshold</span>
                      <span className="font-mono text-[11px] text-fg">
                        {Math.round((config?.warnRatio ?? 0.9) * 100)}% of max px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={70}
                      max={100}
                      step={1}
                      value={Math.round((config?.warnRatio ?? 0.9) * 100)}
                      onChange={(event) => onPatch({ warnRatio: Number(event.target.value) / 100 })}
                      className="h-1 w-full appearance-none rounded-full bg-ink-700 accent-fg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Daily budget (USD)" hint="Polish calls stop at the cap.">
                      <DraftInput
                        type="number"
                        min={0}
                        step={0.1}
                        value={String(config?.dailyUsd ?? 0)}
                        onCommit={(value) => onPatch({ dailyUsd: Number(value) || 0 })}
                      />
                    </Field>
                    <Field label="Monthly budget (USD)">
                      <DraftInput
                        type="number"
                        min={0}
                        step={1}
                        value={String(config?.monthlyUsd ?? 0)}
                        onCommit={(value) => onPatch({ monthlyUsd: Number(value) || 0 })}
                      />
                    </Field>
                  </div>
                  {usage && usage.day.unpriced > 0 ? (
                    <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-near">
                      <Warning size={11} className="mt-0.5 shrink-0" />
                      {usage.day.unpriced} call{usage.day.unpriced === 1 ? '' : 's'} today have no published rate, so the budget cannot
                      count them.
                    </p>
                  ) : null}
                </div>
              </Section>

              <Section title="Extra instruction" hint="Appended to every polish prompt. Keep it short and concrete.">
                <textarea
                  value={promptDraft}
                  onChange={(event) => setPromptDraft(event.target.value)}
                  rows={2}
                  spellCheck
                  placeholder="Example: prefer British spelling and never use exclamation marks."
                  className="w-full resize-none rounded-lg border border-line bg-ink-850 px-2.5 py-2 text-[12.5px] leading-relaxed text-fg outline-none placeholder:text-fg-faint/50 focus:border-line-strong"
                />
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11.5px] text-fg-dim">
                  <input
                    type="checkbox"
                    checked={config?.contextLine ?? true}
                    onChange={(event) => onPatch({ contextLine: event.target.checked })}
                    className="h-3.5 w-3.5 accent-fg"
                  />
                  Send the location line with each prompt
                </label>
              </Section>
            </>
          ) : null}

          <Section title="Measurement font" hint="Must match what the app renders with, otherwise the pixel budget is a guess.">
            {font ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_78px] gap-2">
                  <Field label="Family">
                    <DraftInput value={font.family} onCommit={(value) => onFont({ ...font, family: value.trim() || font.family })} />
                  </Field>
                  <Field label="Size px">
                    <DraftInput
                      type="number"
                      min={8}
                      step={0.5}
                      value={String(font.size)}
                      onCommit={(value) => onFont({ ...font, size: Number(value) || font.size })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Weight">
                    <DraftInput
                      type="number"
                      min={100}
                      step={100}
                      value={String(font.weight)}
                      onCommit={(value) => onFont({ ...font, weight: Number(value) || font.weight })}
                    />
                  </Field>
                  <Field label="Letter spacing px">
                    <DraftInput
                      type="number"
                      step={0.1}
                      value={String(font.letterSpacing)}
                      onCommit={(value) => onFont({ ...font, letterSpacing: Number(value) || 0 })}
                    />
                  </Field>
                </div>
                {fontInstalled(font) ? (
                  <p className="text-[10.5px] text-fg-faint">Font resolves on this machine.</p>
                ) : (
                  <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-near">
                    <Warning size={11} className="mt-0.5 shrink-0" />
                    This family is not installed here, so the browser substitutes one and pixel numbers will drift. Install it or
                    export the app's real font stack.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11.5px] text-fg-faint">Load an export first. Its font block drives the measurement.</p>
            )}
          </Section>

          <Section title="Usage this month">
            {usage ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'requests', value: String(usage.month.requests) },
                    { label: 'tokens', value: `${usage.month.inputTokens + usage.month.outputTokens}` },
                    { label: 'cost USD', value: `$${usage.month.costUsd.toFixed(3)}` }
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-line bg-ink-900 px-2.5 py-2">
                      <div className="font-mono text-[14px] tabular-nums text-fg">{stat.value}</div>
                      <div className="text-[10px] text-fg-faint">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 pt-1">
                  {Object.entries(usage.byProvider)
                    .sort((a, b) => b[1].requests - a[1].requests)
                    .map(([provider, bucket]) => (
                      <div key={provider} className="flex items-center justify-between font-mono text-[10.5px] text-fg-faint">
                        <span className="text-fg-dim">{provider}</span>
                        <span>
                          {bucket.requests} calls · {bucket.inputTokens + bucket.outputTokens} tok · ${bucket.costUsd.toFixed(3)}
                        </span>
                      </div>
                    ))}
                  {!Object.keys(usage.byProvider).length ? (
                    <p className="text-[11px] text-fg-faint">No polish calls yet this month.</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] text-fg-faint">Usage loads with the app.</p>
            )}
          </Section>

          <div className="flex items-start gap-2 px-5 py-4 text-[10.5px] leading-relaxed text-fg-faint">
            <Plugs size={12} className="mt-0.5 shrink-0" />
            <p>
              Requests go straight from this machine to the provider you pick. The local server binds to 127.0.0.1 and keeps keys in
              {' '}
              <span className="font-mono">data/keys.enc.json</span>.
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
