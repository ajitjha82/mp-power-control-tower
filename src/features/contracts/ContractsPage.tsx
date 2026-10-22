import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CalendarClock, ExternalLink, FileSignature, IndianRupee, Users, UserCheck, X, AlarmClock } from 'lucide-react'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { KpiSkeleton, ErrorState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { Button, NativeSelect, Progress } from '@/components/ui/primitives'
import { Dialog, SheetContent } from '@/components/ui/overlays'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { contractRows, listContracts } from '@/services/entities'
import { cn, fmtINR, fmtNum, fmtPct, pct, sumBy } from '@/lib/utils'
import { useClientPage, fmtDate } from '@/features/admin/shared'

type ContractRow = ReturnType<typeof contractRows>[number]
type StatusFilter = 'all' | 'Active' | 'Renewal Due' | 'Expiring'

const columns: ColumnDef<ContractRow, unknown>[] = [
  { accessorKey: 'number', header: 'Contract No.', cell: ({ row }) => <span className="num font-mono text-[13px] font-medium">{row.original.number}</span> },
  {
    accessorKey: 'vendorName',
    header: 'Vendor',
    cell: ({ row }) => (
      <Link to={`/vendors/${row.original.vendorId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-secondary hover:underline">
        {row.original.vendorName}
      </Link>
    ),
  },
  { accessorKey: 'scope', header: 'Scope', meta: { hideBelow: 'lg' } },
  { accessorKey: 'regionName', header: 'Region', meta: { hideBelow: 'md' } },
  { accessorKey: 'startDate', header: 'Start', cell: ({ row }) => fmtDate(row.original.startDate), meta: { hideBelow: 'xl' } },
  { accessorKey: 'endDate', header: 'End', cell: ({ row }) => fmtDate(row.original.endDate), meta: { hideBelow: 'md' } },
  {
    accessorKey: 'daysLeft',
    header: 'Days left',
    cell: ({ row }) => <span className={cn(row.original.daysLeft <= 30 ? 'font-semibold text-destructive' : row.original.daysLeft <= 90 && 'text-warning')}>{fmtNum(row.original.daysLeft)}</span>,
    meta: { align: 'right' },
  },
  { accessorKey: 'sanctionedManpower', header: 'Sanctioned', cell: ({ row }) => fmtNum(row.original.sanctionedManpower), meta: { align: 'right', hideBelow: 'md' } },
  { accessorKey: 'deployed', header: 'Deployed', cell: ({ row }) => fmtNum(row.original.deployed), meta: { align: 'right' } },
  { accessorKey: 'vacancy', header: 'Vacancy', cell: ({ row }) => fmtNum(row.original.vacancy), meta: { align: 'right', hideBelow: 'lg' } },
  {
    accessorKey: 'pfExceptions',
    header: 'PF exc.',
    cell: ({ row }) => <span className={cn(row.original.pfExceptions > 0 && 'font-medium text-destructive')}>{fmtNum(row.original.pfExceptions)}</span>,
    meta: { align: 'right', hideBelow: 'md' },
  },
  {
    accessorKey: 'esiExceptions',
    header: 'ESI exc.',
    cell: ({ row }) => <span className={cn(row.original.esiExceptions > 0 && 'font-medium text-destructive')}>{fmtNum(row.original.esiExceptions)}</span>,
    meta: { align: 'right', hideBelow: 'lg' },
  },
  {
    accessorKey: 'salaryIssues',
    header: 'Salary issues',
    cell: ({ row }) => <span className={cn(row.original.salaryIssues > 0 && 'font-medium text-warning')}>{fmtNum(row.original.salaryIssues)}</span>,
    meta: { align: 'right', hideBelow: 'lg' },
  },
  { accessorKey: 'serviceChargePct', header: 'Service charge %', cell: ({ row }) => fmtPct(row.original.serviceChargePct, 2), meta: { align: 'right', hideBelow: 'xl' } },
  { accessorKey: 'expiryStatus', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.expiryStatus} /> },
]

export default function ContractsPage() {
  const { filters, key } = useScope()
  const [contractParam, setContractParam] = useUrlParam('contract')
  const [expiringParam, setExpiringParam] = useUrlParam('expiring')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const t = useTableState({ sort: { id: 'daysLeft', desc: false } })

  const q = useQuery({ queryKey: ['contracts', key], queryFn: () => listContracts(filters) })
  const all = q.data

  const rows = useMemo(() => {
    if (!all) return undefined
    return all.filter((c) => {
      if (contractParam && c.id !== contractParam) return false
      if (expiringParam === '1' && c.daysLeft > 30) return false
      if (status !== 'all' && c.expiryStatus !== status) return false
      return true
    })
  }, [all, contractParam, expiringParam, status])

  const page = useClientPage(['contracts', key, contractParam, expiringParam, status], rows, t, (c) => [c.number, c.vendorName, c.scope, c.regionName, c.id, c.title])

  const kpis = useMemo(() => {
    if (!all) return null
    const active = all.length
    const deployed = sumBy(all, (c) => c.deployed)
    const sanctioned = sumBy(all, (c) => c.sanctionedManpower)
    return {
      active,
      expiring: all.filter((c) => c.daysLeft <= 30).length,
      renewal: all.filter((c) => c.daysLeft <= 90).length,
      sanctioned,
      deployed,
      value: sumBy(all, (c) => c.value),
    }
  }, [all])

  const selected = all?.find((c) => c.id === selectedId) ?? null
  const focused = contractParam ? all?.find((c) => c.id === contractParam) : null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contracts"
        subtitle="Outsourcing contracts with sanctioned vs deployed manpower, statutory exceptions this wage month and renewal horizon."
      />

      {q.isPending ? (
        <KpiSkeleton count={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        kpis && (
          <KpiGrid className="xl:grid-cols-6">
            <KpiCard label="Active contracts" value={fmtNum(kpis.active)} icon={FileSignature} tooltip="Contracts in the current scope that have not yet ended." />
            <KpiCard
              label="Expiring ≤ 30 days"
              value={fmtNum(kpis.expiring)}
              icon={AlarmClock}
              tone={kpis.expiring ? 'destructive' : 'success'}
              tooltip="Contracts ending within 30 days of the data date. Click to filter."
              onClick={() => setExpiringParam(expiringParam === '1' ? null : '1')}
            />
            <KpiCard
              label="Renewal due ≤ 90 days"
              value={fmtNum(kpis.renewal)}
              icon={CalendarClock}
              tone={kpis.renewal ? 'warning' : 'neutral'}
              tooltip="Contracts ending within 90 days (includes those expiring within 30 days)."
              onClick={() => setStatus(status === 'Renewal Due' ? 'all' : 'Renewal Due')}
            />
            <KpiCard label="Sanctioned manpower" value={fmtNum(kpis.sanctioned)} icon={Users} tooltip="Sum of sanctioned posts across contracts in scope." />
            <KpiCard
              label="Deployed"
              value={fmtNum(kpis.deployed)}
              icon={UserCheck}
              secondary={`${fmtPct(pct(kpis.deployed, kpis.sanctioned))} of sanctioned`}
              tooltip="Personnel on roll against these contracts for the current wage month."
            />
            <KpiCard label="Total contract value" value={fmtINR(kpis.value, { compact: true })} icon={IndianRupee} tooltip="Indicative total contract value (fictional demo figures)." />
          </KpiGrid>
        )
      )}

      {(contractParam || expiringParam === '1') && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-xs text-info">
          <span className="font-medium">Filtered view:</span>
          {contractParam && (
            <button type="button" onClick={() => setContractParam(null)} className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-card px-2 py-0.5 hover:bg-accent">
              Contract {focused?.number ?? contractParam} <X className="size-3" aria-label="Clear contract filter" />
            </button>
          )}
          {expiringParam === '1' && (
            <button type="button" onClick={() => setExpiringParam(null)} className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-card px-2 py-0.5 hover:bg-accent">
              Expiring ≤ 30 days <X className="size-3" aria-label="Clear expiring filter" />
            </button>
          )}
          {contractParam && all && !focused && <span>This contract is not in your current scope.</span>}
        </div>
      )}

      <Section title="Contract register" description="Click a row for contract details and drill-downs. Exceptions and salary issues are for the current wage month." bodyClassName="p-0">
        <DataTable
          caption="Contract register"
          columns={columns}
          result={page.data}
          state={t}
          isPending={q.isPending || page.isPending}
          isFetching={page.isFetching}
          error={q.error ?? page.error}
          onRetry={() => (q.isError ? q.refetch() : page.refetch())}
          getRowId={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          rowClassName={(r) => (r.id === contractParam ? 'bg-info-soft' : undefined)}
          searchPlaceholder="Search contract, vendor, scope…"
          exportName="contracts"
          exportAll={async () => rows ?? []}
          toolbar={
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="h-8 text-xs" aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Renewal Due">Renewal due</option>
              <option value="Expiring">Expiring</option>
            </NativeSelect>
          }
        />
      </Section>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelectedId(null)}>
        {selected && (
          <SheetContent title={selected.number} description={selected.title}>
            <ContractDetail c={selected} />
          </SheetContent>
        )}
      </Dialog>
    </div>
  )
}

function ContractDetail({ c }: { c: ContractRow }) {
  const fill = pct(c.deployed, c.sanctionedManpower)
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={c.expiryStatus} />
        <span className="text-sm text-muted-foreground">
          {c.daysLeft} days to expiry ({fmtDate(c.endDate)})
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <Field label="Vendor" value={c.vendorName} />
        <Field label="Region" value={c.regionName} />
        <Field label="Scope" value={c.scope} />
        <Field label="Contract ID" value={c.id} mono />
        <Field label="Start date" value={fmtDate(c.startDate)} />
        <Field label="End date" value={fmtDate(c.endDate)} />
        <Field label="Service charge" value={fmtPct(c.serviceChargePct, 2)} />
        <Field label="Contract value" value={fmtINR(c.value, { compact: true })} />
      </dl>
      <div className="space-y-1.5 rounded-md border p-3">
        <div className="flex justify-between text-xs">
          <span className="font-medium">Manpower fill</span>
          <span className="num text-muted-foreground">
            {fmtNum(c.deployed)} / {fmtNum(c.sanctionedManpower)} ({fmtPct(fill)})
          </span>
        </div>
        <Progress value={fill} tone={fill >= 95 ? 'success' : fill >= 90 ? 'warning' : 'destructive'} label="Deployed vs sanctioned" />
        <p className="text-xs text-muted-foreground">{fmtNum(c.vacancy)} vacant posts</p>
      </div>
      <dl className="grid grid-cols-3 gap-4 rounded-md border p-3">
        <Field label="PF exceptions" value={<span className={cn(c.pfExceptions > 0 && 'text-destructive')}>{fmtNum(c.pfExceptions)}</span>} />
        <Field label="ESI exceptions" value={<span className={cn(c.esiExceptions > 0 && 'text-destructive')}>{fmtNum(c.esiExceptions)}</span>} />
        <Field label="Salary issues" value={<span className={cn(c.salaryIssues > 0 && 'text-warning')}>{fmtNum(c.salaryIssues)}</span>} />
      </dl>
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drill down</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to={`/pf?contract=${c.id}`}>
              <Users /> Employees (PF view)
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to={`/vendors/${c.vendorId}`}>
              <ExternalLink /> Vendor 360
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to={`/invoices?vendor=${c.vendorId}`}>
              <IndianRupee /> Vendor invoices
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to={`/exceptions?vendor=${c.vendorId}`}>
              <AlarmClock /> Vendor exceptions
            </Link>
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Fictional demo contract. Contract value and dates are illustrative only.</p>
    </div>
  )
}
