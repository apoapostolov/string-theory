// The inbox is a set of projects, not a pile of files.
//
// A project is a folder holding one app export plus the documents the project
// ships to its readers. The picker lists projects; the lane row inside the editor
// lists the files of the one that is open. Listing every file twice, in two
// places, is what made the picker unreadable.

import type { DocumentProgress, InboxEntry, Surface } from '../types'

export type ProjectKind = {
  /** Short label for the composition line: Internal, README, CHANGELOG, guide… */
  label: string
  surface: Surface
  count: number
}

export type ProjectGroup = {
  key: string
  label: string
  /** The entry to open first: the app export, else the earliest document. */
  primary: InboxEntry
  entries: InboxEntry[]
  kinds: ProjectKind[]
  fileCount: number
  strings: number
  errors: number
  /** Aggregate of the working sets already open for this project. */
  progress: DocumentProgress | null
  updated: number
}

/** Lane order inside a project: the app first, then documents in reading order. */
export function sortEntries(entries: InboxEntry[]): InboxEntry[] {
  const rank = (entry: InboxEntry) => (entry.surface === 'app' ? -1 : entry.order ?? 999)
  return [...entries].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    const byName = a.name.localeCompare(b.name)
    if (byName !== 0) return byName
    return a.id.localeCompare(b.id)
  })
}

/**
 * What a file is, named the way the lane row names it: the app's own strings are
 * "Internal", a document is its file name.
 */
export function kindLabel(entry: InboxEntry): string {
  if (entry.surface === 'app') return 'Internal'
  const named = entry.title || entry.source || entry.name
  return named.split('/').pop() || named
}

export function projectGroups(
  files: InboxEntry[],
  open: Array<{ id: string; progress: DocumentProgress; origin: 'inbox' | 'file' }>
): ProjectGroup[] {
  const byProject = new Map<string, InboxEntry[]>()
  for (const entry of files) {
    const key = entry.group || entry.name.replace(/\.strings\.json$/i, '')
    const list = byProject.get(key) ?? []
    list.push(entry)
    byProject.set(key, list)
  }

  const progressOf = (ids: Set<string>) => {
    let done = 0
    let wip = 0
    let total = 0
    for (const doc of open) {
      if (!ids.has(doc.id)) continue
      done += doc.progress.done
      wip += doc.progress.wip
      total += doc.progress.total
    }
    if (!total) return null
    return { done, wip, total, percent: Math.round((done / total) * 100) }
  }

  return [...byProject.entries()]
    .map(([key, entries]) => {
      const ordered = sortEntries(entries)
      const kinds: ProjectKind[] = []
      for (const entry of ordered) {
        const label = kindLabel(entry)
        const existing = kinds.find((kind) => kind.label === label)
        if (existing) existing.count += entry.count
        else kinds.push({ label, surface: entry.surface, count: entry.count })
      }
      const primary = ordered.find((entry) => entry.surface === 'app' && !entry.broken) ?? ordered[0]
      return {
        key,
        label: key,
        primary,
        entries: ordered,
        kinds,
        fileCount: ordered.length,
        strings: ordered.reduce((sum, entry) => sum + entry.count, 0),
        errors: ordered.reduce((sum, entry) => sum + (entry.errors ?? 0), 0),
        progress: progressOf(new Set(ordered.map((entry) => `inbox:${entry.id}`))),
        updated: Math.max(...ordered.map((entry) => entry.mtime))
      }
    })
    .sort((a, b) => b.updated - a.updated || a.label.localeCompare(b.label))
}
