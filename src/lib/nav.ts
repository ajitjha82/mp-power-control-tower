import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck,
  ClipboardList,
  Database,
  FileSignature,
  FileText,
  Gauge,
  HeartPulse,
  History,
  Landmark,
  PlugZap,
  ReceiptIndianRupee,
  Settings,
  ShieldCheck,
  Siren,
  Sparkles,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  group: 'main' | 'admin'
  description?: string
}

export const NAV: NavItem[] = [
  { path: '/', label: 'Overview', icon: Gauge, group: 'main', description: 'Executive control tower' },
  { path: '/workforce', label: 'Workforce', icon: Users, group: 'main', description: 'Sanctioned vs deployed vs present' },
  { path: '/attendance', label: 'Attendance', icon: CalendarCheck, group: 'main', description: 'Attendance & exceptions' },
  { path: '/compliance', label: 'Compliance', icon: ShieldCheck, group: 'main', description: 'Statutory compliance control tower' },
  { path: '/pf', label: 'PF Compliance', icon: Landmark, group: 'main', description: 'Employee-level PF reconciliation' },
  { path: '/esi', label: 'ESI Compliance', icon: HeartPulse, group: 'main', description: 'Employee-level ESI reconciliation' },
  { path: '/salary', label: 'Salary Monitoring', icon: Wallet, group: 'main', description: 'Salary payment assurance' },
  { path: '/vendors', label: 'Vendors', icon: Building2, group: 'main', description: 'Vendor compliance & risk' },
  { path: '/contracts', label: 'Contracts', icon: FileSignature, group: 'main', description: 'Contracts & manpower' },
  { path: '/invoices', label: 'Invoices', icon: ReceiptIndianRupee, group: 'main', description: 'Invoice control & compliance gate' },
  { path: '/exceptions', label: 'Exceptions', icon: Siren, group: 'main', description: 'Unified exception management' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, group: 'main', description: 'Risk analytics & AI insights' },
  { path: '/ask', label: 'Ask Intelligence', icon: Sparkles, group: 'main', description: 'Conversational management intelligence' },
  { path: '/reports', label: 'Reports', icon: FileText, group: 'main', description: 'Management reports' },
  { path: '/admin/users', label: 'Users & Roles', icon: UserCog, group: 'admin' },
  { path: '/admin/masters', label: 'Masters', icon: Database, group: 'admin' },
  { path: '/admin/integrations', label: 'Integrations', icon: PlugZap, group: 'admin' },
  { path: '/audit', label: 'Audit Trail', icon: History, group: 'admin' },
  { path: '/settings', label: 'Settings', icon: Settings, group: 'admin' },
]

export const DETAIL_PARENTS: Array<[RegExp, string, string]> = [
  [/^\/employees\//, '/workforce', 'Employee 360'],
  [/^\/vendors\/.+/, '/vendors', 'Vendor 360'],
  [/^\/invoices\/.+/, '/invoices', 'Invoice'],
  [/^\/exceptions\/.+/, '/exceptions', 'Exception'],
]

export const ICONS = { Activity, ClipboardList }
