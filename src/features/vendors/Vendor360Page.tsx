import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend as RLegend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, ArrowRight, Building2, FileText, ShieldAlert } from 'lucide-react'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { BlockSkeleton, ChartSkeleton, EmptyState, ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { RiskBadge, SeverityBadge, StatusBadge, pctTone } from '@/components/feedback/status'
import { BarList, C, ChartBox, ChartTooltip, axisProps } from '@/components/charts/chart-kit'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays'
import { Button } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { simulate } from '@/services/api'
import { getVendor360 } from '@/services/entities'
import { complianceTrend } from '@/services/metrics'
import { ESI_TYPES, PF_TYPES } from '@/data/snapshot'
import { CURRENT_MONTH, monthLabel } from '@/data/config'
import { useUI } from '@/store/ui'
import { cn, fmtINR, fmtNum, fmtPct } from '@/lib/utils'

export default function Vendor360Page() {
  const { id = '' } = useParams()
  const { filters } = useScope()
  const role = useUI((s) => s.role)
  const navigate = useNavigate()
  const [tab, setTab] = useUrlParam('tab')
  const vf = { ...filters, vendors: [id], contracts: [], compliance: [] }
  const q = useQuery({ queryKey: ['vendor360', id, filters], queryFn: () => getVendor360(id, filters), placeholderData: undefined })
  const trend = useQuery({ queryKey: ['vendor-trend', id, filters], queryFn: () => simulate(() => complianceTrend(vf, 6), 300), placeholderData: undefined })

  if (role === 'Vendor User' && id !== 'V-001') return <EmptyState title="Outside your data scope" description="Vendor users can only view their own organisation. Production enforces this server-side." />
  if (q.isPending)
    return (
      <div className="space-y-4">
        <BlockSkeleton rows={3} className="rounded-lg border bg-card" />
        <KpiSkeleton count={6} />
        <ChartSkeleton />
      </div>
    )
  if (q.isError) return <div className="rounded-lg border bg-card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
  if (!q.data) return <EmptyState title="Vendor not found" description={`No vendor with ID ${id}.`} />

  const { vendor, row, summary: s, contracts, invoices, exceptions, divisions } = q.data
  const overall = (s.pfPct + s.esiPct + s.salaryPct) / 3
  const curInvoices = invoices.filter((i) => i.billingMonth === CURRENT_MONTH)
  const blocked = invoices.filter((i) => i.status === 'Blocked')
  const ageing = [
    { b: '0–7 d', n: exceptions.filter((e) => e.ageDays <= 7).length },
    { b: '8–15 d', n: exceptions.filter((e) => e.ageDays > 7 && e.ageDays <= 15).length },
    { b: '16–30 d', n: exceptions.filter((e) => e.ageDays > 15 && e.ageDays <= 30).length },
    { b: '30+ d', n: exceptions.filter((e) => e.ageDays > 30).length },
  ]
  const invHistory = ['2026-07', '2026-08', '2026-09'].map((m) => {
    const list = invoices.filter((i) => i.billingMonth === m)
    return {
      m: monthLabel(m, true),
      Paid: list.filter((i) => i.status === 'Paid').reduce((a, i) => a + i.amount, 0) / 1e5,
      'In process': list.filter((i) => !['Paid', 'Blocked'].includes(i.status)).reduce((a, i) => a + i.amount, 0) / 1e5,
      Blocked: list.filter((i) => i.status === 'Blocked').reduce((a, i) => a + i.amount, 0) / 1e5,
    }
  })

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft /> Back
      </Button>
      <PageHeader title="Vendor 360" subtitle="Manpower, attendance, statutory compliance, salary, invoices and exceptions for one service provider." />

      <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 lg:flex-row lg:items-center" aria-label="Vendor header">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground"><Building2 className="size-6" aria-hidden /></div>
          <div>
            <h2 className="text-lg font-semibold">{vendor.name}</h2>
            <div className="text-sm text-muted-foreground"><span className="num font-mono">{vendor.id}</span> · GSTIN {vendor.gstinMasked} · {vendor.registeredOffice} · since {vendor.since}</div>
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:ml-8">
          <Field label="Active contracts" value={contracts.length} />
          <Field label="Employees" value={fmtNum(s.workforce)} mono />
          <Field label="Overall compliance" value={<span className={cn('num font-semibold', pctTone(overall) === 'success' ? 'text-success' : pctTone(overall) === 'warning' ? 'text-warning' : 'text-destructive')}>{fmtPct(overall)}</span>} />
          <Field label="Risk score" value={row ? <RiskBadge level={row.riskLevel} score={row.riskScore} /> : '—'} />
        </dl>
      </section>

      {row && (row.riskLevel === 'High' || row.riskLevel === 'Critical') && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive-soft/60 px-4 py-3 text-sm md:flex-row md:items-center">
          <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
          <p className="flex-1">
            <b>Elevated risk.</b> PF compliance {fmtPct(s.pfPct)} ({fmtNum(s.pfExceptions)} exceptions), ESI {fmtPct(s.esiPct)}, {fmtNum(row.openExceptions)} open exceptions and {blocked.length} invoice{blocked.length === 1 ? '' : 's'} blocked at the compliance gate.
          </p>
          {blocked[0] && (
            <Button size="sm" variant="secondary" asChild>
              <Link to={`/invoices/${blocked[0].id}`}>Open blocked invoice <ArrowRight /></Link>
            </Button>
          )}
        </div>
      )}

      <KpiGrid className="xl:grid-cols-6">
        <KpiCard label="Attendance" value={fmtPct(s.attendancePct)} tone={pctTone(s.attendancePct, 94, 92)} secondary={`${fmtNum(s.present)} present`} onClick={() => setTab('attendance')} />
        <KpiCard label="PF compliance" value={fmtPct(s.pfPct)} tone={pctTone(s.pfPct)} secondary={`${fmtNum(s.pfExceptions)} exceptions`} href={`/pf?vendor=${id}&status=exception`} />
        <KpiCard label="ESI compliance" value={fmtPct(s.esiPct)} tone={pctTone(s.esiPct)} secondary={`${fmtNum(s.esiExceptions)} exceptions`} href={`/esi?vendor=${id}&status=exception`} />
        <KpiCard label="Salary timeliness" value={fmtPct(s.salaryPct)} tone={pctTone(s.salaryPct, 98, 96)} secondary={`${fmtNum(s.salaryByStatus[2]!)} delayed`} href={`/salary?vendor=${id}`} />
        <KpiCard label="Amount at risk" value={fmtINR(row?.amountAtRisk ?? s.totalAtRisk, { compact: true })} tone="destructive" secondary="all open exceptions" tooltip="Sum over the vendor's open exceptions (statutory, salary, attendance, wage) — same basis as the vendor risk register." onClick={() => setTab('exceptions')} />
        <KpiCard label="Current invoices" value={fmtINR(curInvoices.reduce((a, i) => a + i.amount, 0), { compact: true })} secondary={`${blocked.length} blocked`} tone={blocked.length ? 'warning' : 'neutral'} onClick={() => setTab('invoices')} />
      </KpiGrid>

      <Tabs value={tab ?? 'overview'} onValueChange={setTab}>
        <TabsList aria-label="Vendor 360 sections">
          {['overview', 'employees', 'attendance', 'pf', 'esi', 'salary', 'invoices', 'contracts', 'documents', 'exceptions'].map((v) => (
            <TabsTrigger key={v} value={v} className="capitalize">
              {v === 'pf' ? 'PF' : v === 'esi' ? 'ESI' : v}
              {v === 'exceptions' && <span className="num rounded-full bg-muted px-1.5 text-2xs">{exceptions.length}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="Compliance & timeliness trend" description="PF, ESI, salary and attendance — last 6 wage months">
              {trend.data ? (
                <ChartBox height={240} label="Vendor compliance trend">
                  <LineChart data={trend.data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis domain={['dataMin - 1', 100]} tickFormatter={(v: number) => `${Math.round(v)}%`} {...axisProps} width={44} />
                    <Tooltip content={<ChartTooltip fmt={(v) => `${v.toFixed(2)}%`} />} />
                    <RLegend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="pfPct" name="PF" stroke={C.c1} strokeWidth={2} dot={false} />
                    <Line dataKey="esiPct" name="ESI" stroke={C.c2} strokeWidth={2} dot={false} />
                    <Line dataKey="salaryPct" name="Salary timeliness" stroke={C.c3} strokeWidth={2} dot={false} />
                    <Line dataKey="attendancePct" name="Attendance" stroke={C.c4} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                  </LineChart>
                </ChartBox>
              ) : (
                <ChartSkeleton />
              )}
            </Section>
            <Section title="Manpower trend" description="Personnel on roll by wage month">
              {trend.data ? (
                <ChartBox height={240} label="Vendor manpower trend">
                  <BarChart data={trend.data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis {...axisProps} width={48} domain={['dataMin - 50', 'auto']} />
                    <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip />} />
                    <Bar dataKey="workforce" name="Employees" fill={C.c1} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartBox>
              ) : (
                <ChartSkeleton />
              )}
            </Section>
            <Section title="Exception ageing" description="Open exceptions by age">
              <ChartBox height={200} label="Exception ageing">
                <BarChart data={ageing} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="b" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip />} />
                  <Bar dataKey="n" name="Exceptions" fill={C.warning} radius={[3, 3, 0, 0]} cursor="pointer" onClick={() => setTab('exceptions')} />
                </BarChart>
              </ChartBox>
            </Section>
            <Section title="Invoice / payment history" description="Vendor invoice value (₹ lakh) by billing month — distinct from employee salary">
              <ChartBox height={200} label="Invoice history">
                <BarChart data={invHistory} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="m" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip fmt={(v) => `₹${v.toFixed(1)} L`} />} />
                  <RLegend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Paid" stackId="a" fill={C.success} />
                  <Bar dataKey="In process" stackId="a" fill={C.c1} />
                  <Bar dataKey="Blocked" stackId="a" fill={C.danger} radius={[3, 3, 0, 0]} cursor="pointer" onClick={() => setTab('invoices')} />
                </BarChart>
              </ChartBox>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="employees">
          <Section title="Deployment by division" description="Click a division to filter the PF reconciliation for this vendor" actions={<Button size="sm" variant="outline" asChild><Link to={`/pf?vendor=${id}`}>All employees (PF view)</Link></Button>}>
            <BarList items={divisions.map((d) => ({ key: d.id, label: d.name, value: d.workforce, sub: `${fmtPct(d.attendancePct)} att.` }))} onSelect={() => navigate(`/pf?vendor=${id}`)} />
          </Section>
        </TabsContent>

        <TabsContent value="attendance">
          <Section title="Attendance" description="Present today and attendance trend">
            <dl className="mb-4 grid grid-cols-3 gap-4">
              <Field label="Deployed" value={fmtNum(s.workforce)} mono />
              <Field label="Present today" value={fmtNum(s.present)} mono />
              <Field label="Absent today" value={fmtNum(s.absent)} mono />
            </dl>
            <Button size="sm" variant="outline" onClick={() => navigate('/attendance')}>Attendance dashboard</Button>
          </Section>
        </TabsContent>

        {(['pf', 'esi'] as const).map((k) => (
          <TabsContent key={k} value={k}>
            <Section title={`${k.toUpperCase()} exceptions by type`} actions={<Button size="sm" variant="secondary" asChild><Link to={`/${k}?vendor=${id}&status=exception`}>Open {k.toUpperCase()} reconciliation <ArrowRight /></Link></Button>}>
              <BarList
                items={(k === 'pf' ? PF_TYPES : ESI_TYPES).map((tp, i) => ({ key: tp, label: tp, value: (k === 'pf' ? s.pfByType : s.esiByType)[i]!, color: i === 0 ? C.danger : C.warning })).filter((x) => x.value)}
                onSelect={(tp) => navigate(`/${k}?vendor=${id}&status=exception&exception=${encodeURIComponent(tp)}`)}
              />
              {(k === 'pf' ? s.pfExceptions : s.esiExceptions) === 0 && <EmptyState title={`No ${k.toUpperCase()} exceptions for this vendor.`} />}
            </Section>
          </TabsContent>
        ))}

        <TabsContent value="salary">
          <Section title="Salary payment status (employee credit)" actions={<Button size="sm" variant="outline" asChild><Link to={`/salary?vendor=${id}`}>Salary monitoring</Link></Button>}>
            <BarList
              items={['Paid', 'Pending', 'Delayed', 'Partial', 'Amount Mismatch'].map((l, i) => ({ key: l, label: l, value: s.salaryByStatus[i]!, color: i === 0 ? C.success : i === 2 ? C.danger : C.warning }))}
              onSelect={(st) => navigate(`/salary?vendor=${id}&status=${encodeURIComponent(st)}`)}
            />
          </Section>
        </TabsContent>

        <TabsContent value="invoices">
          <Section title="Invoices" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Vendor invoices</caption>
                <thead>
                  <tr className="border-b text-2xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-2 text-left">Invoice</th>
                    <th scope="col" className="px-2 py-2 text-left">Billing month</th>
                    <th scope="col" className="hidden px-2 py-2 text-left md:table-cell">Contract</th>
                    <th scope="col" className="px-2 py-2 text-right">Amount</th>
                    <th scope="col" className="hidden px-2 py-2 text-left sm:table-cell">Stage</th>
                    <th scope="col" className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...invoices].reverse().map((i) => (
                    <tr key={i.id} tabIndex={0} onClick={() => navigate(`/invoices/${i.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/invoices/${i.id}`)} className={cn('cursor-pointer border-b hover:bg-accent/60', i.status === 'Blocked' && 'bg-destructive-soft/30')}>
                      <td className="px-4 py-2 font-medium text-secondary">{i.number}</td>
                      <td className="px-2 py-2">{monthLabel(i.billingMonth)}</td>
                      <td className="hidden px-2 py-2 text-xs md:table-cell">{contracts.find((c) => c.id === i.contractId)?.number}</td>
                      <td className="num px-2 py-2 text-right">{fmtINR(i.amount, { compact: true })}</td>
                      <td className="hidden px-2 py-2 text-xs sm:table-cell">{i.stage}</td>
                      <td className="px-4 py-2"><StatusBadge status={i.status} size="xs" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="contracts">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {contracts.map((c) => (
              <Section key={c.id} title={c.number} description={`${c.scope} · ${c.region}`}>
                <dl className="grid grid-cols-2 gap-3">
                  <Field label="Validity" value={`${c.startDate} → ${c.endDate}`} />
                  <Field label="Sanctioned / deployed" value={`${fmtNum(c.sanctionedManpower)} / ${fmtNum(c.deployed)}`} />
                  <Field label="PF exceptions" value={<span className={cn(c.pfEx > 0 && 'font-semibold text-destructive')}>{c.pfEx}</span>} />
                  <Field label="ESI / salary issues" value={`${c.esiEx} / ${c.salaryIssues}`} />
                </dl>
                <Button size="xs" variant="outline" className="mt-3" asChild>
                  <Link to={`/pf?contract=${c.id}&status=exception`}>Employees with PF exceptions</Link>
                </Button>
              </Section>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Section title="Vendor documents" description="Fictional register — submitted documents are not the same as verified compliance." bodyClassName="p-0">
            <ul className="divide-y text-sm">
              {[
                ['Labour licence (contract labour)', 'Approved'],
                ['EPF establishment registration (masked)', 'Approved'],
                ['ESIC employer registration (masked)', 'Approved'],
                ['Sep 2026 ECR / challan upload', 'Under Review'],
                ['Sep 2026 bank payment file', blocked.length ? 'Under Review' : 'Approved'],
                ['Performance bank guarantee', 'Approved'],
                ['GST registration', 'Approved'],
              ].map(([n, st]) => (
                <li key={n} className="flex items-center gap-3 px-4 py-2.5">
                  <FileText className="size-4 text-muted-foreground" aria-hidden /> {n}
                  <span className="ml-auto"><StatusBadge status={st!} size="xs" /></span>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>

        <TabsContent value="exceptions">
          <Section title="Open exceptions" description="Highest amount at risk first" actions={<Button size="sm" variant="outline" asChild><Link to={`/exceptions?vendor=${id}`}>Exception centre</Link></Button>} bodyClassName="p-0">
            {exceptions.length ? (
              <ul className="divide-y">
                {[...exceptions].sort((a, b) => b.amountAtRisk - a.amountAtRisk).slice(0, 25).map((x) => (
                  <li key={x.id}>
                    <Link to={`/exceptions/${x.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/60">
                      <SeverityBadge severity={x.severity} />
                      <span className="num font-mono text-xs">{x.id}</span>
                      <span>{x.category} · {x.type}</span>
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">{fmtINR(x.amountAtRisk)} · {x.ageDays}d <StatusBadge status={x.status} size="xs" /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No open exceptions." />
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
