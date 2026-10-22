import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowRight, Filter, IndianRupee, UserRound, X } from 'lucide-react'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { BlockSkeleton, ErrorState, KpiSkeleton, AuthNotice } from '@/components/feedback/states'
import { SeverityBadge, StatusBadge, pctTone } from '@/components/feedback/status'
import { BarList, C } from '@/components/charts/chart-kit'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { ExceptionActions } from '@/components/feedback/ExceptionActions'
import { Timeline } from '@/components/feedback/Timeline'
import { SheetContent } from '@/components/ui/overlays'
import { Button } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { simulate } from '@/services/api'
import { summarize } from '@/services/metrics'
import { type ESIRow, type PFRow, type RecoParams, esiRows, listESI, listPF, pfRows } from '@/services/records'
import { getExceptionDetail } from '@/services/entities'
import { ESI_TYPES, PF_TYPES } from '@/data/snapshot'
import { contractById, vendorById } from '@/data/vendors'
import { statutoryConfig, monthLabel } from '@/data/config'
import { cn, fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import type { PageResult } from '@/types'

type Kind = 'pf' | 'esi'
type Row = PFRow | ESIRow
const isPF = (r: Row): r is PFRow => 'uan' in r

const STATUS_TABS = [
  { v: 'all', label: 'All applicable' },
  { v: 'exception', label: 'Exceptions' },
  { v: 'compliant', label: 'Compliant' },
] as const

const money = (v: number) => fmtINR(v)
const diffCell = (v: number) => <span className={cn('num font-medium', v < 0 ? 'text-destructive' : v > 0 ? 'text-warning' : 'text-muted-foreground')}>{v === 0 ? '0' : fmtINR(v)}</span>

export function ReconciliationPage({ kind }: { kind: Kind }) {
  const pf = kind === 'pf'
  const label = pf ? 'PF' : 'ESI'
  const types = pf ? PF_TYPES : ESI_TYPES
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const [status, setStatus] = useUrlParam('status')
  const [exception, setException] = useUrlParam('exception')
  const [vendor, setVendor] = useUrlParam('vendor')
  const [contract, setContract] = useUrlParam('contract')
  const t = useTableState({ sort: { id: 'employeeId', desc: false } })
  const [open, setOpen] = useState<Row | null>(null)

  const params: Omit<RecoParams, 'page' | 'pageSize'> = {
    status: (status as RecoParams['status']) ?? (exception ? 'exception' : 'all'),
    exception,
    vendor,
    contract,
  }
  const kpiScope = useMemo(
    () => ({ ...filters, vendors: vendor ? [vendor] : filters.vendors, contracts: contract ? [contract] : filters.contracts }),
    [filters, vendor, contract],
  )
  const kpis = useQuery({ queryKey: [kind, 'kpi', ...key, vendor, contract], queryFn: () => simulate(() => summarize(kpiScope), 220) })
  const list = useQuery({
    queryKey: [kind, 'list', ...key, t.request, params],
    queryFn: (): Promise<PageResult<Row>> => (pf ? listPF(filters, { ...t.request, ...params }) : listESI(filters, { ...t.request, ...params })),
  })

  const s = kpis.data
  const byType = s ? (pf ? s.pfByType : s.esiByType) : []
  const exCount = s ? (pf ? s.pfExceptions : s.esiExceptions) : 0
  const pct = s ? (pf ? s.pfPct : s.esiPct) : 0
  const applicable = s ? (pf ? s.pfApplicable : s.esiApplicable) : 0
  const atRisk = s ? (pf ? s.pfAtRisk : s.esiAtRisk) : 0

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { accessorKey: 'employeeId', header: 'Employee ID', cell: ({ row }) => <span className="num font-mono text-xs">{row.original.employeeId}</span> },
      {
        accessorKey: 'name',
        header: 'Employee',
        cell: ({ row }) => (
          <Link to={`/employees/${row.original.employeeId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-secondary hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      { accessorKey: 'vendorName', header: 'Vendor', meta: { hideBelow: 'md' } },
      { accessorKey: 'contractNo', header: 'Contract', enableSorting: false, meta: { hideBelow: 'xl' }, cell: ({ getValue }) => <span className="text-xs">{getValue<string>()}</span> },
      { accessorKey: 'locationName', header: 'Location', enableSorting: false, meta: { hideBelow: 'xl' }, cell: ({ getValue }) => <span className="block max-w-[180px] truncate text-xs">{getValue<string>()}</span> },
      pf
        ? { accessorKey: 'uan', header: 'UAN', enableSorting: false, meta: { hideBelow: 'lg' }, cell: ({ getValue }) => <span className="num font-mono text-xs">{getValue<string>()}</span> }
        : { accessorKey: 'esic', header: 'ESIC No.', enableSorting: false, meta: { hideBelow: 'lg' }, cell: ({ getValue }) => <span className="num font-mono text-xs">{getValue<string>()}</span> },
      { accessorKey: 'payableDays', header: 'Payable Days', meta: { align: 'right', hideBelow: 'lg' } },
      { accessorKey: 'eligibleWage', header: 'Eligible Wage', meta: { align: 'right', hideBelow: 'lg' }, cell: ({ getValue }) => money(getValue<number>()) },
      ...(pf
        ? ([
            { accessorKey: 'pfWage', header: 'PF Wage', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => money(getValue<number>()) },
            { accessorKey: 'expectedEmployee', header: 'Expected Employee PF', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => money(getValue<number>()) },
            { accessorKey: 'expectedEmployer', header: 'Expected Employer PF', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => money(getValue<number>()) },
          ] as ColumnDef<Row, unknown>[])
        : ([{ accessorKey: 'expected', header: 'Expected Contribution', meta: { align: 'right', hideBelow: 'md' }, cell: ({ getValue }) => money(getValue<number>()) }] as ColumnDef<Row, unknown>[])),
      { accessorKey: 'reported', header: pf ? 'Reported PF' : 'Reported Contribution', meta: { align: 'right', hideBelow: 'md' }, cell: ({ getValue }) => money(getValue<number>()) },
      { accessorKey: 'difference', header: 'Difference', meta: { align: 'right' }, cell: ({ getValue }) => diffCell(getValue<number>()) },
      { accessorKey: 'status', header: 'Compliance Status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} size="xs" /> },
      {
        accessorKey: 'exception',
        header: 'Exception',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) =>
          row.original.exception ? (
            <span className="flex items-center gap-1.5">
              {row.original.severity && <SeverityBadge severity={row.original.severity} />}
              <span className="text-xs">{row.original.exception}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      { accessorKey: 'atRisk', header: 'At Risk', meta: { align: 'right', hideBelow: 'lg' }, cell: ({ getValue }) => (getValue<number>() ? <span className="num">{fmtINR(getValue<number>())}</span> : <span className="text-muted-foreground">—</span>) },
      {
        id: 'actions',
        header: 'Action',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpen(row.original) }} aria-label={`Open reconciliation detail for ${row.original.name}`}>
            Details <ArrowRight />
          </Button>
        ),
      },
    ],
    [pf],
  )

  const contextChips = [
    vendor && { label: `Vendor: ${vendorById.get(vendor)?.shortName ?? vendor}`, clear: () => setVendor(null) },
    contract && { label: `Contract: ${contractById.get(contract)?.number ?? contract}`, clear: () => setContract(null) },
    exception && { label: `Exception: ${exception}`, clear: () => setException(null) },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Statutory reconciliation · ${monthLabel(filters.wageMonth)}`}
        title={pf ? 'PF Reconciliation' : 'ESI Reconciliation'}
        subtitle={
          pf
            ? 'Employee-level comparison of expected PF (from approved payable days, eligible wage and the configured rate) against the contribution reported by the vendor.'
            : 'Employee-level comparison of expected ESI (for employees within the configured wage ceiling) against the contribution reported by the vendor.'
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/compliance">Compliance tower</Link>
          </Button>
        }
      />

      {kpis.isPending ? (
        <KpiSkeleton count={7} />
      ) : kpis.isError ? (
        <div className="rounded-lg border bg-card"><ErrorState error={kpis.error} onRetry={() => kpis.refetch()} /></div>
      ) : (
        <KpiGrid className="xl:grid-cols-7">
          <KpiCard label={`${label} Applicable`} value={fmtNum(applicable)} secondary={`${fmtNum(s!.workforce - applicable)} not applicable`} tooltip={`Employees to whom ${label} applies under the configured rules (version ${statutoryConfig.version}).`} onClick={() => setStatus('all')} />
          <KpiCard label="Fully Compliant" value={fmtNum(applicable - exCount)} tone={pctTone(pct)} secondary={`${fmtPct(pct)} compliance`} tooltip="Expected and reported contributions reconcile at employee level with verified evidence." onClick={() => { setStatus('compliant'); setException(null) }} />
          <KpiCard label="Contribution Missing" value={fmtNum(byType[0]! + byType[4]!)} tone="destructive" secondary="not found + missing" tooltip="No contribution found, or employee missing from the return." onClick={() => { setStatus('exception'); setException(types[0]!) }} />
          <KpiCard label="Short Contribution" value={fmtNum(byType[1]!)} tone="warning" onClick={() => { setStatus('exception'); setException(types[1]!) }} tooltip="Reported contribution lower than expected." />
          <KpiCard label="Wage Mismatch" value={fmtNum(byType[2]!)} tone="warning" onClick={() => { setStatus('exception'); setException(types[2]!) }} tooltip="Reported wage differs from computed eligible wage." />
          <KpiCard label={pf ? 'UAN Issues' : 'ESIC No. Issues'} value={fmtNum(byType[3]! + byType[5]!)} tone="warning" secondary="mismatch + duplicate" onClick={() => { setStatus('exception'); setException(types[3]!) }} tooltip="Identifier mismatches or duplicates against verified master." />
          <KpiCard icon={IndianRupee} label="Amount at Risk" value={fmtINR(atRisk, { compact: true })} tone="destructive" secondary={`${fmtNum(exCount)} exceptions`} tooltip="Shortfall for amount defects; full expected liability where identity or evidence is unverified." onClick={() => { setStatus('exception'); setException(null) }} />
        </KpiGrid>
      )}

      <div className="grid gap-4 xl:grid-cols-4">
        <Section title="Exception breakdown" description="Click a type to filter the employee table" className="xl:col-span-1">
          {s ? (
            <>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="num text-2xl font-semibold text-destructive">{fmtNum(exCount)}</span>
                <span className="text-xs text-muted-foreground">employees with exceptions</span>
              </div>
              <BarList
                items={types.map((tp, i) => ({ key: tp, label: tp, value: byType[i]!, color: i === 0 || i === 4 ? C.danger : i === 7 ? C.muted : C.warning }))
                  .filter((x) => x.value > 0)
                  .sort((a, b) => b.value - a.value)}
                selected={exception}
                onSelect={(k) => {
                  setStatus('exception')
                  setException(exception === k ? null : k)
                }}
              />
              <p className="mt-3 text-2xs leading-snug text-muted-foreground">
                A challan or remittance upload alone is not treated as employee-level proof; “Evidence Pending” remains an exception until employee-level records are verified.
              </p>
            </>
          ) : (
            <BlockSkeleton rows={8} />
          )}
        </Section>

        <Section title={`Employee-level ${label} reconciliation`} className="xl:col-span-3" bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <div role="tablist" aria-label="Compliance status" className="flex rounded-md border bg-muted/40 p-0.5">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.v}
                  role="tab"
                  aria-selected={(params.status ?? 'all') === tab.v}
                  onClick={() => {
                    setStatus(tab.v)
                    if (tab.v !== 'exception') setException(null)
                  }}
                  className={cn('rounded px-2.5 py-1 text-xs font-medium', (params.status ?? 'all') === tab.v ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {contextChips.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary/10 px-2 py-0.5 text-xs">
                <Filter className="size-3" aria-hidden /> {c.label}
                <button type="button" onClick={c.clear} aria-label={`Clear ${c.label}`} className="rounded-full hover:bg-background/60">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <DataTable
            caption={`${label} reconciliation by employee`}
            columns={columns}
            result={list.data}
            state={t}
            isPending={list.isPending}
            isFetching={list.isFetching}
            error={list.error}
            onRetry={() => list.refetch()}
            getRowId={(r) => r.employeeId}
            onRowClick={(r) => setOpen(r)}
            searchPlaceholder="Search employee ID or name…"
            emptyTitle={`No ${label} exceptions found for the selected filters.`}
            exportName={`${kind}-reconciliation`}
            exportAll={() => simulate<Row[]>(() => (pf ? pfRows(filters, { ...t.request, ...params }) : esiRows(filters, { ...t.request, ...params })), 150)}
            initialHidden={pf ? ['pfWage', 'expectedEmployer'] : []}
            selectable
            bulkActions={(ids) => <ExceptionActions recordId={`${ids.length} records`} kinds={['assign', 'clarify']} size="xs" />}
            rowClassName={(r) => (r.severity === 'Critical' ? 'bg-destructive-soft/30' : undefined)}
          />
        </Section>
      </div>

      <DialogPrimitive.Root open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && <RecoDetail row={open} kind={kind} onOpenEmployee={() => navigate(`/employees/${open.employeeId}`)} />}
      </DialogPrimitive.Root>
    </div>
  )
}

function RecoDetail({ row, kind, onOpenEmployee }: { row: Row; kind: Kind; onOpenEmployee: () => void }) {
  const pf = kind === 'pf'
  const excId = row.exception ? `EXC-${pf ? 'PF' : 'ESI'}-${10000 + row.idx}` : null
  const detail = useQuery({ queryKey: ['exc-detail', excId], queryFn: () => getExceptionDetail(excId!), enabled: !!excId, placeholderData: undefined })
  const r = pf && isPF(row) ? row : null
  const e = !pf && !isPF(row) ? row : null
  const reco = detail.data?.pf
  return (
    <SheetContent
      title={
        <span className="flex items-center gap-2">
          {pf ? 'PF' : 'ESI'} reconciliation · {row.employeeId}
        </span>
      }
      description={row.name}
      className="sm:max-w-2xl"
    >
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} />
          {row.severity && <SeverityBadge severity={row.severity} />}
          {row.workflow && <StatusBadge status={row.workflow} />}
          <Button size="sm" variant="outline" className="ml-auto" onClick={onOpenEmployee}>
            <UserRound /> Employee 360
          </Button>
        </div>

        <section aria-label="Employee">
          <h3 className="eyebrow mb-2">Employee</h3>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Name" value={row.name} />
            <Field label="Workforce ID" value={row.employeeId} mono />
            <Field label="Vendor" value={<Link className="text-secondary hover:underline" to={`/vendors/${row.vendorId}`}>{row.vendorName}</Link>} />
            <Field label="Contract" value={row.contractNo} />
            <Field label="Location" value={row.locationName} />
            <Field label={pf ? 'UAN' : 'ESIC No.'} value={r ? r.uan : e!.esic} mono />
          </dl>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-md border p-3" aria-label="Attendance and wage">
            <h3 className="eyebrow mb-2">Attendance & wage</h3>
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Payable days" value={row.payableDays} mono />
              <Field label="Attendance status" value="Approved" />
              <Field label="Eligible wage" value={fmtINR(row.eligibleWage)} mono />
              {r && <Field label="PF wage" value={fmtINR(r.pfWage)} mono />}
            </dl>
          </section>
          <section className="rounded-md border p-3" aria-label="Expected vs reported">
            <h3 className="eyebrow mb-2">Expected vs reported</h3>
            <dl className="grid grid-cols-2 gap-3">
              {r ? (
                <>
                  <Field label="Expected employee" value={fmtINR(r.expectedEmployee)} mono />
                  <Field label="Expected employer" value={fmtINR(r.expectedEmployer)} mono />
                  <Field label="Reported wage" value={reco ? fmtINR(reco.reportedWage) : '…'} mono />
                  <Field label="Reported (employee + employer)" value={reco ? `${fmtINR(reco.reportedEmployee)} + ${fmtINR(reco.reportedEmployer)}` : fmtINR(r.reported)} mono />
                </>
              ) : (
                <>
                  <Field label="Expected" value={fmtINR(e!.expected)} mono />
                  <Field label="Reported" value={fmtINR(e!.reported)} mono />
                </>
              )}
              <Field label="Difference" value={diffCell(row.difference)} />
              <Field label="Amount at risk" value={row.atRisk ? fmtINR(row.atRisk) : '—'} mono />
            </dl>
          </section>
        </div>
        <p className="text-2xs text-muted-foreground">Expected values use the configured statutory parameters ({statutoryConfig.version}); they are demonstration values, not authoritative rates.</p>

        {excId ? (
          <>
            <section aria-label="Resolution timeline">
              <h3 className="eyebrow mb-3">Timeline</h3>
              {detail.isPending ? <BlockSkeleton rows={5} /> : detail.data ? <Timeline events={detail.data.timeline} /> : null}
            </section>
            <section aria-label="Actions" className="space-y-3 border-t pt-4">
              <h3 className="eyebrow">Actions</h3>
              <ExceptionActions recordId={excId} kinds={['assign', 'clarify', 'comment', 'review']} />
              <AuthNotice>Overrides and approvals require authorisation and are written to the audit trail in production.</AuthNotice>
              <Link to={`/exceptions/${excId}`} className="inline-flex items-center gap-1 text-sm text-secondary hover:underline">
                Open full exception record <ArrowRight className="size-3.5" />
              </Link>
            </section>
          </>
        ) : (
          <p className="rounded-md border border-success/25 bg-success-soft px-3 py-2 text-sm text-success">Fully reconciled for the selected wage month — no open exception.</p>
        )}
      </div>
    </SheetContent>
  )
}
