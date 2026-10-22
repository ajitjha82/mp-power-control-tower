import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowRight } from 'lucide-react'
import type { Invoice } from '@/types'
import { PageHeader, Section } from '@/components/layout/page'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { KpiSkeleton } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { Button, NativeSelect } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { simulate } from '@/services/api'
import { invoiceKpis, listInvoices } from '@/services/entities'
import { HERO_INVOICE_ID } from '@/data/invoices'
import { contractById, vendorById } from '@/data/vendors'
import { monthLabel } from '@/data/config'
import { cn, fmtINR, fmtNum } from '@/lib/utils'
import { useEffect } from 'react'

const STATUSES = ['Submitted', 'Under Scrutiny', 'Blocked', 'Approved', 'Payment Pending', 'Paid']

export default function InvoicesPage() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const [status, setStatus] = useUrlParam('status')
  const [vendor, setVendor] = useUrlParam('vendor')
  const [month, setMonth] = useUrlParam('month')
  const [hero] = useUrlParam('hero')
  useEffect(() => {
    if (hero) navigate(`/invoices/${HERO_INVOICE_ID()}`, { replace: true })
  }, [hero, navigate])
  const t = useTableState({ sort: { id: 'ageingDays', desc: true } })
  const kpis = useQuery({ queryKey: ['inv-kpi', ...key], queryFn: () => simulate(() => invoiceKpis(filters)) })
  const list = useQuery({ queryKey: ['inv-list', ...key, t.request, status, vendor, month], queryFn: () => listInvoices(filters, { ...t.request, status, vendor, month }) })

  const columns = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Invoice No.', cell: ({ getValue }) => <span className="font-medium text-secondary">{getValue<string>()}</span> },
      { accessorKey: 'vendorId', header: 'Vendor', cell: ({ getValue }) => vendorById.get(getValue<string>())!.shortName },
      { accessorKey: 'contractId', header: 'Contract', enableSorting: false, meta: { hideBelow: 'xl' }, cell: ({ getValue }) => <span className="text-xs">{contractById.get(getValue<string>())!.number}</span> },
      { accessorKey: 'billingMonth', header: 'Billing Month', meta: { hideBelow: 'md' }, cell: ({ getValue }) => monthLabel(getValue<string>(), true) },
      { accessorKey: 'employees', header: 'Employees', meta: { align: 'right', hideBelow: 'lg' }, cell: ({ getValue }) => fmtNum(getValue<number>()) },
      { accessorKey: 'wageAmount', header: 'Wage Amount', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => fmtINR(getValue<number>(), { compact: true }) },
      { accessorKey: 'serviceCharge', header: 'Service Charge', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => fmtINR(getValue<number>(), { compact: true }) },
      { accessorKey: 'tax', header: 'Tax', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => fmtINR(getValue<number>(), { compact: true }) },
      { accessorKey: 'adjustments', header: 'Adjustments', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => (getValue<number>() ? fmtINR(getValue<number>(), { compact: true }) : '—') },
      { accessorKey: 'amount', header: 'Invoice Amount', meta: { align: 'right' }, cell: ({ getValue }) => <span className="font-medium">{fmtINR(getValue<number>(), { compact: true })}</span> },
      { accessorKey: 'complianceStatus', header: 'Compliance Status', meta: { hideBelow: 'lg' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} size="xs" /> },
      { accessorKey: 'stage', header: 'Workflow Stage', meta: { hideBelow: 'md' }, cell: ({ getValue }) => <span className="text-xs">{getValue<string>()}</span> },
      { accessorKey: 'ageingDays', header: 'Ageing', meta: { align: 'right', hideBelow: 'sm' }, cell: ({ row }) => <span className={cn(row.original.status !== 'Paid' && row.original.ageingDays > 12 && 'font-semibold text-destructive')}>{row.original.ageingDays}d</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} size="xs" /> },
      { id: 'actions', header: 'Action', enableSorting: false, enableHiding: false, cell: () => <Button size="xs" variant="ghost">Open <ArrowRight /></Button> },
    ],
    [],
  )

  const k = kpis.data
  const pick = (s: string | null) => setStatus(status === s ? null : s)
  return (
    <div className="space-y-5">
      <PageHeader title="Invoice Control" subtitle="Vendor invoices pass a compliance gate (attendance, master, wage, salary, PF, ESI, documents) before approval. Vendor invoice payment is separate from employee salary payment." />
      {k ? (
        <KpiGrid className="xl:grid-cols-7">
          <KpiCard label="Invoices Submitted" value={fmtNum(k.submitted)} secondary="current billing month" onClick={() => pick(null)} />
          <KpiCard label="Under Scrutiny" value={fmtNum(k.underScrutiny)} tone="info" onClick={() => pick('Under Scrutiny')} />
          <KpiCard label="Blocked" value={fmtNum(k.blocked)} tone="destructive" secondary={fmtINR(k.blockedValue, { compact: true })} onClick={() => pick('Blocked')} tooltip="Failed one or more blocking checks of the compliance gate." />
          <KpiCard label="Approved" value={fmtNum(k.approved)} tone="success" onClick={() => pick('Approved')} />
          <KpiCard label="Payment Pending" value={fmtNum(k.paymentPending)} tone="info" onClick={() => pick('Payment Pending')} />
          <KpiCard label="Paid" value={fmtNum(k.paid)} tone="success" onClick={() => pick('Paid')} />
          <KpiCard label="Total Invoice Value" value={fmtINR(k.totalValue, { compact: true })} secondary="current billing month" />
        </KpiGrid>
      ) : (
        <KpiSkeleton count={7} />
      )}
      <Section title="Invoices" bodyClassName="p-0">
        <DataTable
          caption="Vendor invoices"
          columns={columns}
          result={list.data}
          state={t}
          isPending={list.isPending}
          isFetching={list.isFetching}
          error={list.error}
          onRetry={() => list.refetch()}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/invoices/${r.id}`)}
          searchPlaceholder="Search invoice no., vendor, contract…"
          emptyTitle="No invoices match the current criteria."
          exportName="invoices"
          rowClassName={(r) => (r.status === 'Blocked' ? 'bg-destructive-soft/30' : undefined)}
          toolbar={
            <>
              <NativeSelect aria-label="Status" value={status ?? ''} onChange={(e) => setStatus(e.target.value || null)} className="h-8 text-xs">
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </NativeSelect>
              <NativeSelect aria-label="Billing month" value={month ?? ''} onChange={(e) => setMonth(e.target.value || null)} className="h-8 text-xs">
                <option value="">All months</option>
                {['2026-09', '2026-08', '2026-07'].map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </NativeSelect>
              {vendor && (
                <Button size="xs" variant="outline" onClick={() => setVendor(null)}>
                  Vendor: {vendorById.get(vendor)?.shortName} ✕
                </Button>
              )}
            </>
          }
        />
      </Section>
    </div>
  )
}
