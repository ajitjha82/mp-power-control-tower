import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Check, ShieldAlert, ShieldCheck, ShieldOff, UserX, KeyRound, X } from 'lucide-react'
import type { Role } from '@/types'
import { simulate } from '@/services/api'
import { ROLES, can, canSee, roleScope, type Action } from '@/lib/rbac'
import { NAV } from '@/lib/nav'
import { useUI } from '@/store/ui'
import { PageHeader, Section } from '@/components/layout/page'
import { StatusBadge } from '@/components/feedback/status'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { ConfirmReasonDialog, GatedButton, fmtIST, useClientPage } from './shared'

const ACTION_LIST: Array<[Action, string]> = [
  ['exception.assign', 'Assign exception'],
  ['exception.comment', 'Comment on exception'],
  ['exception.requestVendor', 'Request vendor response'],
  ['exception.escalate', 'Escalate exception'],
  ['exception.resolve', 'Resolve exception'],
  ['invoice.approve', 'Approve invoice'],
  ['invoice.return', 'Return invoice'],
  ['attendance.approve', 'Approve attendance'],
  ['report.export', 'Export reports'],
  ['vendor.respond', 'Vendor response'],
  ['admin.manage', 'Administer system'],
]

interface DemoUser {
  id: string
  name: string
  role: Role
  scope: string
  lastLogin: string
  mfa: 'Enrolled' | 'Not enrolled' | 'Reset pending'
  status: 'Active' | 'Suspended'
}

const USERS: DemoUser[] = [
  { id: 'U-001', name: 'Director (Commercial)', role: 'Senior Management', scope: 'Enterprise', lastLogin: '2026-10-22T08:55:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-002', name: 'V. Chaturvedi', role: 'HR', scope: 'Enterprise', lastLogin: '2026-10-22T09:12:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-003', name: 'P. Shrivastava', role: 'HR', scope: 'Enterprise (Contract Cell)', lastLogin: '2026-10-21T17:40:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-004', name: 'M. Agrawal', role: 'Finance', scope: 'Enterprise', lastLogin: '2026-10-22T09:02:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-005', name: 'N. Bhargava', role: 'Compliance Officer', scope: 'Enterprise', lastLogin: '2026-10-22T08:31:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-006', name: 'S. Qureshi', role: 'Compliance Officer', scope: 'Enterprise', lastLogin: '2026-10-20T11:15:00+05:30', mfa: 'Reset pending', status: 'Active' },
  { id: 'U-007', name: 'A. R. Khan', role: 'Division Officer', scope: 'Bhopal City Division I', lastLogin: '2026-10-22T07:58:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-008', name: 'S. K. Malviya', role: 'Site Officer', scope: 'Single site (Bhopal)', lastLogin: '2026-10-22T09:20:00+05:30', mfa: 'Not enrolled', status: 'Active' },
  { id: 'U-009', name: 'ABC Manpower desk', role: 'Vendor User', scope: 'Vendor: ABC Manpower', lastLogin: '2026-10-21T19:05:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-010', name: 'XYZ Facility desk', role: 'Vendor User', scope: 'Vendor: XYZ Facility', lastLogin: '2026-09-02T14:20:00+05:30', mfa: 'Not enrolled', status: 'Suspended' },
  { id: 'U-011', name: 'R. Iyer', role: 'Auditor', scope: 'Enterprise (read-only)', lastLogin: '2026-10-18T10:45:00+05:30', mfa: 'Enrolled', status: 'Active' },
  { id: 'U-012', name: 'IT Admin', role: 'System Administrator', scope: 'Platform administration', lastLogin: '2026-10-22T06:30:00+05:30', mfa: 'Enrolled', status: 'Active' },
]

function Yes({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', ok ? 'text-success' : 'text-muted-foreground/70')} title={label}>
      {ok ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
      <span className="sr-only">{label}</span>
      <span aria-hidden className="hidden 2xl:inline">{ok ? 'Yes' : 'No'}</span>
    </span>
  )
}

function MfaLabel({ mfa }: { mfa: DemoUser['mfa'] }) {
  const Icon = mfa === 'Enrolled' ? ShieldCheck : mfa === 'Reset pending' ? ShieldAlert : ShieldOff
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', mfa === 'Enrolled' ? 'text-success' : mfa === 'Reset pending' ? 'text-warning' : 'text-destructive')}>
      <Icon className="size-3.5" aria-hidden /> {mfa}
    </span>
  )
}

function Matrix({ title, cols, check }: { title: string; cols: Array<[string, string]>; check: (role: Role, key: string) => boolean }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{title}</caption>
        <thead className="bg-muted/60">
          <tr>
            <th scope="col" className="sticky left-0 z-10 whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Role
            </th>
            {cols.map(([k, label]) => (
              <th key={k} scope="col" className="whitespace-nowrap border-b px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((r) => (
            <tr key={r} className="border-b last:border-0">
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-card px-3 py-2 text-left font-medium">
                {r}
                {roleScope(r).label && <span className="block text-2xs font-normal text-muted-foreground">{roleScope(r).label}</span>}
              </th>
              {cols.map(([k, label]) => {
                const ok = check(r, k)
                return (
                  <td key={k} className="px-2 py-2 text-center">
                    <Yes ok={ok} label={`${r}: ${label} — ${ok ? 'allowed' : 'not allowed'}`} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function UsersPage() {
  const role = useUI((s) => s.role)
  const isAdmin = can(role, 'admin.manage')
  const t = useTableState({ pageSize: 25 })
  const q = useQuery({ queryKey: ['admin-users'], queryFn: () => simulate(() => USERS) })
  const page = useClientPage(['admin-users'], q.data, t, (u) => [u.name, u.role, u.scope, u.id])
  const [pending, setPending] = useState<{ kind: 'disable' | 'mfa'; user: DemoUser } | null>(null)
  const denied = `Your current role (${role}) cannot manage users. Requires System Administrator.`

  const columns: ColumnDef<DemoUser, unknown>[] = [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: 'role', header: 'Role' },
    { accessorKey: 'scope', header: 'Data scope', meta: { hideBelow: 'md' } },
    { accessorKey: 'lastLogin', header: 'Last login', cell: ({ row }) => <span className="num text-[13px]">{fmtIST(row.original.lastLogin)}</span>, meta: { hideBelow: 'lg' } },
    { accessorKey: 'mfa', header: 'MFA', cell: ({ row }) => <MfaLabel mfa={row.original.mfa} /> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5">
          <GatedButton allowed={isAdmin} reason={denied} size="xs" onClick={() => setPending({ kind: 'mfa', user: row.original })}>
            <KeyRound /> Reset MFA
          </GatedButton>
          <GatedButton allowed={isAdmin && row.original.status === 'Active'} reason={row.original.status !== 'Active' ? 'User is already suspended.' : denied} size="xs" variant="outline" onClick={() => setPending({ kind: 'disable', user: row.original })}>
            <UserX /> Disable
          </GatedButton>
        </div>
      ),
      meta: { align: 'right' },
    },
  ]

  const actionCols: Array<[string, string]> = ACTION_LIST
  const moduleCols: Array<[string, string]> = NAV.map((n) => [n.path, n.label])

  return (
    <div className="space-y-5">
      <PageHeader title="Users & Roles" subtitle="Role-based access model: which actions and modules each role can use, and the data scope applied." />

      <div role="note" className="flex gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">Demonstration only.</strong> Role switching and access rules in this prototype are client-side simulations. In production, authorisation and data scoping are enforced server-side (policy engine with row-level scoping) and the UI only reflects permissions returned by the API.
        </span>
      </div>

      <Section title="Role matrix" description="Derived from the prototype's permission rules. ✓ allowed, ✗ not allowed." bodyClassName="p-0">
        <Tabs defaultValue="actions">
          <div className="px-4 pt-2">
            <TabsList>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="modules">Modules</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="actions" className="pt-2">
            <Matrix title="Role vs action permissions" cols={actionCols} check={(r, k) => can(r, k as Action)} />
          </TabsContent>
          <TabsContent value="modules" className="pt-2">
            <Matrix title="Role vs module visibility" cols={moduleCols} check={(r, k) => canSee(r, k)} />
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Users" description="Fictional user accounts. Actions are simulated and require System Administrator." bodyClassName="p-0">
        <DataTable
          caption="Users"
          columns={columns}
          result={page.data}
          state={t}
          isPending={q.isPending || page.isPending}
          isFetching={page.isFetching}
          error={q.error ?? page.error}
          onRetry={() => (q.isError ? q.refetch() : page.refetch())}
          getRowId={(u) => u.id}
          searchPlaceholder="Search name, role, scope…"
        />
      </Section>

      <ConfirmReasonDialog
        open={pending?.kind === 'disable'}
        onOpenChange={(v) => !v && setPending(null)}
        title={`Disable ${pending?.user.name ?? ''}?`}
        description="The account will be suspended and active sessions revoked."
        confirmLabel="Disable user"
        destructive
        successMessage={`Disable request for ${pending?.user.name ?? 'user'} recorded (simulated)`}
      />
      <ConfirmReasonDialog
        open={pending?.kind === 'mfa'}
        onOpenChange={(v) => !v && setPending(null)}
        title={`Reset MFA for ${pending?.user.name ?? ''}?`}
        description="The user will need to re-enrol their second factor at next sign-in."
        confirmLabel="Reset MFA"
        successMessage={`MFA reset for ${pending?.user.name ?? 'user'} recorded (simulated)`}
      />
    </div>
  )
}
