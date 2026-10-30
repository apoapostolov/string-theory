import { ArrowRight, Copy, DownloadSimple, WarningCircle } from '@phosphor-icons/react'
import { Button } from './Button'

type Props = {
  done: number
  wip: number
  total: number
  dirty: number
  over: number
  near: number
  onCopy: () => void
  onExport: () => void
  onRevertAll: () => void
  onJump: () => void
  canJump: boolean
}

export function StatusBar({ done, wip, total, dirty, over, near, onCopy, onExport, onRevertAll, onJump, canJump }: Props) {
  const pct = total ? Math.round((done / total) * 100) : 0

  return (
    <footer className="flex h-12 shrink-0 items-center gap-4 border-t border-line bg-ink-925 px-4">
      <div className="flex items-center gap-2.5">
        <div className="relative h-1 w-28 overflow-hidden rounded-full bg-ink-700">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${pct === 100 ? 'bg-ok' : 'bg-fg-dim'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-fg-dim tabular-nums">
          {done} / {total} completed
        </span>
        {wip > 0 ? <span className="font-mono text-[11px] text-near">{wip} in progress</span> : null}
      </div>

      {over > 0 ? (
        <span className="flex items-center gap-1 font-mono text-[11px] text-over">
          <WarningCircle size={12} weight="fill" />
          {over} will wrap
        </span>
      ) : null}
      {near > 0 ? <span className="font-mono text-[11px] text-near">{near} close to limit</span> : null}
      {over === 0 && near === 0 && total > 0 ? (
        <span className="font-mono text-[11px] text-ok">all within budget</span>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        {canJump ? (
          <Button size="sm" onClick={onJump} className="h-8">
            Next issue
            <ArrowRight size={11} />
          </Button>
        ) : null}
        <Button size="sm" variant="quiet" onClick={onRevertAll} disabled={dirty === 0} className="h-8">
          Revert all
        </Button>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button size="sm" onClick={onCopy} className="h-8">
          <Copy size={12} />
          Copy JSON
        </Button>
        <Button size="sm" variant="primary" onClick={onExport} className="h-8">
          <DownloadSimple size={13} />
          Export JSON
        </Button>
      </div>
    </footer>
  )
}
