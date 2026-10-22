import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend as RLegend, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, HeartPulse, IndianRupee, Landmark, Users } from 'lucide-react'
import { PageHeader, Section } from '@/components/layout/page'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { BlockSkeleton, ChartSkeleton, ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { pctTone, toneText } from '@/components/feedback/status'
import { BarList, C, ChartBox, ChartTooltip, Gauge, axisProps } from '@/components/charts/chart-kit'
import { ComplianceTrendChart } from '@/components/charts/ComplianceTrendChart'
import { Button } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { simulate } from '@/services/api'
import { breakdown, complianceTrend, summarize } from '@/services/metrics'
import { ESI_TYPES, PF_TYPES } from '@/data/snapshot'
import { monthLabel, statutoryConfig } from '@/data/config'
import { useFilters } from '@/store/filters'
import { cn, fmtINR, fmtNum, fmtPct } from '@/lib/utils'

const ALL_TYPES = Array.from(new Set([...PF_TYPES, ...ESI_TYPES]))

export default function CompliancePage() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const patch = useFilters((s) => s.patch)
  const [monthParam, setMonthParam] = useUrlParam('month')
  const [range, setRange] = useState<3 | 6 | 12>(6)
  useEffect(() => {
    if (monthParam) {
      patch({ wageMonth: monthParam })
      setMonthParam(null)
    }
  }, [monthParam, patch, setMonthParam])

  const sum = useQuery({ queryKey: ['comp-sum', ...key], queryFn: () => simulate(() => summarize(filters)) })
  const trend = useQuery({ queryKey: ['comp-trend', range, ...key], queryFn: () => simulate(() => complianceTrend(filters, range), 300) })
  const vendors = useQuery({ queryKey: ['comp-vendors', ...key], queryFn: () => simulate(() => breakdown(filters, 'vendor'), 300) })
  const regions = useQuery({ queryKey: ['comp-regions', ...key], queryFn: () => simulate(() => breakdown(filters, 'region'), 300) })

  const s = sum.data
  const breakdownData = s
    ? ALL_TYPES.map((t) => ({ type: t, PF: s.pfByType[PF_TYPES.indexOf(t as (typeof PF_TYPES)[number])] ?? 0, ESI: s.esiByType[ESI_TYPES.indexOf(t as (typeof ESI_TYPES)[number])] ?? 0 })).sort((a, b) => b.PF + b.ESI - (a.PF + a.ESI))
    : []

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Wage month · ${monthLabel(filters.wageMonth)}`}
        title="Statutory Compliance Control Tower"
        subtitle="Employee-level PF and ESI reconciliation. Compliance means expected and reported contributions reconcile per employee with verified evidence — submitted documents alone are not treated as verified compliance."
        actions={<span className="rounded-md border px-2 py-1 text-2xs text-muted-foreground">Parameters: {statutoryConfig.version} (configurable)</span>}
      />

      {s ? (
        <KpiGrid className="xl:grid-cols-8">
          <KpiCard icon={Users} label="Total Employees" value={fmtNum(s.workforce)} href="/workforce" />
          <KpiCard icon={Landmark} label="PF Applicable" value={fmtNum(s.pfApplicable)} href="/pf" />
          <KpiCard label="PF Compliant" value={fmtNum(s.pfCompliant)} tone="success" href="/pf?status=compliant" />
          <KpiCard label="PF Exceptions" value={fmtNum(s.pfExceptions)} tone="destructive" href="/pf?status=exception" />
          <KpiCard icon={HeartPulse} label="ESI Applicable" value={fmtNum(s.esiApplicable)} href="/esi" />
          <KpiCard label="ESI Compliant" value={fmtNum(s.esiCompliant)} tone="success" href="/esi?status=compliant" />
          <KpiCard label="ESI Exceptions" value={fmtNum(s.esiExceptions)} tone="destructive" href="/esi?status=exception" />
          <KpiCard icon={IndianRupee} label="Total Amount at Risk" value={fmtINR(s.pfAtRisk + s.esiAtRisk, { compact: true })} tone="destructive" secondary="PF + ESI" href="/exceptions?category=PF" />
        </KpiGrid>
      ) : sum.isError ? (
        <div className="rounded-lg border bg-card"><ErrorState error={sum.error} onRetry={() => sum.refetch()} /></div>
      ) : (
        <KpiSkeleton />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(['pf', 'esi'] as const).map((k) => {
          const pf = k === 'pf'
          return (
            <Section key={k} title={pf ? 'PF Compliance' : 'ESI Compliance'} description={pf ? 'Employees with fully reconciled PF ÷ PF-applicable employees' : 'Employees with fully reconciled ESI ÷ ESI-applicable employees'} actions={<Button variant="ghost" size="xs" asChild><Link to={`/${k}?status=exception`}>Reconciliation <ArrowRight /></Link></Button>}>
              {s ? (
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <Gauge value={pf ? s.pfPct : s.esiPct} label={pf ? 'PF compliance' : 'ESI compliance'} tone={pctTone(pf ? s.pfPct : s.esiPct)} target={97} />
                  <div className="w-full flex-1 space-y-2">
                    <Link to={`/${k}?status=compliant`} className="flex items-center justify-between rounded-md border border-success/25 bg-success-soft px-3 py-2 hover:border-success/50">
                      <span className="text-sm text-success">Compliant</span>
                      <span className="num text-lg font-semibold">{fmtNum(pf ? s.pfCompliant : s.esiCompliant)}</span>
                    </Link>
                    <Link to={`/${k}?status=exception`} className="flex items-center justify-between rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 hover:border-destructive/50">
                      <span className="text-sm text-destructive">Exception</span>
                      <span className="num text-lg font-semibold">{fmtNum(pf ? s.pfExceptions : s.esiExceptions)}</span>
                    </Link>
                    <div className="flex items-center justify-between px-3 text-xs text-muted-foreground">
                      <span>Not applicable</span>
                      <span className="num">{fmtNum(s.workforce - (pf ? s.pfApplicable : s.esiApplicable))}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 text-xs text-muted-foreground">
                      <span>Amount at risk</span>
                      <span className="num font-medium text-foreground">{fmtINR(pf ? s.pfAtRisk : s.esiAtRisk, { compact: true })}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <BlockSkeleton rows={5} />
              )}
            </Section>
          )
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Section
          className="xl:col-span-3"
          title="Compliance trend"
          description="Hover for exact percentages and exception counts"
          actions={
            <div role="radiogroup" aria-label="Trend range" className="flex rounded-md border bg-muted/40 p-0.5">
              {([3, 6, 12] as const).map((r) => (
                <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={cn('rounded px-2 py-0.5 text-xs font-medium', range === r ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                  {r} Months
                </button>
              ))}
            </div>
          }
        >
          {trend.data ? <ComplianceTrendChart data={trend.data} height={280} onSelectMonth={(m) => patch({ wageMonth: m })} /> : trend.isError ? <ErrorState error={trend.error} onRetry={() => trend.refetch()} /> : <ChartSkeleton height={280} />}
        </Section>
        <Section className="xl:col-span-2" title="Exception breakdown" description="Click a bar to open the filtered employee table">
          {s ? (
            <ChartBox height={280} label="PF and ESI exceptions by type">
              <BarChart data={breakdownData} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" {...axisProps} />
                <YAxis type="category" dataKey="type" {...axisProps} width={150} tick={{ fontSize: 10.5 }} />
                <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip />} />
                <RLegend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="PF" stackId="a" fill={C.c1} cursor="pointer" onClick={(d: { type?: string }) => d.type && navigate(`/pf?status=exception&exception=${encodeURIComponent(d.type)}`)} />
                <Bar dataKey="ESI" stackId="a" fill={C.c2} radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d: { type?: string }) => d.type && navigate(`/esi?status=exception&exception=${encodeURIComponent(d.type)}`)} />
              </BarChart>
            </ChartBox>
          ) : (
            <ChartSkeleton height={280} />
          )}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Lowest PF compliance by vendor" description="Click to open the vendor's PF exceptions">
          {vendors.data ? (
            <BarList
              items={[...vendors.data].sort((a, b) => a.pfPct - b.pfPct).slice(0, 10).map((v) => ({ key: v.id, label: v.name, value: v.pfPct, sub: `${fmtNum(v.pfExceptions)} exc.`, color: v.pfPct < 95 ? C.danger : v.pfPct < 97 ? C.warning : C.success }))}
              format={(v) => fmtPct(v)}
              max={100}
              onSelect={(id) => navigate(`/pf?vendor=${id}&status=exception`)}
            />
          ) : (
            <BlockSkeleton rows={8} />
          )}
        </Section>
        <Section title="Compliance by region" description="Click a region to filter the control tower">
          {regions.data ? (
            <table className="w-full text-sm">
              <caption className="sr-only">PF and ESI compliance by region</caption>
              <thead>
                <tr className="border-b text-2xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 text-left">Region</th>
                  <th scope="col" className="py-2 text-right">PF %</th>
                  <th scope="col" className="py-2 text-right">PF exc.</th>
                  <th scope="col" className="py-2 text-right">ESI %</th>
                  <th scope="col" className="py-2 text-right">ESI exc.</th>
                </tr>
              </thead>
              <tbody>
                {regions.data.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => patch({ regions: [r.id], circles: [], divisions: [], locations: [] })} onKeyDown={(e) => e.key === 'Enter' && patch({ regions: [r.id] })} className="cursor-pointer border-b last:border-0 hover:bg-accent/60">
                    <td className="py-2 font-medium text-secondary">{r.name}</td>
                    <td className={cn('num py-2 text-right', toneText[pctTone(r.pfPct)])}>{fmtPct(r.pfPct)}</td>
                    <td className="num py-2 text-right">{fmtNum(r.pfExceptions)}</td>
                    <td className={cn('num py-2 text-right', toneText[pctTone(r.esiPct)])}>{fmtPct(r.esiPct)}</td>
                    <td className="num py-2 text-right">{fmtNum(r.esiExceptions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <BlockSkeleton rows={5} />
          )}
        </Section>
      </div>
      <p className="text-2xs text-muted-foreground">
        No direct integration with statutory portals is implemented in this prototype; contribution data is modelled as vendor-submitted files reconciled at employee level. Rates and ceilings are configurable system parameters.
      </p>
    </div>
  )
}
