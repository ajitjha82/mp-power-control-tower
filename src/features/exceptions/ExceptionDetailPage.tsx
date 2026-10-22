import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, FileCheck2, MessageSquare, Paperclip } from 'lucide-react'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { AuthNotice, BlockSkeleton, EmptyState, ErrorState } from '@/components/feedback/states'
import { SeverityBadge, StatusBadge } from '@/components/feedback/status'
import { ExceptionActions } from '@/components/feedback/ExceptionActions'
import { Timeline } from '@/components/feedback/Timeline'
import { Button } from '@/components/ui/primitives'
import { getExceptionDetail } from '@/services/entities'
import { divisionById } from '@/data/org'
import { cn, fmtINR } from '@/lib/utils'

export default function ExceptionDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['exc-detail', id], queryFn: () => getExceptionDetail(id), placeholderData: undefined })
  if (q.isPending) return <div className="space-y-4"><BlockSkeleton rows={4} className="rounded-lg border bg-card" /><BlockSkeleton rows={8} className="rounded-lg border bg-card" /></div>
  if (q.isError) return <div className="rounded-lg border bg-card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
  if (!q.data) return <EmptyState title="Exception not found" description={`No open exception ${id}.`} />
  const { exception: e, employee, vendor, contract, pf, esi, salary, wage, timeline, evidence, rootCause, relatedInvoice } = q.data
  const over = e.ageDays - e.slaDays

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>
      <PageHeader
        eyebrow={`${e.category} exception`}
        title={`${e.id} · ${e.type}`}
        subtitle={e.description}
        actions={<ExceptionActions recordId={e.id} />}
      />
      <AuthNotice>Assign, escalate and resolve actions are simulated. In production each requires server-side authorisation, captures a reason, and is written to the immutable audit trail.</AuthNotice>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Summary" className="xl:col-span-2">
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field label="Severity" value={<SeverityBadge severity={e.severity} />} />
            <Field label="Status" value={<StatusBadge status={e.status} size="xs" />} />
            <Field label="Owner" value={`${e.owner} (${e.ownerRole})`} />
            <Field label="Created" value={e.createdAt} mono />
            <Field label="Age" value={`${e.ageDays} days`} />
            <Field label="SLA" value={<span className={cn('font-medium', over > 0 ? 'text-destructive' : 'text-success')}>{e.slaDays} days · {over > 0 ? `breached by ${over}d` : `${-over}d remaining`}</span>} />
            <Field label="Financial impact" value={<span className="num font-semibold text-destructive">{e.amountAtRisk ? fmtINR(e.amountAtRisk) : '—'}</span>} />
            <Field label="Division" value={divisionById.get(e.divisionId ?? '')?.name ?? '—'} />
          </dl>
          <div className="mt-4 rounded-md border bg-muted/40 p-3">
            <div className="eyebrow mb-1">Root cause (rule-based classification)</div>
            <p className="text-sm">{rootCause}</p>
          </div>
        </Section>

        <Section title="Affected parties">
          <dl className="space-y-3">
            {employee && <Field label="Employee" value={<Link to={`/employees/${employee.id}`} className="text-secondary hover:underline">{employee.name} · {employee.id}</Link>} />}
            <Field label="Vendor" value={<Link to={`/vendors/${vendor.id}`} className="text-secondary hover:underline">{vendor.name}</Link>} />
            {contract && <Field label="Contract" value={contract.number} />}
            {relatedInvoice && (
              <Field
                label="Linked invoice"
                value={
                  <Link to={`/invoices/${relatedInvoice.id}`} className="inline-flex items-center gap-2 text-secondary hover:underline">
                    {relatedInvoice.number} <StatusBadge status={relatedInvoice.status} size="xs" />
                  </Link>
                }
              />
            )}
          </dl>
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Resolution timeline" description="Vendor submission → reconciliation → exception → vendor response → MP Power review → resolution" className="xl:col-span-2">
          <Timeline events={timeline} />
        </Section>
        <div className="space-y-4">
          {(pf || esi || salary) && (
            <Section title="Financial detail">
              <dl className="grid grid-cols-2 gap-3">
                {wage && <Field label="Payable days" value={wage.payableDays} mono />}
                {wage && <Field label="Gross wage" value={fmtINR(wage.grossEarned)} mono />}
                {pf && (
                  <>
                    <Field label="Expected PF" value={fmtINR(pf.expectedEmployee + pf.expectedEmployer)} mono />
                    <Field label="Reported PF" value={fmtINR(pf.reportedEmployee + pf.reportedEmployer)} mono />
                    <Field label="Difference" value={<span className="num text-destructive">{fmtINR(pf.difference)}</span>} />
                    <Field label="UAN" value={pf.uanMasked} mono />
                  </>
                )}
                {esi && (
                  <>
                    <Field label="Expected ESI" value={fmtINR(esi.expectedEmployee + esi.expectedEmployer)} mono />
                    <Field label="Reported ESI" value={fmtINR(esi.reportedEmployee + esi.reportedEmployer)} mono />
                    <Field label="Difference" value={<span className="num text-destructive">{fmtINR(esi.difference)}</span>} />
                  </>
                )}
                {salary && (
                  <>
                    <Field label="Net payable" value={fmtINR(salary.netPayable)} mono />
                    <Field label="Reported paid" value={fmtINR(salary.reportedPaid)} mono />
                    <Field label="Delay" value={salary.delayDays ? `${salary.delayDays} days` : '—'} />
                  </>
                )}
              </dl>
            </Section>
          )}
          <Section title="Evidence" bodyClassName="p-0">
            <ul className="divide-y text-sm">
              {evidence.map((ev) => (
                <li key={ev.name} className="flex items-center gap-2 px-4 py-2.5">
                  {ev.kind === 'System' ? <FileCheck2 className="size-4 text-muted-foreground" aria-hidden /> : <Paperclip className="size-4 text-muted-foreground" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">{ev.name}</span>
                  <span className="text-2xs text-muted-foreground">{ev.status}</span>
                </li>
              ))}
            </ul>
            <p className="border-t px-4 py-2 text-2xs text-muted-foreground">Uploaded challans alone are not accepted as employee-level proof.</p>
          </Section>
          <Section title="Comments" bodyClassName="p-0">
            <ul className="divide-y text-sm">
              <li className="px-4 py-2.5"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MessageSquare className="size-3.5" />{vendor.shortName} compliance desk</div><p className="mt-0.5">Supporting documents uploaded; requesting review.</p></li>
              <li className="px-4 py-2.5"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MessageSquare className="size-3.5" />{e.owner}</div><p className="mt-0.5">Cross-checking against employee-level ECR rows before closure.</p></li>
            </ul>
          </Section>
        </div>
      </div>
      {employee && (
        <Button variant="outline" asChild>
          <Link to={`/employees/${employee.id}`}>Open Employee 360 <ArrowRight /></Link>
        </Button>
      )}
    </div>
  )
}
