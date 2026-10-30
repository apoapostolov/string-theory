import { useEffect } from 'react'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'

export type Toast = {
  id: number
  kind: 'ok' | 'error'
  message: string
}

type Props = {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.kind === 'error' ? 8000 : 3200)
    return () => window.clearTimeout(timer)
  }, [toast.id, toast.kind, onDismiss])

  return (
    <div
      role="status"
      className={`pointer-events-auto flex max-w-[420px] items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[12px] leading-relaxed shadow-[0_16px_40px_rgba(0,0,0,0.5)] ${
        toast.kind === 'error'
          ? 'border-over/35 bg-[#1d1113] text-fg'
          : 'border-line bg-ink-800 text-fg'
      }`}
    >
      {toast.kind === 'error' ? (
        <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-over" />
      ) : (
        <CheckCircle size={14} weight="fill" className="mt-0.5 shrink-0 text-ok" />
      )}
      <span className="min-w-0 flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 text-[11px] text-fg-faint hover:text-fg"
      >
        close
      </button>
    </div>
  )
}

export function Toasts({ toasts, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed bottom-16 left-4 z-[60] flex flex-col items-start gap-2">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
