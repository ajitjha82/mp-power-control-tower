import type { AppNotification, AuditEvent, Role } from '@/types'
import { hash01 } from '@/lib/rng'
import { CURRENT_QUOTAS } from './config'

/** Seed notifications. Counts reference the same quotas as the dashboards. */
export const SEED_NOTIFICATIONS: AppNotification[] = [
  { id: 'N-001', category: 'PF', title: `${CURRENT_QUOTAS.pfExceptions.toLocaleString('en-IN')} PF exceptions require review`, body: 'Employee-level PF reconciliation for Sep 2026 completed with open exceptions.', at: '2026-10-22T08:10:00+05:30', read: false, severity: 'High', href: '/pf?status=exception' },
  { id: 'N-002', category: 'Invoice', title: 'Invoice for ABC Manpower (CT-001) exceeded approval SLA', body: 'Pending at HR / Contract Cell beyond the configured 5-day SLA. Compliance gate failed on PF.', at: '2026-10-22T07:45:00+05:30', read: false, severity: 'Critical', href: '/invoices?hero=1' },
  { id: 'N-003', category: 'Salary', title: 'XYZ Facility salary submission overdue', body: 'Bank payment confirmation for Sep 2026 not received for multiple employees.', at: '2026-10-21T18:20:00+05:30', read: false, severity: 'High', href: '/salary?vendor=V-007' },
  { id: 'N-004', category: 'Contract', title: 'Contract for XYZ Facility expires in 14 days', body: 'Renewal or re-tender decision is required to avoid deployment gaps.', at: '2026-10-21T10:00:00+05:30', read: false, severity: 'Medium', href: '/contracts' },
  { id: 'N-005', category: 'ESI', title: `${CURRENT_QUOTAS.esiExceptions} ESI exceptions open`, body: 'ESI reconciliation completed for Sep 2026.', at: '2026-10-21T09:05:00+05:30', read: false, severity: 'Medium', href: '/esi?status=exception' },
  { id: 'N-006', category: 'Attendance', title: '1,184 employees with missing attendance today', body: 'No punch and no approved leave recorded by 09:30.', at: '2026-10-22T09:30:00+05:30', read: false, severity: 'Medium', href: '/attendance?type=Missing%20attendance' },
  { id: 'N-007', category: 'Attendance', title: '12 attendance records after separation', body: 'Punches recorded for employees marked separated in master.', at: '2026-10-20T16:40:00+05:30', read: true, severity: 'Critical', href: '/attendance?type=Attendance%20after%20separation' },
  { id: 'N-008', category: 'Invoice', title: '23 invoices blocked by compliance gate', body: 'Statutory or salary conditions unmet for Sep 2026 billing.', at: '2026-10-20T11:15:00+05:30', read: true, severity: 'High', href: '/invoices?status=Blocked' },
  { id: 'N-009', category: 'System', title: 'Biometric feed delayed — Sarni Generation Circle', body: 'Last sync 47 minutes ago. Attendance may be understated for this circle.', at: '2026-10-22T09:12:00+05:30', read: false, severity: 'Low', href: '/admin/integrations' },
  { id: 'N-010', category: 'System', title: 'Statutory configuration CFG-DEMO-2026.04 active', body: 'Rates and ceilings are configurable parameters; changes require dual authorisation.', at: '2026-10-18T12:00:00+05:30', read: true, severity: 'Low', href: '/settings' },
]

const USERS: Array<[string, Role]> = [
  ['N. Bhargava', 'Compliance Officer'],
  ['P. Shrivastava', 'HR'],
  ['M. Agrawal', 'Finance'],
  ['A. R. Khan', 'Division Officer'],
  ['S. K. Malviya', 'Site Officer'],
  ['ABC Manpower (vendor)', 'Vendor User'],
  ['R. Iyer', 'Auditor'],
  ['IT Admin', 'System Administrator'],
]
const ACTIONS: Array<[string, string, (n: number) => string, string, string, string]> = [
  ['Exception assigned', 'Exceptions', (n) => `EXC-PF-${10000 + n}`, 'Unassigned', 'N. Bhargava', 'Workload balancing'],
  ['Attendance corrected', 'Attendance', (n) => `ATX-${String(n).padStart(5, '0')}`, 'Check-out: —', 'Check-out: 18:02', 'Supervisor confirmation attached'],
  ['Invoice returned', 'Invoices', () => 'INV-2026-1129', 'Under Scrutiny', 'Blocked', 'Compliance gate failed'],
  ['Vendor response submitted', 'PF', (n) => `EXC-PF-${10000 + n}`, 'Awaiting Vendor', 'Vendor Responded', 'Supplementary ECR uploaded'],
  ['Role permission viewed', 'Users & Roles', () => 'ROLE-FIN', '—', '—', 'Periodic access review'],
  ['Report exported', 'Reports', () => 'PF Reconciliation Report', '—', 'CSV (masked)', 'Monthly MIS'],
  ['Employee master updated', 'Masters', (n) => `EMP-${10000 + n}`, 'Bank: XXXXXX1180', 'Bank: XXXXXX4821', 'Bank change request #BR-2291 verified'],
  ['Exception escalated', 'Exceptions', (n) => `EXC-ESI-${10000 + n}`, 'Under Review', 'Escalated', 'SLA breached > 1.5x'],
  ['Configuration viewed', 'Settings', () => 'CFG-DEMO-2026.04', '—', '—', 'Audit sampling'],
  ['Login', 'Security', () => 'Session', '—', '—', 'SSO'],
]

export const AUDIT_EVENTS: AuditEvent[] = Array.from({ length: 240 }, (_, k) => {
  const [user, role] = USERS[Math.floor(hash01(2001, k) * USERS.length)]!
  const [action, module, rec, prev, next, reason] = ACTIONS[Math.floor(hash01(2002, k) * ACTIONS.length)]!
  const ts = Date.parse('2026-10-22T09:28:00+05:30') - Math.floor(k * 41 + hash01(2003, k) * 37) * 60000
  return {
    id: `AUD-${String(90000 - k)}`,
    at: new Date(ts).toISOString(),
    user,
    role,
    action,
    module,
    record: rec(Math.floor(hash01(2004, k) * 60000)),
    previousValue: prev,
    newValue: next,
    source: `10.24.${Math.floor(hash01(2005, k) * 200)}.xxx / ${hash01(2006, k) < 0.7 ? 'Web' : 'Mobile'}`,
    reason,
  }
})
