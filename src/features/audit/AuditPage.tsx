import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Lock, RotateCcw } from 'lucide-react'
import type { AuditEvent } from '@/types'
import { AUDIT_EVENTS } from '@/data/activity'
import { simulate } from '@/services/api'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { Button, Input, Label, NativeSelect } from '@/components/ui/primitives'
import { Dialog, SheetContent } from '@/components/ui/overlays'
import { useClientPage, fmtIST, istDate } from '@/features/admin/shared'

const columns: ColumnDef<AuditEvent, unknown>[] = [
  { accessorKey: 'at', header: 'Timestamp', cell: ({ row }) => <span className="num text-[13px]">{fmtIST(row.original.at)}</span>, meta: { csv: (r: AuditEvent) => fmtIST(r.at) + ' IST' } },
  { accessorKey: 'user', header: 'User', cell: ({ row }) => <span className="font-medium">{row.original.user}</span> },
  { accessorKey: 'role', header: 'Role', meta: { hideBelow: 'lg' } },
  { accessorKey: 'action', header: 'Action' },
  { accessorKey: 'module', header: 'Module', meta: { hideBelow: 'md' } },
  { accessorKey: 'record', header: 'Record', cell: ({ row }) => <span className="num font-mono text-[13px]">{row.original.record}</span> },
  { accessorKey: 'previousValue', header: 'Previous Value', meta: { hideBelow: 'xl' } },
  { accessorKey: 'newValue', header: 'New Value', meta: { hideBelow: 'xl' } },
  { accessorKey: 'source', header: 'IP/Source', meta: { hideBelow: 'xl' } },
  { accessorKey: 'reason', header: 'Reason', cell: ({ row }) => <span className="block max-w-[220px] truncate">{row.original.reason}</span>, meta: { hideBelow: 'lg' } },
]

const uniq = (f: (e: AuditEvent) => string) => Array.from(new Set(AUDIT_EVENTS.map(f))).sort()
const USERS = uniq((e) => e.user)
const MODULES = uniq((e) => e.module)
const ACTIONS = uniq((e) => e.action)

export default function AuditPage() {
  const [user, setUser] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [record, setRecord] = useState('')
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const t = useTableState({ sort: { id: 'at', desc: true } })

  const q = useQuery({ queryKey: ['audit-events'], queryFn: () => simulate(() => AUDIT_EVENTS) })

  const rows = useMemo(() => {
    if (!q.data) return undefined
    const rec = record.trim().toLowerCase()
    return q.data.filter((e) => {
      if (user && e.user !== user) return false
      if (module && e.module !== module) return false
      if (action && e.action !== action) return false
      const d = istDate(e.at)
      if (from && d < from) return false
      if (to && d > to) return false
      if (rec && !e.record.toLowerCase().includes(rec)) return false
      return true
    })
  }, [q.data, user, module, action, from, to, record])

  const page = useClientPage(['audit', user, module, action, from, to, record], rows, t, (e) => [e.user, e.action, e.module, e.record, e.reason, e.id])
  const dirty = user || module || action || from || to || record

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Trail" subtitle="Who did what, when, on which record — with before/after values and the stated reason." />

      <div className="flex gap-2 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-xs text-info">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          In production the audit log is immutable and append-only (write-once storage, tamper-evident hashing); this view is read-only. Sensitive values are masked at source. Timestamps shown in IST.
        </span>
      </div>

      <Section title="Filters" bodyClassName="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="space-y-1">
          <Label htmlFor="au-user">User</Label>
          <NativeSelect id="au-user" value={user} onChange={(e) => setUser(e.target.value)} className="h-8 w-full text-xs">
            <option value="">All users</option>
            {USERS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-module">Module</Label>
          <NativeSelect id="au-module" value={module} onChange={(e) => setModule(e.target.value)} className="h-8 w-full text-xs">
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-action">Action</Label>
          <NativeSelect id="au-action" value={action} onChange={(e) => setAction(e.target.value)} className="h-8 w-full text-xs">
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-from">From date</Label>
          <Input id="au-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-to">To date</Label>
          <Input id="au-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-record">Record</Label>
          <div className="flex gap-1.5">
            <Input id="au-record" value={record} onChange={(e) => setRecord(e.target.value)} placeholder="e.g. EXC-PF" className="h-8 text-xs" />
            {dirty && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Reset filters"
                onClick={() => {
                  setUser('')
                  setModule('')
                  setAction('')
                  setFrom('')
                  setTo('')
                  setRecord('')
                }}
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Audit events" description="Click an event to see full details." bodyClassName="p-0">
        <DataTable
          caption="Audit events"
          columns={columns}
          result={page.data}
          state={t}
          isPending={q.isPending || page.isPending}
          isFetching={page.isFetching}
          error={q.error ?? page.error}
          onRetry={() => (q.isError ? q.refetch() : page.refetch())}
          getRowId={(r) => r.id}
          onRowClick={setSelected}
          searchPlaceholder="Search user, action, record, reason…"
          exportName="audit-trail"
          exportAll={async () => rows ?? []}
          dense
        />
      </Section>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        {selected && (
          <SheetContent title={selected.action} description={`${selected.id} · ${fmtIST(selected.at)} IST`}>
            <div className="space-y-5 p-5">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="User" value={selected.user} />
                <Field label="Role" value={selected.role} />
                <Field label="Module" value={selected.module} />
                <Field label="Record" value={selected.record} mono />
                <Field label="IP / Source" value={selected.source} mono />
                <Field label="Event ID" value={selected.id} mono />
              </dl>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Previous value</div>
                  <div className="mt-1 break-words font-mono text-[13px]">{selected.previousValue}</div>
                </div>
                <div className="rounded-md border border-secondary/30 p-3">
                  <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">New value</div>
                  <div className="mt-1 break-words font-mono text-[13px]">{selected.newValue}</div>
                </div>
              </div>
              <div>
                <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Reason</div>
                <p className="mt-1 text-sm">{selected.reason}</p>
              </div>
              <p className="text-xs text-muted-foreground">Read-only. Audit entries cannot be edited or deleted. Fictional demo event.</p>
            </div>
          </SheetContent>
        )}
      </Dialog>
    </div>
  )
}
