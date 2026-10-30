import { useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  Copy,
  DownloadSimple,
  GraduationCap,
  Sparkle,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { ProfileEntry, ProviderInfo, StylePair, StyleProfile } from '../types'
import { api } from '../lib/api'
import { Button } from './Button'

type Props = {
  open: boolean
  onClose: () => void
  app: string
  context: string
  pairs: StylePair[]
  provider: ProviderInfo | null
  providerReady: boolean
  model: string
  profilesDir: string
  onOpenSettings: () => void
  onToast: (kind: 'ok' | 'error', message: string) => void
  onUsage: () => void
}

/** The file opens with front matter for the skill; the panel already shows it. */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-ink-800 px-1 py-[1px] font-mono text-[11.5px] text-fg-dim">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={index}>{part}</span>
  })
}

/** Renders the subset of markdown the analyst is asked to produce, nothing more. */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.replace(/\r/g, '').split('\n')
    const out: React.ReactNode[] = []
    let table: string[][] = []
    let list: string[] = []
    let paragraph: string[] = []

    const flushTable = () => {
      if (!table.length) return
      const [head, ...rows] = table.filter((row) => !row.every((cell) => /^-+$/.test(cell.trim())))
      out.push(
        <div key={`t${out.length}`} className="my-2.5 overflow-hidden rounded-lg border border-line">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-ink-900">
                {head.map((cell, index) => (
                  <th key={index} className="border-b border-line px-2.5 py-1.5 text-left font-medium text-fg-dim">
                    {cell.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex ? 'border-t border-line/70' : ''}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-2.5 py-1.5 align-top text-fg/90">
                      {inline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      table = []
    }
    const flushList = () => {
      if (!list.length) return
      out.push(
        <ul key={`l${out.length}`} className="my-2 list-disc space-y-1 pl-5 text-[12.5px] text-fg-dim">
          {list.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </ul>
      )
      list = []
    }
    const flushParagraph = () => {
      if (!paragraph.length) return
      out.push(
        <p key={`p${out.length}`} className="my-2 text-[12.5px] leading-relaxed text-fg-dim">
          {inline(paragraph.join(' '))}
        </p>
      )
      paragraph = []
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        flushTable()
        flushList()
        flushParagraph()
        continue
      }
      if (trimmed.startsWith('|')) {
        flushList()
        flushParagraph()
        table.push(trimmed.replace(/^\||\|$/g, '').split('|'))
        continue
      }
      if (/^#{1,3}\s/.test(trimmed)) {
        flushTable()
        flushList()
        flushParagraph()
        const level = trimmed.match(/^#+/)![0].length
        const label = trimmed.replace(/^#+\s*/, '')
        if (level <= 1) {
          out.push(
            <h2 key={`h${out.length}`} className="mt-1 mb-2 text-[14px] font-semibold text-fg">
              {label}
            </h2>
          )
        } else if (level === 2) {
          out.push(
            <h3 key={`h${out.length}`} className="mt-4 mb-1.5 text-[11px] tracking-[0.07em] text-fg-faint uppercase">
              {label}
            </h3>
          )
        } else {
          out.push(
            <h4 key={`h${out.length}`} className="mt-3 mb-1 text-[12.5px] font-medium text-fg-dim">
              {label}
            </h4>
          )
        }
        continue
      }
      if (/^[-*]\s/.test(trimmed)) {
        flushTable()
        flushParagraph()
        list.push(trimmed.replace(/^[-*]\s*/, ''))
        continue
      }
      flushTable()
      flushList()
      paragraph.push(trimmed)
    }
    flushTable()
    flushList()
    flushParagraph()
    return out
  }, [text])

  return <div>{blocks}</div>
}

export function StylePanel({
  open,
  onClose,
  app,
  context,
  pairs,
  provider,
  providerReady,
  model,
  profilesDir,
  onOpenSettings,
  onToast,
  onUsage
}: Props) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<StyleProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ProfileEntry[]>([])
  const [preview, setPreview] = useState<{ name: string; markdown: string } | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const listing = await api.profiles()
      setHistory(listing.files)
    } catch {
      setHistory([])
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    void loadHistory()
  }, [open])

  const enough = pairs.length >= 3
  const characters = pairs.reduce((sum, pair) => sum + pair.original.length + pair.rewrite.length + pair.where.length, 0)
  const estimate = (characters / 4 / 1000) * 1.2

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const profile = await api.runStyle({ app, context, pairs })
      setResult(profile)
      setPreview(null)
      onUsage()
      onToast('ok', `Style profile saved as ${profile.name}`)
      void loadHistory()
    } catch (failure) {
      setError((failure as Error).message)
      onToast('error', (failure as Error).message)
    } finally {
      setRunning(false)
    }
  }

  async function openProfile(name: string) {
    try {
      const profile = await api.profile(name)
      setPreview({ name: profile.name, markdown: profile.markdown })
      setResult(null)
    } catch (failure) {
      onToast('error', (failure as Error).message)
    }
  }

  const shown = result?.markdown ?? preview?.markdown ?? ''
  const shownName = result?.name ?? preview?.name ?? ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown)
      onToast('ok', 'Profile markdown copied')
    } catch {
      onToast('error', 'Clipboard blocked by the browser')
    }
  }

  function download() {
    const blob = new Blob([shown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = shownName || 'string-style.md'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10">
      <div className="w-full max-w-[820px] rounded-[14px] border border-line bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between border-b border-line px-5 py-3">
          <div className="flex items-start gap-2.5">
            <GraduationCap size={16} className="mt-0.5 text-fg-dim" />
            <div>
              <h2 className="text-[13.5px] font-semibold text-fg">Style analyst</h2>
              <p className="mt-0.5 text-[11.5px] text-fg-faint">
                Compares each shipped string with your rewrite and writes down the difference as rules.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-faint hover:bg-ink-800 hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_268px]">
          <div className="border-line px-5 py-4 md:border-r">
            {shown ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle size={13} weight="fill" className="text-ok" />
                  <span className="text-[11.5px] text-fg">{shownName}</span>
                  {result ? (
                    <span className="font-mono text-[10.5px] text-fg-faint">
                      {result.pairs} pairs · {result.model} ·{' '}
                      {result.usage.costUsd === null ? 'unpriced' : `$${result.usage.costUsd.toFixed(4)}`}
                    </span>
                  ) : null}
                </div>
                <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-line bg-ink-950/60 px-4 py-3">
                  <Markdown text={stripFrontmatter(shown)} />
                </div>
                {result ? (
                  <p className="mt-2 font-mono text-[10.5px] break-all text-fg-faint">{result.path}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-1.5">
                  <Button size="sm" onClick={copy} className="h-8">
                    <Copy size={12} />
                    Copy
                  </Button>
                  <Button size="sm" onClick={download} className="h-8">
                    <DownloadSimple size={12} />
                    Download .md
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => { setResult(null); setPreview(null) }} className="h-8">
                    Back
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-line bg-ink-850 px-3.5 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] tracking-[0.07em] text-fg-faint uppercase">Evidence</span>
                    <span className={`font-mono text-[11px] tabular-nums ${enough ? 'text-fg' : 'text-near'}`}>
                      {pairs.length} completed rewrite{pairs.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-faint">
                    Only strings you marked <span className="text-fg-dim">completed</span> and actually changed count. In
                    progress rows are left out, so the profile describes finished decisions, not drafts.
                  </p>
                </div>

                {!enough ? (
                  <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-near">
                    <WarningCircle size={12} weight="fill" className="mt-0.5 shrink-0" />
                    Mark at least three rewrites as completed. Three is the floor, twelve is a better sample.
                  </p>
                ) : null}

                <div className="mt-3 flex items-center gap-2 text-[11.5px]">
                  <Sparkle size={12} className="text-fg-faint" />
                  {providerReady && provider ? (
                    <span className="text-fg-dim">
                      {provider.label} · <span className="font-mono text-[11px]">{model || provider.models[0]}</span>
                    </span>
                  ) : (
                    <span className="text-fg-dim">
                      No provider connected.{' '}
                      <button type="button" onClick={onOpenSettings} className="text-fg underline decoration-line-strong underline-offset-2">
                        Connect one
                      </button>
                    </span>
                  )}
                  {providerReady && enough ? (
                    <span className="ml-auto font-mono text-[10.5px] text-fg-faint">
                      ~{(characters / 1000).toFixed(1)}k chars in, about ${estimate.toFixed(3)}
                    </span>
                  ) : null}
                </div>

                {error ? (
                  <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] text-over">
                    <WarningCircle size={12} weight="fill" className="mt-0.5 shrink-0" />
                    {error}
                  </p>
                ) : null}

                <div className="mt-3.5 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void run()}
                    disabled={running || !enough || !providerReady}
                    className="h-8"
                  >
                    <GraduationCap size={13} />
                    {running ? 'Reading your rewrites…' : result ? 'Run again' : 'Build profile'}
                  </Button>
                  <span className="text-[10.5px] text-fg-faint">
                    Saves to {profilesDir || 'profiles'} and charges the usage ledger like any other call.
                  </span>
                </div>

                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[11.5px] leading-relaxed text-fg-faint">
                    The file is shaped as a skill reference: front matter with the app, the pair count and the model,
                    then the rules. Point Settings at your style skill's references folder and it writes there directly,
                    so the next writer loads it with the skill.
                  </p>
                </div>
              </>
            )}
          </div>

          <aside className="px-4 py-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.07em] text-fg-faint uppercase">Saved profiles</span>
              <button
                type="button"
                aria-label="Refresh profiles"
                onClick={() => void loadHistory()}
                className="ml-auto flex h-5 w-5 items-center justify-center rounded text-fg-faint hover:bg-ink-800 hover:text-fg"
              >
                <ArrowClockwise size={11} className={loadingHistory ? 'animate-spin' : ''} />
              </button>
            </div>
            {history.length ? (
              <ul className="mt-1.5 space-y-0.5">
                {history.map((entry) => (
                  <li key={entry.name}>
                    <button
                      type="button"
                      onClick={() => void openProfile(entry.name)}
                      className={`block w-full rounded px-1.5 py-1 text-left transition-colors hover:bg-ink-800 ${
                        shownName === entry.name ? 'bg-ink-800' : ''
                      }`}
                    >
                      <span className="block truncate text-[11.5px] text-fg-dim">{entry.app}</span>
                      <span className="block truncate font-mono text-[10px] text-fg-faint">
                        {entry.pairs} pairs · {entry.created ? entry.created.slice(0, 10) : 'unknown date'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[11px] leading-relaxed text-fg-faint">
                Nothing yet. The first run writes the first profile.
              </p>
            )}
            <div className="mt-3 rounded-lg border border-line bg-ink-850 px-2.5 py-2">
              <p className="truncate font-mono text-[10px] text-fg-faint" title={profilesDir}>
                {profilesDir ? profilesDir.split(/[\\/]/).filter(Boolean).pop() : 'profiles'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
