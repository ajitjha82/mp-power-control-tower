import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { AlertCircle, FlaskConical, Inbox, Lock, RefreshCw } from 'lucide-react'
import { Button, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export function EmptyState({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <div className="rounded-full bg-muted p-3 text-muted-foreground">
        <Inbox className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <div className="rounded-full bg-destructive-soft p-3 text-destructive">
        <AlertCircle className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium">Unable to load data</p>
      <p className="max-w-md text-xs text-muted-foreground">{msg}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  )
}

/** Renders loading / error / empty / success for a TanStack Query result. */
export function QueryState<T>({
  query,
  skeleton,
  isEmpty,
  empty,
  children,
}: {
  query: UseQueryResult<T>
  skeleton?: ReactNode
  isEmpty?: (d: T) => boolean
  empty?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{skeleton ?? <BlockSkeleton />}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="No records match the current filters." />}</>
  return <>{children(query.data)}</>
}

export function BlockSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 p-4', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2 p-4" style={{ height }} aria-busy="true" aria-label="Loading chart">
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
      ))}
    </div>
  )
}
export function KpiSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border bg-card p-3">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-3 h-6 w-1/2" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

export function DemoTag({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-warning', className)}>
      <FlaskConical className="size-3" aria-hidden /> Demo data
    </span>
  )
}

/** Visible notice that a consequential action would require authorisation + audit in production. */
export function AuthNotice({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-2 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-xs text-info', className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {children ?? 'In production this action requires role-based authorisation enforced server-side and is written to the immutable audit trail. This prototype only simulates it.'}
      </span>
    </div>
  )
}
