import { useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { tagLabel } from '../lib/tags'
import { TagEditor } from './TagEditor'

type Props = {
  tags: string[]
  custom: string[]
  active: string[]
  onFilter: (tag: string) => void
  onToggle: (tag: string) => void
}

/**
 * The tags a string carries, and the way to change them.
 *
 * A chip filters the list, which is the common move while working; the plus
 * opens the picker, where a tag is added or removed. Both live in one line under
 * the source text so the row stays a single block.
 */
export function RowTags({ tags, custom, active, onFilter, onToggle }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onFilter(tag)}
          aria-pressed={active.includes(tag)}
          title={`Show every ${tagLabel(tag)} string`}
          className="st-chip"
        >
          {tagLabel(tag)}
        </button>
      ))}
      {!tags.length ? <span className="text-[10.5px] text-fg-faint/75">no tags</span> : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Edit tags for this string${tags.length ? ` (${tags.length} set)` : ''}`}
        aria-expanded={open}
        title="Edit tags"
        className="st-chip st-chip-add"
      >
        <Plus size={9} />
      </button>

      {open ? (
        <TagEditor
          tags={tags}
          custom={custom}
          onToggle={(tag) => onToggle(tag)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}
