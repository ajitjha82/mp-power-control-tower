import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type TooltipProps,
} from 'recharts'
import type { RiskLevel } from '@/types'
import { PageHeader, Section } from '@/components/layout/page'
import { BarList, C, ChartBox, ChartTooltip, Legend, axisProps } from '@/components/charts/chart-kit'
import { BlockSkeleton, ChartSkeleton, QueryState } from '@/components/feedback/states'
import { RiskBadge, pctTone, toneText } from '@/components/feedback/status'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { useScope } from '@/hooks/useScope'
import { matchesSearch, paginate, simulate } from '@/services/api'
import { cn, fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import { AIInsightsPanel } from './AIInsightsPanel'
import {
  type MatrixPoint,
  type RankRow,
  SCORE_THRESHOLD,
  attendanceAnomalies,
  complianceRisk,
  exceptionRecurrence,
  overtimeSeries,
  riskMatrix,
  salaryDelayRisk,
  vendorRanking,
} from './analytics'

const RISK_COLOR: Record<RiskLevel, string> = { Critical: C.danger, High: C.c5, Medium: C.warning, Low: C.success }

// ---------- Vendor risk matrix ----------
function MatrixTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as MatrixPoint | undefined
  if (!p) return null
  return (
    <div className="min-w-[200px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-semibold">{p.name}</span>
        <RiskBadge level={p.riskLevel} score={p.riskScore} />
      </div>
      <dl className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Compliance score</dt>
          <dd className="num font-medium">{fmtPct(p.score, 2)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Financial exposure</dt>
          <dd className="num font-medium">{fmtINR(p.exposure, { compact: true })}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Workforce</dt>
          <dd className="num font-medium">{fmtNum(p.employees)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Quadrant</dt>
          <dd className="font-medium">{p.quadrant}</dd>
        </div>
      </dl>
      <p className="mt-1.5 border-t pt-1.5 text-2xs text-muted-foreground">Click to open Vendor 360</p>
    </div>
  )
}

function RiskMatrix() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['analytics-matrix', ...key], queryFn: () => simulate(() => riskMatrix(filters)) })
  return (
    <Section
      title="Vendor risk matrix"
      description="Compliance score (avg of PF, ESI, salary %) vs financial exposure (amount at risk). Bubble size = workforce; colour = risk level."
      className="xl:col-span-2"
    >
      <QueryState query={q} skeleton={<ChartSkeleton height={360} />} isEmpty={(d) => !d.points.length}>
        {(d) => {
          const actNow = d.points.filter((p) => p.quadrant === 'Act now').sort((a, b) => b.exposure - a.exposure)
          return (
            <div className="space-y-3">
              <div className="relative">
                <ChartBox height={360} label={`Vendor risk matrix: ${d.points.length} vendors plotted by compliance score and financial exposure. ${actNow.length} in the act-now quadrant.`}>
                  <ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke={C.grid} />
                    <XAxis
                      {...axisProps}
                      type="number"
                      dataKey="score"
                      name="Compliance score"
                      domain={[d.xMin, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                      label={{ value: 'Compliance score →', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: C.muted }}
                    />
                    <YAxis {...axisProps} type="number" dataKey="exposure" name="Exposure" width={72} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
                    <ZAxis type="number" dataKey="employees" range={[60, 1100]} name="Workforce" />
                    <ReferenceLine x={SCORE_THRESHOLD} stroke={C.muted} strokeDasharray="4 4" label={{ value: `${SCORE_THRESHOLD}% threshold`, position: 'top', fontSize: 10, fill: C.muted }} />
                    <ReferenceLine y={d.exposureThreshold} stroke={C.muted} strokeDasharray="4 4" label={{ value: 'Median exposure', position: 'insideTopRight', fontSize: 10, fill: C.muted }} />
                    <Tooltip content={<MatrixTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter data={d.points} name="Vendors" fillOpacity={0.75}>
                      {d.points.map((p) => (
                        <Cell key={p.id} fill={RISK_COLOR[p.riskLevel]} stroke={RISK_COLOR[p.riskLevel]} cursor="pointer" onClick={() => navigate(`/vendors/${p.id}`)} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ChartBox>
                <div aria-hidden className="pointer-events-none absolute inset-0 text-2xs font-semibold uppercase tracking-wide">
                  <span className="absolute left-24 top-2 rounded bg-destructive-soft px-1.5 py-0.5 text-destructive">Act now</span>
                  <span className="absolute right-8 top-2 rounded bg-warning-soft px-1.5 py-0.5 text-warning">Watch exposure</span>
                  <span className="absolute bottom-12 left-24 rounded bg-warning-soft px-1.5 py-0.5 text-warning">Watch compliance</span>
                  <span className="absolute bottom-12 right-8 rounded bg-success-soft px-1.5 py-0.5 text-success">Stable</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Legend items={(['Critical', 'High', 'Medium', 'Low'] as RiskLevel[]).map((l) => ({ label: l, color: RISK_COLOR[l] }))} />
                <span className="text-2xs text-muted-foreground">Thresholds: {SCORE_THRESHOLD}% compliance score · median exposure {fmtINR(d.exposureThreshold, { compact: true })}</span>
              </div>
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="mb-1.5 text-xs font-medium">Act now — low compliance and above-median exposure ({actNow.length})</p>
                {actNow.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {actNow.map((p) => (
                      <li key={p.id}>
                        <Link to={`/vendors/${p.id}`} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <span className="font-medium">{p.name}</span>
                          <span className="num text-muted-foreground">{fmtINR(p.exposure, { compact: true })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No vendors in this quadrant for the current scope.</p>
                )}
              </div>
            </div>
          )
        }}
      </QueryState>
    </Section>
  )
}

// ---------- Attendance anomaly trend ----------
function AttendanceAnomalyChart() {
  const { filters, key } = useScope()
  const q = useQuery({ queryKey: ['analytics-att-anomaly', ...key], queryFn: () => simulate(() => attendanceAnomalies(filters)) })
  return (
    <Section title="Attendance anomaly trend" description="Daily attendance % (last 30 days). Red dots deviate more than 1.5σ from the 30-day mean; band shows ±1.5σ.">
      <QueryState query={q} skeleton={<ChartSkeleton />} isEmpty={(d) => !d.data.length}>
        {(d) => {
          const lo = d.mean - 1.5 * d.sd
          const hi = d.mean + 1.5 * d.sd
          return (
            <div className="space-y-2">
              <ChartBox label={`Attendance trend with ${d.anomalies.length} anomalous days`}>
                <LineChart data={d.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis {...axisProps} dataKey="label" interval={4} />
                  <YAxis {...axisProps} width={44} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                  <ReferenceArea y1={lo} y2={hi} fill={C.info} fillOpacity={0.07} />
                  <ReferenceLine y={d.mean} stroke={C.muted} strokeDasharray="4 4" />
                  <Tooltip content={<ChartTooltip fmt={(v) => fmtPct(v, 2)} />} />
                  <Line type="monotone" dataKey="pct" name="Attendance" stroke={C.c1} strokeWidth={2} dot={false} />
                  {d.anomalies.map((a) => (
                    <ReferenceDot key={a.date} x={a.label} y={a.pct} r={5} fill={C.danger} stroke="hsl(var(--card))" strokeWidth={1.5} />
                  ))}
                </LineChart>
              </ChartBox>
              <p className="text-xs text-muted-foreground">
                Mean <span className="num font-medium text-foreground">{fmtPct(d.mean, 2)}</span> · σ <span className="num">{d.sd.toFixed(2)} pp</span> ·{' '}
                {d.anomalies.length ? (
                  <>
                    <span className="font-medium text-destructive">{d.anomalies.length} anomalous day{d.anomalies.length === 1 ? '' : 's'}</span>: {d.anomalies.map((a) => `${a.label} (${fmtPct(a.pct)})`).join(', ')}
                  </>
                ) : (
                  'No anomalies beyond 1.5σ in this window.'
                )}
              </p>
            </div>
          )
        }}
      </QueryState>
    </Section>
  )
}

// ---------- Compliance-risk trend ----------
function ComplianceRiskChart() {
  const { filters, key } = useScope()
  const q = useQuery({ queryKey: ['analytics-comp-risk', ...key], queryFn: () => simulate(() => complianceRisk(filters)) })
  return (
    <Section title="Compliance-risk trend" description="PF and ESI exceptions per wage month (stacked) with estimated statutory amount at risk (line, right axis).">
      <QueryState query={q} skeleton={<ChartSkeleton />} isEmpty={(d) => !d.length}>
        {(d) => (
          <div className="space-y-2">
            <ChartBox label="Monthly PF and ESI exceptions with estimated amount at risk, last 12 wage months">
              <ComposedChart data={d} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis {...axisProps} dataKey="label" />
                <YAxis {...axisProps} yAxisId="n" width={44} tickFormatter={(v: number) => fmtNum(v)} />
                <YAxis {...axisProps} yAxisId="amt" orientation="right" width={64} tickFormatter={(v: number) => fmtINR(v, { compact: true })} />
                <Tooltip content={<ChartTooltip fmt={(v, n) => (n === 'Amount at risk (est.)' ? fmtINR(v, { compact: true }) : fmtNum(v))} />} />
                <Bar yAxisId="n" dataKey="pfExceptions" name="PF exceptions" stackId="ex" fill={C.c1} />
                <Bar yAxisId="n" dataKey="esiExceptions" name="ESI exceptions" stackId="ex" fill={C.c3} radius={[3, 3, 0, 0]} />
                <Line yAxisId="amt" type="monotone" dataKey="amount" name="Amount at risk (est.)" stroke={C.danger} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ChartBox>
            <Legend
              items={[
                { label: 'PF exceptions', color: C.c1 },
                { label: 'ESI exceptions', color: C.c3 },
                { label: 'Amount at risk (est.)', color: C.danger },
              ]}
            />
            <p className="text-2xs text-muted-foreground">Prior-month amounts are estimated from the current month's average exposure per exception.</p>
          </div>
        )}
      </QueryState>
    </Section>
  )
}

// ---------- Overtime anomaly (derived) ----------
function OvertimeChart() {
  const { filters, key } = useScope()
  const q = useQuery({ queryKey: ['analytics-ot', ...key], queryFn: () => simulate(() => overtimeSeries(filters)) })
  return (
    <Section
      title="Overtime anomaly trend"
      description="Weekly overtime hours — derived demo metric (headcount × baseline OT rate, latest week scaled by the 'Excessive hours' exception rate)."
    >
      <QueryState query={q} skeleton={<ChartSkeleton />} isEmpty={(d) => !d.data.length}>
        {(d) => {
          const anomalies = d.data.filter((p) => p.anomaly)
          return (
            <div className="space-y-2">
              <ChartBox label={`Weekly overtime hours, ${anomalies.length} anomalous weeks`}>
                <ComposedChart data={d.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis {...axisProps} dataKey="label" />
                  <YAxis {...axisProps} width={52} tickFormatter={(v: number) => fmtNum(v)} />
                  <ReferenceLine y={d.mean + 1.5 * d.sd} stroke={C.danger} strokeDasharray="4 4" label={{ value: '+1.5σ', position: 'insideTopLeft', fontSize: 10, fill: C.danger }} />
                  <Tooltip content={<ChartTooltip fmt={(v) => `${fmtNum(v)} h`} />} />
                  <Bar dataKey="hours" name="OT hours (derived)" radius={[3, 3, 0, 0]}>
                    {d.data.map((p) => (
                      <Cell key={p.label} fill={p.anomaly ? C.danger : C.c2} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ChartBox>
              <p className="text-xs text-muted-foreground">
                {anomalies.length ? (
                  <>
                    <span className="font-medium text-destructive">Anomalous week{anomalies.length === 1 ? '' : 's'}:</span> {anomalies.map((a) => `${a.label} (${fmtNum(a.hours)} h)`).join(', ')} ·{' '}
                  </>
                ) : (
                  'No weeks above +1.5σ. '
                )}
                {fmtNum(d.excessive)} “Excessive hours” attendance exceptions in scope. Derived metric for demonstration only.
              </p>
            </div>
          )
        }}
      </QueryState>
    </Section>
  )
}

// ---------- Salary-delay risk (heuristic) ----------
function SalaryRisk() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['analytics-salary-risk', ...key], queryFn: () => simulate(() => salaryDelayRisk(filters)) })
  return (
    <Section
      title="Salary-delay risk"
      description="Heuristic risk score (0–100) from salary-paid % and open salary exceptions per 100 workers. Indicative ranking — not a prediction of fact."
    >
      <QueryState query={q} skeleton={<BlockSkeleton rows={8} />} isEmpty={(d) => !d.length}>
        {(d) => (
          <div className="space-y-2">
            <BarList
              items={d.map((r) => ({
                key: r.id,
                label: r.name,
                value: r.score,
                sub: `· ${fmtPct(r.salaryPct)} paid · ${fmtNum(r.openSalary)} open`,
                color: r.score >= 60 ? C.danger : r.score >= 35 ? C.warning : C.success,
              }))}
              max={100}
              format={(v) => `${v}`}
              onSelect={(id) => navigate(`/salary?vendor=${id}`)}
            />
            <p className="text-2xs text-muted-foreground">Score = (100 − salary-paid %) × 7 + open salary exceptions per 100 workers × 6 (+5 if an invoice is blocked), capped at 100. Select a vendor to view its salary records.</p>
          </div>
        )}
      </QueryState>
    </Section>
  )
}

// ---------- Exception recurrence heat table ----------
function RecurrenceHeat() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['analytics-recurrence', ...key], queryFn: () => simulate(() => exceptionRecurrence(filters)) })
  return (
    <Section title="Exception recurrence" description="Open exceptions by vendor × category (top 12 vendors). Darker cells = higher recurrence." className="xl:col-span-2">
      <QueryState query={q} skeleton={<BlockSkeleton rows={8} />} isEmpty={(d) => !d.rows.length}>
        {(d) => (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full border-separate border-spacing-0.5 text-xs">
              <caption className="sr-only">Open exception counts by vendor and category</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 bg-card px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Vendor
                  </th>
                  {d.categories.map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-2 py-1.5 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-1.5 text-right text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="sticky left-0 whitespace-nowrap bg-card px-2 py-1 text-left font-medium">
                      <button type="button" onClick={() => navigate(`/vendors/${r.id}`)} className="rounded text-left hover:text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {r.name}
                      </button>
                    </th>
                    {r.counts.map((n, k) => {
                      const t = n / d.max
                      return (
                        <td
                          key={d.categories[k]}
                          className={cn('num min-w-[56px] rounded px-2 py-1.5 text-center', n === 0 ? 'text-muted-foreground/60' : t > 0.55 ? 'font-semibold text-destructive-foreground' : 'text-foreground')}
                          style={{ background: n === 0 ? 'hsl(var(--muted) / 0.5)' : `hsl(var(--destructive) / ${(0.08 + t * 0.8).toFixed(2)})` }}
                          aria-label={`${r.name}, ${d.categories[k]}: ${n} open exceptions`}
                        >
                          {n}
                        </td>
                      )
                    })}
                    <td className="num px-2 py-1.5 text-right font-semibold">{fmtNum(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </Section>
  )
}

// ---------- Vendor performance ranking ----------
const pctCell = (v: number) => <span className={cn('font-medium', toneText[pctTone(v)])}>{fmtPct(v)}</span>

const rankColumns: ColumnDef<RankRow, unknown>[] = [
  { accessorKey: 'rank', header: 'Rank', cell: ({ row }) => <span className="num font-mono text-muted-foreground">#{row.original.rank}</span>, meta: { align: 'right' } },
  { accessorKey: 'shortName', header: 'Vendor', cell: ({ row }) => <span className="font-medium">{row.original.shortName}</span> },
  { accessorKey: 'riskScore', header: 'Risk score', cell: ({ row }) => <RiskBadge level={row.original.riskLevel} score={row.original.riskScore} /> },
  { accessorKey: 'employees', header: 'Workforce', cell: ({ row }) => fmtNum(row.original.employees), meta: { align: 'right', hideBelow: 'md' } },
  { accessorKey: 'pfPct', header: 'PF %', cell: ({ row }) => pctCell(row.original.pfPct), meta: { align: 'right' } },
  { accessorKey: 'esiPct', header: 'ESI %', cell: ({ row }) => pctCell(row.original.esiPct), meta: { align: 'right' } },
  { accessorKey: 'salaryPct', header: 'Salary %', cell: ({ row }) => pctCell(row.original.salaryPct), meta: { align: 'right', hideBelow: 'md' } },
  { accessorKey: 'attendancePct', header: 'Attendance %', cell: ({ row }) => fmtPct(row.original.attendancePct), meta: { align: 'right', hideBelow: 'lg' } },
  { accessorKey: 'exPer100', header: 'Exceptions / 100', cell: ({ row }) => row.original.exPer100.toFixed(1), meta: { align: 'right' } },
]

function VendorRankingTable() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const t = useTableState({ sort: { id: 'rank', desc: false }, pageSize: 10 })
  const q = useQuery({ queryKey: ['analytics-ranking', ...key], queryFn: () => simulate(() => vendorRanking(filters)) })
  const result = useMemo(() => {
    if (!q.data) return undefined
    const rows = q.data.filter((r) => matchesSearch(t.request.search, r.shortName, r.name, r.id))
    return paginate(rows, t.request)
  }, [q.data, t.request])
  return (
    <Section title="Vendor performance ranking" description="Ranked by composite risk score. Sort any column; select a row to open Vendor 360." bodyClassName="p-0" className="xl:col-span-2">
      <DataTable
        columns={rankColumns}
        result={result}
        state={t}
        isPending={q.isPending}
        isFetching={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/vendors/${r.id}`)}
        searchPlaceholder="Search vendors…"
        exportName="vendor-performance-ranking"
        exportAll={async () => q.data ?? []}
        caption="Vendor performance ranking"
        dense
      />
    </Section>
  )
}

export default function AnalyticsPage() {
  const { filters } = useScope()
  const scoped = filters.vendors.length + filters.regions.length + filters.circles.length + filters.divisions.length + filters.locations.length + filters.contracts.length + filters.categories.length > 0
  return (
    <div className="space-y-5">
      <PageHeader
        title="Risk & Performance Analytics"
        subtitle="Vendor risk positioning, anomaly detection and recurrence patterns across attendance, statutory compliance and salary. All figures respond to the global filters."
        actions={<span className="text-xs text-muted-foreground">{scoped ? 'Filtered scope' : 'Enterprise scope'}</span>}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <RiskMatrix />
        <AttendanceAnomalyChart />
        <ComplianceRiskChart />
        <OvertimeChart />
        <SalaryRisk />
      </div>
      <AIInsightsPanel />
      <div className="grid gap-4 xl:grid-cols-2">
        <RecurrenceHeat />
        <VendorRankingTable />
      </div>
    </div>
  )
}
