import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors active:translate-y-[0.5px] disabled:opacity-40 disabled:pointer-events-none select-none'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-fg text-ink-950 hover:bg-white',
  ghost: 'border border-line bg-ink-850 text-fg hover:border-line-strong hover:bg-ink-800',
  quiet: 'text-fg-dim hover:bg-ink-800 hover:text-fg',
  danger: 'border border-over/40 text-over hover:bg-over/10'
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-9 px-3.5 text-[13px]'
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

export function Button({ variant = 'ghost', size = 'md', className = '', children, ...rest }: Props) {
  return (
    <button type="button" className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

type IconProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
  variant?: Variant
  size?: Size
}

export function IconButton({ label, children, variant = 'quiet', size = 'sm', className = '', ...rest }: IconProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${BASE} ${VARIANTS[variant]} ${size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
