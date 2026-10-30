import { ArrowRight } from '@phosphor-icons/react'
import type { Fit } from '../types'
import { signed } from '../lib/metrics'

const FIT_TEXT: Record<Fit, string> = {
  ok: 'text-ok',
  near: 'text-near',
  over: 'text-over',
  none: 'text-fg-dim'
}

const FIT_FILL: Record<Fit, string> = {
  ok: 'bg-ok',
  near: 'bg-near',
  over: 'bg-over',
  none: 'bg-fg-faint'
}

const FIT_WORD: Record<Fit, string> = {
  ok: 'fits',
  near: 'close to the limit',
  over: 'over the limit',
  none: 'no limit set'
}

type Props = {
  label: string
  before: number
  after: number
  limit: number | null
  unit: string
  warnRatio: number
  fit: Fit
  title?: string
}

export function Meter({ label, before, after, limit, unit, warnRatio, fit, title }: Props) {
  const delta = Math.round(after - before)
  const overflow = limit !== null && after > limit ? Math.round(after - limit) : 0
  const fill = limit ? Math.min(1, after / limit) : 0
  const warnAt = limit ? Math.min(1, warnRatio) : 0

  const spoken =
    limit !== null
      ? `${Math.round(after)} of ${Math.round(limit)} ${unit}, ${FIT_WORD[fit]}`
      : `${Math.round(after)} ${unit}, ${FIT_WORD[fit]}`

  return (
    <div className="min-w-0 flex-1" title={title}>
      <div className="st-num flex items-baseline gap-1.5 font-mono text-[11px] leading-none">
        <span className="w-[30px] shrink-0 text-[10px] tracking-[0.06em] text-fg-dim uppercase">{label}</span>
        <span className="text-fg-faint">{Math.round(before)}</span>
        <ArrowRight size={9} weight="bold" className="text-fg-faint/50" />
        <span className={`font-semibold ${FIT_TEXT[fit]}`}>{Math.round(after)}</span>
        <span className="text-[10px] text-fg-faint">{unit}</span>
        {limit !== null ? (
          <span className={`text-[10px] ${fit === 'over' ? 'text-over' : 'text-fg-faint'}`}>/ {Math.round(limit)}</span>
        ) : null}
        {fit === 'near' && overflow === 0 ? <span className="text-[10px] text-near">near</span> : null}
        {overflow > 0 ? (
          <span className="ml-auto text-[10px] text-over">+{overflow} over</span>
        ) : delta !== 0 ? (
          <span className={`ml-auto text-[10px] ${delta > 0 ? 'text-fg-dim' : 'text-fg-faint'}`}>
            {signed(delta)}
          </span>
        ) : null}
      </div>

      {limit !== null ? (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={Math.round(limit)}
          aria-valuenow={Math.round(after)}
          aria-valuetext={spoken}
          className="relative mt-[7px] h-[3px] w-full overflow-hidden rounded-full bg-ink-700"
        >
          <div
            className={`st-meter absolute inset-y-0 left-0 w-full rounded-full ${FIT_FILL[fit]}`}
            style={{ transform: `scaleX(${fill})` }}
          />
          <div className="absolute inset-y-0 w-[1px] bg-ink-950/80" style={{ left: `${warnAt * 100}%` }} />
        </div>
      ) : (
        <div aria-hidden="true" className="mt-[7px] h-[3px] w-full rounded-full bg-ink-750" />
      )}
    </div>
  )
}
