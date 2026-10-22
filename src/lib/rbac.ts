import type { GlobalFilters, Role } from '@/types'
import { HERO_DIVISION_ID, HERO_LOCATION_ID } from '@/data/org'
import { HERO_VENDOR_ID } from '@/data/vendors'

/**
 * CLIENT-SIDE ROLE SIMULATION ONLY.
 * This module shapes navigation, actions and data scope for demonstration.
 * It is NOT a security control: in production every query and action must be
 * authorised server-side (policy engine + row-level scoping), and the UI would
 * only reflect the permissions returned by the API.
 */
export const ROLES: Role[] = [
  'Senior Management',
  'HR',
  'Finance',
  'Compliance Officer',
  'Division Officer',
  'Site Officer',
  'Vendor User',
  'Auditor',
  'System Administrator',
]

export type Action =
  | 'exception.assign'
  | 'exception.comment'
  | 'exception.requestVendor'
  | 'exception.escalate'
  | 'exception.resolve'
  | 'invoice.approve'
  | 'invoice.return'
  | 'attendance.approve'
  | 'report.export'
  | 'admin.manage'
  | 'vendor.respond'

const ALLOW: Record<Role, Action[] | '*'> = {
  'Senior Management': ['exception.comment', 'exception.escalate', 'report.export'],
  HR: ['exception.assign', 'exception.comment', 'exception.requestVendor', 'exception.escalate', 'exception.resolve', 'attendance.approve', 'report.export'],
  Finance: ['exception.comment', 'invoice.approve', 'invoice.return', 'report.export'],
  'Compliance Officer': ['exception.assign', 'exception.comment', 'exception.requestVendor', 'exception.escalate', 'exception.resolve', 'report.export'],
  'Division Officer': ['exception.comment', 'exception.escalate', 'attendance.approve', 'report.export'],
  'Site Officer': ['exception.comment', 'attendance.approve'],
  'Vendor User': ['exception.comment', 'vendor.respond'],
  Auditor: ['report.export'],
  'System Administrator': ['admin.manage'],
}

export function can(role: Role, action: Action) {
  const a = ALLOW[role]
  return a === '*' || a.includes(action)
}

/** Navigation keys hidden per role (UI convenience, not enforcement). */
const HIDDEN: Partial<Record<Role, string[]>> = {
  'Vendor User': ['/', '/analytics', '/vendors', '/contracts', '/audit', '/admin/users', '/admin/masters', '/admin/integrations', '/settings', '/reports'],
  'Site Officer': ['/analytics', '/invoices', '/audit', '/admin/users', '/admin/integrations', '/settings'],
  'Division Officer': ['/audit', '/admin/users', '/admin/integrations', '/settings'],
  Finance: ['/admin/users', '/admin/integrations'],
  HR: ['/admin/integrations'],
  'Compliance Officer': ['/admin/integrations'],
  'Senior Management': ['/admin/users', '/admin/integrations', '/admin/masters'],
}
export const canSee = (role: Role, path: string) => !(HIDDEN[role] ?? []).includes(path)

/** Data scope enforced (in production: server-side) per role. */
export function roleScope(role: Role): Partial<GlobalFilters> & { label: string | null } {
  switch (role) {
    case 'Vendor User':
      return { vendors: [HERO_VENDOR_ID], label: 'Vendor scope: ABC Manpower Services Pvt. Ltd.' }
    case 'Division Officer':
      return { divisions: [HERO_DIVISION_ID], label: 'Division scope: Bhopal City Division I' }
    case 'Site Officer':
      return { locations: [HERO_LOCATION_ID], label: 'Site scope: single location' }
    default:
      return { label: null }
  }
}

export const DEMO_USER: Record<Role, string> = {
  'Senior Management': 'Director (Commercial)',
  HR: 'V. Chaturvedi',
  Finance: 'M. Agrawal',
  'Compliance Officer': 'N. Bhargava',
  'Division Officer': 'A. R. Khan',
  'Site Officer': 'S. K. Malviya',
  'Vendor User': 'ABC Manpower desk',
  Auditor: 'R. Iyer',
  'System Administrator': 'IT Admin',
}
