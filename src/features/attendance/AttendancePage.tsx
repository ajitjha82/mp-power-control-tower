import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import type { AttendanceException, AttendanceExceptionType, Severity } from '@/types'
import { Field, PageHeader, Section } from '@/components/layout/page'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { BarList, C, ChartBox, ChartTooltip, Legend, axisProps } from '@/components/charts/chart-kit'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { SeverityBadge, StatusBadge, pctTone } from '@/components/feedback/status'
import { AuthNotice, BlockSkeleton, ChartSkeleton, EmptyState, ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { Button, NativeSelect } from '@/components/ui/primitives'
import { Dialog, SheetContent, Tip } from '@/components/ui/overlays'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { useFilters } from '@/store/filters'
import { useUI } from '@/store/ui'
import { can } from '@/lib/rbac'
import { simulate } from '@/services/api'
import { attendanceKpis, listAttendanceExceptions } from '@/services/entities'
import { attendanceTrend, breakdown } from '@/services/metrics'
import { vendorById } from '@/data/vendors'
import { divisionById, locationById } from '@/data/org'
import { CATEGORIES } from '@/data/roster'
import { cn, fmtNum, fmtPct } from '@/lib/utils'

const TYPES: AttendanceExceptionType[] = [
  'Missing attendance',
  'Missing checkout',
  'Duplicate transaction',
  'Wrong location',
  'Excessive hours',
  'Attendance after separation',
  'Wrong vendor/contract',
  'Manual modification',
]
const STATUSES: AttendanceException['status'][] = ['Open', 'Pending Approval', 'Corrected', 'Rejected']
const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low']

const attTone = (v: number) => pctTone(v, 94, 90)
const pick = <T extends string>(list: readonly T[], v: string | null): T | null => list.find((x) => x === v) ?? null

type Decision = 'Corrected' | 'Rejected'

function HeatCell({ date, label, pctValue, present, absent, mean }: { date: string; label: string; pctValue: number; present: number; absent: number; mean: number }) {
  const diff = pctValue - mean
  const cls = diff >= 0.75 ? 'bg-success text-success-foreground' : diff >= -0.75 ? 'bg-success-soft text-success' : diff >= -1.5 ? 'bg-warning-soft text-warning' : 'bg-destructive-soft text-destructive'
  const band = diff >= 0.75 ? 'above average' : diff >= -0.75 ? 'around average' : diff >= -1.5 ? 'below average' : 'well below average'
  const day = Number(date.slice(8, 10))
  const title = `${label}: ${fmtPct(pctValue, 2)} attendance (${band}) · ${fmtNum(present)} present, ${fmtNum(absent)} absent`
  return (
    <li title={title} aria-label={title} className={cn('flex aspect-square min-h-[38px] flex-col items-center justify-center rounded-md border border-transparent text-center', cls)}>
      <span className="text-2xs opacity-80">{day}</span>
      <span className="num text-[11px] font-semibold leading-none">{pctValue.toFixed(1)}</span>
    </li>
  )
}

export default function AttendancePage() {
  const { filters, key } = useScope()
  const patch = useFilters((s) => s.patch)
  const uiRole = useUI((s) => s.role)
  const canApprove = can(uiRole, 'attendance.approve')

  const [typeParam, setType] = useUrlParam('type')
  const [statusParam, setStatus] = useUrlParam('status')
  const [severityParam, setSeverity] = useUrlParam('severity')
  // Deep links (e.g. AI insight evidence) may scope to a division: apply it as a global filter.
  const [divisionParam, setDivisionParam] = useUrlParam('division')
  useEffect(() => {
    if (!divisionParam) return
    const d = divisionById.get(divisionParam)
    if (d) patch({ regions: [d.regionId], circles: [d.circleId], divisions: [d.id], locations: [] })
    setDivisionParam(null)
  }, [divisionParam, patch, setDivisionParam])
  const type = pick(TYPES, typeParam)
  const status = pick(STATUSES, statusParam)
  const severity = pick(SEVERITIES, severityParam)

  const [reviewing, setReviewing] = useState<AttendanceException | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})

  const kpiQ = useQuery({ queryKey: ['attendance', 'kpis', ...key], queryFn: () => simulate(() => attendanceKpis(filters)) })
  const trendQ = useQuery({ queryKey: ['attendance', 'trend', ...key], queryFn: () => simulate(() => attendanceTrend(filters)) })
  const brkQ = useQuery({
    queryKey: ['attendance', 'breakdowns', ...key],
    queryFn: () =>
      simulate(() => ({
        regions: breakdown(filters, 'region'),
        vendors: breakdown(filters, 'vendor').sort((a, b) => a.attendancePct - b.attendancePct).slice(0, 10),
        categories: breakdown(filters, 'category').sort((a, b) => a.attendancePct - b.attendancePct),
      })),
  })

  const t = useTableState({ sort: { id: 'severity', desc: true } })
  const { setPage } = t
  useEffect(() => setPage(0), [type, status, severity, setPage])
  const tableQ = useQuery({
    queryKey: ['attendance', 'exceptions', ...key, t.request, type, status, severity],
    queryFn: () => listAttendanceExceptions(filters, { ...t.request, type, status, severity }),
    placeholderData: keepPreviousData,
  })

  const scrollToTable = () => document.getElementById('attendance-exceptions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const filterTable = (next: { type?: string | null; status?: string | null }) => {
    setType(next.type ?? null)
    setStatus(next.status ?? null)
    setSeverity(null)
    scrollToTable()
  }

  const decide = (rec: AttendanceException, d: Decision) => {
    setDecisions((m) => ({ ...m, [rec.id]: d }))
    if (d === 'Corrected') toast.success(`Attendance correction approved for ${rec.employeeName}`, { description: `${rec.exception} on ${rec.date} marked Corrected. Payable days will be recomputed (simulated).` })
    else toast.warning(`Correction rejected for ${rec.employeeName}`, { description: `${rec.exception} on ${rec.date} returned to the vendor (simulated).` })
  }

  const columns = useMemo<ColumnDef<AttendanceException, unknown>[]>(
    () => [
      {
        id: 'employeeId',
        accessorKey: 'employeeId',
        header: 'Employee ID',
        cell: ({ row }) => (
          <Link to={`/employees/${row.original.employeeId}`} className="num font-mono text-xs text-secondary hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.employeeId}
          </Link>
        ),
      },
      {
        id: 'employeeName',
        accessorKey: 'employeeName',
        header: 'Employee',
        cell: ({ row }) => (
          <Link to={`/employees/${row.original.employeeId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.employeeName}
          </Link>
        ),
      },
      {
        id: 'vendorId',
        accessorKey: 'vendorId',
        header: 'Vendor',
        cell: ({ row }) => vendorById.get(row.original.vendorId)?.shortName ?? row.original.vendorId,
        meta: { hideBelow: 'md', csv: (r: AttendanceException) => vendorById.get(r.vendorId)?.shortName ?? r.vendorId },
      },
      {
        id: 'locationId',
        accessorKey: 'locationId',
        header: 'Location',
        cell: ({ row }) => <span className="block max-w-[200px] truncate">{locationById.get(row.original.locationId)?.name ?? row.original.locationId}</span>,
        meta: { hideBelow: 'xl', csv: (r: AttendanceException) => locationById.get(r.locationId)?.name ?? r.locationId },
      },
      { id: 'date', accessorKey: 'date', header: 'Date', meta: { hideBelow: 'sm' } },
      { id: 'shift', accessorKey: 'shift', header: 'Shift', meta: { hideBelow: 'xl' } },
      { id: 'checkIn', accessorKey: 'checkIn', header: 'Check-in', cell: ({ row }) => row.original.checkIn ?? <span className="text-muted-foreground">—</span>, meta: { hideBelow: 'lg' } },
      { id: 'checkOut', accessorKey: 'checkOut', header: 'Check-out', cell: ({ row }) => row.original.checkOut ?? <span className="text-muted-foreground">—</span>, meta: { hideBelow: 'lg' } },
      { id: 'source', accessorKey: 'source', header: 'Source', cell: ({ row }) => row.original.source ?? <span className="text-muted-foreground">None</span>, meta: { hideBelow: 'xl' } },
      { id: 'exception', accessorKey: 'exception', header: 'Exception' },
      { id: 'severity', accessorKey: 'severity', header: 'Severity', cell: ({ row }) => <SeverityBadge severity={row.original.severity} />, meta: { hideBelow: 'md' } },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={decisions[row.original.id] ?? row.original.status} />,
        meta: { csv: (r: AttendanceException) => decisions[r.id] ?? r.status },
      },
      {
        id: 'actions',
        header: 'Action',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="xs"
            onClick={(e) => {
              e.stopPropagation()
              setReviewing(row.original)
            }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Review ${row.original.exception} for ${row.original.employeeName}`}
          >
            Review
          </Button>
        ),
      },
    ],
    [decisions],
  )

  const k = kpiQ.data
  const trend = trendQ.data
  const mean = trend?.length ? trend.reduce((a, d) => a + d.pct, 0) / trend.length : 0
  // Calendar grid: Monday-first weeks, leading blanks for the first day.
  const lead = trend?.length ? (new Date(`${trend[0]!.date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0
  const reviewStatus = reviewing ? decisions[reviewing.id] ?? reviewing.status : null
  const decided = reviewStatus === 'Corrected' || reviewStatus === 'Rejected'

  const approveButtons = reviewing ? (
    <div className="flex flex-wrap gap-2">
      {(['Corrected', 'Rejected'] as const).map((d) => {
        const btn = (
          <Button variant={d === 'Corrected' ? 'secondary' : 'outline'} disabled={!canApprove || decided} onClick={() => decide(reviewing, d)}>
            {d === 'Corrected' ? <Check /> : <X />}
            {d === 'Corrected' ? 'Approve correction' : 'Reject'}
          </Button>
        )
        return !canApprove ? (
          <Tip key={d} content={`Your role (${uiRole}) cannot approve attendance. Site, Division and HR officers hold this permission.`}>
            <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${d === 'Corrected' ? 'Approve' : 'Reject'} unavailable for your role`}>
              {btn}
            </span>
          </Tip>
        ) : (
          <span key={d}>{btn}</span>
        )
      })}
    </div>
  ) : null

  return (
    <div className="space-y-5">
      <PageHeader title="Attendance" subtitle="Today's attendance, 30-day trend and attendance exceptions that affect payable days. Click a KPI or chart to filter the exception register." />

      {kpiQ.isPending ? (
        <KpiSkeleton />
      ) : kpiQ.isError ? (
        <ErrorState error={kpiQ.error} onRetry={() => kpiQ.refetch()} />
      ) : k ? (
        <KpiGrid className="xl:grid-cols-8">
          <KpiCard label="Present Today" value={fmtNum(k.present)} secondary={`of ${fmtNum(k.workforce)} deployed`} tone="success" tooltip="Deployed employees with a valid attendance punch today." href="/workforce" />
          <KpiCard label="Absent Today" value={fmtNum(k.absent)} secondary="No valid punch" tone={k.absent > 0 ? 'warning' : 'success'} tooltip="Deployed employees without a valid attendance punch today. Click to see missing-attendance exceptions." onClick={() => filterTable({ type: 'Missing attendance' })} />
          <KpiCard label="Attendance %" value={fmtPct(k.attendancePct)} secondary="Present ÷ deployed" tone={attTone(k.attendancePct)} tooltip="Share of deployed employees present today. Click to show all exceptions." onClick={() => filterTable({})} />
          <KpiCard label="Missing Attendance" value={fmtNum(k.missingAttendance)} secondary="No punch recorded" tone={k.missingAttendance ? 'destructive' : 'success'} tooltip="Rostered employee with no attendance transaction." onClick={() => filterTable({ type: 'Missing attendance' })} />
          <KpiCard label="Missing Checkout" value={fmtNum(k.missingCheckout)} secondary="Check-in only" tone={k.missingCheckout ? 'warning' : 'success'} tooltip="Check-in recorded without a matching check-out." onClick={() => filterTable({ type: 'Missing checkout' })} />
          <KpiCard label="Manual Corrections" value={fmtNum(k.manualCorrections)} secondary="Manual modification" tone={k.manualCorrections ? 'warning' : 'success'} tooltip="Attendance entries modified manually; require approval and audit trail." onClick={() => filterTable({ type: 'Manual modification' })} />
          <KpiCard label="Pending Approval" value={fmtNum(k.pendingApproval)} secondary="Awaiting officer" tone={k.pendingApproval ? 'info' : 'success'} tooltip="Corrections submitted and awaiting site/division officer approval." onClick={() => filterTable({ status: 'Pending Approval' })} />
          <KpiCard label="Geo / Location Exceptions" value={fmtNum(k.geoExceptions)} secondary="Outside geo-fence" tone={k.geoExceptions ? 'destructive' : 'success'} tooltip="Punch recorded outside the deployed location's geo-fence." onClick={() => filterTable({ type: 'Wrong location' })} />
        </KpiGrid>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="30-day attendance trend" description="Daily attendance % · hover for present / absent" className="xl:col-span-2">
          {trendQ.isPending ? (
            <ChartSkeleton />
          ) : trendQ.isError ? (
            <ErrorState error={trendQ.error} onRetry={() => trendQ.refetch()} />
          ) : !trend?.length || !trend.some((d) => d.present + d.absent > 0) ? (
            <EmptyState title="No attendance data for this scope." />
          ) : (
            <ChartBox height={240} label="Daily attendance percentage over the last 30 days">
              <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.c1} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={C.c1} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" {...axisProps} interval={4} />
                <YAxis {...axisProps} domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.min(100, Math.ceil(max + 1))]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip
                  content={
                    <ChartTooltip
                      fmt={(v) => fmtPct(v, 2)}
                      extra={(p) => (
                        <span className="num">
                          Present {fmtNum(Number(p.present))} · Absent {fmtNum(Number(p.absent))}
                        </span>
                      )}
                    />
                  }
                />
                <Area type="monotone" dataKey="pct" name="Attendance %" stroke={C.c1} strokeWidth={2} fill="url(#attFill)" />
              </AreaChart>
            </ChartBox>
          )}
        </Section>

        <Section title="Attendance calendar" description="Last 30 days · shade relative to the 30-day average">
          {trendQ.isPending ? (
            <BlockSkeleton rows={5} />
          ) : trendQ.isError ? (
            <ErrorState error={trendQ.error} onRetry={() => trendQ.refetch()} />
          ) : !trend?.length ? (
            <EmptyState title="No attendance data." />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-7 gap-1 text-center text-2xs font-medium uppercase text-muted-foreground" aria-hidden>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <ul className="grid grid-cols-7 gap-1" aria-label="Daily attendance calendar, last 30 days">
                {Array.from({ length: lead }, (_, i) => (
                  <li key={`pad-${i}`} aria-hidden />
                ))}
                {trend.map((d) => (
                  <HeatCell key={d.date} date={d.date} label={d.label} pctValue={d.pct} present={d.present} absent={d.absent} mean={mean} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                <span>30-day avg <span className="num font-semibold text-foreground">{fmtPct(mean, 2)}</span></span>
                <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-success" aria-hidden />Above</span>
                <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-success-soft ring-1 ring-success/30" aria-hidden />Average</span>
                <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-warning-soft ring-1 ring-warning/30" aria-hidden />Below</span>
                <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-destructive-soft ring-1 ring-destructive/30" aria-hidden />Well below</span>
              </div>
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Section title="By region" description="Attendance % · click to filter globally">
          {brkQ.isPending ? (
            <ChartSkeleton height={220} />
          ) : brkQ.isError ? (
            <ErrorState error={brkQ.error} onRetry={() => brkQ.refetch()} />
          ) : !brkQ.data?.regions.length ? (
            <EmptyState title="No regions in scope." />
          ) : (
            <ChartBox height={220} label="Attendance percentage by region">
              <BarChart data={brkQ.data.regions} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" {...axisProps} domain={[(min: number) => Math.max(0, Math.floor(min - 2)), 100]} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="name" {...axisProps} width={96} tick={{ fontSize: 10 }} tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)} />
                <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip fmt={(v) => fmtPct(v, 2)} extra={(p) => `Present ${fmtNum(Number(p.present))} of ${fmtNum(Number(p.workforce))}`} />} />
                <Bar
                  dataKey="attendancePct"
                  name="Attendance %"
                  radius={[0, 3, 3, 0]}
                  className="cursor-pointer"
                  onClick={(_, i) => {
                    const r = brkQ.data?.regions[i]
                    if (r) patch({ regions: [r.id], circles: [], divisions: [], locations: [] })
                  }}
                >
                  {brkQ.data.regions.map((r) => {
                    const tone = attTone(r.attendancePct)
                    return <Cell key={r.id} fill={tone === 'success' ? C.success : tone === 'warning' ? C.warning : C.danger} />
                  })}
                </Bar>
              </BarChart>
            </ChartBox>
          )}
        </Section>

        <Section title="Lowest vendors" description="10 lowest attendance % · click to filter">
          {brkQ.isPending ? (
            <BlockSkeleton rows={6} />
          ) : brkQ.isError ? (
            <ErrorState error={brkQ.error} onRetry={() => brkQ.refetch()} />
          ) : !brkQ.data?.vendors.length ? (
            <EmptyState title="No vendors in scope." />
          ) : (
            <BarList
              items={brkQ.data.vendors.map((v) => {
                const tone = attTone(v.attendancePct)
                return { key: v.id, label: v.name, value: v.attendancePct, sub: `${fmtNum(v.absent)} abs.`, color: tone === 'success' ? C.success : tone === 'warning' ? C.warning : C.danger }
              })}
              format={(v) => fmtPct(v)}
              max={100}
              selected={filters.vendors.length === 1 ? filters.vendors[0] : null}
              onSelect={(id) => patch({ vendors: [id] })}
            />
          )}
        </Section>

        <Section title="By category" description="Attendance % · click to filter">
          {brkQ.isPending ? (
            <BlockSkeleton rows={6} />
          ) : brkQ.isError ? (
            <ErrorState error={brkQ.error} onRetry={() => brkQ.refetch()} />
          ) : !brkQ.data?.categories.length ? (
            <EmptyState title="No employees in scope." />
          ) : (
            <BarList
              items={brkQ.data.categories.map((c) => ({ key: c.id, label: c.name, value: c.attendancePct, sub: `${fmtNum(c.workforce)} dep.`, color: C.c2 }))}
              format={(v) => fmtPct(v)}
              max={100}
              selected={filters.categories.length === 1 ? filters.categories[0] : null}
              onSelect={(id) => {
                const cat = CATEGORIES.find((c) => c === id)
                if (cat) patch({ categories: [cat] })
              }}
            />
          )}
        </Section>

        <Section title="Exception distribution" description="Open attendance exceptions by type · click to filter">
          {kpiQ.isPending ? (
            <BlockSkeleton rows={6} />
          ) : kpiQ.isError ? (
            <ErrorState error={kpiQ.error} onRetry={() => kpiQ.refetch()} />
          ) : !k?.byType.length ? (
            <EmptyState title="No attendance exceptions in scope." />
          ) : (
            <>
              <BarList
                items={k.byType.map((b) => ({ key: b.type, label: b.type, value: b.count, color: C.c4 }))}
                selected={type}
                onSelect={(id) => {
                  setType(type === id ? null : id)
                  scrollToTable()
                }}
              />
              <div className="mt-3 px-2">
                <Legend items={[{ label: 'Exceptions (count)', color: C.c4 }]} />
              </div>
            </>
          )}
        </Section>
      </div>

      <Section
        id="attendance-exceptions"
        title="Attendance exception register"
        description="Exceptions affecting payable days. Select an employee to open Employee 360, or Review to approve a correction."
        bodyClassName="p-0"
        className="scroll-mt-20"
        actions={
          type || status || severity ? (
            <Button variant="ghost" size="xs" onClick={() => { setType(null); setStatus(null); setSeverity(null) }}>
              <X /> Clear filters
            </Button>
          ) : undefined
        }
      >
        <DataTable
          caption="Attendance exceptions"
          columns={columns}
          result={tableQ.data}
          state={t}
          isPending={tableQ.isPending}
          isFetching={tableQ.isFetching}
          error={tableQ.error}
          onRetry={() => tableQ.refetch()}
          getRowId={(r) => r.id}
          searchPlaceholder="Search employee, ID or vendor…"
          exportName="attendance-exceptions"
          exportAll={async () => (await listAttendanceExceptions(filters, { page: 0, pageSize: 1e9, sort: t.request.sort, search: t.request.search, type, status, severity })).rows}
          toolbar={
            <>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Exception</span>
                <NativeSelect value={type ?? ''} onChange={(e) => setType(e.target.value || null)} className="h-8 text-xs" aria-label="Filter by exception type">
                  <option value="">All types</option>
                  {TYPES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Status</span>
                <NativeSelect value={status ?? ''} onChange={(e) => setStatus(e.target.value || null)} className="h-8 text-xs" aria-label="Filter by status">
                  <option value="">All statuses</option>
                  {STATUSES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Severity</span>
                <NativeSelect value={severity ?? ''} onChange={(e) => setSeverity(e.target.value || null)} className="h-8 text-xs" aria-label="Filter by severity">
                  <option value="">All severities</option>
                  {SEVERITIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </>
          }
        />
      </Section>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        {reviewing && (
          <SheetContent title={`Review: ${reviewing.exception}`} description={`${reviewing.employeeName} · ${reviewing.employeeId} · ${reviewing.date}`}>
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={reviewing.severity} />
                <StatusBadge status={reviewStatus ?? reviewing.status} />
                <span className="num font-mono text-xs text-muted-foreground">{reviewing.id}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Employee" value={<Link to={`/employees/${reviewing.employeeId}`} className="text-secondary hover:underline">{reviewing.employeeName}</Link>} />
                <Field label="Employee ID" value={reviewing.employeeId} mono />
                <Field label="Vendor" value={vendorById.get(reviewing.vendorId)?.shortName ?? reviewing.vendorId} />
                <Field label="Location" value={locationById.get(reviewing.locationId)?.name ?? reviewing.locationId} />
                <Field label="Date" value={reviewing.date} mono />
                <Field label="Shift" value={reviewing.shift} />
                <Field label="Check-in" value={reviewing.checkIn ?? '—'} mono />
                <Field label="Check-out" value={reviewing.checkOut ?? '—'} mono />
                <Field label="Source" value={reviewing.source ?? 'No transaction'} />
                <Field label="Exception" value={reviewing.exception} />
              </dl>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Approving marks the record <strong className="text-foreground">Corrected</strong> and releases the day into payable-day computation. Rejecting returns it to the vendor for re-submission.
              </div>
              {approveButtons}
              {!canApprove && <p className="text-xs text-muted-foreground">Read-only: your current role ({uiRole}) cannot approve attendance corrections.</p>}
              <AuthNotice />
            </div>
          </SheetContent>
        )}
      </Dialog>
    </div>
  )
}
