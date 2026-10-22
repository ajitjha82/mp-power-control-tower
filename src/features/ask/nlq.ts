import type { GlobalFilters } from '@/types'
import { fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import { monthLabel } from '@/data/config'
import { VENDORS, vendorById } from '@/data/vendors'
import { REGIONS, divisionById } from '@/data/org'
import { breakdown, complianceTrend, summarize } from '@/services/metrics'
import { salaryRows } from '@/services/records'
import { contractRows, invoiceGate, scopedAttendanceExceptions, scopedExceptions, scopedInvoices, vendorRows } from '@/services/entities'

/**
 * Deterministic natural-language query prototype. A keyword / regex intent
 * matcher maps the question onto existing analytical services. No language
 * model is involved; unsupported questions return a guided fallback.
 */
export type NlqFmt = 'num' | 'pct' | 'inr'
export type NlqCell = string | number

export interface NlqKpi {
  label: string
  value: string
}
export interface NlqChart {
  type: 'bar' | 'line'
  data: Array<Record<string, NlqCell>>
  xKey: string
  series: Array<{ key: string; label: string }>
  fmt: NlqFmt
}
export interface NlqColumn {
  key: string
  label: string
  kind?: 'text' | 'num' | 'pct' | 'inr' | 'status' | 'risk' | 'id'
}
export interface NlqTable {
  columns: NlqColumn[]
  rows: Array<Record<string, NlqCell>>
  /** Total matching rows (rows may be truncated for display). */
  total: number
  /** Row link = linkPrefix + row[linkKey]. */
  linkPrefix?: string
  linkKey?: string
}
export interface NlqAnswer {
  intent: string
  supported: boolean
  interpretedQuery: string
  summary: string
  kpis: NlqKpi[]
  chart?: NlqChart
  table?: NlqTable
  appliedFilters: string[]
  followUps: string[]
}

export const EXAMPLE_PROMPTS = [
  'Which vendors have PF compliance below 95%?',
  'Show employees whose salary is delayed more than five days.',
  'Which divisions have the highest attendance exceptions?',
  'Show PF and ESI compliance trends for the last six months.',
  'Which vendors have more than 50 unresolved exceptions?',
  'Which invoices are blocked and why?',
  'Show amount at risk by vendor.',
]

const MAX_ROWS = 25

// ---------- Parsing helpers ----------
const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

function normalise(q: string) {
  let s = q.toLowerCase().replace(/[?!]/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b/g, (w) => String(NUM_WORDS[w]))
  return s
}

interface Threshold {
  op: 'lt' | 'gt'
  value: number
}
function threshold(s: string): Threshold | null {
  const m = s.match(/(below|under|less than|lower than|fewer than|<|above|over|more than|greater than|exceeding|higher than|at least|>)\s*(\d+(?:\.\d+)?)/)
  if (!m) return null
  const op = /below|under|less|lower|fewer|</.test(m[1]!) ? 'lt' : 'gt'
  return { op, value: Number(m[2]) }
}
function monthsAsked(s: string, dflt = 6) {
  const m = s.match(/(?:last|past|previous)\s+(\d+)\s+months?/)
  if (m) return Math.max(2, Math.min(12, Number(m[1])))
  if (/\b(year|12 months|annual)\b/.test(s)) return 12
  if (/quarter/.test(s)) return 3
  return dflt
}
const has = (s: string, re: RegExp) => re.test(s)

/** Vendor mentioned by name in the question (narrows the scope). */
function vendorMention(s: string) {
  return VENDORS.find((v) => s.includes(v.shortName.toLowerCase()) || s.includes(v.id.toLowerCase())) ?? null
}

function scopeLabels(f: GlobalFilters): string[] {
  const out = [`Wage month: ${monthLabel(f.wageMonth)}`]
  const named = (ids: string[], noun: string, name: (id: string) => string | undefined) => {
    const real = ids.filter((x) => x !== '__none__')
    if (!real.length) return
    out.push(real.length <= 2 ? `${noun}: ${real.map((id) => name(id) ?? id).join(', ')}` : `${noun}: ${real.length} selected`)
  }
  named(f.regions, 'Region', (id) => REGIONS.find((r) => r.id === id)?.name)
  if (f.circles.length) out.push(`Circles: ${f.circles.length} selected`)
  named(f.divisions, 'Division', (id) => divisionById.get(id)?.name)
  if (f.locations.length) out.push(`Locations: ${f.locations.length} selected`)
  named(f.vendors, 'Vendor', (id) => vendorById.get(id)?.shortName)
  if (f.contracts.length) out.push(`Contracts: ${f.contracts.length} selected`)
  if (f.categories.length) out.push(`Categories: ${f.categories.join(', ')}`)
  if (f.compliance.length) out.push(`Compliance: ${f.compliance.join(', ')}`)
  return out
}

function withVendor(f: GlobalFilters, s: string): { f: GlobalFilters; label: string | null } {
  const v = vendorMention(s)
  if (!v) return { f, label: null }
  if (f.vendors.length && !f.vendors.includes(v.id)) return { f: { ...f, vendors: ['__none__'] }, label: `Vendor: ${v.shortName} (outside your current scope)` }
  return { f: { ...f, vendors: [v.id] }, label: `Vendor (from question): ${v.shortName}` }
}

// ---------- Intents ----------
type Metric = 'pf' | 'esi' | 'salary' | 'attendance'
const METRIC_LABEL: Record<Metric, string> = { pf: 'PF compliance', esi: 'ESI compliance', salary: 'Salary paid on time', attendance: 'Attendance' }
const METRIC_KEY: Record<Metric, 'pfPct' | 'esiPct' | 'salaryPct' | 'attendancePct'> = { pf: 'pfPct', esi: 'esiPct', salary: 'salaryPct', attendance: 'attendancePct' }
function metricsIn(s: string): Metric[] {
  const out: Metric[] = []
  if (/\b(pf|epf|provident)\b/.test(s)) out.push('pf')
  if (/\b(esi|esic)\b/.test(s)) out.push('esi')
  if (/salary|wage pay/.test(s)) out.push('salary')
  if (/attendance/.test(s)) out.push('attendance')
  return out
}

function trendAnswer(f: GlobalFilters, s: string): NlqAnswer {
  const months = monthsAsked(s)
  let ms = metricsIn(s)
  if (!ms.length) ms = ['pf', 'esi']
  const t = complianceTrend(f, months)
  const data = t.map((p) => {
    const row: Record<string, NlqCell> = { label: p.label }
    for (const m of ms) row[METRIC_KEY[m]] = p[METRIC_KEY[m]]
    return row
  })
  const first = t[0]!
  const last = t[t.length - 1]!
  const kpis = ms.map((m) => {
    const d = last[METRIC_KEY[m]] - first[METRIC_KEY[m]]
    return { label: `${METRIC_LABEL[m]} (${last.label})`, value: `${fmtPct(last[METRIC_KEY[m]])} (${d >= 0 ? '+' : ''}${d.toFixed(1)} pp)` }
  })
  const parts = ms.map((m) => {
    const d = last[METRIC_KEY[m]] - first[METRIC_KEY[m]]
    return `${METRIC_LABEL[m]} ${Math.abs(d) < 0.05 ? 'was flat' : d > 0 ? 'improved' : 'declined'} from ${fmtPct(first[METRIC_KEY[m]])} to ${fmtPct(last[METRIC_KEY[m]])}`
  })
  return {
    intent: 'trend',
    supported: true,
    interpretedQuery: `Monthly trend of ${ms.map((m) => METRIC_LABEL[m]).join(' and ')} for the last ${months} wage months`,
    summary: `${parts.join('; ')} between ${first.label} and ${last.label}.`,
    kpis,
    chart: { type: 'line', data, xKey: 'label', series: ms.map((m) => ({ key: METRIC_KEY[m], label: METRIC_LABEL[m] })), fmt: 'pct' },
    appliedFilters: [...scopeLabels(f).slice(1), `Period: last ${months} months`],
    followUps: ['Which vendors have PF compliance below 95%?', 'Show the salary payment trend for the last 12 months.', 'Show amount at risk by vendor.'],
  }
}

function salaryDelayAnswer(f0: GlobalFilters, s: string): NlqAnswer {
  const { f, label } = withVendor(f0, s)
  const th = threshold(s)
  const minDays = s.match(/(\d+)\s*days?/) ? Number(s.match(/(\d+)\s*days?/)![1]) : th?.value ?? 0
  const rows = salaryRows(f, { page: 0, pageSize: 1e6, status: 'Delayed', minDelay: minDays }).sort((a, b) => b.delayDays - a.delayDays)
  const delayTxt = minDays ? ` by more than ${minDays} days` : ''
  const amount = rows.reduce((a, r) => a + r.netPayable, 0)
  const avgDelay = rows.length ? rows.reduce((a, r) => a + r.delayDays, 0) / rows.length : 0
  const byVendor = new Map<string, number>()
  for (const r of rows) byVendor.set(r.vendorName, (byVendor.get(r.vendorName) ?? 0) + 1)
  const vendorData = Array.from(byVendor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, n]) => ({ name, employees: n }))
  return {
    intent: 'salary-delay',
    supported: true,
    interpretedQuery: `Employees with salary status "Delayed"${minDays ? ` and delay greater than ${minDays} days` : ''}`,
    summary: rows.length
      ? `${fmtNum(rows.length)} employees have salary delayed${delayTxt} (average ${avgDelay.toFixed(1)} days), with ${fmtINR(amount, { compact: true })} net pay outstanding. ${vendorData[0] ? `${vendorData[0].name} accounts for the most cases (${fmtNum(vendorData[0].employees)}).` : ''}`
      : `No employees in scope have salary delayed${delayTxt}.`,
    kpis: [
      { label: 'Employees', value: fmtNum(rows.length) },
      { label: 'Net pay outstanding', value: fmtINR(amount, { compact: true }) },
      { label: 'Average delay', value: `${avgDelay.toFixed(1)} days` },
      { label: 'Vendors involved', value: fmtNum(byVendor.size) },
    ],
    chart: vendorData.length > 1 ? { type: 'bar', data: vendorData, xKey: 'name', series: [{ key: 'employees', label: 'Delayed employees' }], fmt: 'num' } : undefined,
    table: rows.length
      ? {
          columns: [
            { key: 'employeeId', label: 'Employee', kind: 'id' },
            { key: 'name', label: 'Name' },
            { key: 'vendorName', label: 'Vendor' },
            { key: 'delayDays', label: 'Delay (days)', kind: 'num' },
            { key: 'netPayable', label: 'Net payable', kind: 'inr' },
            { key: 'status', label: 'Status', kind: 'status' },
          ],
          rows: rows.slice(0, MAX_ROWS).map((r) => ({ employeeId: r.employeeId, name: r.name, vendorName: r.vendorName, delayDays: r.delayDays, netPayable: r.netPayable, status: r.status })),
          total: rows.length,
          linkPrefix: '/employees/',
          linkKey: 'employeeId',
        }
      : undefined,
    appliedFilters: [...scopeLabels(f0), ...(label ? [label] : []), 'Salary status: Delayed', ...(minDays ? [`Delay > ${minDays} days`] : [])],
    followUps: ['Which vendors have the lowest salary-paid percentage?', 'Show the salary payment trend for the last 12 months.', 'Which invoices are blocked and why?'],
  }
}

function attendanceExceptionAnswer(f: GlobalFilters, s: string): NlqAnswer {
  const byVendor = /vendor/.test(s)
  const manualOnly = /manual|correction|modif/.test(s)
  const ax = scopedAttendanceExceptions(f).filter((a) => !manualOnly || a.exception === 'Manual modification')
  const groups = new Map<string, number>()
  for (const a of ax) {
    const k = byVendor ? a.vendorId : a.divisionId
    groups.set(k, (groups.get(k) ?? 0) + 1)
  }
  const wf = new Map(breakdown(f, byVendor ? 'vendor' : 'division').map((g) => [g.id, g.workforce]))
  const ranked = Array.from(groups)
    .map(([id, n]) => ({
      id,
      name: byVendor ? vendorById.get(id)?.shortName ?? id : divisionById.get(id)?.name ?? id,
      n,
      per1000: wf.get(id) ? (n / wf.get(id)!) * 1000 : 0,
    }))
    .sort((a, b) => b.n - a.n)
  const top = ranked[0]
  const types = new Map<string, number>()
  for (const a of ax) types.set(a.exception, (types.get(a.exception) ?? 0) + 1)
  const topType = Array.from(types).sort((a, b) => b[1] - a[1])[0]
  const noun = byVendor ? 'vendor' : 'division'
  return {
    intent: 'attendance-exceptions',
    supported: true,
    interpretedQuery: `Count of ${manualOnly ? 'manual attendance modifications' : 'attendance exceptions'} grouped by ${noun}, ranked highest first`,
    summary: top
      ? `${top.name} has the highest number of ${manualOnly ? 'manual attendance modifications' : 'attendance exceptions'} (${fmtNum(top.n)}, ${top.per1000.toFixed(1)} per 1,000 workers). Across ${fmtNum(ranked.length)} ${noun}s there are ${fmtNum(ax.length)} exceptions${topType ? `; the most common type is "${topType[0]}" (${fmtNum(topType[1])})` : ''}.`
      : 'No attendance exceptions found for the current scope.',
    kpis: [
      { label: 'Attendance exceptions', value: fmtNum(ax.length) },
      { label: `${byVendor ? 'Vendors' : 'Divisions'} affected`, value: fmtNum(ranked.length) },
      { label: 'Most common type', value: topType ? topType[0] : '—' },
    ],
    chart: ranked.length ? { type: 'bar', data: ranked.slice(0, 10).map((r) => ({ name: r.name, exceptions: r.n })), xKey: 'name', series: [{ key: 'exceptions', label: 'Exceptions' }], fmt: 'num' } : undefined,
    table: ranked.length
      ? {
          columns: [
            { key: 'name', label: byVendor ? 'Vendor' : 'Division' },
            { key: 'n', label: 'Exceptions', kind: 'num' },
            { key: 'per1000', label: 'Per 1,000 workers', kind: 'num' },
            ...(byVendor ? [{ key: 'id', label: 'Vendor ID', kind: 'id' as const }] : []),
          ],
          rows: ranked.slice(0, MAX_ROWS).map((r) => ({ id: r.id, name: r.name, n: r.n, per1000: +r.per1000.toFixed(1) })),
          total: ranked.length,
          ...(byVendor ? { linkPrefix: '/vendors/', linkKey: 'id' } : {}),
        }
      : undefined,
    appliedFilters: [...scopeLabels(f), ...(manualOnly ? ['Exception type: Manual modification'] : []), `Grouped by: ${noun}`],
    followUps: [
      byVendor ? 'Which divisions have the highest attendance exceptions?' : 'Which vendors have the highest attendance exceptions?',
      'Which divisions have the most manual attendance corrections?',
      'Show the attendance trend for the last 12 months.',
    ],
  }
}

function unresolvedExceptionsAnswer(f0: GlobalFilters, s: string): NlqAnswer {
  const { f, label } = withVendor(f0, s)
  const th = threshold(s)
  const ex = scopedExceptions(f).filter((e) => e.status !== 'Resolved')
  const counts = new Map<string, { n: number; critical: number; overdue: number; amount: number }>()
  for (const e of ex) {
    const c = counts.get(e.vendorId) ?? { n: 0, critical: 0, overdue: 0, amount: 0 }
    c.n++
    if (e.severity === 'Critical') c.critical++
    if (e.ageDays > e.slaDays) c.overdue++
    if (e.category !== 'Invoice') c.amount += e.amountAtRisk
    counts.set(e.vendorId, c)
  }
  const all = Array.from(counts)
    .map(([id, c]) => ({ id, name: vendorById.get(id)?.shortName ?? id, ...c }))
    .sort((a, b) => b.n - a.n)
  const matched = th ? all.filter((r) => (th.op === 'gt' ? r.n > th.value : r.n < th.value)) : all.slice(0, 10)
  const cond = th ? `${th.op === 'gt' ? 'more than' : 'fewer than'} ${fmtNum(th.value)}` : 'the most'
  return {
    intent: 'unresolved-exceptions',
    supported: true,
    interpretedQuery: `Vendors with ${cond} unresolved compliance exceptions (status ≠ Resolved)`,
    summary: matched.length
      ? `${fmtNum(matched.length)} vendor${matched.length === 1 ? '' : 's'} ${th ? `have ${cond}` : 'have the most'} unresolved exceptions, together holding ${fmtNum(matched.reduce((a, r) => a + r.n, 0))} of ${fmtNum(ex.length)} open exceptions. ${matched[0]!.name} leads with ${fmtNum(matched[0]!.n)} (${fmtNum(matched[0]!.overdue)} past SLA).`
      : `No vendors in scope have ${cond} unresolved exceptions.`,
    kpis: [
      { label: 'Vendors matched', value: fmtNum(matched.length) },
      { label: 'Open exceptions (scope)', value: fmtNum(ex.length) },
      { label: 'Past SLA (matched)', value: fmtNum(matched.reduce((a, r) => a + r.overdue, 0)) },
      { label: 'Amount at risk (matched)', value: fmtINR(matched.reduce((a, r) => a + r.amount, 0), { compact: true }) },
    ],
    chart: matched.length > 1 ? { type: 'bar', data: matched.slice(0, 12).map((r) => ({ name: r.name, open: r.n })), xKey: 'name', series: [{ key: 'open', label: 'Unresolved exceptions' }], fmt: 'num' } : undefined,
    table: matched.length
      ? {
          columns: [
            { key: 'name', label: 'Vendor' },
            { key: 'n', label: 'Unresolved', kind: 'num' },
            { key: 'critical', label: 'Critical', kind: 'num' },
            { key: 'overdue', label: 'Past SLA', kind: 'num' },
            { key: 'amount', label: 'Amount at risk', kind: 'inr' },
          ],
          rows: matched.slice(0, MAX_ROWS).map((r) => ({ id: r.id, name: r.name, n: r.n, critical: r.critical, overdue: r.overdue, amount: r.amount })),
          total: matched.length,
          linkPrefix: '/vendors/',
          linkKey: 'id',
        }
      : undefined,
    appliedFilters: [...scopeLabels(f0), ...(label ? [label] : []), 'Status ≠ Resolved', ...(th ? [`Count ${th.op === 'gt' ? '>' : '<'} ${th.value}`] : [])],
    followUps: ['Show amount at risk by vendor.', 'Which vendors have PF compliance below 95%?', 'Which divisions have the highest attendance exceptions?'],
  }
}

function blockedInvoicesAnswer(f0: GlobalFilters, s: string): NlqAnswer {
  const { f, label } = withVendor(f0, s)
  const inv = scopedInvoices(f)
  const blocked = inv.filter((i) => i.status === 'Blocked').sort((a, b) => b.amount - a.amount)
  const total = blocked.reduce((a, i) => a + i.amount, 0)
  const reasons = new Map(blocked.map((i) => [i.id, invoiceGate(i).reason]))
  const byVendor = new Map<string, number>()
  for (const i of blocked) byVendor.set(i.vendorId, (byVendor.get(i.vendorId) ?? 0) + i.amount)
  const first = blocked[0]
  const firstReason = first ? reasons.get(first.id) : null
  return {
    intent: 'blocked-invoices',
    supported: true,
    interpretedQuery: 'Invoices currently blocked by the compliance gate, largest first, with the failing gate checks',
    summary: first
      ? `${fmtNum(blocked.length)} invoices worth ${fmtINR(total, { compact: true })} are blocked. The largest is ${first.number} (${vendorById.get(first.vendorId)?.shortName}, ${fmtINR(first.amount, { compact: true })})${firstReason ? ` — blocked because: ${firstReason}.` : '.'}`
      : 'No invoices are blocked in the current scope.',
    kpis: [
      { label: 'Blocked invoices', value: fmtNum(blocked.length) },
      { label: 'Blocked value', value: fmtINR(total, { compact: true }) },
      { label: 'Vendors affected', value: fmtNum(byVendor.size) },
      { label: 'Invoices pending payment', value: fmtNum(inv.filter((i) => i.status !== 'Paid').length) },
    ],
    chart:
      byVendor.size > 1
        ? {
            type: 'bar',
            data: Array.from(byVendor)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([id, v]) => ({ name: vendorById.get(id)?.shortName ?? id, value: v })),
            xKey: 'name',
            series: [{ key: 'value', label: 'Blocked value' }],
            fmt: 'inr',
          }
        : undefined,
    table: blocked.length
      ? {
          columns: [
            { key: 'number', label: 'Invoice' },
            { key: 'vendor', label: 'Vendor' },
            { key: 'month', label: 'Billing month' },
            { key: 'amount', label: 'Amount', kind: 'inr' },
            { key: 'reason', label: 'Gate reason' },
            { key: 'status', label: 'Status', kind: 'status' },
          ],
          rows: blocked.slice(0, MAX_ROWS).map((i) => ({
            id: i.id,
            number: i.number,
            vendor: vendorById.get(i.vendorId)?.shortName ?? i.vendorId,
            month: monthLabel(i.billingMonth, true),
            amount: i.amount,
            reason: reasons.get(i.id) ?? '—',
            status: i.status,
          })),
          total: blocked.length,
          linkPrefix: '/invoices/',
          linkKey: 'id',
        }
      : undefined,
    appliedFilters: [...scopeLabels(f0).slice(1), ...(label ? [label] : []), 'Invoice status: Blocked'],
    followUps: ['Which vendors have more than 50 unresolved exceptions?', 'Show amount at risk by vendor.', 'Show employees whose salary is delayed more than five days.'],
  }
}

function amountAtRiskAnswer(f: GlobalFilters): NlqAnswer {
  const rows = vendorRows(f).sort((a, b) => b.amountAtRisk - a.amountAtRisk)
  const total = rows.reduce((a, r) => a + r.amountAtRisk, 0)
  const top5 = rows.slice(0, 5).reduce((a, r) => a + r.amountAtRisk, 0)
  return {
    intent: 'amount-at-risk',
    supported: true,
    interpretedQuery: 'Statutory and salary amount at risk (open exceptions, excluding invoice holds) grouped by vendor',
    summary: rows.length
      ? `${fmtINR(total, { compact: true })} is at risk across ${fmtNum(rows.length)} vendors. The top five account for ${fmtPct(total ? (top5 / total) * 100 : 0, 0)}; ${rows[0]!.shortName} has the largest exposure at ${fmtINR(rows[0]!.amountAtRisk, { compact: true })}.`
      : 'No vendors in the current scope.',
    kpis: [
      { label: 'Total amount at risk', value: fmtINR(total, { compact: true }) },
      { label: 'Top-5 share', value: fmtPct(total ? (top5 / total) * 100 : 0, 0) },
      { label: 'Vendors', value: fmtNum(rows.length) },
    ],
    chart: rows.length ? { type: 'bar', data: rows.slice(0, 12).map((r) => ({ name: r.shortName, value: r.amountAtRisk })), xKey: 'name', series: [{ key: 'value', label: 'Amount at risk' }], fmt: 'inr' } : undefined,
    table: rows.length
      ? {
          columns: [
            { key: 'name', label: 'Vendor' },
            { key: 'amount', label: 'Amount at risk', kind: 'inr' },
            { key: 'open', label: 'Open exceptions', kind: 'num' },
            { key: 'riskLevel', label: 'Risk', kind: 'risk' },
          ],
          rows: rows.slice(0, MAX_ROWS).map((r) => ({ id: r.id, name: r.shortName, amount: r.amountAtRisk, open: r.openExceptions, riskLevel: r.riskLevel, riskScore: r.riskScore })),
          total: rows.length,
          linkPrefix: '/vendors/',
          linkKey: 'id',
        }
      : undefined,
    appliedFilters: scopeLabels(f),
    followUps: ['Which vendors have more than 50 unresolved exceptions?', 'Which invoices are blocked and why?', 'Which are the highest-risk vendors?'],
  }
}

function complianceThresholdAnswer(f: GlobalFilters, s: string, metric: Metric): NlqAnswer {
  const byDivision = /division/.test(s)
  const th = threshold(s)
  const key = METRIC_KEY[metric]
  const label = METRIC_LABEL[metric]
  const source = byDivision
    ? breakdown(f, 'division').map((d) => ({ id: d.id, name: d.name, value: d[key], workforce: d.workforce, link: false }))
    : vendorRows(f).map((v) => ({ id: v.id, name: v.shortName, value: v[key], workforce: v.employees, link: true }))
  const asc = [...source].sort((a, b) => a.value - b.value)
  const matched = th ? asc.filter((r) => (th.op === 'lt' ? r.value < th.value : r.value > th.value)) : asc.slice(0, 10)
  const scope = summarize(f)
  const scopeVal = metric === 'pf' ? scope.pfPct : metric === 'esi' ? scope.esiPct : metric === 'salary' ? scope.salaryPct : scope.attendancePct
  const noun = byDivision ? 'division' : 'vendor'
  const cond = th ? `${th.op === 'lt' ? 'below' : 'above'} ${th.value}%` : 'lowest'
  return {
    intent: 'compliance-threshold',
    supported: true,
    interpretedQuery: `${byDivision ? 'Divisions' : 'Vendors'} with ${label} ${th ? cond : '(lowest 10)'} for ${monthLabel(f.wageMonth)}`,
    summary: matched.length
      ? `${fmtNum(matched.length)} of ${fmtNum(source.length)} ${noun}s ${th ? `have ${label} ${cond}` : `with the lowest ${label} are listed`}, covering ${fmtNum(matched.reduce((a, r) => a + r.workforce, 0))} workers. The lowest is ${matched[0]!.name} at ${fmtPct(matched[0]!.value)} against ${fmtPct(scopeVal)} for the scope.`
      : `No ${noun}s have ${label} ${cond}. Scope-level ${label} is ${fmtPct(scopeVal)}.`,
    kpis: [
      { label: `${byDivision ? 'Divisions' : 'Vendors'} matched`, value: `${fmtNum(matched.length)} / ${fmtNum(source.length)}` },
      { label: `Scope ${label}`, value: fmtPct(scopeVal) },
      { label: 'Workers covered', value: fmtNum(matched.reduce((a, r) => a + r.workforce, 0)) },
    ],
    chart: matched.length > 1 ? { type: 'bar', data: matched.slice(0, 12).map((r) => ({ name: r.name, value: +r.value.toFixed(2) })), xKey: 'name', series: [{ key: 'value', label }], fmt: 'pct' } : undefined,
    table: matched.length
      ? {
          columns: [
            { key: 'name', label: byDivision ? 'Division' : 'Vendor' },
            { key: 'value', label, kind: 'pct' },
            { key: 'workforce', label: 'Workforce', kind: 'num' },
          ],
          rows: matched.slice(0, MAX_ROWS).map((r) => ({ id: r.id, name: r.name, value: r.value, workforce: r.workforce })),
          total: matched.length,
          ...(byDivision ? {} : { linkPrefix: '/vendors/', linkKey: 'id' }),
        }
      : undefined,
    appliedFilters: [...scopeLabels(f), ...(th ? [`${label} ${th.op === 'lt' ? '<' : '>'} ${th.value}%`] : []), `Grouped by: ${noun}`],
    followUps: [
      `Show ${metric === 'esi' ? 'ESI' : metric === 'pf' ? 'PF' : metric} compliance trend for the last six months.`,
      metric === 'pf' ? 'Which vendors have ESI compliance below 96%?' : 'Which vendors have PF compliance below 95%?',
      byDivision ? `Which vendors have ${label} below 95%?` : `Which divisions have ${label} below 95%?`,
    ],
  }
}

function riskVendorsAnswer(f: GlobalFilters): NlqAnswer {
  const rows = vendorRows(f).sort((a, b) => b.riskScore - a.riskScore)
  const high = rows.filter((r) => r.riskLevel === 'High' || r.riskLevel === 'Critical')
  const show = high.length ? high : rows.slice(0, 5)
  return {
    intent: 'risk-vendors',
    supported: true,
    interpretedQuery: 'Vendors ranked by composite risk score (PF, ESI, salary, attendance, exceptions, blocked invoices)',
    summary: rows.length
      ? `${fmtNum(high.length)} of ${fmtNum(rows.length)} vendors are rated High or Critical risk. ${rows[0]!.shortName} has the highest score (${rows[0]!.riskScore}).`
      : 'No vendors in the current scope.',
    kpis: [
      { label: 'High / Critical', value: fmtNum(high.length) },
      { label: 'Critical', value: fmtNum(rows.filter((r) => r.riskLevel === 'Critical').length) },
      { label: 'Vendors in scope', value: fmtNum(rows.length) },
    ],
    chart: show.length > 1 ? { type: 'bar', data: show.slice(0, 12).map((r) => ({ name: r.shortName, score: r.riskScore })), xKey: 'name', series: [{ key: 'score', label: 'Risk score' }], fmt: 'num' } : undefined,
    table: show.length
      ? {
          columns: [
            { key: 'name', label: 'Vendor' },
            { key: 'riskLevel', label: 'Risk', kind: 'risk' },
            { key: 'pf', label: 'PF %', kind: 'pct' },
            { key: 'esi', label: 'ESI %', kind: 'pct' },
            { key: 'salary', label: 'Salary %', kind: 'pct' },
            { key: 'open', label: 'Open exceptions', kind: 'num' },
          ],
          rows: show.slice(0, MAX_ROWS).map((r) => ({ id: r.id, name: r.shortName, riskLevel: r.riskLevel, riskScore: r.riskScore, pf: r.pfPct, esi: r.esiPct, salary: r.salaryPct, open: r.openExceptions })),
          total: show.length,
          linkPrefix: '/vendors/',
          linkKey: 'id',
        }
      : undefined,
    appliedFilters: scopeLabels(f),
    followUps: ['Show amount at risk by vendor.', 'Which vendors have more than 50 unresolved exceptions?', 'Which invoices are blocked and why?'],
  }
}

function workforceAnswer(f: GlobalFilters): NlqAnswer {
  const s = summarize(f)
  const regions = breakdown(f, 'region').sort((a, b) => b.workforce - a.workforce)
  return {
    intent: 'workforce',
    supported: true,
    interpretedQuery: `Deployed outsourced workforce for ${monthLabel(f.wageMonth)} by region`,
    summary: `${fmtNum(s.workforce)} outsourced workers are deployed against ${fmtNum(s.sanctioned)} sanctioned posts (${fmtNum(s.vacant)} vacant). Attendance is ${fmtPct(s.attendancePct)}; PF compliance ${fmtPct(s.pfPct)}, ESI ${fmtPct(s.esiPct)}.`,
    kpis: [
      { label: 'Deployed', value: fmtNum(s.workforce) },
      { label: 'Sanctioned', value: fmtNum(s.sanctioned) },
      { label: 'Vacant', value: fmtNum(s.vacant) },
      { label: 'Attendance', value: fmtPct(s.attendancePct) },
    ],
    chart: regions.length > 1 ? { type: 'bar', data: regions.map((r) => ({ name: r.name, workforce: r.workforce })), xKey: 'name', series: [{ key: 'workforce', label: 'Workforce' }], fmt: 'num' } : undefined,
    appliedFilters: scopeLabels(f),
    followUps: ['Which divisions have the highest attendance exceptions?', 'Which vendors have PF compliance below 95%?', 'Which contracts expire in the next 30 days?'],
  }
}

function contractsExpiringAnswer(f: GlobalFilters, s: string): NlqAnswer {
  const dm = s.match(/(\d+)\s*days?/)
  const days = dm ? Number(dm[1]) : 30
  const rows = contractRows(f)
    .filter((c) => c.daysLeft >= 0 && c.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft)
  const heads = rows.reduce((a, c) => a + c.deployed, 0)
  return {
    intent: 'contracts-expiring',
    supported: true,
    interpretedQuery: `Contracts expiring within ${days} days of ${new Date(Date.UTC(2026, 9, 22)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
    summary: rows.length ? `${fmtNum(rows.length)} contracts covering ${fmtNum(heads)} deployed workers expire within ${days} days. The first is ${rows[0]!.number} (${rows[0]!.vendorName}) in ${rows[0]!.daysLeft} days.` : `No contracts expire within ${days} days.`,
    kpis: [
      { label: 'Contracts', value: fmtNum(rows.length) },
      { label: 'Workers covered', value: fmtNum(heads) },
      { label: 'With PF exceptions', value: fmtNum(rows.filter((c) => c.pfExceptions > 0).length) },
    ],
    table: rows.length
      ? {
          columns: [
            { key: 'number', label: 'Contract' },
            { key: 'vendor', label: 'Vendor' },
            { key: 'daysLeft', label: 'Days left', kind: 'num' },
            { key: 'deployed', label: 'Deployed', kind: 'num' },
            { key: 'status', label: 'Status', kind: 'status' },
          ],
          rows: rows.slice(0, MAX_ROWS).map((c) => ({ id: c.id, number: c.number, vendor: c.vendorName, daysLeft: c.daysLeft, deployed: c.deployed, status: c.expiryStatus })),
          total: rows.length,
          linkPrefix: '/contracts?contract=',
          linkKey: 'id',
        }
      : undefined,
    appliedFilters: [...scopeLabels(f).slice(1), `Expiry ≤ ${days} days`],
    followUps: ['Which are the highest-risk vendors?', 'Show amount at risk by vendor.', 'Which invoices are blocked and why?'],
  }
}

function fallback(f: GlobalFilters, q: string): NlqAnswer {
  return {
    intent: 'fallback',
    supported: false,
    interpretedQuery: q.trim() ? `Could not map "${q.trim()}" to a supported analysis` : 'Empty question',
    summary:
      'This prototype answers questions about a fixed set of topics: PF / ESI / salary / attendance compliance by vendor or division (with thresholds), compliance trends, delayed salaries, attendance exceptions, unresolved exceptions by vendor, blocked invoices, amount at risk, high-risk vendors, workforce and expiring contracts. Try rephrasing with one of these keywords, or pick a suggestion below.',
    kpis: [],
    appliedFilters: scopeLabels(f),
    followUps: EXAMPLE_PROMPTS.slice(0, 4),
  }
}

/** Map a natural-language question onto an analytical function over the scoped data. */
export function answerQuestion(question: string, f: GlobalFilters): NlqAnswer {
  const s = normalise(question)
  if (!s) return fallback(f, question)
  const metrics = metricsIn(s)
  if (has(s, /trend|over time|month[- ]on[- ]month|history|historical|(last|past|previous) \d+ months/) && (metrics.length || has(s, /compliance/))) return trendAnswer(f, s)
  if (has(s, /salar|wage pay|pay(ment)?s?\b/) && has(s, /delay|late|overdue|not (been )?paid|unpaid/)) return salaryDelayAnswer(f, s)
  if (has(s, /attendance/) && has(s, /exception|anomal|issue|correction|manual|modif|missing/)) return attendanceExceptionAnswer(f, s)
  if (has(s, /invoice|bill/)) return blockedInvoicesAnswer(f, s)
  if (has(s, /exception|issue|case/) && has(s, /vendor|unresolved|open|pending/)) return unresolvedExceptionsAnswer(f, s)
  if (has(s, /amount at risk|exposure|financial risk|money at risk|at risk/)) return amountAtRiskAnswer(f)
  if (has(s, /contract/) && has(s, /expir|renew|end/)) return contractsExpiringAnswer(f, s)
  if (metrics.length && (has(s, /complian|%|percent|below|under|above|lowest|worst|poor/) || threshold(s))) return complianceThresholdAnswer(f, s, metrics[0]!)
  if (has(s, /risk|risky|worst|watch ?list|problem/) && has(s, /vendor|agenc|contractor|supplier/)) return riskVendorsAnswer(f)
  if (has(s, /workforce|headcount|head count|how many (employees|workers)|deployed|vacan|sanctioned/)) return workforceAnswer(f)
  return fallback(f, question)
}
