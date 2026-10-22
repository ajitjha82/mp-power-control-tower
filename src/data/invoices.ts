import type { Invoice, InvoiceStatus, WorkflowStage, WorkflowStageName } from '@/types'
import { hash01 } from '@/lib/rng'
import { CURRENT_MONTH, statutoryConfig } from './config'
import { CLEAN_CONTRACT_IDS, CONTRACTS, HERO_CONTRACT_ID, vendorById } from './vendors'
import { N, R } from './roster'
import { getSnapshot } from './snapshot'
import { wageRecord } from './wages'

export const STAGES: WorkflowStageName[] = ['Vendor', 'Site Officer', 'Division', 'HR / Contract Cell', 'Finance', 'Competent Authority', 'Payment']
export const STAGE_SLA: Record<WorkflowStageName, number> = {
  Vendor: 0,
  'Site Officer': 3,
  Division: 3,
  'HR / Contract Cell': 5,
  Finance: 5,
  'Competent Authority': 3,
  Payment: 7,
}
const STAGE_ROLE: Record<WorkflowStageName, [string, string]> = {
  Vendor: ['Vendor billing desk', 'Vendor User'],
  'Site Officer': ['S. K. Malviya', 'Site Officer'],
  Division: ['A. R. Khan', 'Division Officer (EE)'],
  'HR / Contract Cell': ['P. Shrivastava', 'HR / Contract Cell'],
  Finance: ['M. Agrawal', 'Finance (DGM-F&A)'],
  'Competent Authority': ['R. N. Saxena', 'Competent Authority (CE)'],
  Payment: ['Treasury Ops', 'Finance — Payments'],
}

export interface ContractMonthStats {
  employees: number
  gross: number
  pfEx: number
  esiEx: number
  salaryIssues: number
}

let stats: Map<string, ContractMonthStats> | null = null
/** Per-contract aggregates for the current wage month. */
export function contractStats() {
  if (stats) return stats
  const s = getSnapshot(CURRENT_MONTH)
  stats = new Map(CONTRACTS.map((c) => [c.id, { employees: 0, gross: 0, pfEx: 0, esiEx: 0, salaryIssues: 0 }]))
  for (let i = 0; i < N; i++) {
    if (!s.onRoll[i]) continue
    const st = stats.get(CONTRACTS[R.contract[i]!]!.id)!
    st.employees++
    st.gross += wageRecord(s, i).grossEarned
    if (s.pfEx[i]) st.pfEx++
    if (s.esiEx[i]) st.esiEx++
    if (s.salary[i] >= 2) st.salaryIssues++
  }
  return stats
}

const addDays = (iso: string, d: number) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10)
const diffDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
const TODAY = '2026-10-22'

let invoices: Invoice[] | null = null
export const BLOCKED_INVOICE_COUNT = 23

export function getInvoices(): Invoice[] {
  if (invoices) return invoices
  const st = contractStats()
  const months = ['2026-07', '2026-08', CURRENT_MONTH]
  // Blocked: hero contract + the 22 contracts with the most unresolved statutory/salary issues.
  const nonClean = CONTRACTS.filter((c) => !CLEAN_CONTRACT_IDS.has(c.id) && c.id !== HERO_CONTRACT_ID)
  const ranked = [...nonClean].sort((a, b) => {
    const sa = st.get(a.id)!, sb = st.get(b.id)!
    return sb.pfEx + sb.esiEx + sb.salaryIssues - (sa.pfEx + sa.esiEx + sa.salaryIssues)
  })
  const blocked = new Set([HERO_CONTRACT_ID, ...ranked.slice(0, BLOCKED_INVOICE_COUNT - 1).map((c) => c.id)])
  const out: Invoice[] = []
  let seq = 1001
  months.forEach((month, mi) => {
    CONTRACTS.forEach((c, ci) => {
      const cs = st.get(c.id)!
      const h = hash01(1500 + mi, ci)
      const vary = mi === 2 ? 1 : 0.965 + hash01(1600 + mi, ci) * 0.04
      const wageAmount = Math.round(cs.gross * vary)
      const serviceCharge = Math.round((wageAmount * c.serviceChargePct) / 100)
      const adjustments = h < 0.3 ? -Math.round(wageAmount * 0.004) : 0
      const tax = Math.round(((wageAmount + serviceCharge + adjustments) * statutoryConfig.gstRatePct) / 100)
      const [yy, mm] = month.split('-').map(Number)
      const submittedAt = addDays(`${yy}-${String(mm! + 1).padStart(2, '0')}-01`, 7 + Math.floor(hash01(1700 + mi, ci) * 7))
      let stage: WorkflowStageName = 'Payment'
      let status: InvoiceStatus = 'Paid'
      if (mi === 0) {
        if (h < 0.04) status = 'Payment Pending'
      } else if (mi === 1) {
        if (h < 0.18) { status = 'Payment Pending'; stage = 'Payment' }
        else if (h < 0.3) { status = 'Approved'; stage = 'Competent Authority' }
      } else if (blocked.has(c.id)) {
        status = 'Blocked'
        stage = 'HR / Contract Cell'
      } else if (CLEAN_CONTRACT_IDS.has(c.id)) {
        status = h < 0.35 ? 'Approved' : h < 0.75 ? 'Payment Pending' : 'Paid'
        stage = status === 'Approved' ? 'Finance' : status === 'Payment Pending' ? 'Competent Authority' : 'Payment'
      } else {
        status = h < 0.25 ? 'Submitted' : 'Under Scrutiny'
        stage = h < 0.25 ? 'Site Officer' : h < 0.65 ? 'Site Officer' : 'Division'
      }
      const sub = c.id === HERO_CONTRACT_ID && mi === 2 ? '2026-10-09' : submittedAt
      out.push({
        id: `INV-2026-${seq}`,
        number: `INV-2026-${seq}`,
        vendorId: c.vendorId,
        contractId: c.id,
        billingMonth: month,
        submittedAt: sub,
        employees: cs.employees,
        wageAmount,
        serviceCharge,
        tax,
        adjustments,
        amount: wageAmount + serviceCharge + adjustments + tax,
        complianceStatus: status === 'Blocked' ? 'Non-Compliant' : status === 'Submitted' || status === 'Under Scrutiny' ? 'Pending' : 'Compliant',
        stage,
        ageingDays: diffDays(sub, TODAY),
        status,
      })
      seq++
    })
  })
  invoices = out
  return out
}

export const HERO_INVOICE_ID = () => getInvoices().find((i) => i.contractId === HERO_CONTRACT_ID && i.billingMonth === CURRENT_MONTH)!.id

/** Deterministic approval workflow trail for an invoice. */
export function invoiceWorkflow(inv: Invoice): WorkflowStage[] {
  const currentIdx = STAGES.indexOf(inv.stage)
  const isDone = inv.status === 'Paid'
  let cursor = inv.submittedAt
  const seed = Number(inv.id.slice(-4))
  return STAGES.map((name, k) => {
    const [officer, role] = STAGE_ROLE[name]
    const sla = STAGE_SLA[name]
    if (k === 0) {
      return { name, officer: vendorById.get(inv.vendorId)!.shortName, role, receivedAt: inv.submittedAt, completedAt: inv.submittedAt, ageingDays: 0, slaDays: sla, state: 'completed' as const, comment: 'Invoice and supporting registers uploaded.' }
    }
    if (k < currentIdx || isDone) {
      const took = 1 + Math.floor(hash01(seed, k) * Math.max(1, sla))
      const receivedAt = cursor
      const completedAt = addDays(cursor, took)
      cursor = completedAt
      return { name, officer, role, receivedAt, completedAt, ageingDays: took, slaDays: sla, state: 'completed' as const, comment: COMMENTS[name] }
    }
    if (k === currentIdx) {
      const receivedAt = inv.contractId === HERO_CONTRACT_ID && inv.billingMonth === CURRENT_MONTH ? '2026-10-14' : cursor
      const age = Math.max(0, diffDays(receivedAt, TODAY))
      const overdue = age > sla
      return {
        name,
        officer,
        role,
        receivedAt,
        completedAt: null,
        ageingDays: age,
        slaDays: sla,
        state: overdue ? ('overdue' as const) : ('current' as const),
        comment: inv.status === 'Blocked' ? 'Compliance gate failed — returned for statutory reconciliation.' : 'Under scrutiny.',
      }
    }
    return { name, officer, role, receivedAt: null, completedAt: null, ageingDays: 0, slaDays: sla, state: 'pending' as const }
  })
}

const COMMENTS: Partial<Record<WorkflowStageName, string>> = {
  'Site Officer': 'Attendance register verified against biometric feed.',
  Division: 'Manpower deployment matches work order.',
  'HR / Contract Cell': 'Compliance gate passed.',
  Finance: 'Deductions and GST verified.',
  'Competent Authority': 'Approved for release.',
  Payment: 'Payment released to vendor account (masked).',
}
