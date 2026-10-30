import { useEffect, useRef, useState } from 'react'
import {
  ArrowClockwise,
  CaretDown,
  Check,
  Files,
  FolderOpen,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { DocumentProgress, DocumentRecord, InboxEntry, InboxListing } from '../types'

export type SourceSummary = {
  id: string
  label: string
  fileName: string
  origin: DocumentRecord['origin']
  progress: DocumentProgress
  notes: number
  savedAt: string
}

type Props = {
  current: SourceSummary | null
  docs: SourceSummary[]
  inbox: InboxListing | null
  scanning: boolean
  busyId: string | null
  onSelectDoc: (id: string) => void
  onOpenInbox: (entry: InboxEntry) => void
  onRemoveDoc: (id: string) => void
  onRescan: () => void
  onOpenFile: () => void
}

function relativeTime(stamp: number | string): string {
  const time = typeof stamp === 'number' ? stamp : Date.parse(stamp)
  if (!Number.isFinite(time)) return ''
  const diff = Date.now() - time
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`
  return new Date(time).toLocaleDateString()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Progress({ progress, muted }: { progress: DocumentProgress; muted?: boolean }) {
  const tone = progress.percent === 100 ? 'bg-ok' : progress.percent > 0 ? 'bg-fg-dim' : 'bg-ink-700'
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="relative h-[3px] w-20 overflow-hidden rounded-full bg-ink-700">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${tone} ${muted ? 'opacity-60' : ''}`}
          style={{ width: `${progress.percent}%` }}
        />
      </span>
      <span
        className={`w-[34px] text-right font-mono text-[11px] font-medium tabular-nums ${
          progress.percent === 100 ? 'text-ok' : muted ? 'text-fg-dim' : 'text-fg'
        }`}
      >
        {progress.percent}%
      </span>
      <span className="w-[38px] font-mono text-[10px] tabular-nums text-fg-faint">
        {progress.done}/{progress.total}
      </span>
    </span>
  )
}

export function SourcePicker({
  current,
  docs,
  inbox,
  scanning,
  busyId,
  onSelectDoc,
  onOpenInbox,
  onRemoveDoc,
  onRescan,
  onOpenFile
}: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const byInboxId = new Map(docs.filter((doc) => doc.origin === 'inbox').map((doc) => [doc.id, doc]))
  const inboxFiles = inbox?.files ?? []
  const diskDocs = docs.filter((doc) => doc.origin === 'file')
  const listedInboxIds = new Set(inboxFiles.map((entry) => `inbox:${entry.id}`))
  const staleDocs = docs.filter((doc) => doc.origin === 'inbox' && !listedInboxIds.has(doc.id))

  function selectDoc(id: string) {
    setOpen(false)
    onSelectDoc(id)
  }

  function selectInbox(entry: InboxEntry) {
    setOpen(false)
    onOpenInbox(entry)
  }

  function openLocalFile() {
    setOpen(false)
    onOpenFile()
  }

  const totalProgress = docs.reduce(
    (acc, doc) => ({
      done: acc.done + doc.progress.done,
      wip: acc.wip + doc.progress.wip,
      total: acc.total + doc.progress.total
    }),
    { done: 0, wip: 0, total: 0 }
  )
  const overall = totalProgress.total ? Math.round((totalProgress.done / totalProgress.total) * 100) : 0

  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Switch source"
        className={`flex min-w-0 max-w-[380px] items-center gap-2 rounded-lg border px-2 py-1 transition-colors ${
          open ? 'border-line-strong bg-ink-850' : 'border-transparent hover:border-line hover:bg-ink-900'
        }`}
      >
        <Files size={13} className="shrink-0 text-fg-faint" />
        <span className={`truncate text-[13px] font-medium ${current ? 'text-fg' : 'text-fg-dim'}`}>
          {current?.label ?? 'Choose a source'}
        </span>
        {current && current.progress.done > 0 ? (
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-fg-faint">
            {current.progress.done}/{current.progress.total}
          </span>
        ) : null}
        <CaretDown size={10} weight="bold" className={`shrink-0 text-fg-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute top-[38px] left-0 z-40 w-[460px] overflow-hidden rounded-[12px] border border-line bg-ink-850 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="text-[11px] font-semibold tracking-[0.02em] text-fg">Sources</span>
            <span className="font-mono text-[10px] text-fg-faint">
              {docs.length} open · {inboxFiles.length} in inbox
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={onRescan}
                disabled={scanning}
                title="Rescan the inbox"
                className="flex h-6.5 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-fg-dim hover:bg-ink-800 hover:text-fg disabled:opacity-40"
              >
                <ArrowClockwise size={11} className={scanning ? 'animate-spin' : ''} />
                {scanning ? 'Scanning' : 'Rescan'}
              </button>
              <button
                type="button"
                onClick={openLocalFile}
                className="flex h-6.5 items-center gap-1 rounded-md px-1.5 text-[10.5px] text-fg-dim hover:bg-ink-800 hover:text-fg"
              >
                <FolderOpen size={11} />
                Open file
              </button>
            </div>
          </div>

          <div className="max-h-[52vh] overflow-y-auto">
            <div className="flex items-baseline gap-2 px-3 pt-2 pb-1">
              <span className="text-[10px] tracking-[0.07em] text-fg-faint uppercase">Inbox</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-fg-faint/80" title={inbox?.dir}>
                {inbox?.dir ?? 'inbox'}
              </span>
            </div>

            {!inboxFiles.length ? (
              <p className="px-3 pb-2 text-[11px] leading-relaxed text-fg-faint">
                Empty. Another project or agent writes one export here per app, and it shows up without a restart.
              </p>
            ) : (
              <ul className="divide-y divide-line pb-1">
                {inboxFiles.map((entry) => {
                  const doc = byInboxId.get(`inbox:${entry.id}`)
                  const active = current?.id === `inbox:${entry.id}`
                  const selection = doc ? doc.id : `inbox:${entry.id}`
                  return (
                    <li key={entry.id}>
                      <div
                        className={`group flex items-center gap-2 px-3 py-1.5 ${
                          active ? 'bg-ink-750 shadow-[inset_2px_0_0_var(--color-fg)]' : 'hover:bg-ink-800/60'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={Boolean(entry.broken) || busyId === entry.id}
                          onClick={() => (doc ? selectDoc(doc.id) : selectInbox(entry))}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className={`truncate text-[12.5px] ${active ? 'font-medium text-fg' : 'text-fg-dim'}`}>
                                {entry.app || entry.name}
                              </span>
                              {active ? <Check size={10} weight="bold" className="shrink-0 text-fg" /> : null}
                              {entry.errors ? (
                                <span className="flex shrink-0 items-center gap-0.5 font-mono text-[9.5px] text-over">
                                  <WarningCircle size={9} weight="fill" />
                                  {entry.errors} error{entry.errors === 1 ? '' : 's'}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              <span className="truncate font-mono text-[10px] text-fg-faint">
                                {entry.group ? `${entry.group}/` : ''}
                                {entry.name}
                              </span>
                              <span className="shrink-0 text-fg-faint/50">·</span>
                              <span className="shrink-0 text-[10px] text-fg-faint">{entry.count} strings</span>
                              <span className="shrink-0 text-fg-faint/50">·</span>
                              <span className="shrink-0 text-[10px] text-fg-faint">{relativeTime(entry.mtime)}</span>
                              {entry.warnings && !entry.errors ? (
                                <>
                                  <span className="shrink-0 text-fg-faint/50">·</span>
                                  <span className="shrink-0 text-[10px] text-near">
                                    {entry.warnings} note{entry.warnings === 1 ? '' : 's'}
                                  </span>
                                </>
                              ) : null}
                            </span>
                            {entry.broken ? (
                              <span className="mt-0.5 block truncate text-[10px] text-over">{entry.broken}</span>
                            ) : null}
                          </span>
                          {doc ? (
                            <Progress progress={doc.progress} muted={!active} />
                          ) : (
                            <span className="shrink-0 font-mono text-[10px] text-fg-faint">
                              not open <span className="text-fg-faint/50">·</span> {formatBytes(entry.bytes)}
                            </span>
                          )}
                        </button>
                        {doc ? (
                          <button
                            type="button"
                            aria-label="Remove working set"
                            title="Close this working set. The file stays in the inbox."
                            onClick={() => onRemoveDoc(selection)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink-750 hover:text-fg"
                          >
                            <X size={10} />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {staleDocs.length ? (
              <>
                <div className="flex items-baseline gap-2 border-t border-line px-3 pt-2 pb-1">
                  <span className="text-[10px] tracking-[0.07em] text-fg-faint uppercase">Gone from the inbox</span>
                </div>
                <ul className="divide-y divide-line pb-1">
                  {staleDocs.map((doc) => {
                    const active = current?.id === doc.id
                    return (
                      <li key={doc.id}>
                        <div
                          className={`group flex items-center gap-2 px-3 py-1.5 ${
                            active ? 'bg-ink-750 shadow-[inset_2px_0_0_var(--color-fg)]' : 'hover:bg-ink-800/60'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => selectDoc(doc.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className={`truncate text-[12.5px] ${active ? 'font-medium text-fg' : 'text-fg-dim'}`}>
                                  {doc.label}
                                </span>
                                {active ? <Check size={10} weight="bold" className="shrink-0 text-fg" /> : null}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5">
                                <span className="truncate font-mono text-[10px] text-fg-faint">{doc.fileName}</span>
                                <span className="shrink-0 text-[10px] text-near">file removed, rewrites kept</span>
                              </span>
                            </span>
                            <Progress progress={doc.progress} muted={!active} />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove working set"
                            title="Discard this working set"
                            onClick={() => onRemoveDoc(doc.id)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink-750 hover:text-fg"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}

            {diskDocs.length ? (
              <>
                <div className="flex items-baseline gap-2 border-t border-line px-3 pt-2 pb-1">
                  <span className="text-[10px] tracking-[0.07em] text-fg-faint uppercase">Opened from disk</span>
                </div>
                <ul className="divide-y divide-line pb-1">
                  {diskDocs.map((doc) => {
                    const active = current?.id === doc.id
                    return (
                      <li key={doc.id}>
                        <div
                          className={`group flex items-center gap-2 px-3 py-1.5 ${
                            active ? 'bg-ink-750 shadow-[inset_2px_0_0_var(--color-fg)]' : 'hover:bg-ink-800/60'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => selectDoc(doc.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className={`truncate text-[12.5px] ${active ? 'font-medium text-fg' : 'text-fg-dim'}`}>{doc.label}</span>
                                {active ? <Check size={10} weight="bold" className="shrink-0 text-fg" /> : null}
                              </span>
                              <span className="mt-0.5 flex items-center gap-1.5">
                                <span className="truncate font-mono text-[10px] text-fg-faint">{doc.fileName}</span>
                                <span className="shrink-0 text-fg-faint/50">·</span>
                                <span className="shrink-0 text-[10px] text-fg-faint">{relativeTime(doc.savedAt)}</span>
                              </span>
                            </span>
                            <Progress progress={doc.progress} muted={!active} />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove from session"
                            title="Remove from this session"
                            onClick={() => onRemoveDoc(doc.id)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-ink-750 hover:text-fg"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t border-line px-3 py-2">
            {totalProgress.total ? (
              <span className="font-mono text-[10px] text-fg-dim">
                {overall}% overall · {totalProgress.done}/{totalProgress.total} done
                {totalProgress.wip > 0 ? ` · ${totalProgress.wip} in progress` : ''} · {docs.length} open
              </span>
            ) : (
              <span className="text-[10px] text-fg-faint">Pick a source to start rewriting.</span>
            )}
            <span className="ml-auto font-mono text-[10px] text-fg-faint">{inboxFiles.length} in inbox</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
