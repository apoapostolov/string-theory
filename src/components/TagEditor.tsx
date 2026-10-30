import { useEffect, useId, useRef, useState } from 'react'
import { Check, Plus, X } from '@phosphor-icons/react'
import { TAG_GROUPS, isStandardTag, normalizeTag, tagLabel } from '../lib/tags'

type Props = {
  tags: string[]
  custom: string[]
  onToggle: (tag: string) => void
  onClose: () => void
}

/**
 * The tag picker for one string.
 *
 * Standard tags come from the shared vocabulary in groups; anything else a
 * project invented shows up under Custom so it can be reused rather than retyped.
 * A new tag is typed once and then belongs to the file.
 */
export function TagEditor({ tags, custom, onToggle, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const titleId = useId()

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    inputRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const needle = query.trim().toLowerCase()
  const matches = (id: string) => !needle || id.includes(needle) || tagLabel(id).toLowerCase().includes(needle)
  const typed = normalizeTag(query)
  const canCreate = typed.length > 1 && !isStandardTag(typed) && !tags.includes(typed) && !custom.includes(typed)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="st-tagpanel absolute top-full left-0 z-30 mt-1 w-[268px] rounded-[10px] border border-line-strong bg-ink-900 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canCreate) {
              event.preventDefault()
              onToggle(typed)
              setQuery('')
            }
          }}
          aria-label="Find or create a tag"
          placeholder="Tag this string"
          spellCheck={false}
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-ink-850 px-2 text-[11.5px] text-fg outline-none placeholder:text-fg-faint/70 focus:border-fg-dim"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tag picker"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-faint hover:bg-ink-800 hover:text-fg"
        >
          <X size={11} />
        </button>
      </div>

      {tags.length ? (
        <div className="flex flex-wrap gap-1 border-b border-line px-2 py-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag)}
              title={`Remove ${tagLabel(tag)}`}
              className="st-chip st-chip-on"
            >
              {tagLabel(tag)}
              <X size={8} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="max-h-[248px] overflow-y-auto py-1">
        {canCreate ? (
          <button
            type="button"
            onClick={() => {
              onToggle(typed)
              setQuery('')
            }}
            className="st-tagoption text-fg"
          >
            <Plus size={10} />
            <span className="truncate">
              Create <span className="font-mono">{typed}</span>
            </span>
          </button>
        ) : null}

        {custom.filter(matches).length ? (
          <div className="px-2 pt-1 pb-0.5 text-[9.5px] tracking-[0.08em] text-fg-faint uppercase">In this file</div>
        ) : null}
        {custom.filter(matches).map((tag) => (
          <button key={tag} type="button" onClick={() => onToggle(tag)} className="st-tagoption">
            <span className="w-2.5 shrink-0">{tags.includes(tag) ? <Check size={9} /> : null}</span>
            <span className="truncate font-mono">{tag}</span>
          </button>
        ))}

        {TAG_GROUPS.map((group) => {
          const visible = group.tags.filter(([id]) => matches(id))
          if (!visible.length) return null
          return (
            <div key={group.id}>
              <div className="px-2 pt-1.5 pb-0.5 text-[9.5px] tracking-[0.08em] text-fg-faint uppercase">{group.label}</div>
              {visible.map(([id, label]) => (
                <button key={id} type="button" onClick={() => onToggle(id)} className="st-tagoption">
                  <span className="w-2.5 shrink-0">{tags.includes(id) ? <Check size={9} /> : null}</span>
                  <span className="truncate">{label}</span>
                  <span className="ml-auto shrink-0 font-mono text-[9.5px] text-fg-faint/70">{id}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
