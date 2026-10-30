import { useState } from 'react'
import { CaretDown, WarningCircle, X } from '@phosphor-icons/react'
import type { ImportIssue } from '../types'

const INTEGRITY: ImportIssue['code'][] = ['missing-id', 'duplicate-id', 'no-max-px', 'no-strings']

type Props = {
  fileName: string
  version: string
  issues: ImportIssue[]
  onDismiss: () => void
}

/**
 * What the import had to repair. Opens itself when a repair affects merging or
 * measurement, because those silently ruin an export.
 */
export function ImportReport({ fileName, version, issues, onDismiss }: Props) {
  const [open, setOpen] = useState(
    issues.some((issue) => issue.level === 'error' || INTEGRITY.includes(issue.code))
  )
  if (!issues.length) return null

  const errors = issues.filter((issue) => issue.level === 'error').length
  const tone = errors ? 'text-over' : 'text-near'
  const border = errors ? 'border-l-over' : 'border-l-near'
  const headline = errors
    ? `Import failed on ${errors} point${errors === 1 ? '' : 's'}`
    : `Imported with ${issues.length} note${issues.length === 1 ? '' : 's'}`

  return (
    <div className={`border-l-[3px] ${border} border-b border-b-line bg-ink-900/70`}>
      <div className="flex items-center gap-2.5 px-4 py-2">
        <WarningCircle size={13} weight="fill" className={`shrink-0 ${tone}`} />
        <span className="text-[11.5px] font-medium text-fg">{headline}</span>
        <span className="min-w-0 truncate font-mono text-[10.5px] text-fg-faint">
          {fileName} · {version}
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-fg-dim hover:bg-ink-800 hover:text-fg"
        >
          {open ? 'Hide' : 'Review'}
          <CaretDown size={9} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          aria-label="Dismiss import notes"
          onClick={onDismiss}
          className="flex h-6 w-6 items-center justify-center rounded text-fg-faint hover:bg-ink-800 hover:text-fg"
        >
          <X size={11} />
        </button>
      </div>
      {open ? (
        <ul className="space-y-1 px-4 pb-2.5">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="flex gap-2.5 text-[11.5px] leading-relaxed">
              <span
                className={`w-[104px] shrink-0 font-mono text-[10px] uppercase ${
                  issue.level === 'error' ? 'text-over' : 'text-fg-faint'
                }`}
              >
                {issue.code}
              </span>
              <span className="text-fg-dim">{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
