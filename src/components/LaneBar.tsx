import type { Lane } from '../lib/lanes'

type Props = {
  lanes: Lane[]
  activeId: string | null
  onPick: (id: string) => void
}

/**
 * The files of one project, in the order a reader meets them.
 *
 * The app's own strings lead, because they are what the app says; the README,
 * the changelog and the documents the README links to follow, each with its own
 * progress. A project of one file shows nothing here: there is nothing to switch.
 */
export function LaneBar({ lanes, activeId, onPick }: Props) {
  if (lanes.length < 2) return null

  return (
    <div
      role="group"
      aria-label="Files in this project"
      className="st-lanebar flex h-9 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line px-3"
    >
      <span className="shrink-0 text-[10px] tracking-[0.08em] text-fg-faint uppercase">Files</span>
      {lanes.map((lane) => {
        const active = lane.id === activeId
        return (
          <button
            key={lane.id}
            type="button"
            aria-pressed={active}
            title={lane.surface === 'docs' ? `Prose from ${lane.source || lane.label}` : 'The app’s own strings'}
            onClick={() => onPick(lane.id)}
            className={`st-pill shrink-0 ${lane.surface === 'docs' ? '' : 'st-pill-app'}`}
          >
            <span className="max-w-[180px] truncate">{lane.label}</span>
            <span className="st-pill-count tabular-nums">
              {lane.done}/{lane.total}
            </span>
          </button>
        )
      })}
    </div>
  )
}
