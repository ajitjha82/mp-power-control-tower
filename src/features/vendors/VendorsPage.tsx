import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader, Section } from '@/components/layout/page'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { KpiSkeleton } from '@/components/feedback/states'
import { RiskBadge, pctTone, toneText } from '@/components/feedback/status'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { paginate, simulate } from '@/services/api'
import { type VendorRow, vendorRows } from '@/services/entities'
import { cn, fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import type { RiskLevel } from '@/types'

const pctCell = (v: number, good = 97, warn = 95) => <span className={cn('num', toneText[pctTone(v, good, warn)])}>{fmtPct(v)}</span>
const LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low']

export default function VendorsPage() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const [level, setLevel] = useUrlParam('risk')
  const t = useTableState({ sort: { id: 'riskScore', desc: true } })
  const all = useQuery({ queryKey: ['vendors', ...key], queryFn: () => simulate(() => vendorRows(filters)) })
  const rows = useMemo(() => (all.data ?? []).filter((v) => !level || v.riskLevel === level).filter((v) => !t.request.search || v.name.toLowerCase().includes(t.request.search.toLowerCase())), [all.data, level, t.request.search])
  const result = useMemo(() => (all.data ? paginate(rows, t.request) : undefined), [rows, t.request, all.data])

  const columns = useMemo<ColumnDef<VendorRow, unknown>[]>(
    () => [
      { accessorKey: 'name', header: 'Vendor', cell: ({ row }) => <div><div className="font-medium text-secondary">{row.original.shortName}</div><div className="text-2xs text-muted-foreground">{row.original.id} · {row.original.contracts} contracts</div></div> },
      { accessorKey: 'employees', header: 'Employees', meta: { align: 'right' }, cell: ({ getValue }) => fmtNum(getValue<number>()) },
      { accessorKey: 'attendancePct', header: 'Attendance %', meta: { align: 'right', hideBelow: 'lg' }, cell: ({ getValue }) => pctCell(getValue<number>(), 94, 92) },
      { accessorKey: 'pfPct', header: 'PF Compliance %', meta: { align: 'right' }, cell: ({ getValue }) => pctCell(getValue<number>()) },
      { accessorKey: 'esiPct', header: 'ESI Compliance %', meta: { align: 'right', hideBelow: 'md' }, cell: ({ getValue }) => pctCell(getValue<number>()) },
      { accessorKey: 'salaryPct', header: 'Salary Timeliness %', meta: { align: 'right', hideBelow: 'lg' }, cell: ({ getValue }) => pctCell(getValue<number>(), 98, 96) },
      { accessorKey: 'openExceptions', header: 'Open Exceptions', meta: { align: 'right', hideBelow: 'md' }, cell: ({ getValue }) => fmtNum(getValue<number>()) },
      { accessorKey: 'invoiceValue', header: 'Invoice Value', meta: { align: 'right', hideBelow: 'xl' }, cell: ({ getValue }) => fmtINR(getValue<number>(), { compact: true }) },
      { accessorKey: 'amountAtRisk', header: 'Amount at Risk', meta: { align: 'right', hideBelow: 'lg' }, cell: ({ getValue }) => fmtINR(getValue<number>(), { compact: true }) },
      { accessorKey: 'riskScore', header: 'Risk Score', meta: { align: 'right' }, cell: ({ getValue }) => <span className="num font-semibold">{getValue<number>()}</span> },
      { accessorKey: 'riskLevel', header: 'Risk Level', enableSorting: false, cell: ({ row }) => <RiskBadge level={row.original.riskLevel} /> },
    ],
    [],
  )

  const counts = LEVELS.map((l) => (all.data ?? []).filter((v) => v.riskLevel === l).length)
  return (
    <div className="space-y-5">
      <PageHeader
        title="Vendor Compliance & Risk"
        subtitle="Composite risk score (0–100) weighting PF, ESI, salary timeliness, attendance, exception density and blocked invoices. Weights are configurable; the score supports — not replaces — officer judgement."
      />
      {all.data ? (
        <KpiGrid className="xl:grid-cols-5">
          <KpiCard label="Vendors in scope" value={fmtNum(all.data.length)} secondary={`${fmtNum(all.data.reduce((a, v) => a + v.employees, 0))} employees`} onClick={() => setLevel(null)} />
          {LEVELS.map((l, i) => (
            <KpiCard key={l} label={`${l} risk`} value={fmtNum(counts[i]!)} tone={l === 'Critical' || l === 'High' ? 'destructive' : l === 'Medium' ? 'warning' : 'success'} onClick={() => setLevel(level === l ? null : l)} secondary={level === l ? 'filter applied' : 'click to filter'} />
          ))}
        </KpiGrid>
      ) : (
        <KpiSkeleton count={5} />
      )}
      <Section title="Vendor risk register" bodyClassName="p-0">
        <DataTable
          caption="Vendor compliance and risk"
          columns={columns}
          result={result}
          state={t}
          isPending={all.isPending}
          error={all.error}
          onRetry={() => all.refetch()}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/vendors/${r.id}`)}
          searchPlaceholder="Search vendor…"
          exportName="vendor-risk"
          exportAll={async () => rows}
          rowClassName={(r) => (r.riskLevel === 'Critical' ? 'bg-destructive-soft/30' : undefined)}
        />
      </Section>
    </div>
  )
}
