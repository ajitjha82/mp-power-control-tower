/**
 * Core domain types for the Outsourced Workforce Control Tower.
 * All data in this prototype is fictional and generated deterministically.
 */

// ---------- Organisation ----------
export interface Region { id: string; name: string; code: string }
export interface Circle { id: string; name: string; regionId: string }
export interface Division { id: string; name: string; circleId: string; regionId: string; sanctioned: number }
export interface Location {
  id: string
  name: string
  type: 'Substation' | 'Power Plant' | 'Division Office' | 'Circle Office' | 'Project Site' | 'Store'
  divisionId: string
  circleId: string
  regionId: string
}

// ---------- Vendors & contracts ----------
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export interface Vendor {
  id: string
  name: string
  shortName: string
  gstinMasked: string
  registeredOffice: string
  contactPerson: string
  since: number
  /** Relative propensity to generate statutory exceptions (mock-data driver only). */
  riskWeight: number
}

export interface Contract {
  id: string
  number: string
  vendorId: string
  title: string
  scope: string
  regionId: string
  startDate: string
  endDate: string
  sanctionedManpower: number
  serviceChargePct: number
  value: number
}

// ---------- Employee ----------
export type EmployeeCategory = 'Unskilled' | 'Semi-skilled' | 'Skilled' | 'Highly Skilled' | 'Clerical' | 'Security' | 'Driver'
export type EmploymentStatus = 'Active' | 'Separated' | 'On Notice' | 'Suspended'
export type Gender = 'M' | 'F'

export interface Employee {
  idx: number
  id: string
  name: string
  gender: Gender
  vendorId: string
  contractId: string
  locationId: string
  divisionId: string
  circleId: string
  regionId: string
  category: EmployeeCategory
  designation: string
  joinDate: string
  status: EmploymentStatus
  uanMasked: string
  esicMasked: string
  bankMasked: string
  aadhaarMasked: string
  mobileMasked: string
}

export interface Deployment {
  employeeId: string
  locationId: string
  contractId: string
  from: string
  to: string | null
  shift: 'General' | 'A' | 'B' | 'C'
  reportingOfficer: string
}

// ---------- Monthly snapshot ----------
export type PFStatus = 'Compliant' | 'Missing' | 'Short' | 'Mismatch' | 'Pending' | 'Under Review' | 'Not Applicable'
export type ESIStatus = PFStatus
export type SalaryStatus = 'Paid' | 'Pending' | 'Delayed' | 'Partial' | 'Amount Mismatch'

export type PFExceptionType =
  | 'Contribution Not Found'
  | 'Short Contribution'
  | 'Wage Mismatch'
  | 'UAN Mismatch'
  | 'Employee Missing'
  | 'Duplicate Identifier'
  | 'Separated Employee Contribution'
  | 'Evidence Pending'

export type ESIExceptionType =
  | 'Contribution Not Found'
  | 'Short Contribution'
  | 'Wage Mismatch'
  | 'ESIC Number Mismatch'
  | 'Employee Missing'
  | 'Duplicate Identifier'
  | 'Separated Employee Contribution'
  | 'Evidence Pending'

export type ComplianceExceptionType = PFExceptionType | ESIExceptionType

export interface WageRecord {
  employeeId: string
  month: string
  monthDays: number
  payableDays: number
  basicDA: number
  hra: number
  otherAllowances: number
  overtime: number
  grossEarned: number
  pfWage: number
  esiWage: number
  employeePF: number
  employeeESI: number
  otherDeductions: number
  netPayable: number
}

export interface PFRecord {
  employeeId: string
  month: string
  applicable: boolean
  uanMasked: string
  payableDays: number
  eligibleWage: number
  pfWage: number
  expectedEmployee: number
  expectedEmployer: number
  reportedWage: number
  reportedEmployee: number
  reportedEmployer: number
  difference: number
  status: PFStatus
  exception: PFExceptionType | null
  severity: Severity | null
}

export interface ESIRecord {
  employeeId: string
  month: string
  applicable: boolean
  esicMasked: string
  payableDays: number
  eligibleWage: number
  expectedEmployee: number
  expectedEmployer: number
  reportedEmployee: number
  reportedEmployer: number
  difference: number
  status: ESIStatus
  exception: ESIExceptionType | null
  severity: Severity | null
}

export interface SalaryPayment {
  employeeId: string
  month: string
  netPayable: number
  reportedPaid: number
  difference: number
  dueDate: string
  paymentDate: string | null
  delayDays: number
  mode: 'Bank Transfer' | 'Pending'
  utrMasked: string | null
  status: SalaryStatus
}

// ---------- Attendance ----------
export type AttendanceSource = 'Biometric' | 'Face (Mobile)' | 'Geo-fenced App' | 'Manual' | 'Register Upload'
export type AttendanceExceptionType =
  | 'Missing attendance'
  | 'Missing checkout'
  | 'Duplicate transaction'
  | 'Wrong location'
  | 'Excessive hours'
  | 'Attendance after separation'
  | 'Wrong vendor/contract'
  | 'Manual modification'

export interface AttendanceDay {
  date: string
  status: 'P' | 'A' | 'L' | 'H' | 'W' | 'HD'
  checkIn: string | null
  checkOut: string | null
  hours: number
  source: AttendanceSource | null
  exception: AttendanceExceptionType | null
}

export interface Attendance {
  employeeId: string
  month: string
  days: AttendanceDay[]
  present: number
  payableDays: number
}

export interface AttendanceException {
  id: string
  employeeId: string
  employeeName: string
  vendorId: string
  locationId: string
  divisionId: string
  date: string
  shift: Deployment['shift']
  checkIn: string | null
  checkOut: string | null
  source: AttendanceSource | null
  exception: AttendanceExceptionType
  severity: Severity
  status: 'Open' | 'Pending Approval' | 'Corrected' | 'Rejected'
}

// ---------- Exceptions / workflow ----------
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
export type ExceptionCategory =
  | 'Attendance'
  | 'Wage'
  | 'PF'
  | 'ESI'
  | 'Salary'
  | 'Contract'
  | 'Invoice'
  | 'Employee Master'
  | 'Deployment'
  | 'Document'
export type ExceptionStatus = 'Open' | 'Awaiting Vendor' | 'Vendor Responded' | 'Under Review' | 'Escalated' | 'Resolved'

export interface TimelineEvent {
  at: string
  actor: string
  role: string
  title: string
  detail?: string
  state: 'done' | 'current' | 'pending' | 'overdue'
}

export interface ComplianceException {
  id: string
  category: ExceptionCategory
  type: string
  employeeId: string | null
  vendorId: string
  contractId: string | null
  divisionId: string | null
  invoiceId: string | null
  description: string
  amountAtRisk: number
  severity: Severity
  owner: string
  ownerRole: string
  createdAt: string
  ageDays: number
  slaDays: number
  status: ExceptionStatus
}

// ---------- Invoices ----------
export type WorkflowStageName = 'Vendor' | 'Site Officer' | 'Division' | 'HR / Contract Cell' | 'Finance' | 'Competent Authority' | 'Payment'
export type InvoiceStatus = 'Submitted' | 'Under Scrutiny' | 'Blocked' | 'Approved' | 'Payment Pending' | 'Paid' | 'Returned'
export type GateCheckResult = 'pass' | 'fail' | 'warn' | 'pending'

export interface WorkflowStage {
  name: WorkflowStageName
  officer: string
  role: string
  receivedAt: string | null
  completedAt: string | null
  ageingDays: number
  slaDays: number
  state: 'completed' | 'current' | 'pending' | 'overdue'
  comment?: string
}

export interface GateCheck {
  key: 'attendance' | 'master' | 'wage' | 'salary' | 'pf' | 'esi' | 'documents'
  label: string
  result: GateCheckResult
  detail: string
  affectedEmployees: number
}

export interface Invoice {
  id: string
  number: string
  vendorId: string
  contractId: string
  billingMonth: string
  submittedAt: string
  employees: number
  wageAmount: number
  serviceCharge: number
  tax: number
  adjustments: number
  amount: number
  complianceStatus: 'Compliant' | 'Non-Compliant' | 'Pending'
  stage: WorkflowStageName
  ageingDays: number
  status: InvoiceStatus
}

// ---------- Notifications & audit ----------
export type NotificationCategory = 'Attendance' | 'PF' | 'ESI' | 'Salary' | 'Invoice' | 'Contract' | 'System'
export interface AppNotification {
  id: string
  category: NotificationCategory
  title: string
  body: string
  at: string
  read: boolean
  severity: Severity
  href: string
}

export interface AuditEvent {
  id: string
  at: string
  user: string
  role: Role
  action: string
  module: string
  record: string
  previousValue: string
  newValue: string
  source: string
  reason: string
}

// ---------- Dashboard ----------
export type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info'
export interface DashboardMetric {
  key: string
  label: string
  value: number
  format: 'number' | 'percent' | 'currency'
  secondary?: string
  delta?: number
  deltaLabel?: string
  /** Whether an increase is good (true) or bad (false) for this metric. */
  higherIsBetter?: boolean
  tone: Tone
  tooltip: string
  href?: string
}

// ---------- Security ----------
export type Role =
  | 'Senior Management'
  | 'HR'
  | 'Finance'
  | 'Compliance Officer'
  | 'Division Officer'
  | 'Site Officer'
  | 'Vendor User'
  | 'Auditor'
  | 'System Administrator'

// ---------- Filters / paging ----------
export interface GlobalFilters {
  wageMonth: string
  regions: string[]
  circles: string[]
  divisions: string[]
  locations: string[]
  vendors: string[]
  contracts: string[]
  categories: EmployeeCategory[]
  compliance: ComplianceFilter[]
}
export type ComplianceFilter = 'Fully Compliant' | 'PF Exception' | 'ESI Exception' | 'Salary Issue'

export interface PageRequest {
  page: number
  pageSize: number
  sort?: { id: string; desc: boolean } | null
  search?: string
}
export interface PageResult<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}
