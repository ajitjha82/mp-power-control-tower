import { AlertOctagon, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import type { TimelineEvent } from '@/types'
import { cn } from '@/lib/utils'

const STATE = {
  done: { icon: CheckCircle2, cls: 'text-success', label: 'Completed' },
  current: { icon: Loader2, cls: 'text-secondary', label: 'In progress' },
  overdue: { icon: AlertOctagon, cls: 'text-destructive', label: 'Overdue' },
  pending: { icon: Circle, cls: 'text-muted-foreground/50', label: 'Pending' },
}

/** Vertical event timeline (resolution trail). */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => {
        const s = STATE[e.state]
        return (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 && <span aria-hidden className={cn('absolute left-[9px] top-5 h-[calc(100%-12px)] w-px', e.state === 'done' ? 'bg-success/40' : 'bg-border')} />}
            <s.icon className={cn('relative z-10 mt-0.5 size-[19px] shrink-0 bg-card', s.cls, e.state === 'current' && 'animate-[spin_3s_linear_infinite]')} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn('text-sm font-medium', e.state === 'pending' && 'text-muted-foreground')}>{e.title}</span>
                <span className="sr-only">({s.label})</span>
                {e.state === 'overdue' && <span className="rounded bg-destructive-soft px-1.5 text-2xs font-semibold uppercase text-destructive">SLA breached</span>}
                {e.state === 'current' && <span className="rounded bg-info-soft px-1.5 text-2xs font-semibold uppercase text-info">Current</span>}
                {e.at && <span className="num ml-auto text-xs text-muted-foreground">{e.at}</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {e.actor} · {e.role}
              </div>
              {e.detail && e.state !== 'pending' && <p className="mt-1 text-xs leading-relaxed">{e.detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
