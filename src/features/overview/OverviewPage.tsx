import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarClock,
  CalendarCheck,
  FileWarning,
  Landmark,
  HeartPulse,
  IndianRupee,
  ShieldAlert,
  UserCheck,
  Users,
  Wallet,
  Briefcase,
} from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { ChartSkeleton, ErrorState, KpiSkeleton, BlockSkeleton } from '@/components/feedback/states'
import { RiskBadge, StatusBadge, pctTone } from '@/components/feedback/status'
import { C, ChartBox, ChartTooltip, axisProps } from '@/components/charts/chart-kit'
import { ComplianceTrendChart } from '@/components/charts/ComplianceTrendChart'
import { Button } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { simulate } from '@/services/api'
import { getOverview } from '@/services/entities'
import { breakdown, complianceTrend } from '@/services/metrics'
import { vendorById } from '@/data/vendors'
import { monthLabel } from '@/data/config'
import { cn, fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import { OrgBreadcrumb, OrgTable, nextLevel } from './OrgDrilldown'
import { AIInsightsPanel } from '@/features/analytics/AIInsightsPanel'

export default function OverviewPage() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const ov = useQuery({ queryKey: ['overview', ...key], queryFn: () => getOverview(filters) })
  const trend = useQuery({ queryKey: ['trend', 6, ...key], queryFn: () => simulate(() => complianceTrend(filters, 6), 320) })
  const level = nextLevel(filters)
  const org = useQuery({ queryKey: ['org', level, ...key], queryFn: () => simulate(() => breakdown(filters, level), 300) })

  const prev = trend.data?.[trend.data.length - 2]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Wage month · ${monthLabel(filters.wageMonth)}`}
        title="Outsourced Workforce Control Tower"
        subtitle="Real-time visibility into workforce, attendance, statutory compliance, salary and vendor billing"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/reports?report=workforce-monthly">Monthly report</Link>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <Link to="/exceptions">
                Exception centre <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      {ov.isPending ? (
        <KpiSkeleton />
      ) : ov.isError ? (
        <div className="rounded-lg border bg-card"><ErrorState error={ov.error} onRetry={() => ov.refetch()} /></div>
      ) : (
        (() => {
          const s = ov.data.summary
          return (
            <KpiGrid className="xl:grid-cols-8">
              <KpiCard icon={Users} label="Total Outsourced Workforce" value={fmtNum(s.workforce)} secondary={`across ${ov.data.vendorCount} vendors`} tooltip="Personnel on roll for the wage month within the current filter scope." href="/workforce" emphasis />
              <KpiCard icon={Briefcase} label="Sanctioned Manpower" value={fmtNum(s.sanctioned)} secondary={`${fmtNum(s.vacant)} vacant`} tooltip="Sanctioned posts under active contracts (deployed + vacant)." href="/workforce" />
              <KpiCard icon={UserCheck} label="Currently Deployed" value={fmtNum(s.workforce)} secondary={`${fmtPct((s.workforce / Math.max(1, s.sanctioned)) * 100)} of sanctioned`} tooltip="Deployed against sanctioned posts." href="/workforce" />
              <KpiCard icon={CalendarCheck} label="Present Today" value={fmtNum(s.present)} secondary={`${fmtNum(s.absent)} absent`} tooltip="Valid attendance recorded for today's shift(s)." href="/attendance" />
              <KpiCard label="Attendance Rate" value={fmtPct(s.attendancePct)} tone={pctTone(s.attendancePct, 94, 92)} delta={prev ? { value: s.attendancePct - prev.attendancePct, label: 'vs last month' } : undefined} tooltip="Present ÷ deployed." href="/attendance" />
              <KpiCard icon={Landmark} label="PF Compliance" value={fmtPct(s.pfPct)} tone={pctTone(s.pfPct)} secondary={`${fmtNum(s.pfExceptions)} exceptions`} delta={prev ? { value: s.pfPct - prev.pfPct, label: 'MoM' } : undefined} tooltip="Employee-level: PF-applicable employees whose expected contribution is fully reconciled with the vendor's reported contribution." href="/pf?status=exception" />
              <KpiCard icon={HeartPulse} label="ESI Compliance" value={fmtPct(s.esiPct)} tone={pctTone(s.esiPct)} secondary={`${fmtNum(s.esiExceptions)} exceptions`} delta={prev ? { value: s.esiPct - prev.esiPct, label: 'MoM' } : undefined} tooltip="Employee-level ESI reconciliation for ESI-applicable employees (configured wage ceiling)." href="/esi?status=exception" />
              <KpiCard icon={Wallet} label="Salary Paid" value={fmtPct(s.salaryPct)} tone={pctTone(s.salaryPct, 98, 96)} secondary={`${fmtNum(s.workforce - s.salaryByStatus[0]!)} not verified`} delta={prev ? { value: s.salaryPct - prev.salaryPct, label: 'MoM' } : undefined} tooltip="Employee salary credit verified against bank payment file (distinct from vendor invoice payment)." href="/salary?status=issues" />
            </KpiGrid>
          )
        })()
      )}

      {/* Executive alert strip — highest priority operational issues */}
      <section aria-label="Priority alerts">
        {ov.data ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { icon: Landmark, n: ov.data.summary.pfExceptions, text: 'employees have PF exceptions', href: '/pf?status=exception', tone: 'destructive' },
              { icon: HeartPulse, n: ov.data.summary.esiExceptions, text: 'employees have ESI exceptions', href: '/esi?status=exception', tone: 'destructive' },
              { icon: CalendarClock, n: ov.data.summary.salaryByStatus[2]!, text: 'salary payments delayed beyond due date', href: '/salary?status=Delayed', tone: 'destructive' },
              { icon: Ban, n: ov.data.invoices.blocked, text: 'invoices blocked by compliance gate', href: '/invoices?status=Blocked', tone: 'warning' },
              { icon: FileWarning, n: ov.data.expiringContracts, text: 'vendor contracts expire within 30 days', href: '/contracts?expiring=1', tone: 'warning' },
            ].map((a) => (
              <Link
                key={a.text}
                to={a.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  a.tone === 'destructive' ? 'border-destructive/25 bg-destructive-soft hover:border-destructive/50' : 'border-warning/30 bg-warning-soft hover:border-warning/60',
                )}
              >
                <a.icon className={cn('size-5 shrink-0', a.tone === 'destructive' ? 'text-destructive' : 'text-warning')} aria-hidden />
                <span className="min-w-0 text-sm leading-snug">
                  <span className={cn('num font-semibold', a.tone === 'destructive' ? 'text-destructive' : 'text-warning')}>{fmtNum(a.n)}</span> {a.text}
                </span>
                <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title="Statutory compliance trend"
          description="Employee-level PF & ESI reconciliation, last 6 wage months. Click a month to open it."
          actions={<Button variant="ghost" size="xs" asChild><Link to="/compliance">Compliance tower <ArrowRight /></Link></Button>}
        >
          {trend.isPending ? <ChartSkeleton /> : trend.isError ? <ErrorState error={trend.error} onRetry={() => trend.refetch()} /> : <ComplianceTrendChart data={trend.data} onSelectMonth={(m) => navigate(`/compliance?month=${m}`)} />}
        </Section>

        <Section title="Financial exposure" description="Amount associated with open exceptions (demo)">
          {ov.data ? (
            <div className="space-y-4">
              <div>
                <div className="eyebrow">Total amount at risk</div>
                <div className="num mt-1 text-3xl font-semibold tracking-tight text-destructive">{fmtINR(ov.data.summary.totalAtRisk, { compact: true })}</div>
                <p className="mt-1 text-xs text-muted-foreground">Statutory shortfall/unverified liability and unpaid salary for the wage month.</p>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  { label: 'PF exceptions', v: ov.data.summary.pfAtRisk, href: '/pf?status=exception' },
                  { label: 'ESI exceptions', v: ov.data.summary.esiAtRisk, href: '/esi?status=exception' },
                  { label: 'Salary shortfall / unpaid', v: ov.data.summary.salaryAtRisk, href: '/salary?status=issues' },
                ].map((r) => (
                  <li key={r.label}>
                    <Link to={r.href} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="num font-medium">{fmtINR(r.v, { compact: true })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link to="/invoices?status=Blocked" className="flex items-center justify-between rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm hover:border-warning/60">
                <span className="flex items-center gap-2 text-warning"><IndianRupee className="size-4" /> Invoice value on hold</span>
                <span className="num font-semibold">{fmtINR(ov.data.invoices.blockedValue, { compact: true })}</span>
              </Link>
            </div>
          ) : (
            <BlockSkeleton />
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Workforce position" description="Sanctioned vs deployed vs present (click to drill)">
          {ov.data ? (
            <ChartBox height={230} label="Workforce position bar chart">
              <BarChart
                layout="vertical"
                data={[
                  { k: 'Sanctioned', v: ov.data.summary.sanctioned, fill: C.c8, href: '/workforce' },
                  { k: 'Deployed', v: ov.data.summary.workforce, fill: C.c1, href: '/workforce' },
                  { k: 'Present', v: ov.data.summary.present, fill: C.success, href: '/attendance' },
                  { k: 'Absent', v: ov.data.summary.absent, fill: C.warning, href: '/attendance?type=Missing%20attendance' },
                  { k: 'Vacant', v: ov.data.summary.vacant, fill: C.danger, href: '/workforce' },
                ]}
                margin={{ top: 0, right: 56, left: 8, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="k" {...axisProps} width={78} />
                <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip />} />
                <Bar dataKey="v" name="Personnel" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: { href?: string }) => d.href && navigate(d.href)}>
                  {['c8', 'c1', 'success', 'warning', 'danger'].map((c) => <Cell key={c} fill={C[c as keyof typeof C]} />)}
                  <LabelList dataKey="v" position="right" formatter={(v: number) => fmtNum(v)} className="num" style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ChartBox>
          ) : (
            <ChartSkeleton height={230} />
          )}
        </Section>

        <Section className="xl:col-span-2" title="Organisational drilldown" description="Click a row to filter the entire control tower to that unit" actions={<OrgBreadcrumb />}>
          {org.isPending ? <BlockSkeleton rows={5} /> : org.isError ? <ErrorState error={org.error} onRetry={() => org.refetch()} /> : <OrgTable rows={org.data} level={level} />}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title="Highest-risk vendors"
          description="Composite of PF, ESI, salary timeliness, attendance, open exceptions and blocked invoices"
          actions={<Button variant="ghost" size="xs" asChild><Link to="/vendors">All vendors <ArrowRight /></Link></Button>}
          bodyClassName="p-0"
        >
          {ov.data ? (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <caption className="sr-only">Highest-risk vendors</caption>
                <thead>
                  <tr className="border-b text-2xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-left font-semibold">Vendor</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Employees</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">PF</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">ESI</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-semibold md:table-cell">Open exc.</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-semibold md:table-cell">At risk</th>
                    <th scope="col" className="px-4 py-2 text-right font-semibold">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {ov.data.topVendors.map((v) => (
                    <tr key={v.id} tabIndex={0} onClick={() => navigate(`/vendors/${v.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/vendors/${v.id}`)} className="cursor-pointer border-b last:border-0 hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none">
                      <td className="px-4 py-2 font-medium">{v.shortName}</td>
                      <td className="num px-2 py-2 text-right">{fmtNum(v.employees)}</td>
                      <td className={cn('num px-2 py-2 text-right', v.pfPct < 95 && 'font-semibold text-destructive')}>{fmtPct(v.pfPct)}</td>
                      <td className={cn('num hidden px-2 py-2 text-right sm:table-cell', v.esiPct < 95 && 'font-semibold text-destructive')}>{fmtPct(v.esiPct)}</td>
                      <td className="num hidden px-2 py-2 text-right md:table-cell">{fmtNum(v.openExceptions)}</td>
                      <td className="num hidden px-2 py-2 text-right md:table-cell">{fmtINR(v.amountAtRisk, { compact: true })}</td>
                      <td className="px-4 py-2 text-right"><RiskBadge level={v.riskLevel} score={v.riskScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <BlockSkeleton rows={6} />
          )}
        </Section>

        <Section title="Blocked invoices" description="Largest invoices held at the compliance gate" actions={<Button variant="ghost" size="xs" asChild><Link to="/invoices?status=Blocked">View all <ArrowRight /></Link></Button>} bodyClassName="p-0">
          {ov.data ? (
            ov.data.blockedInvoices.length ? (
              <ul className="divide-y">
                {ov.data.blockedInvoices.map((inv) => (
                  <li key={inv.id}>
                    <Link to={`/invoices/${inv.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/60">
                      <ShieldAlert className="size-4 shrink-0 text-destructive" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{inv.number}</div>
                        <div className="truncate text-xs text-muted-foreground">{vendorById.get(inv.vendorId)!.shortName} · {fmtNum(inv.employees)} employees</div>
                      </div>
                      <div className="text-right">
                        <div className="num text-sm font-semibold">{fmtINR(inv.amount, { compact: true })}</div>
                        <StatusBadge status="Blocked" size="xs" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No invoices match the current criteria.</p>
            )
          ) : (
            <BlockSkeleton rows={5} />
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Open exceptions" description="Unified exception register" actions={<Button variant="ghost" size="xs" asChild><Link to="/exceptions">Open <ArrowRight /></Link></Button>}>
          {ov.data ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { l: 'Open', v: ov.data.exceptions.open, href: '/exceptions' },
                  { l: 'Critical', v: ov.data.exceptions.critical, href: '/exceptions?severity=Critical', cls: 'text-destructive' },
                  { l: 'Overdue', v: ov.data.exceptions.overdue, href: '/exceptions?overdue=1', cls: 'text-warning' },
                ].map((x) => (
                  <Link key={x.l} to={x.href} className="rounded-md border px-2 py-2 hover:bg-accent">
                    <div className={cn('num text-xl font-semibold', x.cls)}>{fmtNum(x.v)}</div>
                    <div className="text-2xs uppercase tracking-wide text-muted-foreground">{x.l}</div>
                  </Link>
                ))}
              </div>
              <ChartBox height={170} label="Open exceptions by category">
                <BarChart data={ov.data.exceptions.byCategory.slice(0, 7)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="category" {...axisProps} interval={0} tick={{ fontSize: 9 }} />
                  <YAxis {...axisProps} />
                  <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Open" fill={C.c1} radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: { category?: string }) => d.category && navigate(`/exceptions?category=${encodeURIComponent(d.category)}`)} />
                </BarChart>
              </ChartBox>
            </div>
          ) : (
            <ChartSkeleton height={220} />
          )}
        </Section>
        <div className="xl:col-span-2">
          <AIInsightsPanel compact />
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        <AlertTriangle className="size-3" aria-hidden /> Demonstration values on fictional data. Statutory rates and ceilings are configurable parameters, not hard-coded facts.
      </p>
    </div>
  )
}
