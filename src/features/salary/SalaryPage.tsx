import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Info, X } from 'lucide-react'
import type { SalaryStatus } from '@/types'
import { PageHeader, Section } from '@/components/layout/page'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { BarList, C, ChartBox, ChartTooltip, axisProps } from '@/components/charts/chart-kit'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { StatusBadge, pctTone } from '@/components/feedback/status'
import { BlockSkeleton, ChartSkeleton, EmptyState, ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { Button, NativeSelect } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { simulate } from '@/services/api'
import { breakdown, complianceTrend, summarize } from '@/services/metrics'
import { type SalaryRow, listSalary, salaryRows } from '@/services/records'
import { vendorById } from '@/data/vendors'
import { MONTH_TARGETS, monthLabel } from '@/data/config'
import { cn, fmtINR, fmtNum, fmtPct, pct } from '@/lib/utils'

const STATUSES: SalaryStatus[] = ['Paid', 'Pending', 'Delayed', 'Partial', 'Amount Mismatch']
const STATUS_COLOR: Record<SalaryStatus, string> = {
  Paid: C.success,
  Pending: C.info,
  Delayed: C.danger,
  Partial: C.warning,
  'Amount Mismatch': C.c5,
}
const STATUS_LABEL: Record<SalaryStatus, string> = {
  Paid: 'Paid (credit confirmed)',
  Pending: 'Pending (bank confirmation awaited)',
  Delayed: 'Delayed',
  Partial: 'Partial payment',
  'Amount Mismatch': 'Amount mismatch',
}

const AGE_BUCKETS = [
  { key: '0', label: '1–5 days', min: 1, max: 5 },
  { key: '5', label: '6–10 days', min: 6, max: 10 },
  { key: '10', label: '11–15 days', min: 11, max: 15 },
  { key: '15', label: 'More than 15 days', min: 16, max: Infinity },
] as const

const asStatus = (v: string | null): SalaryStatus | 'issues' | null => (v === 'issues' ? 'issues' : STATUSES.find((s) => s === v) ?? null)

export default function SalaryPage() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const [statusParam, setStatus] = useUrlParam('status')
  const [vendorParam, setVendor] = useUrlParam('vendor')
  const [minDelayParam, setMinDelay] = useUrlParam('minDelay')
  const status = asStatus(statusParam)
  const vendor = vendorParam && vendorById.has(vendorParam) ? vendorParam : null
  const minDelayNum = Number(minDelayParam)
  const minDelay = minDelayParam && Number.isFinite(minDelayNum) && minDelayNum > 0 ? Math.floor(minDelayNum) : undefined

  const sumQ = useQuery({ queryKey: ['salary', 'summary', ...key], queryFn: () => simulate(() => summarize(filters)) })
  const totalsQ = useQuery({
    queryKey: ['salary-totals', ...key],
    staleTime: 5 * 60_000,
    queryFn: () =>
      simulate(() => {
        const rows = salaryRows(filters, { page: 0, pageSize: 1e9, status: 'all' })
        let payable = 0, paid = 0
        const ageing = AGE_BUCKETS.map(() => 0)
        let delayedAmount = 0
        for (const r of rows) {
          payable += r.netPayable
          paid += r.reportedPaid
          if (r.status === 'Delayed') {
            delayedAmount += r.netPayable
            const b = AGE_BUCKETS.findIndex((x) => r.delayDays >= x.min && r.delayDays <= x.max)
            if (b >= 0) ageing[b]!++
          }
        }
        return { payable, paid, ageing, delayedAmount, count: rows.length }
      }),
  })
  const trendQ = useQuery({ queryKey: ['salary', 'trend', ...key], queryFn: () => simulate(() => complianceTrend(filters, 6)) })
  const vendorQ = useQuery({
    queryKey: ['salary', 'vendors', ...key],
    queryFn: () => simulate(() => breakdown(filters, 'vendor').sort((a, b) => a.salaryPct - b.salaryPct).slice(0, 12)),
  })

  const t = useTableState({ sort: { id: 'delayDays', desc: true } })
  const { setPage } = t
  useEffect(() => setPage(0), [status, vendor, minDelay, setPage])
  const tableQ = useQuery({
    queryKey: ['salary', 'table', ...key, t.request, status, vendor, minDelay],
    queryFn: () => listSalary(filters, { ...t.request, status: status ?? 'all', vendor, minDelay }),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<ColumnDef<SalaryRow, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Employee',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.name}</div>
            <div className="num font-mono text-2xs text-muted-foreground">{row.original.employeeId}</div>
          </div>
        ),
        meta: { csv: (r: SalaryRow) => `${r.name} (${r.employeeId})` },
      },
      { id: 'vendorName', accessorKey: 'vendorName', header: 'Vendor', meta: { hideBelow: 'md' } },
      { id: 'netPayable', accessorKey: 'netPayable', header: 'Net Payable', cell: ({ row }) => fmtINR(row.original.netPayable), meta: { align: 'right' } },
      { id: 'reportedPaid', accessorKey: 'reportedPaid', header: 'Reported Paid', cell: ({ row }) => fmtINR(row.original.reportedPaid), meta: { align: 'right', hideBelow: 'lg' } },
      {
        id: 'difference',
        accessorKey: 'difference',
        header: 'Difference',
        cell: ({ row }) => {
          const d = row.original.difference
          return <span className={cn(d < 0 && 'font-medium text-destructive')}>{d === 0 ? '—' : fmtINR(d)}</span>
        },
        meta: { align: 'right', hideBelow: 'md' },
      },
      {
        id: 'paymentDate',
        accessorKey: 'paymentDate',
        header: 'Payment Date',
        cell: ({ row }) => row.original.paymentDate ?? <span className="text-muted-foreground">Not credited</span>,
        meta: { hideBelow: 'lg' },
      },
      {
        id: 'delayDays',
        accessorKey: 'delayDays',
        header: 'Delay (days)',
        cell: ({ row }) => {
          const d = row.original.delayDays
          return <span className={cn(d > 15 ? 'font-medium text-destructive' : d > 0 ? 'text-warning' : 'text-muted-foreground')}>{d > 0 ? fmtNum(d) : '—'}</span>
        },
        meta: { align: 'right' },
      },
      { id: 'status', accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      {
        id: 'actions',
        header: 'Action',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button asChild variant="outline" size="xs" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Link to={`/employees/${row.original.employeeId}`} aria-label={`View ${row.original.name} in Employee 360`}>
              View
            </Link>
          </Button>
        ),
      },
    ],
    [],
  )

  const sum = sumQ.data
  const totals = totalsQ.data
  const target = MONTH_TARGETS[filters.wageMonth]?.salaryPaidPct
  const vendorName = vendor ? vendorById.get(vendor)?.shortName ?? vendor : null
  const hasTableFilter = !!(status || vendor || minDelay)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Salary Payment Assurance"
        subtitle={`Verification that each deployed employee's net salary for ${monthLabel(filters.wageMonth)} was credited in full and on time by the vendor.`}
      />

      <div className="flex gap-2 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-xs text-info">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          This page tracks <strong>employee salary credit</strong> (vendor → worker bank account, verified against the vendor's bank payment file). It is distinct from{' '}
          <Link to="/invoices" className="font-medium underline underline-offset-2">
            vendor invoice payment
          </Link>{' '}
          (MP Power → vendor). Unpaid or short-paid salary blocks invoice approval at the salary gate.
        </p>
      </div>

      {sumQ.isPending ? (
        <KpiSkeleton />
      ) : sumQ.isError ? (
        <ErrorState error={sumQ.error} onRetry={() => sumQ.refetch()} />
      ) : sum && sum.workforce === 0 ? (
        <EmptyState title="No employees in the current scope." description="Clear or widen the global filters to see salary assurance." />
      ) : sum ? (
        <KpiGrid className="xl:grid-cols-8">
          <KpiCard label="Employees Payable" value={fmtNum(sum.workforce)} secondary={monthLabel(filters.wageMonth, true)} tooltip="Deployed employees on roll in the wage month with net salary payable." onClick={() => { setStatus(null); setVendor(null); setMinDelay(null) }} />
          <KpiCard
            label="Salary Paid"
            value={fmtNum(sum.salaryByStatus[0] ?? 0)}
            secondary={fmtPct(sum.salaryPct)}
            tone={pctTone(sum.salaryPct, 98, 96)}
            delta={target !== undefined ? { value: sum.salaryPct - target, label: 'vs target', higherIsBetter: true } : undefined}
            tooltip="Employees whose full net salary credit is confirmed by the bank file (UTR verified)."
            onClick={() => setStatus('Paid')}
          />
          <KpiCard label="Payment Pending" value={fmtNum(sum.salaryByStatus[1] ?? 0)} secondary="Bank confirmation awaited" tone="info" tooltip="Vendor reports payment initiated; bank credit confirmation not yet received." onClick={() => setStatus('Pending')} />
          <KpiCard label="Delayed" value={fmtNum(sum.salaryByStatus[2] ?? 0)} secondary="Past due date" tone={(sum.salaryByStatus[2] ?? 0) > 0 ? 'destructive' : 'success'} tooltip="Salary not credited by the configured due date." onClick={() => setStatus('Delayed')} />
          <KpiCard label="Partial Payment" value={fmtNum(sum.salaryByStatus[3] ?? 0)} secondary="Short credit" tone={(sum.salaryByStatus[3] ?? 0) > 0 ? 'warning' : 'success'} tooltip="Credited amount is lower than the computed net payable." onClick={() => setStatus('Partial')} />
          <KpiCard label="Amount Mismatch" value={fmtNum(sum.salaryByStatus[4] ?? 0)} secondary="Reported ≠ computed" tone={(sum.salaryByStatus[4] ?? 0) > 0 ? 'warning' : 'success'} tooltip="Amount in the vendor's payment file differs from the wage register." onClick={() => setStatus('Amount Mismatch')} />
          <KpiCard
            label="Total Payable"
            value={totals ? fmtINR(totals.payable, { compact: true }) : totalsQ.isError ? '—' : '…'}
            secondary="Net salary, all employees"
            tooltip="Sum of computed net payable across employees in scope."
          />
          <KpiCard
            label="Total Paid"
            value={totals ? fmtINR(totals.paid, { compact: true }) : totalsQ.isError ? '—' : '…'}
            secondary={totals ? `${fmtPct(pct(totals.paid, totals.payable))} of payable` : undefined}
            tone={totals ? pctTone(pct(totals.paid, totals.payable), 98, 96) : 'neutral'}
            tooltip="Sum of salary amounts reported as credited (bank file)."
          />
        </KpiGrid>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Salary paid % trend" description="Share of employees with confirmed full credit · last 6 wage months" className="xl:col-span-2">
          {trendQ.isPending ? (
            <ChartSkeleton />
          ) : trendQ.isError ? (
            <ErrorState error={trendQ.error} onRetry={() => trendQ.refetch()} />
          ) : !trendQ.data?.length ? (
            <EmptyState title="No trend data for this scope." />
          ) : (
            <ChartBox height={240} label="Salary paid percentage trend over the last six wage months">
              <AreaChart data={trendQ.data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="salFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.c1} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={C.c1} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} domain={[(min: number) => Math.max(80, Math.floor(min - 1)), 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<ChartTooltip fmt={(v) => fmtPct(v, 2)} />} />
                {target !== undefined && <ReferenceLine y={target} stroke={C.muted} strokeDasharray="4 4" label={{ value: `Target ${target}%`, position: 'insideTopRight', fontSize: 10, fill: C.muted }} />}
                <Area type="monotone" dataKey="salaryPct" name="Salary paid %" stroke={C.c1} strokeWidth={2} fill="url(#salFill)" dot={{ r: 3 }} />
              </AreaChart>
            </ChartBox>
          )}
        </Section>

        <Section title="Payment status" description="Click a status to filter the register">
          {sumQ.isPending ? (
            <BlockSkeleton rows={5} />
          ) : sumQ.isError ? (
            <ErrorState error={sumQ.error} onRetry={() => sumQ.refetch()} />
          ) : sum && sum.workforce > 0 ? (
            <BarList
              items={STATUSES.map((s, i) => ({
                key: s,
                label: <StatusBadge status={s} size="xs" />,
                value: sum.salaryByStatus[i] ?? 0,
                sub: fmtPct(pct(sum.salaryByStatus[i] ?? 0, sum.workforce)),
                color: STATUS_COLOR[s],
              }))}
              selected={status}
              onSelect={(k) => setStatus(status === k ? null : k)}
            />
          ) : (
            <EmptyState title="No employees in scope." />
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Vendor payment timeliness" description="Lowest salary-paid % · worst 12 vendors · click to filter" className="xl:col-span-2">
          {vendorQ.isPending ? (
            <BlockSkeleton rows={8} />
          ) : vendorQ.isError ? (
            <ErrorState error={vendorQ.error} onRetry={() => vendorQ.refetch()} />
          ) : !vendorQ.data?.length ? (
            <EmptyState title="No vendors in scope." />
          ) : (
            <div className="grid gap-x-6 md:grid-cols-2">
              <BarList
                items={vendorQ.data.slice(0, 6).map((v) => ({ key: v.id, label: v.name, value: v.salaryPct, sub: `${fmtNum(v.salaryIssues)} issues`, color: v.salaryPct >= 98 ? C.success : v.salaryPct >= 96 ? C.warning : C.danger }))}
                format={(v) => fmtPct(v)}
                max={100}
                selected={vendor}
                onSelect={(k) => setVendor(vendor === k ? null : k)}
              />
              <BarList
                items={vendorQ.data.slice(6).map((v) => ({ key: v.id, label: v.name, value: v.salaryPct, sub: `${fmtNum(v.salaryIssues)} issues`, color: v.salaryPct >= 98 ? C.success : v.salaryPct >= 96 ? C.warning : C.danger }))}
                format={(v) => fmtPct(v)}
                max={100}
                selected={vendor}
                onSelect={(k) => setVendor(vendor === k ? null : k)}
              />
            </div>
          )}
        </Section>

        <Section title="Delayed payment ageing" description="Delayed salaries by days past due · click to filter">
          {totalsQ.isPending ? (
            <BlockSkeleton rows={4} />
          ) : totalsQ.isError ? (
            <ErrorState error={totalsQ.error} onRetry={() => totalsQ.refetch()} />
          ) : totals && totals.ageing.some((n) => n > 0) ? (
            <>
              <BarList
                items={AGE_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, value: totals.ageing[i] ?? 0, color: i >= 2 ? C.danger : i === 1 ? C.warning : C.c4 }))}
                selected={status === 'Delayed' && minDelay !== undefined ? String(minDelay) : null}
                onSelect={(k) => {
                  setStatus('Delayed')
                  setMinDelay(k === '0' ? null : k)
                }}
              />
              <p className="mt-3 px-2 text-xs text-muted-foreground">
                Selecting a bucket shows delayed salaries with delay above its lower bound. Delayed net payable:{' '}
                <span className="num font-medium text-foreground">{fmtINR(totals.delayedAmount, { compact: true })}</span>
              </p>
            </>
          ) : (
            <EmptyState title="No delayed salary payments in scope." />
          )}
        </Section>
      </div>

      <Section
        title="Employee salary credit register"
        description="Employee-level net payable vs. reported credit. Select a row to open Employee 360."
        bodyClassName="p-0"
        actions={
          hasTableFilter ? (
            <Button variant="ghost" size="xs" onClick={() => { setStatus(null); setVendor(null); setMinDelay(null) }}>
              <X /> Clear filters
            </Button>
          ) : undefined
        }
      >
        <DataTable
          caption="Employee salary credit register"
          columns={columns}
          result={tableQ.data}
          state={t}
          isPending={tableQ.isPending}
          isFetching={tableQ.isFetching}
          error={tableQ.error}
          onRetry={() => tableQ.refetch()}
          getRowId={(r) => r.employeeId}
          onRowClick={(r) => navigate(`/employees/${r.employeeId}`)}
          searchPlaceholder="Search employee ID or name…"
          exportName="salary-credit-register"
          exportAll={async () => (await listSalary(filters, { page: 0, pageSize: 1e9, sort: t.request.sort, search: t.request.search, status: status ?? 'all', vendor, minDelay })).rows}
          toolbar={
            <>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Status</span>
                <NativeSelect value={status ?? ''} onChange={(e) => setStatus(e.target.value || null)} className="h-8 text-xs" aria-label="Filter by salary status">
                  <option value="">All statuses</option>
                  <option value="issues">All issues (not fully paid)</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {vendorName && (
                <button type="button" onClick={() => setVendor(null)} className="inline-flex items-center gap-1 rounded-full border bg-accent px-2 py-0.5 text-xs" aria-label={`Remove vendor filter ${vendorName}`}>
                  Vendor: {vendorName} <X className="size-3" aria-hidden />
                </button>
              )}
              {minDelay !== undefined && (
                <button type="button" onClick={() => setMinDelay(null)} className="inline-flex items-center gap-1 rounded-full border bg-accent px-2 py-0.5 text-xs" aria-label={`Remove delay filter (more than ${minDelay} days)`}>
                  Delay &gt; {minDelay} d <X className="size-3" aria-hidden />
                </button>
              )}
            </>
          }
        />
      </Section>

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        Salary gate status for vendor bills is shown on <Link to="/invoices" className="inline-flex items-center gap-0.5 font-medium text-secondary hover:underline">Invoices <ArrowRight className="size-3" aria-hidden /></Link>
      </p>
    </div>
  )
}
