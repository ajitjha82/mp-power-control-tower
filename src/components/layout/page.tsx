import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives'
import { DemoTag } from '@/components/feedback/states'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function PageHeader({ title, subtitle, actions, eyebrow, demo = true }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; demo?: boolean }) {
  useDocumentTitle(title)
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight md:text-[1.375rem]">{title}</h1>
          {demo && <DemoTag />}
        </div>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)} aria-labelledby={id}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle id={id}>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </CardHeader>
      <CardContent className={cn('min-w-0 flex-1', bodyClassName)}>{children}</CardContent>
    </Card>
  )
}

/** Small label/value pair used across detail views. */
export function Field({ label, value, mono, className }: { label: string; value: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-sm', mono && 'num font-mono text-[13px]')}>{value}</dd>
    </div>
  )
}
