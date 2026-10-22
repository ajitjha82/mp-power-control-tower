import type {
  AttendanceException,
  ComplianceException,
  ExceptionCategory,
  GateCheck,
  GlobalFilters,
  Invoice,
  PageRequest,
  RiskLevel,
  Severity,
} from '@/types'
import { pct } from '@/lib/utils'
import { CURRENT_MONTH, TODAY } from '@/data/config'
import { CONTRACTS, VENDORS, contractById, contractsByVendor, vendorById } from '@/data/vendors'
import { divisionById, locationById, regionById } from '@/data/org'
import { IDX, N, R, empId, employeeName, getEmployee, idxFromEmpId } from '@/data/roster'
import { getSnapshot } from '@/data/snapshot'
import { esiRecord, pfRecord, salaryPayment, wageRecord } from '@/data/wages'
import { attendanceFor, getAttendanceExceptions, shiftOf } from '@/data/attendance'
import { contractStats, getInvoices, invoiceWorkflow } from '@/data/invoices'
import { RESOLVED_THIS_MONTH, exceptionTimeline, getExceptions } from '@/data/exceptions'
import { matchesSearch, paginate, simulate } from './api'
import { breakdown, summarize } from './metrics'
import { scopeIndices } from './scope'

// ---------- Scope helpers ----------
const setCache = new Map<string, Set<number>>()
function scopeSet(f: GlobalFilters) {
  const key = JSON.stringify({ ...f, compliance: [] })
  let s = setCache.get(key)
  if (!s) {
    s = new Set(scopeIndices({ ...f, compliance: [] }))
    if (setCache.size > 20) setCache.clear()
    setCache.set(key, s)
  }
  return s
}
const isUnscoped = (f: GlobalFilters) =>
  !f.regions.length && !f.circles.length && !f.divisions.length && !f.locations.length && !f.vendors.length && !f.contracts.length && !f.categories.length

/** Contract-level records (invoices, contracts) are scoped by vendor/contract/region. */
function contractInScope(f: GlobalFilters, contractId: string) {
  const c = contractById.get(contractId)!
  if (f.vendors.length && !f.vendors.includes(c.vendorId)) return false
  if (f.contracts.length && !f.contracts.includes(c.id)) return false
  if (f.regions.length && !f.regions.includes(c.regionId)) return false
  if (f.divisions.length || f.locations.length || f.circles.length) {
    // Contract is in scope if any of its deployed personnel are.
    const s = scopeSet(f)
    const ci = IDX.contractIndex.get(c.id)!
    for (const i of s) if (R.contract[i] === ci) return true
    return false
  }
  return true
}

// ---------- Exceptions ----------
export interface ExceptionParams extends PageRequest {
  category?: ExceptionCategory | null
  severity?: Severity | null
  status?: string | null
  vendor?: string | null
  division?: string | null
  owner?: string | null
  ageing?: '0-7' | '8-15' | '16-30' | '30+' | null
  overdue?: boolean
  employeeId?: string | null
  invoiceId?: string | null
}

export function scopedExceptions(f: GlobalFilters): ComplianceException[] {
  const all = getExceptions()
  if (isUnscoped(f)) return all
  const s = scopeSet(f)
  return all.filter((e) => (e.employeeId ? s.has(idxFromEmpId(e.employeeId)) : contractInScope(f, e.contractId!)))
}

export function exceptionKpis(f: GlobalFilters) {
  const ex = scopedExceptions(f)
  const resolved = Object.values(RESOLVED_THIS_MONTH).reduce((a, b) => a + b, 0)
  const scale = isUnscoped(f) ? 1 : ex.length / getExceptions().length
  const byCategory = new Map<ExceptionCategory, number>()
  for (const e of ex) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1)
  return {
    open: ex.length,
    critical: ex.filter((e) => e.severity === 'Critical').length,
    high: ex.filter((e) => e.severity === 'High').length,
    medium: ex.filter((e) => e.severity === 'Medium').length,
    low: ex.filter((e) => e.severity === 'Low').length,
    overdue: ex.filter((e) => e.ageDays > e.slaDays).length,
    resolvedThisMonth: Math.round(resolved * scale),
    amountAtRisk: ex.reduce((a, e) => a + (e.category === 'Invoice' ? 0 : e.amountAtRisk), 0),
    byCategory: Array.from(byCategory, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    ageing: [
      { bucket: '0–7 d', count: ex.filter((e) => e.ageDays <= 7).length },
      { bucket: '8–15 d', count: ex.filter((e) => e.ageDays > 7 && e.ageDays <= 15).length },
      { bucket: '16–30 d', count: ex.filter((e) => e.ageDays > 15 && e.ageDays <= 30).length },
      { bucket: '30+ d', count: ex.filter((e) => e.ageDays > 30).length },
    ],
  }
}

export function filterExceptions(f: GlobalFilters, p: ExceptionParams) {
  return scopedExceptions(f).filter((e) => {
    if (p.category && e.category !== p.category) return false
    if (p.severity && e.severity !== p.severity) return false
    if (p.status && e.status !== p.status) return false
    if (p.vendor && e.vendorId !== p.vendor) return false
    if (p.division && e.divisionId !== p.division) return false
    if (p.owner && e.owner !== p.owner) return false
    if (p.employeeId && e.employeeId !== p.employeeId) return false
    if (p.invoiceId && e.invoiceId !== p.invoiceId) return false
    if (p.overdue && e.ageDays <= e.slaDays) return false
    if (p.ageing) {
      const a = e.ageDays
      if (p.ageing === '0-7' && a > 7) return false
      if (p.ageing === '8-15' && (a <= 7 || a > 15)) return false
      if (p.ageing === '16-30' && (a <= 15 || a > 30)) return false
      if (p.ageing === '30+' && a <= 30) return false
    }
    if (p.search && !matchesSearch(p.search, e.id, e.employeeId, e.employeeId ? employeeName(idxFromEmpId(e.employeeId)) : null, e.type, vendorById.get(e.vendorId)?.shortName)) return false
    return true
  })
}

const SEV_RANK: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 }
export const listExceptions = (f: GlobalFilters, p: ExceptionParams) =>
  simulate(() => paginate(filterExceptions(f, p), p, { severity: (e) => SEV_RANK[e.severity], sla: (e) => e.ageDays - e.slaDays }))

export function exceptionDetail(id: string) {
  const e = getExceptions().find((x) => x.id === id)
  if (!e) return null
  const i = e.employeeId ? idxFromEmpId(e.employeeId) : -1
  const s = getSnapshot(CURRENT_MONTH)
  return {
    exception: e,
    employee: i >= 0 ? getEmployee(i) : null,
    vendor: vendorById.get(e.vendorId)!,
    contract: e.contractId ? contractById.get(e.contractId)! : null,
    pf: i >= 0 && e.category === 'PF' ? pfRecord(s, i) : null,
    esi: i >= 0 && e.category === 'ESI' ? esiRecord(s, i) : null,
    salary: i >= 0 && e.category === 'Salary' ? salaryPayment(s, i) : null,
    wage: i >= 0 ? wageRecord(s, i) : null,
    timeline: exceptionTimeline(e),
    evidence: evidenceFor(e),
    rootCause: rootCause(e),
    relatedInvoice: e.contractId ? getInvoices().find((v) => v.contractId === e.contractId && v.billingMonth === CURRENT_MONTH) ?? null : null,
  }
}
export const getExceptionDetail = (id: string) => simulate(() => exceptionDetail(id))

function evidenceFor(e: ComplianceException) {
  const base = [
    { name: `Reconciliation result — ${e.id}.json`, kind: 'System', status: 'Verified' },
  ]
  if (e.category === 'PF')
    return [
      { name: 'ECR file (vendor upload, Sep 2026)', kind: 'Vendor', status: 'Received' },
      { name: 'Challan / TRRN (masked)', kind: 'Vendor', status: e.type === 'Evidence Pending' ? 'Pending verification' : 'Received' },
      ...(e.status === 'Vendor Responded' || e.status === 'Under Review' ? [{ name: 'Supplementary ECR (vendor response)', kind: 'Vendor', status: 'Under review' }] : []),
      ...base,
    ]
  if (e.category === 'ESI') return [{ name: 'ESI contribution statement (vendor upload)', kind: 'Vendor', status: 'Received' }, ...base]
  if (e.category === 'Salary') return [{ name: 'Bank payment file (masked)', kind: 'Vendor', status: e.type === 'Salary Delayed' ? 'Missing' : 'Received' }, ...base]
  return base
}

function rootCause(e: ComplianceException) {
  const map: Record<string, string> = {
    'Contribution Not Found': 'Employee present in wage register with payable days but absent from the vendor ECR — typically a missed ECR row or a contribution filed under a different establishment code.',
    'Short Contribution': 'Contribution computed on a lower base than the configured PF wage or partial-month posting.',
    'Wage Mismatch': 'Wage reported to the statutory body differs from the wage computed from approved payable days and contract rates.',
    'UAN Mismatch': 'UAN in vendor filing does not match the verified employee master.',
    'ESIC Number Mismatch': 'ESIC IP number in vendor filing does not match the verified employee master.',
    'Employee Missing': 'Employee omitted from the statutory return although deployed and paid.',
    'Duplicate Identifier': 'Same statutory identifier mapped to more than one workforce ID.',
    'Separated Employee Contribution': 'Contribution filed for a period after the recorded separation date.',
    'Evidence Pending': 'Challan uploaded, but employee-level evidence has not been verified. A challan alone is not treated as employee-level proof.',
  }
  return map[e.type] ?? 'Rule-based validation flagged this record for review. Root cause to be confirmed by the owner.'
}

// ---------- Invoices ----------
export interface InvoiceParams extends PageRequest {
  status?: string | null
  vendor?: string | null
  month?: string | null
  stage?: string | null
}
export function scopedInvoices(f: GlobalFilters): Invoice[] {
  return getInvoices().filter((i) => contractInScope(f, i.contractId))
}
export const listInvoices = (f: GlobalFilters, p: InvoiceParams) =>
  simulate(() =>
    paginate(
      scopedInvoices(f).filter(
        (i) =>
          (!p.status || i.status === p.status) &&
          (!p.vendor || i.vendorId === p.vendor) &&
          (!p.month || i.billingMonth === p.month) &&
          (!p.stage || i.stage === p.stage) &&
          matchesSearch(p.search, i.number, vendorById.get(i.vendorId)!.shortName, contractById.get(i.contractId)!.number),
      ),
      p,
    ),
  )

export function invoiceKpis(f: GlobalFilters) {
  const inv = scopedInvoices(f)
  const cur = inv.filter((i) => i.billingMonth === CURRENT_MONTH)
  return {
    submitted: cur.length,
    underScrutiny: inv.filter((i) => i.status === 'Under Scrutiny' || i.status === 'Submitted').length,
    blocked: inv.filter((i) => i.status === 'Blocked').length,
    approved: inv.filter((i) => i.status === 'Approved').length,
    paymentPending: inv.filter((i) => i.status === 'Payment Pending').length,
    paid: inv.filter((i) => i.status === 'Paid').length,
    pending: inv.filter((i) => i.status !== 'Paid').length,
    totalValue: cur.reduce((a, i) => a + i.amount, 0),
    blockedValue: inv.filter((i) => i.status === 'Blocked').reduce((a, i) => a + i.amount, 0),
  }
}

export function invoiceGate(inv: Invoice): { checks: GateCheck[]; result: 'Blocked' | 'Passed' | 'Provisional'; reason: string | null; evaluated: boolean } {
  if (inv.billingMonth !== CURRENT_MONTH) {
    return {
      checks: GATE_LABELS.map(([key, label]) => ({ key, label, result: 'pass', detail: 'Verified at the time of approval.', affectedEmployees: 0 })),
      result: 'Passed',
      reason: null,
      evaluated: true,
    }
  }
  const st = contractStats().get(inv.contractId)!
  const ex = getExceptions().filter((e) => e.contractId === inv.contractId)
  const cnt = (c: ExceptionCategory) => new Set(ex.filter((e) => e.category === c).map((e) => e.employeeId)).size
  const evaluated = ['HR / Contract Cell', 'Finance', 'Competent Authority', 'Payment'].includes(inv.stage)
  const attendancePending = inv.stage === 'Site Officer'
  const master = cnt('Employee Master')
  const wage = cnt('Wage')
  const docs = cnt('Document')
  const checks: GateCheck[] = [
    { key: 'attendance', label: 'Attendance Approved', result: attendancePending ? 'pending' : 'pass', detail: attendancePending ? 'Site officer approval of the attendance register is pending.' : `Payable days approved for ${st.employees.toLocaleString('en-IN')} employees.`, affectedEmployees: 0 },
    { key: 'master', label: 'Employee Master Valid', result: master ? 'warn' : 'pass', detail: master ? `${master} master-data exceptions (non-blocking, tracked).` : 'All billed employees verified in master.', affectedEmployees: master },
    { key: 'wage', label: 'Wage Validated', result: wage ? 'warn' : 'pass', detail: wage ? `${wage} wage exceptions under review (non-blocking).` : 'Wages match contract rates and payable days.', affectedEmployees: wage },
    { key: 'salary', label: 'Salary Condition', result: st.salaryIssues ? 'fail' : 'pass', detail: st.salaryIssues ? `Salary not fully paid/verified for ${st.salaryIssues} employees.` : 'Employee salary credit verified for all billed employees.', affectedEmployees: st.salaryIssues },
    { key: 'pf', label: 'PF Compliance', result: st.pfEx ? 'fail' : 'pass', detail: st.pfEx ? `PF exceptions unresolved for ${st.pfEx} employees.` : 'Employee-level PF reconciled.', affectedEmployees: st.pfEx },
    { key: 'esi', label: 'ESI Compliance', result: st.esiEx ? 'fail' : 'pass', detail: st.esiEx ? `ESI exceptions unresolved for ${st.esiEx} employees.` : 'Employee-level ESI reconciled.', affectedEmployees: st.esiEx },
    { key: 'documents', label: 'Documents Complete', result: docs ? 'warn' : 'pass', detail: docs ? `${docs} document exceptions (non-blocking).` : 'Invoice, registers and statutory returns attached.', affectedEmployees: docs },
  ]
  const failing = checks.filter((c) => c.result === 'fail')
  const reason = failing.length ? failing.map((c) => c.detail.replace(/\.$/, '')).join('; ') : null
  return { checks, result: failing.length ? (evaluated ? 'Blocked' : 'Provisional') : evaluated ? 'Passed' : 'Provisional', reason, evaluated }
}
const GATE_LABELS: Array<[GateCheck['key'], string]> = [
  ['attendance', 'Attendance Approved'],
  ['master', 'Employee Master Valid'],
  ['wage', 'Wage Validated'],
  ['salary', 'Salary Condition'],
  ['pf', 'PF Compliance'],
  ['esi', 'ESI Compliance'],
  ['documents', 'Documents Complete'],
]

export function invoiceDetail(id: string) {
  const inv = getInvoices().find((i) => i.id === id)
  if (!inv) return null
  return {
    invoice: inv,
    vendor: vendorById.get(inv.vendorId)!,
    contract: contractById.get(inv.contractId)!,
    gate: invoiceGate(inv),
    workflow: invoiceWorkflow(inv),
    exception: getExceptions().find((e) => e.invoiceId === inv.id) ?? null,
  }
}
export const getInvoiceDetail = (id: string) => simulate(() => invoiceDetail(id))

// ---------- Vendors ----------
export interface VendorRow {
  id: string
  name: string
  shortName: string
  contracts: number
  employees: number
  attendancePct: number
  pfPct: number
  esiPct: number
  salaryPct: number
  openExceptions: number
  invoiceValue: number
  amountAtRisk: number
  blockedInvoices: number
  riskScore: number
  riskLevel: RiskLevel
}

export const riskLevel = (score: number): RiskLevel => (score >= 70 ? 'Critical' : score >= 45 ? 'High' : score >= 25 ? 'Medium' : 'Low')

export function vendorRows(f: GlobalFilters): VendorRow[] {
  const groups = breakdown(f, 'vendor')
  const ex = scopedExceptions(f)
  const inv = scopedInvoices(f)
  return groups.map((g) => {
    const vex = ex.filter((e) => e.vendorId === g.id)
    const vinv = inv.filter((i) => i.vendorId === g.id)
    const blocked = vinv.filter((i) => i.status === 'Blocked').length
    const exPer100 = (vex.length / Math.max(1, g.workforce)) * 100
    const score = Math.min(
      100,
      Math.round((100 - g.pfPct) * 3 + (100 - g.esiPct) * 2.5 + (100 - g.salaryPct) * 3 + (100 - g.attendancePct) * 0.8 + exPer100 * 0.6 + blocked * 3),
    )
    const v = vendorById.get(g.id)!
    return {
      id: g.id,
      name: v.name,
      shortName: v.shortName,
      contracts: contractsByVendor.get(g.id)!.length,
      employees: g.workforce,
      attendancePct: g.attendancePct,
      pfPct: g.pfPct,
      esiPct: g.esiPct,
      salaryPct: g.salaryPct,
      openExceptions: vex.length,
      invoiceValue: vinv.filter((i) => i.billingMonth === CURRENT_MONTH).reduce((a, i) => a + i.amount, 0),
      amountAtRisk: vex.filter((e) => e.category !== 'Invoice').reduce((a, e) => a + e.amountAtRisk, 0),
      blockedInvoices: blocked,
      riskScore: score,
      riskLevel: riskLevel(score),
    }
  })
}
export const listVendors = (f: GlobalFilters) => simulate(() => vendorRows(f))

export function vendor360(id: string, f: GlobalFilters) {
  const v = vendorById.get(id)
  if (!v) return null
  const vf: GlobalFilters = { ...f, vendors: [id], contracts: [], compliance: [] }
  const row = vendorRows({ ...f, vendors: [id], contracts: [], compliance: [] })[0]
  const sum = summarize(vf)
  const contracts = contractsByVendor.get(id)!.map((c) => ({ ...c, deployed: contractStats().get(c.id)!.employees, region: regionById.get(c.regionId)!.name, ...contractStats().get(c.id)! }))
  const ex = scopedExceptions(vf)
  return {
    vendor: v,
    row: row ?? null,
    summary: sum,
    contracts,
    invoices: getInvoices().filter((i) => i.vendorId === id),
    exceptions: ex,
    divisions: breakdown(vf, 'division').sort((a, b) => b.workforce - a.workforce).slice(0, 12),
  }
}
export const getVendor360 = (id: string, f: GlobalFilters) => simulate(() => vendor360(id, f))

// ---------- Contracts ----------
export function contractRows(f: GlobalFilters) {
  const st = contractStats()
  return CONTRACTS.filter((c) => contractInScope(f, c.id)).map((c) => {
    const s = st.get(c.id)!
    const daysLeft = Math.round((Date.parse(c.endDate) - Date.parse(TODAY)) / 86400000)
    return {
      ...c,
      vendorName: vendorById.get(c.vendorId)!.shortName,
      regionName: regionById.get(c.regionId)!.name,
      deployed: s.employees,
      vacancy: c.sanctionedManpower - s.employees,
      pfExceptions: s.pfEx,
      esiExceptions: s.esiEx,
      salaryIssues: s.salaryIssues,
      daysLeft,
      expiryStatus: daysLeft <= 30 ? ('Expiring' as const) : daysLeft <= 90 ? ('Renewal Due' as const) : ('Active' as const),
    }
  })
}
export const listContracts = (f: GlobalFilters) => simulate(() => contractRows(f))

// ---------- Attendance ----------
export interface AttendanceParams extends PageRequest {
  type?: string | null
  status?: string | null
  severity?: string | null
}
export function scopedAttendanceExceptions(f: GlobalFilters): AttendanceException[] {
  const all = getAttendanceExceptions()
  if (isUnscoped(f)) return all
  const s = scopeSet(f)
  return all.filter((a) => s.has(idxFromEmpId(a.employeeId)))
}
export function attendanceKpis(f: GlobalFilters) {
  const sum = summarize({ ...f, wageMonth: CURRENT_MONTH })
  const ax = scopedAttendanceExceptions(f)
  const by = (t: string) => ax.filter((a) => a.exception === t).length
  return {
    present: sum.present,
    absent: sum.absent,
    attendancePct: sum.attendancePct,
    workforce: sum.workforce,
    missingAttendance: by('Missing attendance'),
    missingCheckout: by('Missing checkout'),
    manualCorrections: by('Manual modification'),
    pendingApproval: ax.filter((a) => a.status === 'Pending Approval').length,
    geoExceptions: by('Wrong location'),
    byType: Array.from(new Set(ax.map((a) => a.exception))).map((t) => ({ type: t, count: by(t) })).sort((a, b) => b.count - a.count),
  }
}
export const listAttendanceExceptions = (f: GlobalFilters, p: AttendanceParams) =>
  simulate(() =>
    paginate(
      scopedAttendanceExceptions(f).filter(
        (a) =>
          (!p.type || a.exception === p.type) &&
          (!p.status || a.status === p.status) &&
          (!p.severity || a.severity === p.severity) &&
          matchesSearch(p.search, a.employeeId, a.employeeName, vendorById.get(a.vendorId)?.shortName),
      ),
      p,
      { severity: (a) => SEV_RANK[a.severity] },
    ),
  )

// ---------- Employee 360 ----------
export function employee360(id: string, month: string = CURRENT_MONTH) {
  const i = idxFromEmpId(id)
  if (i < 0) return null
  const s = getSnapshot(month)
  if (!s.onRoll[i]) return { notOnRoll: true as const, employee: getEmployee(i) }
  const emp = getEmployee(i)
  const contract = contractById.get(emp.contractId)!
  const vendor = vendorById.get(emp.vendorId)!
  const location = locationById.get(emp.locationId)!
  const division = divisionById.get(emp.divisionId)!
  const wage = wageRecord(s, i)
  const pf = pfRecord(s, i)
  const esi = esiRecord(s, i)
  const salary = salaryPayment(s, i)
  const attendance = attendanceFor(s, i)
  const exceptions = getExceptions().filter((e) => e.employeeId === emp.id)
  const attEx = getAttendanceExceptions().filter((a) => a.employeeId === emp.id)
  const invoice = month === CURRENT_MONTH ? getInvoices().find((v) => v.contractId === contract.id && v.billingMonth === CURRENT_MONTH) ?? null : null
  type StageState = 'ok' | 'exception' | 'na' | 'pending'
  const lifecycle: Array<{ key: string; label: string; state: StageState; detail: string }> = [
    { key: 'onboarded', label: 'Onboarded', state: 'ok', detail: `Joined ${emp.joinDate}` },
    { key: 'verified', label: 'Verified', state: exceptions.some((e) => e.category === 'Employee Master' || e.category === 'Document') ? 'exception' : 'ok', detail: 'Identity, bank and statutory IDs' },
    { key: 'deployed', label: 'Deployed', state: exceptions.some((e) => e.category === 'Deployment') ? 'exception' : 'ok', detail: location.name },
    { key: 'attendance', label: 'Attendance', state: attEx.some((a) => a.status === 'Open') ? 'exception' : 'ok', detail: `${attendance.present} days present` },
    { key: 'wage', label: 'Wage', state: exceptions.some((e) => e.category === 'Wage') ? 'exception' : 'ok', detail: `${wage.payableDays} payable days` },
    { key: 'salary', label: 'Salary', state: salary.status === 'Paid' ? 'ok' : salary.status === 'Pending' ? 'pending' : 'exception', detail: salary.status },
    { key: 'pf', label: 'PF', state: !pf.applicable ? 'na' : pf.exception ? 'exception' : 'ok', detail: pf.applicable ? pf.status : 'Not applicable' },
    { key: 'esi', label: 'ESI', state: !esi.applicable ? 'na' : esi.exception ? 'exception' : 'ok', detail: esi.applicable ? esi.status : 'Not applicable' },
  ]
  return {
    notOnRoll: false as const,
    employee: emp,
    contract,
    vendor,
    location,
    division,
    region: regionById.get(emp.regionId)!,
    shift: shiftOf(i),
    wage,
    pf,
    esi,
    salary,
    attendance,
    exceptions,
    attendanceExceptions: attEx,
    invoice,
    invoiceGate: invoice ? invoiceGate(invoice) : null,
    lifecycle,
    pfAge: s.pfAge[i]!,
  }
}
export const getEmployee360 = (id: string, month?: string) => simulate(() => employee360(id, month))

// ---------- Global search ----------
export interface SearchHit {
  kind: 'Employee' | 'Vendor' | 'Contract' | 'Invoice'
  id: string
  title: string
  subtitle: string
  href: string
  badge?: string
}
export function searchAll(q: string, limit = 6): SearchHit[] {
  const s = q.trim().toLowerCase()
  if (s.length < 2) return []
  const hits: SearchHit[] = []
  const snap = getSnapshot(CURRENT_MONTH)
  const empHit = (i: number): SearchHit => {
    const c = CONTRACTS[R.contract[i]!]!
    const pf = snap.pfEx[i] ? 'PF: Exception' : R.pfApplicable[i] ? 'PF: Compliant' : 'PF: N/A'
    return {
      kind: 'Employee',
      id: empId(i),
      title: `${employeeName(i)} · ${empId(i)}`,
      subtitle: `Vendor: ${vendorById.get(c.vendorId)!.shortName} · Division: ${divisionById.get(locationById.get(getEmployee(i).locationId)!.divisionId)!.name}`,
      badge: pf,
      href: `/employees/${empId(i)}`,
    }
  }
  const direct = idxFromEmpId(q.toUpperCase())
  if (direct >= 0) hits.push(empHit(direct))
  else if (/^\d{3,5}$/.test(s)) {
    const n = Number(s)
    for (const cand of [n - 10000, n]) if (cand >= 0 && cand < N && hits.length < limit) hits.push(empHit(cand))
  }
  if (!/^emp-\d+$/.test(s)) {
    for (let i = 0; i < N && hits.filter((h) => h.kind === 'Employee').length < limit; i++) {
      if (employeeName(i).toLowerCase().includes(s)) hits.push(empHit(i))
    }
  }
  for (const v of VENDORS) if (v.name.toLowerCase().includes(s) || v.id.toLowerCase().includes(s)) hits.push({ kind: 'Vendor', id: v.id, title: v.name, subtitle: `${v.id} · ${contractsByVendor.get(v.id)!.length} contracts`, href: `/vendors/${v.id}` })
  for (const c of CONTRACTS) if (c.number.toLowerCase().includes(s) || c.id.toLowerCase().includes(s)) hits.push({ kind: 'Contract', id: c.id, title: c.number, subtitle: `${vendorById.get(c.vendorId)!.shortName} · ${c.title}`, href: `/contracts?contract=${c.id}` })
  for (const inv of getInvoices()) if (inv.number.toLowerCase().includes(s)) hits.push({ kind: 'Invoice', id: inv.id, title: inv.number, subtitle: `${vendorById.get(inv.vendorId)!.shortName} · ${inv.billingMonth} · ${inv.status}`, href: `/invoices/${inv.id}`, badge: inv.status })
  return hits.slice(0, 24)
}

// ---------- Overview ----------
export function overview(f: GlobalFilters) {
  const sum = summarize(f)
  const exk = exceptionKpis(f)
  const invk = invoiceKpis(f)
  const contracts = contractRows(f)
  const expiring = contracts.filter((c) => c.daysLeft <= 30).length
  const vendors = vendorRows(f).sort((a, b) => b.riskScore - a.riskScore)
  return {
    summary: sum,
    exceptions: exk,
    invoices: invk,
    expiringContracts: expiring,
    topVendors: vendors.slice(0, 6),
    vendorCount: vendors.length,
    highRiskVendors: vendors.filter((v) => v.riskLevel === 'High' || v.riskLevel === 'Critical').length,
    blockedInvoices: scopedInvoices(f).filter((i) => i.status === 'Blocked').sort((a, b) => b.amount - a.amount).slice(0, 5),
  }
}
export const getOverview = (f: GlobalFilters) => simulate(() => overview(f))

export const pctOf = pct
