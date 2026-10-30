import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import sampleRaw from '../samples/demo.strings.json?raw'
import type { ConfigPayload, Fit, FontMetrics, ModeId, Row, UsageSummary } from './types'
import { api } from './lib/api'
import { DEFAULT_FONT, parseExport } from './lib/format'
import { charFit, fitOf, measurePx, worstFit } from './lib/metrics'
import { FilterBar, TopBar, type FilterId } from './components/TopBar'
import { StringRow } from './components/StringRow'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/EmptyState'
import { FormatSpec } from './components/FormatSpec'
import { Toasts, type Toast } from './components/Toasts'
import { Button } from './components/Button'

const STORAGE_KEY = 'string-theory.workspace.v1'

type FileMeta = {
  name: string
  app: string
  context: string
  font: FontMetrics
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'strings'
  )
}

export default function App() {
  const [payload, setPayload] = useState<ConfigPayload | null>(null)
  const [apiDown, setApiDown] = useState(false)
  const [meta, setMeta] = useState<FileMeta | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [specOpen, setSpecOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dragging, setDragging] = useState(false)

  const toastSeq = useRef(1)
  const rowsRef = useRef<Row[]>(rows)
  const metaRef = useRef<FileMeta | null>(meta)
  const jumpCursor = useRef(0)
  rowsRef.current = rows
  metaRef.current = meta

  const pushToast = useCallback((kind: 'ok' | 'error', message: string) => {
    const id = toastSeq.current++
    setToasts((current) => [...current.slice(-3), { id, kind, message }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  // ------------------------------------------------------------ boot

  useEffect(() => {
    api
      .config()
      .then((next) => {
        setPayload(next)
        setApiDown(false)
      })
      .catch((error: Error) => {
        setApiDown(true)
        pushToast('error', `Local API unreachable: ${error.message}`)
      })
  }, [pushToast])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { meta?: FileMeta; rows?: Row[] }
      if (!saved.meta || !Array.isArray(saved.rows) || !saved.rows.length) return
      setMeta(saved.meta)
      setRows(saved.rows.map((row) => ({ ...row, busy: false, error: null })))
      pushToast('ok', `Restored ${saved.meta.app} · ${saved.rows.length} strings`)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [pushToast])

  useEffect(() => {
    if (!meta || !rows.length) return
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ meta, rows }))
      } catch {
        /* storage full or blocked; the export still works */
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [meta, rows])

  // ------------------------------------------------------------ file

  const applyFile = useCallback(
    (source: unknown, fileName: string) => {
      const parsed = parseExport(source, fileName)
      if (!parsed.rows.length) {
        pushToast('error', 'No strings found in that file.')
        return
      }
      setMeta({ name: parsed.name, app: parsed.app, context: parsed.context, font: parsed.font })
      setRows(
        parsed.rows.map((row) => ({
          ...row,
          text: row.source,
          ai: false,
          busy: false,
          error: null
        }))
      )
      setFilter('all')
      setQuery('')
      jumpCursor.current = 0
      pushToast('ok', `${parsed.rows.length} strings loaded from ${parsed.name}`)
      parsed.warnings.slice(0, 2).forEach((warning) => pushToast('ok', warning))
    },
    [pushToast]
  )

  const openFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        applyFile(JSON.parse(text), file.name)
      } catch (error) {
        pushToast('error', `Could not read ${file.name}: ${(error as Error).message}`)
      }
    },
    [applyFile, pushToast]
  )

  const loadSample = useCallback(() => {
    try {
      applyFile(JSON.parse(sampleRaw), 'demo.strings.json')
    } catch (error) {
      pushToast('error', (error as Error).message)
    }
  }, [applyFile, pushToast])

  const pickFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void openFile(file)
    }
    input.click()
  }, [openFile])

  // ------------------------------------------------------------ editing

  const onEdit = useCallback((key: string, text: string) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, text, error: null } : row)))
  }, [])

  const onRevert = useCallback((key: string) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, text: row.source, ai: false, error: null } : row))
    )
  }, [])

  const onRevertAll = useCallback(() => {
    if (!window.confirm('Revert every rewrite back to the source string?')) return
    setRows((current) => current.map((row) => ({ ...row, text: row.source, ai: false, error: null })))
    pushToast('ok', 'All strings reverted')
  }, [pushToast])

  const provider = useMemo(
    () => payload?.providers.find((entry) => entry.id === payload.config.activeProvider) ?? null,
    [payload]
  )
  const providerReady = Boolean(provider && (!provider.needsKey || payload?.keys[provider.id]?.present))

  const polish = useCallback(
    async (key: string, mode?: ModeId) => {
      const row = rowsRef.current.find((entry) => entry.key === key)
      const current = metaRef.current
      if (!row || !current) return
      if (!providerReady) {
        setSettingsOpen(true)
        pushToast('error', 'Connect an AI provider first.')
        return
      }

      setRows((list) => list.map((entry) => (entry.key === key ? { ...entry, busy: true, error: null } : entry)))
      try {
        const response = await api.polish({
          item: {
            id: row.id,
            text: row.text,
            where: row.where,
            maxPx: row.maxPx,
            maxChars: row.maxChars,
            px: measurePx(row.text, current.font),
            appContext: current.context
          },
          mode,
          app: current.app,
          font: current.font
        })
        setRows((list) =>
          list.map((entry) =>
            entry.key === key ? { ...entry, text: response.text, busy: false, ai: true, error: null } : entry
          )
        )
        setPayload((state) => (state ? { ...state, usage: response.summary } : state))
      } catch (error) {
        const message = (error as Error).message
        setRows((list) => list.map((entry) => (entry.key === key ? { ...entry, busy: false, error: message } : entry)))
        pushToast('error', message)
      }
    },
    [providerReady, pushToast]
  )

  // ------------------------------------------------------------ derived

  const font = meta?.font ?? DEFAULT_FONT
  const warnRatio = payload?.config.warnRatio ?? 0.9

  const decorated = useMemo(() => {
    return rows.map((row) => {
      const afterPx = measurePx(row.text, font)
      const pxFit = fitOf(afterPx, row.maxPx, warnRatio)
      const chFit = charFit(row.text.length, row.maxChars, pxFit, warnRatio)
      return { row, fit: worstFit(pxFit, chFit), changed: row.text !== row.source }
    })
  }, [rows, font, warnRatio])

  const counts = useMemo(() => {
    const base: Record<FilterId, number> = { all: decorated.length, changed: 0, near: 0, over: 0, untouched: 0 }
    const fitCounts: Record<Fit, number> = { ok: 0, near: 0, over: 0, none: 0 }
    for (const entry of decorated) {
      if (entry.changed) base.changed += 1
      else base.untouched += 1
      if (entry.fit === 'near') base.near += 1
      if (entry.fit === 'over') base.over += 1
      fitCounts[entry.fit] += 1
    }
    return { base, fitCounts }
  }, [decorated])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return decorated.filter((entry) => {
      if (filter === 'changed' && !entry.changed) return false
      if (filter === 'untouched' && entry.changed) return false
      if (filter === 'near' && entry.fit !== 'near') return false
      if (filter === 'over' && entry.fit !== 'over') return false
      if (!needle) return true
      return (
        entry.row.id.toLowerCase().includes(needle) ||
        entry.row.source.toLowerCase().includes(needle) ||
        entry.row.text.toLowerCase().includes(needle) ||
        entry.row.where.toLowerCase().includes(needle)
      )
    })
  }, [decorated, filter, query])

  // ------------------------------------------------------------ export

  const exportObject = useCallback(() => {
    const current = metaRef.current
    if (!current) return null
    const list = rowsRef.current
    return {
      format: 'string-theory/1',
      app: current.app,
      exportedAt: new Date().toISOString(),
      font: current.font,
      changed: list.filter((row) => row.text !== row.source).length,
      strings: list.map((row) => ({
        id: row.id,
        text: row.text,
        previous: row.source,
        where: row.where,
        maxPx: row.maxPx,
        maxChars: row.maxChars,
        changed: row.text !== row.source
      }))
    }
  }, [])

  const onExport = useCallback(() => {
    const data = exportObject()
    if (!data || !metaRef.current) return
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slug(metaRef.current.app)}.rewritten.json`
    anchor.click()
    URL.revokeObjectURL(url)
    pushToast('ok', `Exported ${data.strings.length} strings`)
  }, [exportObject, pushToast])

  const onCopy = useCallback(async () => {
    const data = exportObject()
    if (!data) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      pushToast('ok', 'Export JSON copied to the clipboard')
    } catch {
      pushToast('error', 'Clipboard blocked by the browser')
    }
  }, [exportObject, pushToast])

  const onJump = useCallback(() => {
    const problems = decorated.filter((entry) => entry.fit === 'over' || entry.fit === 'near')
    if (!problems.length) return
    const target = problems[jumpCursor.current % problems.length]
    jumpCursor.current += 1
    const node = document.getElementById(`row-${target.row.key}`)
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      node.classList.remove('st-land')
      void node.offsetWidth
      node.classList.add('st-land')
    }
  }, [decorated])

  // ------------------------------------------------------------ config writes

  const patchConfig = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        const next = await api.patchConfig(patch)
        setPayload(next)
      } catch (error) {
        pushToast('error', (error as Error).message)
      }
    },
    [pushToast]
  )

  const setKey = useCallback(
    async (providerId: string, key: string) => {
      const next = await api.setKey(providerId, key)
      setPayload(next)
    },
    []
  )

  const clearKey = useCallback(async (providerId: string) => {
    const next = await api.clearKey(providerId)
    setPayload(next)
  }, [])

  const onFont = useCallback((next: FontMetrics) => {
    setMeta((current) => (current ? { ...current, font: next } : current))
  }, [])

  // ------------------------------------------------------------ render

  const hasFile = Boolean(meta && rows.length)
  const usage: UsageSummary | null = payload?.usage ?? null

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-ink-950"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) void openFile(file)
      }}
    >
      <TopBar
        appName={meta?.app ?? ''}
        fileName={meta?.name ?? ''}
        count={rows.length}
        font={meta?.font ?? null}
        query={query}
        onQuery={setQuery}
        provider={provider}
        providerReady={providerReady}
        usage={usage}
        onOpenFile={openFile}
        onSettings={() => setSettingsOpen(true)}
        onSpec={() => setSpecOpen(true)}
      />

      {apiDown ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-over/30 bg-over/10 px-4 py-1.5 text-[11.5px] text-over">
          <span className="font-mono">API OFFLINE</span>
          <span className="text-fg-dim">Start the local server with npm start, or npm run dev during development.</span>
        </div>
      ) : null}

      {hasFile ? (
        <FilterBar
          filter={filter}
          onFilter={setFilter}
          counts={counts.base}
          fitCounts={counts.fitCounts}
          total={rows.length}
        />
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto">
        {!hasFile ? (
          <EmptyState onOpen={pickFile} onSample={loadSample} onFormat={() => setSpecOpen(true)} />
        ) : visible.length ? (
          <div className="pb-6">
            {visible.map((entry) => (
              <StringRow
                key={entry.row.key}
                row={entry.row}
                font={font}
                warnRatio={warnRatio}
                canPolish={providerReady}
                onEdit={onEdit}
                onPolish={polish}
                onRevert={onRevert}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-[13px] text-fg-dim">No strings match that filter.</p>
            <Button size="sm" variant="quiet" onClick={() => { setFilter('all'); setQuery('') }}>
              Clear filters
            </Button>
          </div>
        )}
      </main>

      {hasFile ? (
        <StatusBar
          changed={counts.base.changed}
          total={rows.length}
          over={counts.fitCounts.over}
          near={counts.fitCounts.near}
          onCopy={onCopy}
          onExport={onExport}
          onRevertAll={onRevertAll}
          onJump={onJump}
          canJump={counts.fitCounts.over + counts.fitCounts.near > 0}
        />
      ) : null}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        payload={payload}
        font={meta?.font ?? null}
        onPatch={patchConfig}
        onSetKey={setKey}
        onClearKey={clearKey}
        onFont={onFont}
        onToast={pushToast}
      />

      <FormatSpec open={specOpen} onClose={() => setSpecOpen(false)} />

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/80">
          <div className="rounded-[14px] border border-dashed border-line-strong px-8 py-6 text-[13px] text-fg">
            Drop the export to load it
          </div>
        </div>
      ) : null}
    </div>
  )
}
