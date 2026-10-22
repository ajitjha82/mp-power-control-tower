import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { formatDistanceStrict } from 'date-fns'
import { CheckCheck } from 'lucide-react'
import type { NotificationCategory } from '@/types'
import { SEED_NOTIFICATIONS } from '@/data/activity'
import { DATA_AS_OF } from '@/data/config'
import { useUI } from '@/store/ui'
import { SheetContent } from '@/components/ui/overlays'
import { Button } from '@/components/ui/primitives'
import { SeverityBadge } from '@/components/feedback/status'
import { cn } from '@/lib/utils'

const CATS: Array<NotificationCategory | 'All'> = ['All', 'Attendance', 'PF', 'ESI', 'Salary', 'Invoice', 'Contract', 'System']

export function useUnreadCount() {
  const read = useUI((s) => s.readNotifications)
  return SEED_NOTIFICATIONS.filter((n) => !n.read && !read.includes(n.id)).length
}

export function NotificationPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { readNotifications, markRead } = useUI()
  const [cat, setCat] = useState<(typeof CATS)[number]>('All')
  const navigate = useNavigate()
  const list = SEED_NOTIFICATIONS.filter((n) => cat === 'All' || n.category === cat)
  const isRead = (id: string, seed: boolean) => seed || readNotifications.includes(id)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Notifications" description="Operational alerts across modules" className="sm:max-w-md">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter notifications">
            {CATS.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={cat === c}
                onClick={() => setCat(c)}
                className={cn('rounded-full border px-2 py-0.5 text-xs', cat === c ? 'border-secondary bg-secondary text-secondary-foreground' : 'hover:bg-accent')}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end px-4 pt-2">
          <Button variant="ghost" size="xs" onClick={() => markRead(SEED_NOTIFICATIONS.map((n) => n.id))}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <ul className="divide-y">
          {list.map((n) => {
            const read = isRead(n.id, n.read)
            return (
              <li key={n.id} className={cn('px-4 py-3', !read && 'bg-info-soft/40')}>
                <div className="flex items-start gap-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', read ? 'bg-transparent' : 'bg-secondary')} aria-label={read ? undefined : 'Unread'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{n.category}</span>
                      <SeverityBadge severity={n.severity} />
                      <span className="ml-auto text-2xs text-muted-foreground">{formatDistanceStrict(new Date(n.at), new Date(DATA_AS_OF), { addSuffix: true })}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          markRead([n.id])
                          onOpenChange(false)
                          navigate(n.href)
                        }}
                      >
                        View
                      </Button>
                      {!read && (
                        <Button size="xs" variant="ghost" onClick={() => markRead([n.id])}>
                          Mark as read
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </DialogPrimitive.Root>
  )
}
