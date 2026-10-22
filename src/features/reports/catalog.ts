export type ReportCategory = 'Workforce' | 'Attendance' | 'PF' | 'ESI' | 'Salary' | 'Vendor' | 'Invoice' | 'Compliance' | 'Audit'

export interface ReportDef {
  id: string
  name: string
  category: ReportCategory
  description: string
  frequency: 'Daily' | 'Weekly' | 'Monthly'
  audience: string
}

export const REPORTS: ReportDef[] = [
  { id: 'workforce-monthly', name: 'Monthly Workforce Report', category: 'Workforce', description: 'Sanctioned vs deployed vs present by region, division and vendor.', frequency: 'Monthly', audience: 'Senior Management, HR' },
  { id: 'attendance-exceptions', name: 'Attendance Exception Report', category: 'Attendance', description: 'Missing punches, geo exceptions, manual corrections and pending approvals.', frequency: 'Daily', audience: 'Division / Site Officers' },
  { id: 'pf-reconciliation', name: 'PF Reconciliation Report', category: 'PF', description: 'Employee-level expected vs reported PF with exception classification.', frequency: 'Monthly', audience: 'Compliance, Finance' },
  { id: 'esi-reconciliation', name: 'ESI Reconciliation Report', category: 'ESI', description: 'Employee-level expected vs reported ESI with exception classification.', frequency: 'Monthly', audience: 'Compliance, Finance' },
  { id: 'vendor-scorecard', name: 'Vendor Compliance Scorecard', category: 'Vendor', description: 'Attendance, PF, ESI, salary timeliness, exceptions and risk score per vendor.', frequency: 'Monthly', audience: 'Contract Cell, Senior Management' },
  { id: 'salary-delay', name: 'Salary Delay Report', category: 'Salary', description: 'Employees with delayed, partial or mismatched salary credit.', frequency: 'Weekly', audience: 'HR, Labour Compliance' },
  { id: 'invoice-ageing', name: 'Invoice Ageing Report', category: 'Invoice', description: 'Invoices by workflow stage, ageing and SLA breach, including compliance-gate blocks.', frequency: 'Weekly', audience: 'Finance' },
  { id: 'exception-ageing', name: 'Compliance Exception Ageing Report', category: 'Compliance', description: 'Open exceptions by category, owner, ageing bucket and SLA status.', frequency: 'Weekly', audience: 'All control owners' },
  { id: 'audit-activity', name: 'Audit Activity Report', category: 'Audit', description: 'User actions on consequential records with before/after values.', frequency: 'Monthly', audience: 'Auditors' },
]
