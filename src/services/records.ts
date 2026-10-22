import type { ESIStatus, ExceptionStatus, GlobalFilters, PFStatus, PageRequest, SalaryStatus, Severity } from '@/types'
import { CONTRACTS, VENDORS } from '@/data/vendors'
import { LOCATIONS } from '@/data/org'
import { IDX, R, empId, employeeName, idxFromEmpId } from '@/data/roster'
import { ESI_TYPES, PF_TYPES, WORKFLOW, getSnapshot } from '@/data/snapshot'
import { esiRecord, pfAtRisk, pfRecord, salaryPayment } from '@/data/wages'
import { matchesSearch, paginate, simulate } from './api'
import { scopeIndices } from './scope'

export interface RecoParams extends PageRequest {
  /** 'exception' = any open exception, 'compliant', or a specific status label */
  status?: 'all' | 'exception' | 'compliant' | PFStatus
  exception?: string | null
  vendor?: string | null
  contract?: string | null
  ids?: string[] | null
}

export interface RowBase {
  idx: number
  employeeId: string
  name: string
  vendorId: string
  vendorName: string
  contractId: string
  contractNo: string
  locationName: string
  divisionId: string
}
export const rowBase = (i: number): RowBase => {
  const c = CONTRACTS[R.contract[i]!]!
  const l = LOCATIONS[R.location[i]!]!
  return {
    idx: i,
    employeeId: empId(i),
    name: employeeName(i),
    vendorId: c.vendorId,
    vendorName: VENDORS[R.vendor[i]!]!.shortName,
    contractId: c.id,
    contractNo: c.number,
    locationName: l.name,
    divisionId: l.divisionId,
  }
}

export interface PFRow extends RowBase {
  uan: string
  payableDays: number
  eligibleWage: number
  pfWage: number
  expectedEmployee: number
  expectedEmployer: number
  reported: number
  difference: number
  status: PFStatus
  exception: string | null
  severity: Severity | null
  atRisk: number
  workflow: ExceptionStatus | null
  ageDays: number
}
export interface ESIRow extends RowBase {
  esic: string
  payableDays: number
  eligibleWage: number
  expected: number
  reported: number
  difference: number
  status: ESIStatus
  exception: string | null
  severity: Severity | null
  atRisk: number
  workflow: ExceptionStatus | null
  ageDays: number
}

const GENERIC_STATUS = ['all', 'exception', 'compliant']

function candidateIndices(f: GlobalFilters, p: RecoParams, applicable: Uint8Array, ex: Uint8Array, types: readonly string[]) {
  const idx = scopeIndices(f)
  const vSet = p.vendor ? IDX.vendorIndex.get(p.vendor) : undefined
  const cSet = p.contract ? IDX.contractIndex.get(p.contract) : undefined
  const ids = p.ids?.length ? new Set(p.ids.map(idxFromEmpId)) : null
  const typeIdx = p.exception ? types.indexOf(p.exception) + 1 : 0
  const out: number[] = []
  for (const i of idx) {
    if (!applicable[i]) continue
    if (vSet !== undefined && R.vendor[i] !== vSet) continue
    if (cSet !== undefined && R.contract[i] !== cSet) continue
    if (ids && !ids.has(i)) continue
    if (p.status === 'exception' && !ex[i]) continue
    if (p.status === 'compliant' && ex[i]) continue
    if (typeIdx && ex[i] !== typeIdx) continue
    if (p.search && !matchesSearch(p.search, empId(i), employeeName(i))) continue
    out.push(i)
  }
  return out
}

export function pfRows(f: GlobalFilters, p: RecoParams): PFRow[] {
  const s = getSnapshot(f.wageMonth)
  return candidateIndices(f, p, R.pfApplicable, s.pfEx, PF_TYPES)
    .map((i): PFRow => {
      const r = pfRecord(s, i)
      const expected = r.expectedEmployee + r.expectedEmployer
      return {
        ...rowBase(i),
        uan: r.uanMasked,
        payableDays: r.payableDays,
        eligibleWage: r.eligibleWage,
        pfWage: r.pfWage,
        expectedEmployee: r.expectedEmployee,
        expectedEmployer: r.expectedEmployer,
        reported: r.reportedEmployee + r.reportedEmployer,
        difference: r.difference,
        status: r.status,
        exception: r.exception,
        severity: r.severity,
        atRisk: pfAtRisk(expected, r.difference, s.pfEx[i]!),
        workflow: s.pfEx[i] ? WORKFLOW[s.pfWf[i]!]! : null,
        ageDays: s.pfEx[i] ? s.pfAge[i]! : 0,
      }
    })
    .filter((r) => !p.status || GENERIC_STATUS.includes(p.status) || r.status === p.status)
}

export function esiRows(f: GlobalFilters, p: RecoParams): ESIRow[] {
  const s = getSnapshot(f.wageMonth)
  return candidateIndices(f, p, R.esiApplicable, s.esiEx, ESI_TYPES)
    .map((i): ESIRow => {
      const r = esiRecord(s, i)
      const expected = r.expectedEmployee + r.expectedEmployer
      const t = s.esiEx[i]!
      return {
        ...rowBase(i),
        esic: r.esicMasked,
        payableDays: r.payableDays,
        eligibleWage: r.eligibleWage,
        expected,
        reported: expected + r.difference,
        difference: r.difference,
        status: r.status,
        exception: r.exception,
        severity: r.severity,
        atRisk: t ? (t === 2 || t === 3 ? Math.abs(r.difference) : expected) : 0,
        workflow: t ? WORKFLOW[s.esiWf[i]!]! : null,
        ageDays: t ? s.esiAge[i]! : 0,
      }
    })
    .filter((r) => !p.status || GENERIC_STATUS.includes(p.status) || r.status === p.status)
}

export const listPF = (f: GlobalFilters, p: RecoParams) => simulate(() => paginate(pfRows(f, p), p))
export const listESI = (f: GlobalFilters, p: RecoParams) => simulate(() => paginate(esiRows(f, p), p))

// ---------- Salary ----------
export interface SalaryRow extends RowBase {
  netPayable: number
  reportedPaid: number
  difference: number
  dueDate: string
  paymentDate: string | null
  delayDays: number
  status: SalaryStatus
}
export interface SalaryParams extends PageRequest {
  status?: SalaryStatus | 'issues' | 'all'
  minDelay?: number
  vendor?: string | null
}
export function salaryRows(f: GlobalFilters, p: SalaryParams): SalaryRow[] {
  const s = getSnapshot(f.wageMonth)
  const vSet = p.vendor ? IDX.vendorIndex.get(p.vendor) : undefined
  const out: SalaryRow[] = []
  for (const i of scopeIndices(f)) {
    const st = s.salary[i]!
    if (p.status === 'issues' && st === 0) continue
    if (vSet !== undefined && R.vendor[i] !== vSet) continue
    if (p.minDelay && s.delay[i]! <= p.minDelay) continue
    if (p.search && !matchesSearch(p.search, empId(i), employeeName(i))) continue
    const pay = salaryPayment(s, i)
    if (p.status && p.status !== 'all' && p.status !== 'issues' && pay.status !== p.status) continue
    out.push({
      ...rowBase(i),
      netPayable: pay.netPayable,
      reportedPaid: pay.reportedPaid,
      difference: pay.difference,
      dueDate: pay.dueDate,
      paymentDate: pay.paymentDate,
      delayDays: pay.delayDays,
      status: pay.status,
    })
  }
  return out
}
export const listSalary = (f: GlobalFilters, p: SalaryParams) => simulate(() => paginate(salaryRows(f, p), p))
