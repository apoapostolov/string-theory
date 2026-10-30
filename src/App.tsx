import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import sampleRaw from '../samples/demo.strings.json?raw'
import type {
  ConfigPayload,
  DocumentProgress,
  DocumentRecord,
  FileMeta,
  Fit,
  FontMetrics,
  ImportIssue,
  InboxEntry,
  InboxListing,
  ModeId,
  ParsedFile,
  Row,
  RowState,
  StylePair,
  UsageSummary
} from './types'
import { api } from './lib/api'
import { DEFAULT_FONT, parseExport } from './lib/format'
import { charFit, measurePx, wrapFit, wrapText, worstFit } from './lib/metrics'
import { FilterBar, TopBar, type FilterId } from './components/TopBar'
import { StringRow } from './components/StringRow'
import { StatusBar } from './components/StatusBar'
import { SettingsPanel } from './components/SettingsPanel'
import { EmptyState } from './components/EmptyState'
import { FormatSpec } from './components/FormatSpec'
import { ImportReport } from './components/ImportReport'
import { SourcePicker, type SourceSummary } from './components/SourcePicker'
import { StylePanel } from './components/StylePanel'
import { Toasts, type Toast } from './components/Toasts'
import { TagBar, type TagCount } from './components/TagBar'
import { ChangePrompt } from './components/ChangePrompt'
import { LaneBar } from './components/LaneBar'
import { lanesFor } from './lib/lanes'
import { useVirtualRows } from './lib/useVirtualRows'
import { customTagsIn, isStandardTag, normalizeTag, tagLabel } from './lib/tags'
import { Button } from './components/Button'

const LIBRARY_KEY = 'string-theory.library.v2'
const LEGACY_KEY = 'string-theory.workspace.v1'

type Library = {
  activeId: string | null
  docs: Record<string, DocumentRecord>
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'strings'
  )
}

function progressOf(rows: Row[]): DocumentProgress {
  const total = rows.length
  const done = rows.filter((row) => row.state === 'done').length
  const wip = rows.filter((row) => row.state === 'wip').length
  return { total, done, wip, percent: total ? Math.round((done / total) * 100) : 0 }
}

function toRows(parsed: ParsedFile): Row[] {
  return parsed.rows.map((row) => ({
    ...row,
    text: row.source,
    ai: false,
    busy: false,
    error: null,
    state: 'normal' as RowState
  }))
}

/** Working sets saved before states existed load as untouched rows. */
function revive(rows: Row[]): Row[] {
  return rows.map((row) => ({
    ...row,
    busy: false,
    error: null,
    // Working sets saved before tags existed carry no list at all.
    tags: Array.isArray(row.tags) ? row.tags : [],
    note: typeof row.note === 'string' ? row.note : '',
    state: row.state ?? 'normal'
  }))
}

function metaOf(parsed: ParsedFile): FileMeta {
  return {
    name: parsed.name,
    app: parsed.app,
    context: parsed.context,
    font: parsed.font,
    version: parsed.version,
    surface: parsed.surface ?? 'app',
    source: parsed.source ?? '',
    order: parsed.order ?? null,
    title: parsed.title ?? '',
    issues: parsed.issues as ImportIssue[]
  }
}

function documentFrom(parsed: ParsedFile, id: string, origin: DocumentRecord['origin'], path: string): DocumentRecord {
  return {
    id,
    label: parsed.app,
    fileName: parsed.name,
    origin,
    path,
    meta: metaOf(parsed),
    rows: toRows(parsed),
    savedAt: new Date().toISOString()
  }
}

export default function App() {
  const [payload, setPayload] = useState<ConfigPayload | null>(null)
  const [apiDown, setApiDown] = useState(false)
  const [library, setLibrary] = useState<Library>({ activeId: null, docs: {} })
  const [meta, setMeta] = useState<FileMeta | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [inbox, setInbox] = useState<InboxListing | null>(null)
  const [scanning, setScanning] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [promptOpen, setPromptOpen] = useState(false)
  const listRef = useRef<HTMLElement | null>(null)
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [tagMode, setTagMode] = useState<'any' | 'all'>('any')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [specOpen, setSpecOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dragging, setDragging] = useState(false)

  const toastSeq = useRef(1)
  const rowsRef = useRef<Row[]>(rows)
  const metaRef = useRef<FileMeta | null>(meta)
  const libraryRef = useRef<Library>(library)
  const activeIdRef = useRef<string | null>(library.activeId)
  const jumpCursor = useRef(0)
  rowsRef.current = rows
  metaRef.current = meta
  libraryRef.current = library
  activeIdRef.current = library.activeId

  const pushToast = useCallback((kind: 'ok' | 'error', message: string) => {
    const id = toastSeq.current++
    setToasts((current) => [...current.slice(-3), { id, kind, message }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const scanInbox = useCallback(
    async (quiet = false) => {
      setScanning(true)
      try {
        const listing = await api.inbox()
        setInbox(listing)
        if (!quiet) {
          pushToast('ok', listing.files.length ? `${listing.files.length} exports in the inbox` : 'Inbox is empty')
        }
        return listing
      } catch (error) {
        if (!quiet) pushToast('error', `Inbox scan failed: ${(error as Error).message}`)
        return null
      } finally {
        setScanning(false)
      }
    },
    [pushToast]
  )

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
    void scanInbox(true)
  }, [pushToast, scanInbox])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Library>
        const docs = saved.docs ?? {}
        const valid = Object.fromEntries(
          Object.entries(docs).filter(([, doc]) => doc && Array.isArray(doc.rows) && doc.meta && doc.id)
        ) as Record<string, DocumentRecord>
        const ids = Object.keys(valid)
        if (!ids.length) return
        const activeId = saved.activeId && valid[saved.activeId] ? saved.activeId : ids[0]
        setLibrary({ activeId, docs: valid })
        setMeta(valid[activeId].meta)
        setRows(revive(valid[activeId].rows))
        pushToast('ok', `Restored ${ids.length} working set${ids.length === 1 ? '' : 's'}`)
        return
      }
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (!legacy) return
      const saved = JSON.parse(legacy) as { meta?: FileMeta; rows?: Row[] }
      if (!saved.meta || !Array.isArray(saved.rows) || !saved.rows.length) return
      const doc: DocumentRecord = {
        id: `file:${saved.meta.name}`,
        label: saved.meta.app,
        fileName: saved.meta.name,
        origin: 'file',
        path: '',
        meta: {
          ...saved.meta,
          version: saved.meta.version ?? 'string-theory/1',
          issues: Array.isArray(saved.meta.issues) ? saved.meta.issues : []
        },
        rows: revive(saved.rows),
        savedAt: new Date().toISOString()
      }
      setLibrary({ activeId: doc.id, docs: { [doc.id]: doc } })
      setMeta(doc.meta)
      setRows(doc.rows)
      localStorage.removeItem(LEGACY_KEY)
      pushToast('ok', `Restored ${doc.label}`)
    } catch {
      localStorage.removeItem(LIBRARY_KEY)
      localStorage.removeItem(LEGACY_KEY)
    }
  }, [pushToast])

  // Persist every working set, not just the visible one.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = libraryRef.current
      const docs = { ...current.docs }
      const id = activeIdRef.current
      const liveMeta = metaRef.current
      if (id && liveMeta) {
        const existing = docs[id]
        docs[id] = {
          id,
          label: liveMeta.app,
          fileName: liveMeta.name,
          origin: existing?.origin ?? 'file',
          path: existing?.path ?? '',
          meta: liveMeta,
          rows: rowsRef.current,
          savedAt: new Date().toISOString()
        }
      }
      try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify({ activeId: current.activeId, docs }))
      } catch {
        /* storage full or blocked; export still works */
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [library, rows, meta])

  // ------------------------------------------------------------ documents

  const flushActive = useCallback(() => {
    const id = activeIdRef.current
    const liveMeta = metaRef.current
    if (!id || !liveMeta) return libraryRef.current.docs
    const docs = { ...libraryRef.current.docs }
    const existing = docs[id]
    docs[id] = {
      id,
      label: liveMeta.app,
      fileName: liveMeta.name,
      origin: existing?.origin ?? 'file',
      path: existing?.path ?? '',
      meta: liveMeta,
      rows: rowsRef.current,
      savedAt: new Date().toISOString()
    }
    return docs
  }, [])

  const activate = useCallback((id: string) => {
    const docs = flushActive()
    const target = docs[id]
    if (!target) return
    setLibrary({ activeId: id, docs })
    setMeta(target.meta)
    setRows(revive(target.rows))
    setFilter('all')
    setQuery('')
    setReportOpen(true)
    jumpCursor.current = 0
  }, [flushActive])

  const adoptDoc = useCallback(
    (doc: DocumentRecord) => {
      const docs = { ...flushActive(), [doc.id]: doc }
      setLibrary({ activeId: doc.id, docs })
      setMeta(doc.meta)
      setRows(doc.rows)
      setFilter('all')
      setQuery('')
      setReportOpen(true)
      jumpCursor.current = 0
    },
    [flushActive]
  )

  const removeDoc = useCallback(
    (id: string) => {
      const docs = { ...libraryRef.current.docs }
      delete docs[id]
      const remaining = Object.keys(docs)
      if (activeIdRef.current === id) {
        const next = remaining[0]
        if (next) {
          const doc = docs[next]
          setLibrary({ activeId: next, docs })
          setMeta(doc.meta)
          setRows(revive(doc.rows))
        } else {
          setLibrary({ activeId: null, docs })
          setMeta(null)
          setRows([])
        }
      } else {
        setLibrary({ activeId: libraryRef.current.activeId, docs })
      }
      pushToast('ok', 'Removed from this session. The file is untouched.')
    },
    [pushToast]
  )

  // ------------------------------------------------------------ loading

  /**
   * Opens a project: the file that was clicked and every export beside it,
   * because the app's strings and the prose that describes them are one project
   * and reading both is the point of the file bar.
   *
   * The documents are collected first and committed in one library write. Adding
   * them one at a time let each activation flush the previous document back into
   * a library object that did not yet contain the one before it, which silently
   * dropped the first file of every project.
   */
  const loadInboxFile = useCallback(
    async (entry: InboxEntry) => {
      const project = entry.group || ''
      const siblings = (inbox?.files ?? []).filter(
        (file) => (file.group || '') === project && !file.broken && (project !== '' || file.id === entry.id)
      )
      const queue = siblings.length ? siblings : [entry]
      setBusyId(entry.id)
      try {
        const loaded: DocumentRecord[] = []
        for (const file of queue) {
          const fileId = `inbox:${file.id}`
          if (libraryRef.current.docs[fileId]) continue
          try {
            const payload = await api.openInboxFile(file.id)
            const parsed = parseExport(payload.json, payload.name)
            if (!parsed.rows.length) continue
            loaded.push(documentFrom(parsed, fileId, 'inbox', file.id))
          } catch (error) {
            pushToast('error', `${file.name}: ${(error as Error).message}`)
          }
        }

        const docs = { ...flushActive() }
        for (const doc of loaded) docs[doc.id] = doc

        const clicked = `inbox:${entry.id}`
        const target =
          loaded.find((doc) => doc.meta.surface === 'app')?.id ??
          (docs[clicked] ? clicked : loaded[0]?.id) ??
          null

        if (!target) {
          pushToast('error', `Nothing to open in ${project || 'that file'}.`)
          return
        }

        setLibrary({ activeId: target, docs })
        setMeta(docs[target].meta)
        setRows(revive(docs[target].rows))
        setFilter('all')
        setQuery('')
        setReportOpen(true)
        jumpCursor.current = 0

        const docCount = queue.filter((file) => docs[`inbox:${file.id}`]).length
        const prose = queue.filter((file) => docs[`inbox:${file.id}`]?.meta.surface === 'docs').length
        if (docCount > 1) {
          pushToast('ok', `Opened ${docCount} files${prose ? ` · ${prose} of them prose` : ''}`)
        }
      } finally {
        setBusyId(null)
      }
    },
    [flushActive, inbox, pushToast]
  )

  const loadFromFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const parsed = parseExport(JSON.parse(text), file.name)
        if (!parsed.rows.length) {
          pushToast('error', `No strings found in ${file.name}.`)
          return
        }
        const id = `file:${file.name}:${file.size}:${file.lastModified}`
        const existing = libraryRef.current.docs[id]
        if (existing) {
          activate(id)
          pushToast('ok', `${file.name} is already open`)
          return
        }
        adoptDoc(documentFrom(parsed, id, 'file', ''))
        pushToast('ok', `${parsed.rows.length} strings from ${parsed.app}`)
      } catch (error) {
        pushToast('error', `Could not read ${file.name}: ${(error as Error).message}`)
      }
    },
    [activate, adoptDoc, pushToast]
  )

  const loadSample = useCallback(() => {
    const id = 'sample:demo'
    const existing = libraryRef.current.docs[id]
    if (existing) {
      activate(id)
      return
    }
    try {
      const parsed = parseExport(JSON.parse(sampleRaw), 'demo.strings.json')
      adoptDoc(documentFrom(parsed, id, 'file', ''))
      pushToast('ok', `${parsed.rows.length} strings in the sample`)
    } catch (error) {
      pushToast('error', (error as Error).message)
    }
  }, [activate, adoptDoc, pushToast])

  const pickFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      files.forEach((file, index) => {
        window.setTimeout(() => void loadFromFile(file), index * 120)
      })
    }
    input.click()
  }, [loadFromFile])

  // ------------------------------------------------------------ editing

  const onEdit = useCallback((key: string, text: string) => {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row
        // A rewrite counts as finished the moment it differs from the source;
        // putting it back exactly means there is nothing left to review.
        const state: RowState = text === row.source ? 'normal' : row.state === 'normal' ? 'done' : row.state
        return { ...row, text, state, error: null }
      })
    )
  }, [])

  const onCycleState = useCallback((key: string) => {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row
        const state: RowState = row.state === 'done' ? 'wip' : 'done'
        return { ...row, state }
      })
    )
  }, [])

  const onResetState = useCallback((key: string) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, state: 'normal' } : row)))
  }, [])

  const onRevert = useCallback((key: string) => {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, text: row.source, ai: false, error: null, state: 'normal' } : row
      )
    )
  }, [])

  const onRevertAll = useCallback(() => {
    if (!window.confirm('Revert every rewrite in this file back to the source string?')) return
    setRows((current) =>
      current.map((row) => ({ ...row, text: row.source, ai: false, error: null, state: 'normal' }))
    )
    pushToast('ok', 'All strings reverted')
  }, [pushToast])

  const provider = useMemo(
    () => payload?.providers.find((entry) => entry.id === payload.config.activeProvider) ?? null,
    [payload]
  )
  const oauthReady = Boolean(
    provider && payload?.config.authModes?.[provider.id] !== 'key' && payload?.oauth.sessions?.[provider.id]?.present
  )
  const keyReady = Boolean(provider && (!provider.needsKey || payload?.keys[provider.id]?.present))
  const providerReady = Boolean(provider && (oauthReady || keyReady))

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
            maxPx: row.maxPxPerLine,
            tags: row.tags ?? [],
            note: row.note,
            maxPxPerLine: row.maxPxPerLine,
            maxLines: row.maxLines,
            maxChars: row.maxChars,
            px: measurePx(row.text, row.font ?? current.font),
            appContext: current.context,
            surface: current.surface ?? 'app'
          },
          mode,
          app: current.app,
          font: row.font ?? current.font
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

  const warnRatio = payload?.config.warnRatio ?? 0.9

  const isDocs = meta?.surface === 'docs'

  const decorated = useMemo(() => {
    return rows.map((row) => {
      const rowFont = row.font ?? meta?.font ?? DEFAULT_FONT
      const wrap = wrapText(row.text, row.maxPxPerLine, rowFont)
      const pxFit = isDocs
        ? { fit: 'none' as const, leak: false, lastRatio: 0, lines: wrap.lines.length, maxLines: 0, widest: 0, overBy: 0, tooManyLines: false }
        : wrapFit(wrap, { maxPxPerLine: row.maxPxPerLine, maxLines: row.maxLines }, warnRatio)
      const chFit = charFit(row.text.length, row.maxChars, pxFit.fit, warnRatio)
      return {
        row,
        font: rowFont,
        wrap,
        pxFit,
        fit: worstFit(pxFit.fit, chFit),
        changed: row.text !== row.source
      }
    })
  }, [rows, meta, warnRatio, isDocs])

  const counts = useMemo(() => {
    const base: Record<FilterId, number> = { all: decorated.length, normal: 0, wip: 0, done: 0, near: 0, over: 0 }
    const fitCounts: Record<Fit, number> = { ok: 0, near: 0, over: 0, none: 0 }
    for (const entry of decorated) {
      base[entry.row.state] += 1
      if (entry.fit === 'near') base.near += 1
      if (entry.fit === 'over') base.over += 1
      fitCounts[entry.fit] += 1
    }
    return { base, fitCounts }
  }, [decorated])

  const dirty = useMemo(() => decorated.filter((entry) => entry.changed).length, [decorated])

  /** Every tag in the file with its own progress, standard tags first. */
  const tagIndex = useMemo<{ tags: TagCount[]; untagged: number }>(() => {
    const seen = new Map<string, TagCount>()
    let untagged = 0
    for (const entry of decorated) {
      const tags = entry.row.tags ?? []
      if (!tags.length) untagged += 1
      for (const id of tags) {
        const current = seen.get(id) ?? { id, total: 0, done: 0, wip: 0, group: '' }
        current.total += 1
        if (entry.row.state === 'done') current.done += 1
        if (entry.row.state === 'wip') current.wip += 1
        seen.set(id, current)
      }
    }
    const tags = [...seen.values()].sort((a, b) => {
      const standard = Number(isStandardTag(b.id)) - Number(isStandardTag(a.id))
      if (standard) return standard
      if (a.total !== b.total) return b.total - a.total
      return a.id.localeCompare(b.id)
    })
    return { tags, untagged }
  }, [decorated])

  const isTagFiltering = activeTags.length > 0

  const matchesTags = useCallback(
    (row: Row) => {
      if (!activeTags.length) return true
      const tags = row.tags ?? []
      if (activeTags.includes('~untagged') && tags.length === 0) return true
      const named = activeTags.filter((tag) => tag !== '~untagged')
      if (!named.length) return false
      return tagMode === 'all' ? named.every((tag) => tags.includes(tag)) : named.some((tag) => tags.includes(tag))
    },
    [activeTags, tagMode]
  )

  const toggleTag = useCallback((id: string) => {
    setActiveTags((current) => (current.includes(id) ? current.filter((tag) => tag !== id) : [...current, id]))
  }, [])

  const toggleRowTag = useCallback((key: string, tag: string) => {
    const id = normalizeTag(tag)
    if (!id) return
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row
        const tags = row.tags ?? []
        return { ...row, tags: tags.includes(id) ? tags.filter((value) => value !== id) : [...tags, id] }
      })
    )
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return decorated.filter((entry) => {
      if (filter === 'normal' && entry.row.state !== 'normal') return false
      if (filter === 'wip' && entry.row.state !== 'wip') return false
      if (filter === 'done' && entry.row.state !== 'done') return false
      if (filter === 'near' && entry.fit !== 'near') return false
      if (filter === 'over' && entry.fit !== 'over') return false
      if (!matchesTags(entry.row)) return false
      if (!needle) return true
      return (
        entry.row.id.toLowerCase().includes(needle) ||
        entry.row.source.toLowerCase().includes(needle) ||
        entry.row.text.toLowerCase().includes(needle) ||
        entry.row.where.toLowerCase().includes(needle) ||
        (entry.row.tags ?? []).some((tag) => tag.includes(needle) || tagLabel(tag).toLowerCase().includes(needle))
      )
    })
  }, [decorated, filter, query, matchesTags])

  // A thousand strings is a hundred thousand pixels nobody is looking at.
  const visibleKeys = useMemo(() => visible.map((entry) => entry.row.key), [visible])
  const pinned = pinnedKey && visibleKeys.includes(pinnedKey) ? pinnedKey : null
  const virtual = useVirtualRows({ keys: visibleKeys, estimate: 96, scrollRef: listRef, pinnedKey: pinned })

  // Evidence for the style analyst: finished rewrites, never untouched rows.
  const stylePairs = useMemo<StylePair[]>(
    () =>
      decorated
        .filter((entry) => entry.row.state === 'done' && entry.changed)
        .map((entry) => ({
          id: entry.row.id,
          where: entry.row.where,
          original: entry.row.source,
          rewrite: entry.row.text
        })),
    [decorated]
  )

  const customTags = useMemo(() => customTagsIn(rows), [rows])

  const docSummaries = useMemo<SourceSummary[]>(() => {
    const list = Object.values(library.docs).map((doc) => ({
      id: doc.id,
      label: doc.label,
      fileName: doc.fileName,
      origin: doc.origin,
      progress: progressOf(doc.rows),
      notes: doc.meta.issues.length,
      savedAt: doc.savedAt
    }))
    const activeId = library.activeId
    const index = list.findIndex((doc) => doc.id === activeId)
    if (index >= 0 && rows.length) {
      list[index] = { ...list[index], progress: progressOf(rows), savedAt: new Date().toISOString() }
    }
    return list.sort((a, b) => {
      if (a.id === activeId) return -1
      if (b.id === activeId) return 1
      return Date.parse(b.savedAt) - Date.parse(a.savedAt)
    })
  }, [library.docs, library.activeId, rows])

  const currentSource = docSummaries.find((doc) => doc.id === library.activeId) ?? null

  // Every file of the active project, in reading order: internal, README,
  // changelog, then whatever the README links to.
  const lanes = useMemo(() => lanesFor(library.docs, library.activeId), [library.docs, library.activeId])

  // ------------------------------------------------------------ export

  const exportObject = useCallback(() => {
    const current = metaRef.current
    if (!current) return null
    const list = rowsRef.current
    const docsFile = current.surface === 'docs'
    return {
      format: 'string-theory/1',
      app: current.app,
      ...(docsFile
        ? { surface: 'docs', source: current.source, order: current.order ?? undefined, title: current.title || undefined }
        : {}),
      exportedAt: new Date().toISOString(),
      ...(docsFile ? {} : { font: current.font }),
      changed: list.filter((row) => row.text !== row.source).length,
      strings: list.map((row) => ({
        id: row.id,
        text: row.text,
        previous: row.source,
        where: row.where,
        // A document has no layout, so its rows carry no layout fields at all.
        ...(docsFile
          ? {}
          : {
              maxPxPerLine: row.maxPxPerLine,
              maxLines: row.maxLines,
              maxPxTotal: row.maxPxTotal,
              maxChars: row.maxChars
            }),
        tags: row.tags ?? [],
        ...(row.note ? { note: row.note } : {}),
        ...(row.font ? { font: row.font } : {}),
        changed: row.text !== row.source,
        state: row.state,
        // An emptied row marked complete means the string is gone.
        ...(!row.text.trim() && row.state === 'done' && row.source.trim() ? { removed: true } : {})
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
    const current = metaRef.current
    anchor.download =
      current.surface === 'docs'
        ? `${slug(current.title || current.source || current.app)}.rewritten.json`
        : `${slug(current.app)}.rewritten.json`
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
    const index = visibleKeys.indexOf(target.row.key)
    if (index >= 0) virtual.scrollToIndex(index)
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
        if (patch.inboxDir !== undefined) void scanInbox(true)
      } catch (error) {
        pushToast('error', (error as Error).message)
      }
    },
    [pushToast, scanInbox]
  )

  const refreshPayload = useCallback(async () => {
    try {
      setPayload(await api.config())
    } catch {
      /* the toast already covered an API outage */
    }
  }, [])

  const setKey = useCallback(async (providerId: string, key: string) => {
    const next = await api.setKey(providerId, key)
    setPayload(next)
  }, [])

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
        const files = Array.from(event.dataTransfer.files ?? [])
        files.forEach((file, index) => {
          window.setTimeout(() => void loadFromFile(file), index * 120)
        })
      }}
    >
      <TopBar
        source={
          <SourcePicker
            current={currentSource}
            docs={docSummaries}
            inbox={inbox}
            scanning={scanning}
            busyId={busyId}
            onSelectDoc={activate}
            onOpenInbox={(entry) => void loadInboxFile(entry)}
            onRemoveDoc={removeDoc}
            onRescan={() => void scanInbox()}
            onOpenFile={pickFile}
            onToast={pushToast}
          />
        }
        count={rows.length}
        font={meta?.surface === 'docs' ? null : (meta?.font ?? null)}
        query={query}
        onQuery={setQuery}
        provider={provider}
        providerReady={providerReady}
        usage={usage}
        onSettings={() => setSettingsOpen(true)}
        onSpec={() => setSpecOpen(true)}
        onStyle={hasFile ? () => setStyleOpen(true) : null}
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
          prose={isDocs}
        />
      ) : null}

      {hasFile ? (
        <LaneBar lanes={lanes} activeId={library.activeId} onPick={activate} />
      ) : null}

      {hasFile ? (
        <TagBar
          tags={tagIndex.tags}
          active={activeTags}
          mode={tagMode}
          untagged={tagIndex.untagged}
          onToggle={toggleTag}
          onMode={setTagMode}
          onClear={() => setActiveTags([])}
        />
      ) : null}

      {hasFile && reportOpen && meta?.issues?.length ? (
        <ImportReport
          fileName={meta.name}
          version={meta.version}
          issues={meta.issues}
          onDismiss={() => setReportOpen(false)}
        />
      ) : null}

      <main ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {!hasFile ? (
          <EmptyState onOpen={pickFile} onSample={loadSample} onFormat={() => setSpecOpen(true)} />
        ) : visible.length ? (
          <div
            role="list"
            aria-label="Strings in this file"
            className="st-rows"
            data-start={virtual.start}
            data-end={virtual.end}
            data-count={visible.length}
            style={{ height: virtual.totalHeight + 64 }}
          >
            {Array.from({ length: Math.max(0, virtual.end - virtual.start) }, (_, offset) => virtual.start + offset)
              .concat(virtual.extra)
              .map((index) => {
                const entry = visible[index]
                if (!entry) return null
                return (
                  <div
                    key={entry.row.key}
                    role="presentation"
                    className="st-rowwrap"
                    style={{ transform: `translateY(${virtual.offsetOf(index)}px)` }}
                    onFocus={() => setPinnedKey(entry.row.key)}
                  >
                    <div ref={(node) => virtual.register(entry.row.key, node)}>
                      <StringRow
                        row={entry.row}
                        font={entry.font}
                        wrap={entry.wrap}
                        wrapFit={entry.pxFit}
                        warnRatio={warnRatio}
                        canPolish={providerReady}
                        onEdit={onEdit}
                        onPolish={polish}
                        onRevert={onRevert}
                        onCycleState={onCycleState}
                        onResetState={onResetState}
                        customTags={customTags}
                        activeTags={activeTags}
                        onToggleTag={toggleRowTag}
                        onFilterTag={toggleTag}
                        even={index % 2 === 1}
                        docs={isDocs}
                        setsize={visible.length}
                        posinset={index + 1}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-[13px] text-fg-dim">No strings match that filter.</p>
            {isTagFiltering ? (
              <p className="text-[11.5px] text-fg-faint">
                {activeTags.map((tag) => (tag === '~untagged' ? 'Untagged' : tagLabel(tag))).join(tagMode === 'all' ? ' + ' : ' or ')}
                {' '}narrows the list; the status filter still applies.
              </p>
            ) : null}
            <Button size="sm" variant="quiet" onClick={() => { setFilter('all'); setQuery(''); setActiveTags([]) }}>
              Clear filters
            </Button>
          </div>
        )}
      </main>

      {hasFile ? (
        <StatusBar
          done={counts.base.done}
          wip={counts.base.wip}
          total={rows.length}
          dirty={dirty}
          over={counts.fitCounts.over}
          near={counts.fitCounts.near}
          onCopy={onCopy}
          onExport={onExport}
          onPrompt={() => setPromptOpen(true)}
          onRevertAll={onRevertAll}
          onJump={onJump}
          canJump={counts.fitCounts.over + counts.fitCounts.near > 0}
        />
      ) : null}

      {hasFile ? (
        <ChangePrompt
          open={promptOpen}
          onClose={() => setPromptOpen(false)}
          rows={rows}
          app={meta?.app || 'this app'}
          onToast={pushToast}
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

      <StylePanel
        open={styleOpen}
        onClose={() => setStyleOpen(false)}
        app={meta?.app ?? ''}
        context={meta?.context ?? ''}
        pairs={stylePairs}
        provider={provider}
        providerReady={providerReady}
        model={payload?.config.model || provider?.models[0] || ''}
        profilesDir={payload?.profiles.dir ?? ''}
        onOpenSettings={() => {
          setStyleOpen(false)
          setSettingsOpen(true)
        }}
        onToast={pushToast}
        onUsage={refreshPayload}
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/80">
          <div className="rounded-[14px] border border-dashed border-line-strong px-8 py-6 text-[13px] text-fg">
            Drop one export, or several to compare projects
          </div>
        </div>
      ) : null}
    </div>
  )
}
