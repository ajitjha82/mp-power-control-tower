import type { GlobalFilters } from '@/types'
import { CURRENT_MONTH } from '@/data/config'
import { AUDIT_EVENTS } from '@/data/activity'
import { vendorById } from '@/data/vendors'
import { breakdown } from '@/services/metrics'
import { pfRows, esiRows, salaryRows } from '@/services/records'
import { scopedAttendanceExceptions, scopedExceptions, scopedInvoices, vendorRows } from '@/services/entities'
import { fmtINR, fmtPct } from '@/lib/utils'

export type CellKind = 'text' | 'num' | 'status' | 'severity' | 'risk' | 'mono'
export interface PreviewCol {
  label: string
  kind: CellKind
}
export type Cell = string | number
export interface Preview {
  cols: PreviewCol[]
  rows: Cell[][]
  total: number
  note?: string
  summary?: Array<{ label: string; value: string }>
}

export const PREVIEW_LIMIT = 15

/** Which report-local filters apply to each report. */
export const REPORT_FILTERS: Record<string, { month: boolean; org: boolean }> = {
  'workforce-monthly': { month: true, org: true },
  'attendance-exceptions': { month: false, org: true },
  'pf-reconciliation': { month: true, org: true },
  'esi-reconciliation': { month: true, org: true },
  'vendor-scorecard': { month: true, org: true },
  'salary-delay': { month: true, org: true },
  'invoice-ageing': { month: false, org: true },
  'exception-ageing': { month: false, org: true },
  'audit-activity': { month: false, org: false },
}

const c = (label: string, kind: CellKind = 'text'): PreviewCol => ({ label, kind })
const vname = (id: string) => vendorById.get(id)?.shortName ?? id

export function buildPreview(reportId: string, f: GlobalFilters): Preview {
  switch (reportId) {
    case 'workforce-monthly': {
      const rows = breakdown(f, 'region').sort((a, b) => b.workforce - a.workforce)
      return {
        cols: [c('Region'), c('Sanctioned', 'num'), c('Deployed', 'num'), c('Vacant', 'num'), c('Present', 'num'), c('Attendance %', 'num'), c('PF compliance %', 'num'), c('ESI compliance %', 'num')],
        rows: rows.slice(0, PREVIEW_LIMIT).map((r) => [r.name, r.sanctioned, r.workforce, r.vacant, r.present, fmtPct(r.attendancePct), fmtPct(r.pfPct), fmtPct(r.esiPct)]),
        total: rows.length,
      }
    }
    case 'attendance-exceptions': {
      const rows = scopedAttendanceExceptions(f)
      return {
        cols: [c('ID', 'mono'), c('Employee'), c('Vendor'), c('Date'), c('Exception'), c('Source'), c('Severity', 'severity'), c('Status', 'status')],
        rows: rows.slice(0, PREVIEW_LIMIT).map((a) => [a.id, `${a.employeeName} (${a.employeeId})`, vname(a.vendorId), a.date, a.exception, a.source ?? '—', a.severity, a.status]),
        total: rows.length,
        note: 'Attendance exceptions are for the current period; wage-month filter does not apply.',
      }
    }
    case 'pf-reconciliation': {
      const rows = pfRows(f, { page: 0, pageSize: PREVIEW_LIMIT, status: 'exception' })
      return {
        cols: [c('Employee ID', 'mono'), c('Name'), c('Vendor'), c('UAN (masked)', 'mono'), c('Expected', 'num'), c('Reported', 'num'), c('Difference', 'num'), c('Status', 'status'), c('Exception')],
        rows: rows
          .slice(0, PREVIEW_LIMIT)
          .map((r) => [r.employeeId, r.name, r.vendorName, r.uan, fmtINR(r.expectedEmployee + r.expectedEmployer), fmtINR(r.reported), fmtINR(r.difference), r.status, r.exception ?? '—']),
        total: rows.length,
        note: 'Preview lists employees with PF exceptions; the full report also includes reconciled employees.',
      }
    }
    case 'esi-reconciliation': {
      const rows = esiRows(f, { page: 0, pageSize: PREVIEW_LIMIT, status: 'exception' })
      return {
        cols: [c('Employee ID', 'mono'), c('Name'), c('Vendor'), c('ESIC (masked)', 'mono'), c('Expected', 'num'), c('Reported', 'num'), c('Difference', 'num'), c('Status', 'status'), c('Exception')],
        rows: rows.slice(0, PREVIEW_LIMIT).map((r) => [r.employeeId, r.name, r.vendorName, r.esic, fmtINR(r.expected), fmtINR(r.reported), fmtINR(r.difference), r.status, r.exception ?? '—']),
        total: rows.length,
        note: 'Preview lists employees with ESI exceptions; the full report also includes reconciled employees.',
      }
    }
    case 'vendor-scorecard': {
      const rows = vendorRows(f).sort((a, b) => b.riskScore - a.riskScore)
      return {
        cols: [c('Vendor'), c('Employees', 'num'), c('Attendance %', 'num'), c('PF %', 'num'), c('ESI %', 'num'), c('Salary paid %', 'num'), c('Open exceptions', 'num'), c('Blocked invoices', 'num'), c('Risk score', 'num'), c('Risk level', 'risk')],
        rows: rows
          .slice(0, PREVIEW_LIMIT)
          .map((v) => [v.shortName, v.employees, fmtPct(v.attendancePct), fmtPct(v.pfPct), fmtPct(v.esiPct), fmtPct(v.salaryPct), v.openExceptions, v.blockedInvoices, v.riskScore, v.riskLevel]),
        total: rows.length,
        note: 'Exceptions and invoices reflect the current period; compliance percentages follow the selected wage month.',
      }
    }
    case 'salary-delay': {
      const rows = salaryRows(f, { page: 0, pageSize: PREVIEW_LIMIT, status: 'issues' }).filter((r) => r.status !== 'Pending').sort((a, b) => b.delayDays - a.delayDays)
      return {
        cols: [c('Employee ID', 'mono'), c('Name'), c('Vendor'), c('Net payable', 'num'), c('Reported paid', 'num'), c('Due date'), c('Paid on'), c('Delay (days)', 'num'), c('Status', 'status')],
        rows: rows
          .slice(0, PREVIEW_LIMIT)
          .map((r) => [r.employeeId, r.name, r.vendorName, fmtINR(r.netPayable), fmtINR(r.reportedPaid), r.dueDate, r.paymentDate ?? '—', r.delayDays, r.status]),
        total: rows.length,
      }
    }
    case 'invoice-ageing': {
      const rows = scopedInvoices(f)
        .filter((i) => i.status !== 'Paid')
        .sort((a, b) => b.ageingDays - a.ageingDays)
      return {
        cols: [c('Invoice No.', 'mono'), c('Vendor'), c('Billing month'), c('Stage'), c('Ageing (days)', 'num'), c('Amount', 'num'), c('Compliance', 'status'), c('Status', 'status')],
        rows: rows.slice(0, PREVIEW_LIMIT).map((i) => [i.number, vname(i.vendorId), i.billingMonth, i.stage, i.ageingDays, fmtINR(i.amount), i.complianceStatus, i.status]),
        total: rows.length,
        note: 'All unpaid invoices across billing months; wage-month filter does not apply.',
      }
    }
    case 'exception-ageing': {
      const ex = scopedExceptions(f)
      const rows = [...ex].sort((a, b) => b.ageDays - b.slaDays - (a.ageDays - a.slaDays))
      const bucket = (lo: number, hi: number) => ex.filter((e) => e.ageDays >= lo && e.ageDays <= hi).length
      return {
        cols: [c('Exception ID', 'mono'), c('Category'), c('Type'), c('Vendor'), c('Owner'), c('Age (days)', 'num'), c('SLA (days)', 'num'), c('Severity', 'severity'), c('Status', 'status')],
        rows: rows.slice(0, PREVIEW_LIMIT).map((e) => [e.id, e.category, e.type, vname(e.vendorId), e.owner, e.ageDays, e.slaDays, e.severity, e.status]),
        total: rows.length,
        summary: [
          { label: '0–7 d', value: String(bucket(0, 7)) },
          { label: '8–15 d', value: String(bucket(8, 15)) },
          { label: '16–30 d', value: String(bucket(16, 30)) },
          { label: '30+ d', value: String(bucket(31, Number.MAX_SAFE_INTEGER)) },
          { label: 'Overdue vs SLA', value: String(ex.filter((e) => e.ageDays > e.slaDays).length) },
        ],
        note: `Open exceptions for wage month ${CURRENT_MONTH}, sorted by SLA breach.`,
      }
    }
    case 'audit-activity': {
      const rows = AUDIT_EVENTS
      return {
        cols: [c('Timestamp'), c('User'), c('Role'), c('Action'), c('Module'), c('Record', 'mono'), c('Previous'), c('New'), c('Reason')],
        rows: rows
          .slice(0, PREVIEW_LIMIT)
          .map((e) => [new Date(e.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }), e.user, e.role, e.action, e.module, e.record, e.previousValue, e.newValue, e.reason]),
        total: rows.length,
        note: 'Audit activity is not scoped by organisation or vendor filters.',
      }
    }
    default:
      return { cols: [], rows: [], total: 0 }
  }
}
