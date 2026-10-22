import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { PageRequest, PageResult } from '@/types'
import { paginate, simulate } from '@/services/api'
import { Button, Label, Textarea } from '@/components/ui/primitives'
import { Dialog, DialogContent, Tip } from '@/components/ui/overlays'
import { AuthNotice } from '@/components/feedback/states'
import type { TableState } from '@/components/tables/DataTable'

/**
 * Helpers local to the admin / governance pages (contracts, reports, audit,
 * users, masters, integrations, settings). Not part of the shared component library.
 */

type Getter<T> = (row: T) => string | number | null | undefined

/** Client-side rows → simulated paged response (search + sort + page) via TanStack Query. */
export function useClientPage<T>(
  key: readonly unknown[],
  rows: T[] | undefined,
  state: TableState,
  searchFields: (row: T) => Array<string | null | undefined>,
  getters: Record<string, Getter<T>> = {},
) {
  return useQuery<PageResult<T>>({
    queryKey: ['client-page', ...key, state.request, rows?.length ?? -1],
    enabled: rows !== undefined,
    placeholderData: keepPreviousData,
    queryFn: () =>
      simulate(() => {
        const q = state.request.search?.trim().toLowerCase() ?? ''
        const filtered = q ? (rows ?? []).filter((r) => searchFields(r).some((f) => f?.toLowerCase().includes(q))) : rows ?? []
        return paginate(filtered, state.request as PageRequest, getters)
      }, 120),
  })
}

/** Button that is disabled (with an explanatory tooltip) when the role lacks permission. */
export function GatedButton({
  allowed,
  reason,
  children,
  onClick,
  variant = 'outline',
  size = 'sm',
}: {
  allowed: boolean
  reason: string
  children: ReactNode
  onClick: () => void
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'xs'
}) {
  if (allowed)
    return (
      <Button variant={variant} size={size} onClick={onClick}>
        {children}
      </Button>
    )
  return (
    <Tip content={reason}>
      <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={reason}>
        <Button variant={variant} size={size} disabled aria-disabled>
          {children}
        </Button>
      </span>
    </Tip>
  )
}

const reasonSchema = z.object({
  reason: z.string().trim().min(10, 'Please give a reason of at least 10 characters.').max(500, 'Keep the reason under 500 characters.'),
})
type ReasonForm = z.infer<typeof reasonSchema>

/** Confirmation dialog for consequential actions — reason is mandatory, outcome is simulated. */
export function ConfirmReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  successMessage,
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
  successMessage: string
  children?: ReactNode
}) {
  const form = useForm<ReasonForm>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } })
  const close = (v: boolean) => {
    if (!v) form.reset()
    onOpenChange(v)
  }
  const submit = form.handleSubmit(async () => {
    await new Promise((r) => setTimeout(r, 350))
    toast.success(successMessage, { description: 'Simulated in this prototype — in production this would be authorised server-side and written to the audit trail with your reason.' })
    close(false)
  })
  const err = form.formState.errors.reason?.message
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={title} description={description}>
        <form onSubmit={submit} className="space-y-4 px-5 py-4" noValidate>
          {children}
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">Reason (required)</Label>
            <Textarea id="confirm-reason" placeholder="Why is this action needed?" aria-invalid={!!err} aria-describedby={err ? 'confirm-reason-err' : undefined} {...form.register('reason')} />
            {err && (
              <p id="confirm-reason-err" className="text-xs text-destructive">
                {err}
              </p>
            )}
          </div>
          <AuthNotice />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Submitting…' : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Download plain rows as a CSV (demo data, masked identifiers). */
export function downloadCsv(name: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = ['# MP Power Control Tower — DEMO DATA (fictional). Sensitive identifiers masked.', header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Format an ISO instant in IST. */
export function fmtIST(iso: string, withTime = true) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  })
}
/** YYYY-MM-DD of an ISO instant in IST. */
export function istDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
export function fmtDate(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })
}

/** Accessible on/off switch (no shared primitive exists). */
export function Switch({ checked, onCheckedChange, id, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
        (checked ? 'bg-secondary' : 'bg-muted-foreground/30')
      }
    >
      <span className={'inline-block size-4 rounded-full bg-card shadow transition-transform ' + (checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
}
