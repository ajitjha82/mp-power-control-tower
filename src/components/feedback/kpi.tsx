import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Tone } from '@/types'
import { Tip } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { toneBg, toneText } from './status'

export interface KpiProps {
  label: string
  value: string
  secondary?: ReactNode
  delta?: { value: number; label?: string; higherIsBetter?: boolean; unit?: string }
  tone?: Tone
  tooltip?: string
  href?: string
  icon?: LucideIcon
  className?: string
  onClick?: () => void
  emphasis?: boolean
}

/** KPI tile: primary value, secondary context, trend, status rail, tooltip and drill-down. */
export function KpiCard({ label, value, secondary, delta, tone = 'neutral', tooltip, href, icon: Icon, className, onClick, emphasis }: KpiProps) {
  const up = (delta?.value ?? 0) > 0
  const good = delta ? (delta.higherIsBetter ?? true) === up || delta.value === 0 : true
  const body = (
    <>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px] rounded-l-lg', tone === 'neutral' ? 'bg-primary/30' : toneBg[tone])} />
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="size-3.5" aria-hidden />}
          {label}
        </span>
        {tooltip && (
          <Tip content={tooltip}>
            <span tabIndex={0} role="img" aria-label={`About ${label}`} className="text-muted-foreground/70 hover:text-foreground">
              <Info className="size-3.5" />
            </span>
          </Tip>
        )}
      </div>
      <div className={cn('num mt-1.5 font-semibold tracking-tight', emphasis ? 'text-[1.7rem] leading-8' : 'text-2xl', tone !== 'neutral' && toneText[tone])}>{value}</div>
      <div className="mt-1 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {delta && (
          <span className={cn('inline-flex items-center font-medium', good ? 'text-success' : 'text-destructive')}>
            {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            <span className="num">
              {up ? '+' : ''}
              {delta.value.toFixed(1)}
              {delta.unit ?? ' pp'}
            </span>
            <span className="sr-only">{good ? '(favourable)' : '(adverse)'}</span>
          </span>
        )}
        {delta?.label && <span>{delta.label}</span>}
        {secondary && <span className="truncate">{secondary}</span>}
      </div>
      {(href || onClick) && <ChevronRight aria-hidden className="absolute bottom-3 right-2.5 size-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />}
    </>
  )
  const cls = cn(
    'group relative block rounded-lg border bg-card py-3 pl-4 pr-3 text-left shadow-[0_1px_2px_rgba(15,30,60,0.04)] transition-[box-shadow,border-color]',
    (href || onClick) && 'hover:border-secondary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  )
  if (href)
    return (
      <Link to={href} className={cls} aria-label={`${label}: ${value}. Open details`}>
        {body}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'w-full')}>
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-4', className)}>{children}</div>
}
