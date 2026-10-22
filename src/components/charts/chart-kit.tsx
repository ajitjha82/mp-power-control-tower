import type { ReactElement, ReactNode } from 'react'
import { ResponsiveContainer, type TooltipProps } from 'recharts'
import { cn, fmtNum } from '@/lib/utils'

/** Theme-aware chart colours (resolve through CSS variables, so dark mode just works). */
export const C = {
  c1: 'hsl(var(--chart-1))',
  c2: 'hsl(var(--chart-2))',
  c3: 'hsl(var(--chart-3))',
  c4: 'hsl(var(--chart-4))',
  c5: 'hsl(var(--chart-5))',
  c6: 'hsl(var(--chart-6))',
  c7: 'hsl(var(--chart-7))',
  c8: 'hsl(var(--chart-8))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--destructive))',
  info: 'hsl(var(--info))',
  primary: 'hsl(var(--secondary))',
  muted: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--chart-grid))',
} as const
export const SERIES = [C.c1, C.c2, C.c3, C.c4, C.c5, C.c6, C.c7, C.c8]

export const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11 } } as const

export function ChartBox({ height = 240, children, className, label }: { height?: number; children: ReactElement; className?: string; label: string }) {
  return (
    <div className={cn('w-full', className)} style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}

type Fmt = (v: number, name: string) => string
/** Shared tooltip body for all Recharts charts. */
export function ChartTooltip({ active, payload, label, fmt, extra }: TooltipProps<number, string> & { fmt?: Fmt; extra?: (p: Record<string, unknown>) => ReactNode }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as Record<string, unknown> | undefined
  return (
    <div className="min-w-[160px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      {label !== undefined && <div className="mb-1 font-semibold">{String(label)}</div>}
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-sm" style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }} />
              {p.name}
            </span>
            <span className="num font-medium">{fmt ? fmt(Number(p.value), String(p.name)) : fmtNum(Number(p.value))}</span>
          </li>
        ))}
      </ul>
      {extra && row && <div className="mt-1.5 border-t pt-1.5 text-muted-foreground">{extra(row)}</div>}
    </div>
  )
}

/** Semi-circular gauge for headline compliance percentages. */
export function Gauge({ value, label, tone, size = 180, target }: { value: number; label: string; tone: 'success' | 'warning' | 'destructive'; size?: number; target?: number }) {
  const r = 70
  const cx = 90
  const cy = 86
  const arc = (v: number) => {
    const a = Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100)
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const
  }
  // Scale 80–100% across the arc so small differences remain legible.
  const scaled = (v: number) => ((Math.max(80, v) - 80) / 20) * 100
  const [ex, ey] = arc(scaled(value))
  const color = tone === 'success' ? C.success : tone === 'warning' ? C.warning : C.danger
  const tgt = target !== undefined ? arc(scaled(target)) : null
  return (
    <svg viewBox="0 0 180 100" width={size} height={(size * 100) / 180} role="img" aria-label={`${label}: ${value.toFixed(1)} percent`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="hsl(var(--muted))" strokeWidth={14} strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
      {tgt && <circle cx={tgt[0]} cy={tgt[1]} r={3.5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={1.5} />}
      <text x={cx} y={cy - 14} textAnchor="middle" className="num" style={{ fontSize: 26, fontWeight: 650, fill: 'hsl(var(--foreground))' }}>
        {value.toFixed(1)}%
      </text>
      <text x={cx - r} y={cy + 13} textAnchor="middle" style={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}>
        80%
      </text>
      <text x={cx + r} y={cy + 13} textAnchor="middle" style={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}>
        100%
      </text>
    </svg>
  )
}

/**
 * Accessible horizontal bar list — preferred over pies for categorical
 * breakdowns. Each row is a button when `onSelect` is provided (drill-down).
 */
export function BarList({
  items,
  onSelect,
  selected,
  format = fmtNum,
  color = C.primary,
  max,
}: {
  items: Array<{ key: string; label: ReactNode; value: number; sub?: ReactNode; color?: string }>
  onSelect?: (key: string) => void
  selected?: string | null
  format?: (v: number) => string
  color?: string
  max?: number
}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium">{it.label}</span>
              <span className="num shrink-0 font-semibold">
                {format(it.value)}
                {it.sub && <span className="ml-1.5 font-normal text-muted-foreground">{it.sub}</span>}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(it.value / m) * 100}%`, background: it.color ?? color }} />
            </div>
          </>
        )
        return (
          <li key={it.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(it.key)}
                aria-pressed={selected === it.key}
                className={cn('w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected === it.key && 'bg-accent ring-1 ring-secondary/40')}
              >
                {inner}
              </button>
            ) : (
              <div className="px-2 py-1.5">{inner}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function Legend({ items }: { items: Array<{ label: string; color: string; dashed?: boolean }> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn('h-0.5 w-3.5', i.dashed && 'border-t-2 border-dashed bg-transparent')} style={i.dashed ? { borderColor: i.color } : { background: i.color, height: 8, width: 8, borderRadius: 2 }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
