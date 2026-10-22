import type { ComplianceException, ExceptionCategory, ExceptionStatus, Severity, TimelineEvent } from '@/types'
import { hash01, mulberry32, weightedSample } from '@/lib/rng'
import { CURRENT_MONTH } from './config'
import { CONTRACTS, HERO_CONTRACT_ID, VENDORS, contractById, vendorById } from './vendors'
import { LOCATIONS, divisionById } from './org'
import { HERO_IDX, N, R, empId, employeeName, idxFromEmpId } from './roster'
import { ESI_TYPES, PF_TYPES, WORKFLOW, getSnapshot } from './snapshot'
import { esiRecord, pfAtRisk, pfRecord, salaryPayment } from './wages'
import { getAttendanceExceptions } from './attendance'
import { contractStats, getInvoices } from './invoices'

export const SLA_DAYS: Record<ExceptionCategory, number> = {
  Attendance: 3,
  Wage: 7,
  PF: 15,
  ESI: 15,
  Salary: 7,
  Contract: 30,
  Invoice: 5,
  'Employee Master': 10,
  Deployment: 7,
  Document: 15,
}

const OWNERS: Record<ExceptionCategory, Array<[string, string]>> = {
  PF: [['N. Bhargava', 'Compliance Officer'], ['S. Qureshi', 'Compliance Officer'], ['T. Awasthi', 'Compliance Officer']],
  ESI: [['K. Dwivedi', 'Compliance Officer'], ['S. Qureshi', 'Compliance Officer']],
  Salary: [['P. Shrivastava', 'HR / Contract Cell'], ['V. Chaturvedi', 'HR']],
  Attendance: [['S. K. Malviya', 'Site Officer'], ['R. Pathak', 'Site Officer'], ['J. Baghel', 'Site Officer']],
  Wage: [['V. Chaturvedi', 'HR']],
  Contract: [['P. Shrivastava', 'HR / Contract Cell']],
  Invoice: [['M. Agrawal', 'Finance']],
  'Employee Master': [['V. Chaturvedi', 'HR'], ['A. Kulkarni', 'HR']],
  Deployment: [['A. R. Khan', 'Division Officer']],
  Document: [['A. Kulkarni', 'HR']],
}

const DATE0 = Date.UTC(2026, 9, 22)
const daysAgo = (n: number) => new Date(DATE0 - n * 86400000).toISOString().slice(0, 10)

function owner(cat: ExceptionCategory, seed: number) {
  const list = OWNERS[cat]
  return list[Math.floor(hash01(1900, seed) * list.length)]!
}

function sevFor(cat: ExceptionCategory, amount: number, age: number, status: ExceptionStatus, base?: Severity | null): Severity {
  if (status === 'Escalated' || (age > SLA_DAYS[cat] * 1.5 && amount > 2500)) return 'Critical'
  if (base) return base
  if (amount > 5000) return 'High'
  return amount > 1000 ? 'Medium' : 'Low'
}

let cache: ComplianceException[] | null = null

export function getExceptions(): ComplianceException[] {
  if (cache) return cache
  const s = getSnapshot(CURRENT_MONTH)
  const out: ComplianceException[] = []
  const locOf = (i: number) => LOCATIONS[R.location[i]!]!
  const base = (i: number) => ({ employeeId: empId(i), vendorId: VENDORS[R.vendor[i]!]!.id, contractId: CONTRACTS[R.contract[i]!]!.id, divisionId: locOf(i).divisionId, invoiceId: null })

  for (let i = 0; i < N; i++) {
    if (!s.onRoll[i]) continue
    if (s.pfEx[i]) {
      const rec = pfRecord(s, i)
      const amount = pfAtRisk(rec.expectedEmployee + rec.expectedEmployer, rec.difference, s.pfEx[i]!)
      const status = WORKFLOW[s.pfWf[i]!]!
      out.push({
        id: `EXC-PF-${10000 + i}`,
        category: 'PF',
        type: PF_TYPES[s.pfEx[i]! - 1]!,
        ...base(i),
        description: pfDescription(s.pfEx[i]!, rec.expectedEmployee + rec.expectedEmployer, rec.difference),
        amountAtRisk: amount,
        severity: rec.severity ?? 'Medium',
        owner: owner('PF', i)[0],
        ownerRole: owner('PF', i)[1],
        createdAt: daysAgo(s.pfAge[i]!),
        ageDays: s.pfAge[i]!,
        slaDays: SLA_DAYS.PF,
        status,
      })
    }
    if (s.esiEx[i]) {
      const rec = esiRecord(s, i)
      const expected = rec.expectedEmployee + rec.expectedEmployer
      const t = s.esiEx[i]!
      out.push({
        id: `EXC-ESI-${10000 + i}`,
        category: 'ESI',
        type: ESI_TYPES[t - 1]!,
        ...base(i),
        description: `ESI ${ESI_TYPES[t - 1]!.toLowerCase()} for ${CURRENT_MONTH}: expected ₹${expected}, reported ₹${expected + rec.difference}.`,
        amountAtRisk: t === 2 || t === 3 ? Math.abs(rec.difference) : expected,
        severity: rec.severity ?? 'Medium',
        owner: owner('ESI', i)[0],
        ownerRole: owner('ESI', i)[1],
        createdAt: daysAgo(s.esiAge[i]!),
        ageDays: s.esiAge[i]!,
        slaDays: SLA_DAYS.ESI,
        status: WORKFLOW[s.esiWf[i]!]!,
      })
    }
    if (s.salary[i]! >= 2) {
      const p = salaryPayment(s, i)
      const age = s.salAge[i]!
      const status = WORKFLOW[Math.floor(hash01(1910, i) * 5)]!
      const amount = Math.abs(p.difference)
      out.push({
        id: `EXC-SAL-${10000 + i}`,
        category: 'Salary',
        type: p.status === 'Delayed' ? 'Salary Delayed' : p.status === 'Partial' ? 'Partial Payment' : 'Amount Mismatch',
        ...base(i),
        description:
          p.status === 'Delayed'
            ? `Salary for ${CURRENT_MONTH} ${p.reportedPaid ? `paid ${p.delayDays} days after due date` : `not paid; ${p.delayDays} days past due date`}.`
            : p.status === 'Partial'
              ? `Only ₹${p.reportedPaid} of ₹${p.netPayable} net payable credited.`
              : `Reported credit ₹${p.reportedPaid} differs from computed net ₹${p.netPayable}.`,
        amountAtRisk: amount,
        severity: sevFor('Salary', amount, age, status, p.status === 'Delayed' && !p.reportedPaid ? 'High' : null),
        owner: owner('Salary', i)[0],
        ownerRole: owner('Salary', i)[1],
        createdAt: daysAgo(age),
        ageDays: age,
        slaDays: SLA_DAYS.Salary,
        status,
      })
    }
  }

  // Attendance (open only)
  for (const a of getAttendanceExceptions()) {
    if (a.status !== 'Open') continue
    const i = idxFromEmpId(a.employeeId)
    const age = Math.round((DATE0 - Date.parse(a.date)) / 86400000)
    out.push({
      id: `EXC-ATT-${a.id.slice(4)}`,
      category: 'Attendance',
      type: a.exception.charAt(0).toUpperCase() + a.exception.slice(1),
      ...base(i),
      description: `${a.exception} on ${a.date} (${a.shift} shift).`,
      amountAtRisk: Math.round((R.rate[i]! / 30) * (a.exception === 'Excessive hours' ? 0.6 : 1)),
      severity: age > 3 && a.severity === 'High' ? 'Critical' : a.severity,
      owner: owner('Attendance', i)[0],
      ownerRole: owner('Attendance', i)[1],
      createdAt: a.date,
      ageDays: age,
      slaDays: SLA_DAYS.Attendance,
      status: hash01(1920, i) < 0.6 ? 'Open' : 'Awaiting Vendor',
    })
  }

  // Roster-level categories (exclude hero contract to keep its gate clean)
  const rng = mulberry32(5150)
  const heroCi = CONTRACTS.findIndex((c) => c.id === HERO_CONTRACT_ID)
  const pool = Array.from({ length: N }, (_, i) => i).filter((i) => s.onRoll[i] && R.contract[i] !== heroCi && i !== HERO_IDX)
  const risk = (i: number) => VENDORS[R.vendor[i]!]!.riskWeight
  const misc: Array<[ExceptionCategory, number, string[]]> = [
    ['Wage', 146, ['Below Configured Minimum Rate', 'Overtime Beyond Limit', 'Arrears Not Applied']],
    ['Employee Master', 118, ['Bank Account Unverified', 'Duplicate Identity Suspected', 'UAN Not Linked', 'Missing Date of Birth']],
    ['Deployment', 64, ['Deployed at Unsanctioned Location', 'Deployment Without Work Order']],
    ['Document', 88, ['Police Verification Pending', 'Medical Fitness Expired', 'ID Card Expired']],
  ]
  for (const [cat, count, types] of misc) {
    for (const i of weightedSample(rng, pool, risk, count)) {
      const age = 1 + Math.floor(hash01(1930 + cat.length, i) * 30)
      const status = WORKFLOW[Math.floor(hash01(1931 + cat.length, i) * 5)]!
      const type = types[Math.floor(hash01(1932 + cat.length, i) * types.length)]!
      const amount = cat === 'Wage' ? 300 + Math.floor(hash01(1933, i) * 2400) : 0
      out.push({
        id: `EXC-${cat === 'Employee Master' ? 'MST' : cat.slice(0, 3).toUpperCase()}-${10000 + i}`,
        category: cat,
        type,
        ...base(i),
        description: `${type} — ${employeeName(i)}.`,
        amountAtRisk: amount,
        severity: sevFor(cat, amount, age, status, type.includes('Duplicate') || type.includes('Unsanctioned') ? 'High' : null),
        owner: owner(cat, i)[0],
        ownerRole: owner(cat, i)[1],
        createdAt: daysAgo(age),
        ageDays: age,
        slaDays: SLA_DAYS[cat],
        status,
      })
    }
  }

  // Contract-level
  const st = contractStats()
  CONTRACTS.forEach((c, k) => {
    const daysLeft = Math.round((Date.parse(c.endDate) - DATE0) / 86400000)
    if (daysLeft <= 30) {
      out.push({
        id: `EXC-CON-${c.id.slice(3)}`,
        category: 'Contract',
        type: 'Contract Expiring',
        employeeId: null,
        vendorId: c.vendorId,
        contractId: c.id,
        divisionId: null,
        invoiceId: null,
        description: `Contract ${c.number} expires on ${c.endDate} (${daysLeft} days). ${st.get(c.id)!.employees} personnel deployed; renewal or re-tender decision pending.`,
        amountAtRisk: 0,
        severity: daysLeft <= 15 ? 'High' : 'Medium',
        owner: 'P. Shrivastava',
        ownerRole: 'HR / Contract Cell',
        createdAt: daysAgo(30 - daysLeft),
        ageDays: Math.max(0, 30 - daysLeft),
        slaDays: SLA_DAYS.Contract,
        status: k % 2 ? 'Under Review' : 'Open',
      })
    }
  })

  // Invoice-level
  for (const inv of getInvoices()) {
    if (inv.status !== 'Blocked') continue
    const cs = st.get(inv.contractId)!
    out.push({
      id: `EXC-INV-${inv.id.slice(-4)}`,
      category: 'Invoice',
      type: 'Invoice Blocked by Compliance Gate',
      employeeId: null,
      vendorId: inv.vendorId,
      contractId: inv.contractId,
      divisionId: null,
      invoiceId: inv.id,
      description: `${inv.number} blocked: PF exceptions ${cs.pfEx}, ESI exceptions ${cs.esiEx}, salary issues ${cs.salaryIssues}.`,
      amountAtRisk: inv.amount,
      severity: inv.ageingDays > 10 ? 'Critical' : 'High',
      owner: 'M. Agrawal',
      ownerRole: 'Finance',
      createdAt: daysAgo(Math.max(1, inv.ageingDays - 5)),
      ageDays: Math.max(1, inv.ageingDays - 5),
      slaDays: SLA_DAYS.Invoice,
      status: 'Open',
    })
  }

  cache = out
  return out
}

/** Exceptions closed during the current month (aggregate counts only). */
export const RESOLVED_THIS_MONTH: Record<ExceptionCategory, number> = {
  Attendance: 874,
  Wage: 96,
  PF: 512,
  ESI: 268,
  Salary: 341,
  Contract: 4,
  Invoice: 17,
  'Employee Master': 63,
  Deployment: 38,
  Document: 52,
}

function pfDescription(t: number, expected: number, diff: number) {
  switch (t) {
    case 1: return `No PF contribution found in the vendor's ECR for ${CURRENT_MONTH}. Expected ₹${expected}.`
    case 2: return `Short PF contribution of ₹${Math.abs(diff)} against expected ₹${expected}.`
    case 3: return `PF wage reported below computed eligible wage; shortfall ₹${Math.abs(diff)}.`
    case 4: return `UAN in ECR does not match employee master.`
    case 5: return `Employee absent from ECR although payable days recorded.`
    case 6: return `Same UAN reported against multiple workforce IDs.`
    case 7: return `Contribution reported for an employee separated mid-month — validate separation date.`
    default: return `Challan uploaded; employee-level ECR evidence pending verification.`
  }
}

/** Deterministic resolution timeline for an exception. */
export function exceptionTimeline(e: ComplianceException): TimelineEvent[] {
  const created = e.createdAt
  const at = (d: number) => new Date(Date.parse(created) + d * 86400000).toISOString().slice(0, 10)
  const vendor = vendorById.get(e.vendorId)!.shortName
  const stIdx = WORKFLOW.indexOf(e.status as (typeof WORKFLOW)[number])
  const steps: Array<[string, string, string, string]> = [
    ['Vendor submission', `${vendor} billing desk`, 'Vendor User', e.category === 'PF' || e.category === 'ESI' ? 'ECR / contribution file and challan uploaded for the wage month.' : 'Monthly registers submitted.'],
    ['System reconciliation', 'Reconciliation engine', 'System', 'Employee-level comparison of expected vs reported values.'],
    ['Exception raised', 'Reconciliation engine', 'System', e.description],
    ['Vendor response', `${vendor} compliance desk`, 'Vendor User', vendorResponse(e)],
    ['MP Power review', e.owner, e.ownerRole, 'Reviewing vendor response and evidence against employee-level record.'],
    ['Resolution', '—', 'Competent officer', 'Close with evidence, or escalate / recover through invoice adjustment.'],
  ]
  return steps.map(([title, actor, role, detail], k) => {
    const reached = k <= 2 || (k === 3 && stIdx >= 2) || (k === 4 && stIdx >= 3)
    const isCurrent = (k === 3 && stIdx <= 1) || (k === 4 && stIdx >= 3 && e.status !== 'Resolved')
    const overdue = isCurrent && e.ageDays > e.slaDays
    return {
      at: reached ? at(k === 0 ? -2 : k === 1 ? -1 : k === 2 ? 0 : k === 3 ? Math.min(e.ageDays - 2, 4) : Math.min(e.ageDays - 1, 6)) : '',
      actor,
      role,
      title: title + (k === 4 && e.status === 'Escalated' ? ' (escalated)' : ''),
      detail,
      state: e.status === 'Resolved' ? 'done' : overdue ? 'overdue' : isCurrent ? 'current' : reached ? 'done' : 'pending',
    }
  })
}

function vendorResponse(e: ComplianceException) {
  if (e.category !== 'PF' && e.category !== 'ESI') return 'Vendor clarification requested.'
  switch (e.type) {
    case 'Contribution Not Found': return 'Vendor states contribution was paid via supplementary ECR; supplementary ECR and TRRN uploaded for verification.'
    case 'Short Contribution': return 'Vendor attributes shortfall to arrears posting; differential to be paid with next ECR.'
    case 'Wage Mismatch': return 'Vendor claims allowances excluded per their interpretation; MP Power wage computation under review.'
    default: return 'Vendor submitted clarification and supporting documents.'
  }
}

export const contractLabel = (id: string | null) => (id ? contractById.get(id)?.number ?? id : '—')
export const divisionLabel = (id: string | null) => (id ? divisionById.get(id)?.name ?? id : '—')
