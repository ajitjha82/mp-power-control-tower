import { lazy, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/feedback/states'
import { canSee } from '@/lib/rbac'
import { useUI } from '@/store/ui'

// Route-level code splitting: each feature loads on demand.
const Overview = lazy(() => import('@/features/overview/OverviewPage'))
const Workforce = lazy(() => import('@/features/workforce/WorkforcePage'))
const Attendance = lazy(() => import('@/features/attendance/AttendancePage'))
const Compliance = lazy(() => import('@/features/compliance/CompliancePage'))
const PF = lazy(() => import('@/features/pf/PFPage'))
const ESI = lazy(() => import('@/features/esi/ESIPage'))
const Salary = lazy(() => import('@/features/salary/SalaryPage'))
const Vendors = lazy(() => import('@/features/vendors/VendorsPage'))
const Vendor360 = lazy(() => import('@/features/vendors/Vendor360Page'))
const Contracts = lazy(() => import('@/features/contracts/ContractsPage'))
const Invoices = lazy(() => import('@/features/invoices/InvoicesPage'))
const InvoiceDetail = lazy(() => import('@/features/invoices/InvoiceDetailPage'))
const Exceptions = lazy(() => import('@/features/exceptions/ExceptionsPage'))
const ExceptionDetail = lazy(() => import('@/features/exceptions/ExceptionDetailPage'))
const Employee360 = lazy(() => import('@/features/employees/Employee360Page'))
const Analytics = lazy(() => import('@/features/analytics/AnalyticsPage'))
const Ask = lazy(() => import('@/features/ask/AskPage'))
const Reports = lazy(() => import('@/features/reports/ReportsPage'))
const Audit = lazy(() => import('@/features/audit/AuditPage'))
const Users = lazy(() => import('@/features/admin/UsersPage'))
const Masters = lazy(() => import('@/features/admin/MastersPage'))
const Integrations = lazy(() => import('@/features/admin/IntegrationsPage'))
const Settings = lazy(() => import('@/features/admin/SettingsPage'))

function Guard({ path, children }: { path: string; children: ReactNode }) {
  const role = useUI((s) => s.role)
  if (canSee(role, path)) return <>{children}</>
  if (path === '/' && role === 'Vendor User') return <Navigate to="/vendors/V-001" replace />
  return (
    <div className="rounded-lg border bg-card">
      <EmptyState
        title={`Not available for the ${role} role`}
        description="This module is outside the selected role's permissions. In production, the API would also refuse the request."
        action={<ShieldOff className="mt-2 size-5 text-muted-foreground" />}
      />
    </div>
  )
}

function NotFound() {
  const { pathname } = useLocation()
  return <EmptyState title="Page not found" description={`No page exists at ${pathname}.`} />
}

export default function App() {
  const g = (path: string, el: ReactNode) => <Guard path={path}>{el}</Guard>
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={g('/', <Overview />)} />
        <Route path="workforce" element={g('/workforce', <Workforce />)} />
        <Route path="attendance" element={g('/attendance', <Attendance />)} />
        <Route path="compliance" element={g('/compliance', <Compliance />)} />
        <Route path="pf" element={g('/pf', <PF />)} />
        <Route path="esi" element={g('/esi', <ESI />)} />
        <Route path="salary" element={g('/salary', <Salary />)} />
        <Route path="vendors" element={g('/vendors', <Vendors />)} />
        <Route path="vendors/:id" element={<Vendor360 />} />
        <Route path="contracts" element={g('/contracts', <Contracts />)} />
        <Route path="invoices" element={g('/invoices', <Invoices />)} />
        <Route path="invoices/:id" element={g('/invoices', <InvoiceDetail />)} />
        <Route path="exceptions" element={g('/exceptions', <Exceptions />)} />
        <Route path="exceptions/:id" element={g('/exceptions', <ExceptionDetail />)} />
        <Route path="employees/:id" element={<Employee360 />} />
        <Route path="analytics" element={g('/analytics', <Analytics />)} />
        <Route path="ask" element={g('/ask', <Ask />)} />
        <Route path="reports" element={g('/reports', <Reports />)} />
        <Route path="audit" element={g('/audit', <Audit />)} />
        <Route path="admin/users" element={g('/admin/users', <Users />)} />
        <Route path="admin/masters" element={g('/admin/masters', <Masters />)} />
        <Route path="admin/integrations" element={g('/admin/integrations', <Integrations />)} />
        <Route path="settings" element={g('/settings', <Settings />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
