import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, CheckCircle2, CircleDashed, Clock, Eye, ShieldCheck, Users, XCircle } from 'lucide-react'
import type { GateCheck, WorkflowStage } from '@/types'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { AuthNotice, BlockSkeleton, EmptyState, ErrorState } from '@/components/feedback/states'
import { StatusBadge } from '@/components/feedback/status'
import { Button, Label, Textarea } from '@/components/ui/primitives'
import { Dialog, DialogContent, Tip } from '@/components/ui/overlays'
import { getInvoiceDetail } from '@/services/entities'
import { monthLabel } from '@/data/config'
import { can } from '@/lib/rbac'
import { useUI } from '@/store/ui'
import { cn, fmtINR, fmtNum } from '@/lib/utils'

const GATE_ICON = {
  pass: { icon: CheckCircle2, cls: 'text-success', label: 'Passed' },
  fail: { icon: XCircle, cls: 'text-destructive', label: 'FAILED' },
  warn: { icon: AlertTriangle, cls: 'text-warning', label: 'Warning (non-blocking)' },
  pending: { icon: CircleDashed, cls: 'text-muted-foreground', label: 'Pending' },
}

function GateRow({ c, contractId }: { c: GateCheck; contractId: string }) {
  const g = GATE_ICON[c.result]
  const drill = c.result === 'fail' && (c.key === 'pf' || c.key === 'esi' || c.key === 'salary')
  return (
    <li className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center', c.result === 'fail' && 'bg-destructive-soft/50')}>
      <g.icon className={cn('size-5 shrink-0', g.cls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{c.label}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide', c.result === 'fail' ? 'bg-destructive text-destructive-foreground' : c.result === 'pass' ? 'bg-success-soft text-success' : c.result === 'warn' ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>{g.label}</span>
        </div>
        <p className="text-xs text-muted-foreground">{c.detail}</p>
      </div>
      {drill && (
        <Button size="sm" variant="secondary" asChild>
          <Link to={c.key === 'salary' ? `/salary?status=issues` : `/${c.key}?contract=${contractId}&status=exception`}>
            <Users /> View {fmtNum(c.affectedEmployees)} employees
          </Link>
        </Button>
      )}
    </li>
  )
}

const STAGE_STYLE = {
  completed: { icon: CheckCircle2, ring: 'border-success bg-success-soft text-success', bar: 'bg-success', label: 'Completed' },
  current: { icon: Clock, ring: 'border-secondary bg-info-soft text-secondary', bar: 'bg-border', label: 'Current' },
  overdue: { icon: AlertTriangle, ring: 'border-destructive bg-destructive-soft text-destructive', bar: 'bg-border', label: 'Overdue' },
  pending: { icon: CircleDashed, ring: 'border-border bg-muted text-muted-foreground', bar: 'bg-border', label: 'Pending' },
}

function WorkflowViz({ stages }: { stages: WorkflowStage[] }) {
  return (
    <div className="overflow-x-auto pb-2 scrollbar-thin">
      <ol className="flex min-w-[860px] gap-0" aria-label="Invoice approval workflow">
        {stages.map((s, i) => {
          const st = STAGE_STYLE[s.state]
          return (
            <li key={s.name} className="relative flex-1 px-1">
              <div className="flex items-center">
                <span className={cn('z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2', st.ring)}>
                  <st.icon className="size-4" aria-hidden />
                </span>
                {i < stages.length - 1 && <span aria-hidden className={cn('h-0.5 flex-1', st.bar)} />}
              </div>
              <div className={cn('mt-2 rounded-md border p-2 text-xs', s.state === 'overdue' && 'border-destructive/40', s.state === 'current' && 'border-secondary/40')}>
                <div className="font-semibold">{s.name}</div>
                <div className="sr-only">{st.label}</div>
                <div className="truncate text-muted-foreground">{s.officer}</div>
                <div className="truncate text-2xs text-muted-foreground">{s.role}</div>
                <dl className="mt-1.5 space-y-0.5 text-2xs">
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Received</dt><dd className="num">{s.receivedAt ?? '—'}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Completed</dt><dd className="num">{s.completedAt ?? '—'}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Ageing / SLA</dt><dd className={cn('num', s.state === 'overdue' && 'font-semibold text-destructive')}>{s.receivedAt ? `${s.ageingDays}d / ${s.slaDays}d` : `— / ${s.slaDays}d`}</dd></div>
                </dl>
                {s.comment && <p className="mt-1.5 line-clamp-3 text-2xs italic text-muted-foreground">“{s.comment}”</p>}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-2 flex flex-wrap gap-4 text-2xs text-muted-foreground">
        {Object.entries(STAGE_STYLE).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1"><v.icon className={cn('size-3.5', v.ring.split(' ').pop())} />{v.label}</span>
        ))}
      </div>
    </div>
  )
}

export default function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const role = useUI((s) => s.role)
  const [confirm, setConfirm] = useState<'approve' | 'return' | null>(null)
  const [reason, setReason] = useState('')
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => getInvoiceDetail(id), placeholderData: undefined })

  if (q.isPending) return <div className="space-y-4"><BlockSkeleton rows={3} className="rounded-lg border bg-card" /><BlockSkeleton rows={8} className="rounded-lg border bg-card" /></div>
  if (q.isError) return <div className="rounded-lg border bg-card"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>
  if (!q.data) return <EmptyState title="Invoice not found" description={`No invoice ${id}.`} />
  if (role === 'Vendor User' && q.data.vendor.id !== 'V-001') return <EmptyState title="Outside your data scope" />

  const { invoice: inv, vendor, contract, gate, workflow, exception } = q.data
  const blocked = gate.result === 'Blocked'
  const canApprove = can(role, 'invoice.approve')

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>
      <PageHeader
        title={`Invoice ${inv.number}`}
        eyebrow={`Billing month · ${monthLabel(inv.billingMonth)}`}
        subtitle={<>Vendor <Link to={`/vendors/${vendor.id}`} className="text-secondary hover:underline">{vendor.name}</Link> · Contract {contract.number}</>}
        actions={
          <>
            {(['return', 'approve'] as const).map((a) => {
              const allowed = a === 'approve' ? canApprove && !blocked && inv.status !== 'Paid' : can(role, 'invoice.return') && inv.status !== 'Paid'
              const reasonTip = a === 'approve' && blocked ? 'Cannot approve: compliance gate failed.' : !can(role, a === 'approve' ? 'invoice.approve' : 'invoice.return') ? `Not permitted for the ${role} role.` : inv.status === 'Paid' ? 'Invoice already paid.' : ''
              const btn = (
                <Button key={a} size="sm" variant={a === 'approve' ? 'secondary' : 'outline'} disabled={!allowed} onClick={() => setConfirm(a)}>
                  {a === 'approve' ? <><ShieldCheck /> Approve</> : 'Return to vendor'}
                </Button>
              )
              return allowed ? btn : <Tip key={a} content={reasonTip}><span tabIndex={0}>{btn}</span></Tip>
            })}
          </>
        }
      />

      <section
        aria-live="polite"
        className={cn(
          'flex flex-col gap-3 rounded-lg border-2 p-4 md:flex-row md:items-center',
          blocked ? 'border-destructive bg-destructive-soft' : gate.result === 'Passed' ? 'border-success/50 bg-success-soft' : 'border-info/40 bg-info-soft',
        )}
      >
        {blocked ? <Ban className="size-9 shrink-0 text-destructive" aria-hidden /> : gate.result === 'Passed' ? <CheckCircle2 className="size-9 shrink-0 text-success" aria-hidden /> : <Eye className="size-9 shrink-0 text-info" aria-hidden />}
        <div className="flex-1">
          <div className="eyebrow">Compliance gate result</div>
          <div className={cn('text-2xl font-bold tracking-tight', blocked ? 'text-destructive' : gate.result === 'Passed' ? 'text-success' : 'text-info')}>
            {blocked ? 'INVOICE BLOCKED' : gate.result === 'Passed' ? 'GATE PASSED' : 'PROVISIONAL — gate not yet evaluated'}
          </div>
          {gate.reason && <p className="mt-0.5 text-sm"><b>Reason:</b> {gate.reason}.</p>}
          {!gate.evaluated && <p className="mt-0.5 text-xs text-muted-foreground">The formal gate is evaluated at the HR / Contract Cell stage; results below are a preview.</p>}
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <StatusBadge status={inv.status} />
          <span className="text-xs text-muted-foreground">Stage: {inv.stage} · {inv.ageingDays} days since submission</span>
          {exception && <Link to={`/exceptions/${exception.id}`} className="text-xs text-secondary hover:underline">Exception {exception.id}</Link>}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Compliance gate" description="All blocking checks must pass before the invoice can be approved" className="xl:col-span-2" bodyClassName="p-0">
          <ul className="divide-y">
            {gate.checks.map((c) => <GateRow key={c.key} c={c} contractId={inv.contractId} />)}
          </ul>
        </Section>
        <Section title="Invoice summary">
          <dl className="grid grid-cols-2 gap-3">
            <Field label="Employees billed" value={fmtNum(inv.employees)} mono />
            <Field label="Submitted" value={inv.submittedAt} mono />
            <Field label="Wage amount" value={fmtINR(inv.wageAmount)} mono />
            <Field label={`Service charge (${contract.serviceChargePct}%)`} value={fmtINR(inv.serviceCharge)} mono />
            <Field label="Tax (configured GST)" value={fmtINR(inv.tax)} mono />
            <Field label="Adjustments" value={fmtINR(inv.adjustments)} mono />
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t pt-3">
            <span className="text-sm font-medium">Invoice amount</span>
            <span className="num text-xl font-semibold">{fmtINR(inv.amount)}</span>
          </div>
          <p className="mt-3 text-2xs text-muted-foreground">Vendor invoice payment is released only after the gate passes. Employee salary credit is verified separately (Salary Monitoring).</p>
        </Section>
      </div>

      <Section title="Approval workflow" description="Vendor → Site Officer → Division → HR / Contract Cell → Finance → Competent Authority → Payment">
        <WorkflowViz stages={workflow} />
      </Section>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) { setConfirm(null); setReason('') } }}>
        {confirm && (
          <DialogContent title={confirm === 'approve' ? `Approve ${inv.number}?` : `Return ${inv.number} to vendor?`} description={`${vendor.shortName} · ${fmtINR(inv.amount)}`}>
            <form
              className="space-y-3 px-5 py-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (reason.trim().length < 10) return
                toast.success(confirm === 'approve' ? 'Approval recorded (simulated)' : 'Returned to vendor (simulated)', { description: 'Would be authorised server-side and written to the audit trail.' })
                setConfirm(null)
                setReason('')
              }}
            >
              <Label htmlFor="inv-reason">Reason (min. 10 characters, recorded in audit trail)</Label>
              <Textarea id="inv-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={reason.length > 0 && reason.trim().length < 10} />
              <AuthNotice />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button type="submit" variant="secondary" disabled={reason.trim().length < 10}>Confirm <ArrowRight /></Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
