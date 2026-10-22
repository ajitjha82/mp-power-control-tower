import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { ComplianceException, ExceptionCategory, Severity } from '@/types'
import { PageHeader, Section } from '@/components/layout/page'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { KpiSkeleton } from '@/components/feedback/states'
import { SeverityBadge, StatusBadge } from '@/components/feedback/status'
import { ExceptionActions } from '@/components/feedback/ExceptionActions'
import { BarList, C } from '@/components/charts/chart-kit'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { NativeSelect, Button } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { simulate } from '@/services/api'
import { type ExceptionParams, exceptionKpis, filterExceptions, listExceptions } from '@/services/entities'
import { DIVISIONS, divisionById } from '@/data/org'
import { VENDORS, vendorById } from '@/data/vendors'
import { employeeName, idxFromEmpId } from '@/data/roster'
import { cn, fmtINR, fmtNum } from '@/lib/utils'

const CATEGORIES: ExceptionCategory[] = ['Attendance', 'Wage', 'PF', 'ESI', 'Salary', 'Contract', 'Invoice', 'Employee Master', 'Deployment', 'Document']
const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low']
const STATUSES = ['Open', 'Awaiting Vendor', 'Vendor Responded', 'Under Review', 'Escalated']
const OWNERS = ['N. Bhargava', 'S. Qureshi', 'T. Awasthi', 'K. Dwivedi', 'P. Shrivastava', 'V. Chaturvedi', 'A. Kulkarni', 'S. K. Malviya', 'R. Pathak', 'J. Baghel', 'A. R. Khan', 'M. Agrawal']

export default function ExceptionsPage() {
  const { filters, key } = useScope()
  const navigate = useNavigate()
  const [category, setCategory] = useUrlParam('category')
  const [severity, setSeverity] = useUrlParam('severity')
  const [status, setStatus] = useUrlParam('status')
  const [vendor, setVendor] = useUrlParam('vendor')
  const [division, setDivision] = useUrlParam('division')
  const [owner, setOwner] = useUrlParam('owner')
  const [ageing, setAgeing] = useUrlParam('ageing')
  const [overdue, setOverdue] = useUrlParam('overdue')
  const t = useTableState({ sort: { id: 'severity', desc: true } })
  const params: Omit<ExceptionParams, 'page' | 'pageSize'> = {
    category: category as ExceptionCategory | null,
    severity: severity as Severity | null,
    status,
    vendor,
    division,
    owner,
    ageing: ageing as ExceptionParams['ageing'],
    overdue: overdue === '1',
  }
  const kpis = useQuery({ queryKey: ['exc-kpi', ...key], queryFn: () => simulate(() => exceptionKpis(filters)) })
  const list = useQuery({ queryKey: ['exc-list', ...key, t.request, params], queryFn: () => listExceptions(filters, { ...t.request, ...params }) })

  const columns = useMemo<ColumnDef<ComplianceException, unknown>[]>(
    () => [
      { accessorKey: 'id', header: 'Exception ID', cell: ({ getValue }) => <span className="num font-mono text-xs text-secondary">{getValue<string>()}</span> },
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <div><div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{row.original.category}</div><div className="text-sm">{row.original.type}</div></div> },
      {
        accessorKey: 'employeeId',
        header: 'Employee',
        enableSorting: false,
        meta: { hideBelow: 'md' },
        cell: ({ getValue }) => {
          const id = getValue<string | null>()
          return id ? <Link to={`/employees/${id}`} onClick={(e) => e.stopPropagation()} className="hover:underline"><div className="text-sm">{employeeName(idxFromEmpId(id))}</div><div className="num font-mono text-2xs text-muted-foreground">{id}</div></Link> : <span className="text-muted-foreground">—</span>
        },
      },
      { accessorKey: 'vendorId', header: 'Vendor', meta: { hideBelow: 'lg' }, cell: ({ getValue }) => vendorById.get(getValue<string>())!.shortName },
      { accessorKey: 'divisionId', header: 'Division', meta: { hideBelow: 'xl' }, cell: ({ getValue }) => <span className="text-xs">{divisionById.get(getValue<string>() ?? '')?.name ?? '—'}</span> },
      { accessorKey: 'description', header: 'Description', enableSorting: false, meta: { hideBelow: 'xl' }, cell: ({ getValue }) => <span className="block max-w-[260px] truncate text-xs text-muted-foreground" title={getValue<string>()}>{getValue<string>()}</span> },
      { accessorKey: 'amountAtRisk', header: 'Amount at Risk', meta: { align: 'right', hideBelow: 'sm' }, cell: ({ getValue }) => (getValue<number>() ? fmtINR(getValue<number>(), { compact: true }) : '—') },
      { accessorKey: 'severity', header: 'Severity', cell: ({ getValue }) => <SeverityBadge severity={getValue<Severity>()} /> },
      { accessorKey: 'owner', header: 'Owner', meta: { hideBelow: 'lg' }, cell: ({ row }) => <div className="text-xs"><div>{row.original.owner}</div><div className="text-muted-foreground">{row.original.ownerRole}</div></div> },
      { accessorKey: 'createdAt', header: 'Created', meta: { hideBelow: 'xl' }, cell: ({ getValue }) => <span className="num text-xs">{getValue<string>()}</span> },
      { accessorKey: 'ageDays', header: 'Age', meta: { align: 'right' }, cell: ({ getValue }) => `${getValue<number>()}d` },
      { id: 'sla', header: 'SLA', meta: { hideBelow: 'md' }, cell: ({ row }) => { const over = row.original.ageDays - row.original.slaDays; return <span className={cn('text-xs font-medium', over > 0 ? 'text-destructive' : 'text-success')}>{over > 0 ? `Breached +${over}d` : `${-over}d left`}</span> } },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} size="xs" /> },
    ],
    [],
  )

  const k = kpis.data
  const reset = () => [setCategory, setSeverity, setStatus, setVendor, setDivision, setOwner, setAgeing, setOverdue].forEach((f) => f(null))
  const anyFilter = [category, severity, status, vendor, division, owner, ageing, overdue].some(Boolean)

  return (
    <div className="space-y-5">
      <PageHeader title="Exception Management Centre" subtitle="Every exception has an owner, an SLA and an auditable resolution trail." />
      {k ? (
        <KpiGrid className="xl:grid-cols-6">
          <KpiCard label="Open" value={fmtNum(k.open)} secondary={fmtINR(k.amountAtRisk, { compact: true }) + ' at risk'} onClick={reset} />
          <KpiCard label="Critical" value={fmtNum(k.critical)} tone="destructive" onClick={() => setSeverity('Critical')} />
          <KpiCard label="High" value={fmtNum(k.high)} tone="destructive" onClick={() => setSeverity('High')} />
          <KpiCard label="Medium" value={fmtNum(k.medium)} tone="warning" onClick={() => setSeverity('Medium')} />
          <KpiCard label="Overdue (SLA breached)" value={fmtNum(k.overdue)} tone="warning" onClick={() => setOverdue('1')} />
          <KpiCard label="Resolved This Month" value={fmtNum(k.resolvedThisMonth)} tone="success" tooltip="Closed with evidence during the current month." />
        </KpiGrid>
      ) : (
        <KpiSkeleton count={6} />
      )}
      <div className="grid gap-4 xl:grid-cols-4">
        <Section title="By category" description="Click to filter" className="xl:col-span-1">
          {k ? (
            <>
              <BarList items={k.byCategory.map((c) => ({ key: c.category, label: c.category, value: c.count, color: C.c1 }))} selected={category} onSelect={(c) => setCategory(category === c ? null : c)} />
              <h3 className="eyebrow mb-1 mt-4">Ageing</h3>
              <BarList
                items={k.ageing.map((a, i) => ({ key: ['0-7', '8-15', '16-30', '30+'][i]!, label: a.bucket, value: a.count, color: i >= 2 ? C.danger : C.warning }))}
                selected={ageing}
                onSelect={(a) => setAgeing(ageing === a ? null : a)}
              />
            </>
          ) : null}
        </Section>
        <Section title="Exception register" className="xl:col-span-3" bodyClassName="p-0">
          <DataTable
            caption="Exception register"
            columns={columns}
            result={list.data}
            state={t}
            isPending={list.isPending}
            isFetching={list.isFetching}
            error={list.error}
            onRetry={() => list.refetch()}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/exceptions/${r.id}`)}
            searchPlaceholder="Search ID, employee, vendor, type…"
            exportName="exceptions"
            exportAll={() => simulate(() => filterExceptions(filters, { ...t.request, ...params }), 120)}
            selectable
            bulkActions={(ids) => <ExceptionActions recordId={`${ids.length} exceptions`} kinds={['assign', 'escalate']} size="xs" />}
            emptyTitle="No exceptions match the current filters."
            toolbar={
              <div className="flex flex-wrap items-center gap-1.5">
                <NativeSelect aria-label="Type" value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)} className="h-8 text-xs">
                  <option value="">All types</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </NativeSelect>
                <NativeSelect aria-label="Severity" value={severity ?? ''} onChange={(e) => setSeverity(e.target.value || null)} className="h-8 text-xs">
                  <option value="">All severities</option>
                  {SEVERITIES.map((c) => <option key={c}>{c}</option>)}
                </NativeSelect>
                <NativeSelect aria-label="Status" value={status ?? ''} onChange={(e) => setStatus(e.target.value || null)} className="h-8 text-xs">
                  <option value="">All statuses</option>
                  {STATUSES.map((c) => <option key={c}>{c}</option>)}
                </NativeSelect>
                <NativeSelect aria-label="Vendor" value={vendor ?? ''} onChange={(e) => setVendor(e.target.value || null)} className="h-8 max-w-[150px] text-xs">
                  <option value="">All vendors</option>
                  {VENDORS.map((v) => <option key={v.id} value={v.id}>{v.shortName}</option>)}
                </NativeSelect>
                <NativeSelect aria-label="Division" value={division ?? ''} onChange={(e) => setDivision(e.target.value || null)} className="h-8 max-w-[150px] text-xs">
                  <option value="">All divisions</option>
                  {DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelect>
                <NativeSelect aria-label="Owner" value={owner ?? ''} onChange={(e) => setOwner(e.target.value || null)} className="h-8 max-w-[140px] text-xs">
                  <option value="">All owners</option>
                  {OWNERS.map((o) => <option key={o}>{o}</option>)}
                </NativeSelect>
                {overdue && <Button size="xs" variant="outline" onClick={() => setOverdue(null)}>Overdue only ✕</Button>}
                {anyFilter && <Button size="xs" variant="ghost" onClick={reset}>Clear</Button>}
              </div>
            }
          />
        </Section>
      </div>
    </div>
  )
}
