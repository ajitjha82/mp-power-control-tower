import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Circle, Clock, FileText, MapPin, MinusCircle, ShieldAlert, XCircle } from 'lucide-react'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { BlockSkeleton, EmptyState, ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { KpiCard } from '@/components/feedback/kpi'
import { SeverityBadge, StatusBadge, statusTone } from '@/components/feedback/status'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays'
import { Button } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { getEmployee360 } from '@/services/entities'
import { monthLabel, statutoryConfig } from '@/data/config'
import { cn, fmtINR, fmtNum, initials } from '@/lib/utils'
import type { AttendanceDay } from '@/types'

type Data = Extract<NonNullable<Awaited<ReturnType<typeof getEmployee360>>>, { notOnRoll: false }>

const STAGE_STYLE = {
  ok: { icon: CheckCircle2, cls: 'border-success/40 bg-success-soft text-success', label: 'OK' },
  exception: { icon: XCircle, cls: 'border-destructive/50 bg-destructive-soft text-destructive ring-2 ring-destructive/25', label: 'Exception' },
  pending: { icon: Clock, cls: 'border-info/40 bg-info-soft text-info', label: 'Pending' },
  na: { icon: MinusCircle, cls: 'border-border bg-muted text-muted-foreground', label: 'Not applicable' },
}

function Lifecycle({ stages }: { stages: Data['lifecycle'] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" aria-label="Employee lifecycle">
      {stages.map((s, i) => {
        const st = STAGE_STYLE[s.state]
        return (
          <li key={s.key} className="relative">
            <div className={cn('flex h-full flex-col gap-1 rounded-md border px-2.5 py-2', st.cls)}>
              <div className="flex items-center gap-1.5">
                <st.icon className="size-4 shrink-0" aria-hidden />
                <span className="text-xs font-semibold">{s.label}</span>
                <span className="sr-only">— {st.label}</span>
              </div>
              <span className="truncate text-2xs opacity-90">{s.detail}</span>
            </div>
            {i < stages.length - 1 && <ArrowRight aria-hidden className="absolute -right-2 top-1/2 z-10 hidden size-3.5 -translate-y-1/2 text-muted-foreground xl:block" />}
          </li>
        )
      })}
    </ol>
  )
}

const DAY_CLS: Record<AttendanceDay['status'], string> = {
  P: 'bg-success-soft text-success border-success/30',
  A: 'bg-destructive-soft text-destructive border-destructive/30',
  L: 'bg-warning-soft text-warning border-warning/30',
  H: 'bg-info-soft text-info border-info/30',
  W: 'bg-muted text-muted-foreground border-border',
  HD: 'bg-warning-soft text-warning border-warning/30',
}
const DAY_LABEL: Record<AttendanceDay['status'], string> = { P: 'Present', A: 'Absent (unpaid)', L: 'Leave without pay', H: 'Holiday', W: 'Weekly off (paid)', HD: 'Half day' }

function AttendanceCalendar({ days }: { days: AttendanceDay[] }) {
  const first = new Date(days[0]!.date + 'T00:00:00Z').getUTCDay()
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-2xs font-semibold uppercase text-muted-foreground">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: first }, (_, i) => <div key={`b${i}`} />)}
        {days.map((d) => (
          <div key={d.date} title={`${d.date}: ${DAY_LABEL[d.status]}${d.checkIn ? ` · ${d.checkIn}–${d.checkOut} · ${d.source}` : ''}${d.exception ? ` · ${d.exception}` : ''}`} className={cn('relative flex aspect-[4/3] flex-col items-center justify-center rounded border text-xs', DAY_CLS[d.status])}>
            <span className="num font-semibold">{Number(d.date.slice(-2))}</span>
            <span className="text-[9px] font-medium">{d.status}</span>
            {d.exception && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-warning" aria-label="manual modification" />}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-2xs text-muted-foreground">
        {(['P', 'W', 'L', 'A'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1"><span className={cn('size-3 rounded border', DAY_CLS[k])} />{DAY_LABEL[k]}</span>
        ))}
        <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-warning" />Manual modification</span>
      </div>
    </div>
  )
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) {
  return (
    <div className={cn('flex justify-between gap-4 border-b py-1.5 text-sm last:border-0', strong && 'font-semibold')}>
      <span className={cn(!strong && 'text-muted-foreground')}>{k}</span>
      <span className={cn('num', tone)}>{v}</span>
    </div>
  )
}

export default function Employee360Page() {
  const { id = '' } = useParams()
  const { filters } = useScope()
  const navigate = useNavigate()
  const [tab, setTab] = useUrlParam('tab')
  const q = useQuery({ queryKey: ['emp360', id, filters.wageMonth], queryFn: () => getEmployee360(id, filters.wageMonth), placeholderData: undefined })

  if (q.isPending)
    return (
      <div className="space-y-4">
        <BlockSkeleton rows={3} className="rounded-lg border bg-card" />
        <KpiSkeleton count={7} />
        <BlockSkeleton rows={8} className="rounded-lg border bg-card" />
      </div>
    )
  if (q.isError) return <div className="rounded-lg border bg-card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
  if (!q.data) return <EmptyState title="Employee not found" description={`No workforce record for ${id}. IDs look like EMP-10234.`} />
  if (q.data.notOnRoll) return <EmptyState title={`${q.data.employee.name} was not on roll in ${monthLabel(filters.wageMonth)}`} description={`Joined ${q.data.employee.joinDate}. Select a later wage month.`} />

  const d = q.data as Data
  const e = d.employee
  const pfExc = d.exceptions.find((x) => x.category === 'PF')
  const excTone = (s: string) => statusTone(s)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft /> Back
        </Button>
      </div>
      <PageHeader title="Employee 360" eyebrow={`Wage month · ${monthLabel(filters.wageMonth)}`} subtitle="Traceability from deployment and attendance through wage, salary, PF, ESI and the vendor invoice." />

      <section className="rounded-lg border bg-card p-4" aria-label="Employee header">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground" aria-hidden>
              {initials(e.name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{e.name}</h2>
                <StatusBadge status={e.status} />
              </div>
              <div className="num font-mono text-sm text-muted-foreground">{e.id}</div>
              <div className="mt-0.5 text-sm">{e.designation} · {e.category}</div>
            </div>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-3 md:ml-6 md:grid-cols-4">
            <Field label="Vendor" value={<Link to={`/vendors/${d.vendor.id}`} className="inline-flex items-center gap-1 font-medium text-secondary hover:underline"><Building2 className="size-3.5" />{d.vendor.shortName}</Link>} />
            <Field label="Contract" value={<Link to={`/contracts?contract=${d.contract.id}`} className="text-secondary hover:underline">{d.contract.number}</Link>} />
            <Field label="Location" value={<span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-muted-foreground" />{d.location.name}</span>} />
            <Field label="Division" value={d.division.name} />
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Attendance" value={`${d.attendance.present} days`} secondary={`of ${d.wage.monthDays} days`} onClick={() => setTab('attendance')} />
        <KpiCard label="Payable Days" value={fmtNum(d.wage.payableDays)} secondary="approved" onClick={() => setTab('wages')} />
        <KpiCard label="Gross Wage" value={fmtINR(d.wage.grossEarned)} onClick={() => setTab('wages')} />
        <KpiCard label="Net Payable" value={fmtINR(d.wage.netPayable)} onClick={() => setTab('salary')} />
        <KpiCard label="Salary Status" value={d.salary.status} tone={excTone(d.salary.status)} secondary={d.salary.paymentDate ? `credited ${d.salary.paymentDate}` : 'no credit confirmed'} onClick={() => setTab('salary')} />
        <KpiCard label="PF Status" value={d.pf.applicable ? d.pf.status : 'N/A'} tone={d.pf.applicable ? excTone(d.pf.status) : 'neutral'} secondary={d.pf.exception ?? (d.pf.applicable ? 'reconciled' : 'not applicable')} onClick={() => setTab('pf')} />
        <KpiCard label="ESI Status" value={d.esi.applicable ? d.esi.status : 'N/A'} tone={d.esi.applicable ? excTone(d.esi.status) : 'neutral'} secondary={d.esi.exception ?? (d.esi.applicable ? 'reconciled' : 'above configured ceiling')} onClick={() => setTab('esi')} />
      </div>

      <Section title="Lifecycle trace" description="Onboarded → Verified → Deployed → Attendance → Wage → Salary → PF → ESI. Red marks exactly where the exception sits.">
        <Lifecycle stages={d.lifecycle} />
        {(pfExc || d.invoiceGate?.result === 'Blocked') && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive-soft/50 p-3 md:flex-row md:items-center">
            <ShieldAlert className="size-5 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              {pfExc && (
                <p>
                  <b>PF exception:</b> {pfExc.type} — {pfExc.description}{' '}
                  <span className="text-muted-foreground">Status: {pfExc.status}, age {pfExc.ageDays} days (SLA {pfExc.slaDays}).</span>
                </p>
              )}
              {d.invoice && d.invoiceGate?.result === 'Blocked' && (
                <p className="mt-1">
                  <b>Downstream impact:</b> vendor invoice {d.invoice.number} is <b>blocked</b> at the compliance gate — {d.invoiceGate.reason}.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {pfExc && (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/exceptions/${pfExc.id}`}>Exception timeline</Link>
                </Button>
              )}
              {d.invoice && (
                <Button size="sm" variant="secondary" asChild>
                  <Link to={`/invoices/${d.invoice.id}`}>Open invoice <ArrowRight /></Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </Section>

      <Tabs value={tab ?? 'pf'} onValueChange={setTab}>
        <TabsList aria-label="Employee 360 sections">
          {[
            ['profile', 'Profile'],
            ['deployment', 'Deployment'],
            ['attendance', 'Attendance'],
            ['wages', 'Wages'],
            ['salary', 'Salary'],
            ['pf', 'PF'],
            ['esi', 'ESI'],
            ['exceptions', `Exceptions (${d.exceptions.length})`],
            ['documents', 'Documents'],
            ['audit', 'Audit Trail'],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v!}>
              {l}
              {v === 'pf' && d.pf.exception && <AlertTriangle className="size-3.5 text-destructive" aria-label="has exception" />}
              {v === 'esi' && d.esi.exception && <AlertTriangle className="size-3.5 text-destructive" aria-label="has exception" />}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile">
          <Section title="Profile" description="Sensitive identifiers are masked; full values are visible only to authorised roles in production.">
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Full name" value={e.name} />
              <Field label="Gender" value={e.gender === 'F' ? 'Female' : 'Male'} />
              <Field label="Date of joining" value={e.joinDate} mono />
              <Field label="Category" value={e.category} />
              <Field label="UAN" value={e.uanMasked} mono />
              <Field label="ESIC IP No." value={e.esicMasked} mono />
              <Field label="Bank account" value={e.bankMasked} mono />
              <Field label="Aadhaar (masked)" value={e.aadhaarMasked} mono />
              <Field label="Mobile" value={e.mobileMasked} mono />
              <Field label="Employment status" value={<StatusBadge status={e.status} size="xs" />} />
            </dl>
          </Section>
        </TabsContent>

        <TabsContent value="deployment">
          <Section title="Deployment">
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Region" value={d.region.name} />
              <Field label="Division" value={d.division.name} />
              <Field label="Location" value={d.location.name} />
              <Field label="Location type" value={d.location.type} />
              <Field label="Contract" value={d.contract.number} />
              <Field label="Contract scope" value={d.contract.scope} />
              <Field label="Shift" value={d.shift} />
              <Field label="Contract validity" value={`${d.contract.startDate} → ${d.contract.endDate}`} mono />
            </dl>
          </Section>
        </TabsContent>

        <TabsContent value="attendance">
          <div className="grid gap-4 xl:grid-cols-3">
            <Section title={`Attendance register · ${monthLabel(d.wage.month)}`} className="xl:col-span-2">
              <AttendanceCalendar days={d.attendance.days} />
            </Section>
            <Section title="Summary">
              <Row k="Days in month" v={String(d.wage.monthDays)} />
              <Row k="Present" v={String(d.attendance.present)} />
              <Row k="Weekly offs (paid)" v={String(d.attendance.days.filter((x) => x.status === 'W').length)} />
              <Row k="Absent / LWP" v={String(d.attendance.days.filter((x) => x.status === 'A' || x.status === 'L').length)} />
              <Row k="Payable days (approved)" v={String(d.attendance.payableDays)} strong />
              <h4 className="eyebrow mb-1 mt-4">Open attendance exceptions</h4>
              {d.attendanceExceptions.length ? (
                d.attendanceExceptions.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-1 text-sm">
                    <span>{a.exception} · {a.date}</span>
                    <StatusBadge status={a.status} size="xs" />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">None.</p>
              )}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="wages">
          <Section title="Wage computation" description={`Monthly rate × payable days ÷ days in month. Deductions use configured parameters (${statutoryConfig.version}).`}>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="eyebrow mb-1">Earnings</h4>
                <Row k="Basic + DA" v={fmtINR(d.wage.basicDA)} />
                <Row k="HRA" v={fmtINR(d.wage.hra)} />
                <Row k="Other allowances" v={fmtINR(d.wage.otherAllowances)} />
                <Row k="Overtime" v={fmtINR(d.wage.overtime)} />
                <Row k="Gross earned" v={fmtINR(d.wage.grossEarned)} strong />
              </div>
              <div>
                <h4 className="eyebrow mb-1">Deductions</h4>
                <Row k="Employee PF (configured rate)" v={fmtINR(d.wage.employeePF)} />
                <Row k="Employee ESI (configured rate)" v={fmtINR(d.wage.employeeESI)} />
                <Row k="Other deductions" v={fmtINR(d.wage.otherDeductions)} />
                <Row k="Net payable" v={fmtINR(d.wage.netPayable)} strong />
              </div>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="salary">
          <Section title="Salary payment (employee credit)" description="Verified against the vendor's bank payment file. This is the employee's salary — not the vendor's invoice payment.">
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Net payable" value={fmtINR(d.salary.netPayable)} mono />
              <Field label="Reported paid" value={fmtINR(d.salary.reportedPaid)} mono />
              <Field label="Difference" value={<span className={cn('num', d.salary.difference < 0 && 'text-destructive')}>{fmtINR(d.salary.difference)}</span>} />
              <Field label="Status" value={<StatusBadge status={d.salary.status} size="xs" />} />
              <Field label="Due date" value={d.salary.dueDate} mono />
              <Field label="Payment date" value={d.salary.paymentDate ?? '—'} mono />
              <Field label="Delay" value={d.salary.delayDays ? `${d.salary.delayDays} days` : '—'} />
              <Field label="UTR (masked)" value={d.salary.utrMasked ?? '—'} mono />
            </dl>
          </Section>
        </TabsContent>

        <TabsContent value="pf">
          <Section
            title="PF reconciliation"
            description="Expected = configured employee/employer rates on the PF wage derived from approved payable days."
            actions={pfExc && <Button size="sm" variant="outline" asChild><Link to={`/exceptions/${pfExc.id}`}>View exception</Link></Button>}
          >
            {d.pf.applicable ? (
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <h4 className="eyebrow mb-1">Basis</h4>
                  <Row k="Payable days" v={String(d.pf.payableDays)} />
                  <Row k="Eligible wage" v={fmtINR(d.pf.eligibleWage)} />
                  <Row k="PF wage" v={fmtINR(d.pf.pfWage)} />
                  <Row k="UAN" v={d.pf.uanMasked} />
                </div>
                <div>
                  <h4 className="eyebrow mb-1">Expected PF</h4>
                  <Row k="Employee contribution" v={fmtINR(d.pf.expectedEmployee)} />
                  <Row k="Employer contribution" v={fmtINR(d.pf.expectedEmployer)} />
                  <Row k="Total expected" v={fmtINR(d.pf.expectedEmployee + d.pf.expectedEmployer)} strong />
                </div>
                <div>
                  <h4 className="eyebrow mb-1">Reported PF (vendor)</h4>
                  <Row k="Reported wage" v={fmtINR(d.pf.reportedWage)} />
                  <Row k="Employee" v={fmtINR(d.pf.reportedEmployee)} />
                  <Row k="Employer" v={fmtINR(d.pf.reportedEmployer)} />
                  <Row k="Difference" v={fmtINR(d.pf.difference)} strong tone={d.pf.difference < 0 ? 'text-destructive' : undefined} />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:col-span-3">
                  <StatusBadge status={d.pf.status} />
                  {d.pf.exception && <span className="text-sm">{d.pf.exception}</span>}
                  {d.pf.severity && <SeverityBadge severity={d.pf.severity} />}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">PF not applicable for this employee under the configured rules.</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="esi">
          <Section title="ESI reconciliation" description="Applies to employees within the configured ESI wage ceiling.">
            {d.esi.applicable ? (
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <Row k="ESIC IP No." v={d.esi.esicMasked} />
                  <Row k="Payable days" v={String(d.esi.payableDays)} />
                  <Row k="Eligible wage" v={fmtINR(d.esi.eligibleWage)} />
                </div>
                <div>
                  <Row k="Expected employee" v={fmtINR(d.esi.expectedEmployee)} />
                  <Row k="Expected employer" v={fmtINR(d.esi.expectedEmployer)} />
                </div>
                <div>
                  <Row k="Reported employee" v={fmtINR(d.esi.reportedEmployee)} />
                  <Row k="Reported employer" v={fmtINR(d.esi.reportedEmployer)} />
                  <Row k="Difference" v={fmtINR(d.esi.difference)} strong tone={d.esi.difference < 0 ? 'text-destructive' : undefined} />
                </div>
                <div className="flex items-center gap-2 md:col-span-3">
                  <StatusBadge status={d.esi.status} />
                  {d.esi.exception && <span className="text-sm">{d.esi.exception}</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ESI not applicable — rate wage above the configured ceiling.</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="exceptions">
          <Section title="Exceptions" bodyClassName="p-0">
            {d.exceptions.length ? (
              <ul className="divide-y">
                {d.exceptions.map((x) => (
                  <li key={x.id}>
                    <Link to={`/exceptions/${x.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/60">
                      <SeverityBadge severity={x.severity} />
                      <span className="num font-mono text-xs">{x.id}</span>
                      <span className="text-sm font-medium">{x.category} · {x.type}</span>
                      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                        {fmtINR(x.amountAtRisk)} at risk · {x.ageDays}d <StatusBadge status={x.status} size="xs" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No open exceptions for this employee." />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="documents">
          <Section title="Documents" description="Fictional document register (no files are stored in this prototype)." bodyClassName="p-0">
            <ul className="divide-y">
              {[
                ['Appointment letter (vendor)', 'Verified'],
                ['Identity proof (masked)', 'Verified'],
                ['Police verification', e.category === 'Security' ? 'Verified' : 'Verified'],
                ['Bank account proof', 'Verified'],
                ['UAN / KYC link confirmation', d.pf.exception === 'UAN Mismatch' ? 'Under Review' : 'Verified'],
                ['Medical fitness', 'Pending'],
              ].map(([n, s]) => (
                <li key={n} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <FileText className="size-4 text-muted-foreground" aria-hidden />
                  {n}
                  <span className="ml-auto"><StatusBadge status={s === 'Verified' ? 'Approved' : s!} size="xs" /></span>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>

        <TabsContent value="audit">
          <Section title="Audit trail" bodyClassName="p-0">
            <ul className="divide-y text-sm">
              {[
                ['2026-10-14 11:02', 'System', 'PF reconciliation run', `Status → ${d.pf.applicable ? d.pf.status : 'N/A'}`],
                ['2026-10-12 16:40', 'S. K. Malviya (Site Officer)', 'Attendance approved', `Payable days ${d.wage.payableDays}`],
                ['2026-10-09 10:15', `${d.vendor.shortName} (Vendor)`, 'Wage register submitted', `Gross ${fmtINR(d.wage.grossEarned)}`],
                ['2026-09-30 18:00', 'System', 'Attendance month closed', `${d.attendance.present} present days`],
                [`${e.joinDate} 10:00`, 'V. Chaturvedi (HR)', 'Employee onboarded', `Contract ${d.contract.number}`],
              ].map(([at, who, what, detail]) => (
                <li key={at + what} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-4 py-2.5">
                  <span className="num w-36 shrink-0 font-mono text-xs text-muted-foreground">{at}</span>
                  <span className="font-medium">{what}</span>
                  <span className="text-muted-foreground">{detail}</span>
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><Circle className="size-2 fill-current" />{who}</span>
                </li>
              ))}
            </ul>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
