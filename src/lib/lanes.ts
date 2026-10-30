import type { DocumentRecord } from '../types'

export type Lane = {
  id: string
  /** `Internal` for the app's own strings, else the document's name. */
  label: string
  surface: 'app' | 'docs'
  /** Where the strings came from, such as `README.md`. */
  source: string
  order: number
  done: number
  total: number
}

/** `inbox:moo/readme.strings.json` → `moo`; a loose file is its own project. */
export function projectOf(docId: string): string {
  const path = docId.replace(/^[a-z]+:/i, '')
  const cut = path.lastIndexOf('/')
  return cut === -1 ? path : path.slice(0, cut)
}

/**
 * The lanes of one project, most important first.
 *
 * The app's own strings always lead, then the document with order 0 — the
 * README — then the changelog and whatever the README links to, in the order the
 * generator recorded. Files without an order keep their name order at the end,
 * so a hand-written docs file still lands somewhere sensible.
 */
export function lanesFor(docs: Record<string, DocumentRecord>, activeId: string | null): Lane[] {
  const active = activeId ? docs[activeId] : null
  if (!active) return []
  const project = projectOf(active.id)

  const lanes = Object.values(docs)
    .filter((doc) => {
      if (!doc?.meta) return false
      const origin = doc.id.replace(/^[a-z]+:/i, '')
      return projectOf(doc.id) === project && (doc.id.startsWith('inbox:') || origin === project)
    })
    .map((doc) => {
      const surface = doc.meta.surface ?? 'app'
      return {
        id: doc.id,
        label: surface === 'docs' ? doc.meta.title || doc.meta.source || doc.fileName : 'Internal',
        surface,
        source: doc.meta.source ?? '',
        order: surface === 'app' ? -1 : (doc.meta.order ?? 99),
        done: doc.rows.filter((row) => row.state === 'done').length,
        total: doc.rows.length
      } satisfies Lane
    })

  return lanes.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    if (a.surface !== b.surface) return a.surface === 'app' ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}
