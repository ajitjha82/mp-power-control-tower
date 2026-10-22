import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowUpRight, CheckCircle2, Eye, MessageSquare, Send, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button, Label, NativeSelect, Textarea } from '@/components/ui/primitives'
import { Dialog, DialogContent, Tip } from '@/components/ui/overlays'
import { AuthNotice } from './states'
import { can, type Action } from '@/lib/rbac'
import { useUI } from '@/store/ui'

type Kind = 'assign' | 'clarify' | 'comment' | 'review' | 'escalate' | 'resolve'
const DEF: Record<Kind, { label: string; icon: LucideIcon; action: Action; consequential: boolean; verb: string }> = {
  assign: { label: 'Assign', icon: UserPlus, action: 'exception.assign', consequential: false, verb: 'assigned' },
  clarify: { label: 'Request vendor response', icon: Send, action: 'exception.requestVendor', consequential: false, verb: 'sent to vendor for clarification' },
  comment: { label: 'Add comment', icon: MessageSquare, action: 'exception.comment', consequential: false, verb: 'commented' },
  review: { label: 'Mark under review', icon: Eye, action: 'exception.assign', consequential: false, verb: 'marked under review' },
  escalate: { label: 'Escalate', icon: ArrowUpRight, action: 'exception.escalate', consequential: true, verb: 'escalated' },
  resolve: { label: 'Resolve', icon: CheckCircle2, action: 'exception.resolve', consequential: true, verb: 'resolved' },
}
const OFFICERS = ['N. Bhargava (Compliance)', 'S. Qureshi (Compliance)', 'T. Awasthi (Compliance)', 'V. Chaturvedi (HR)', 'P. Shrivastava (Contract Cell)', 'A. R. Khan (Division)']

const schema = z.object({
  assignee: z.string().optional(),
  note: z.string().trim().min(10, 'Please provide at least 10 characters for the audit record.').max(500),
})
type FormValues = z.infer<typeof schema>

/** Exception workflow actions, gated by (simulated) role permissions. */
export function ExceptionActions({ recordId, kinds = ['assign', 'clarify', 'comment', 'review', 'escalate', 'resolve'], size = 'sm' }: { recordId: string; kinds?: Kind[]; size?: 'sm' | 'xs' }) {
  const role = useUI((s) => s.role)
  const [open, setOpen] = useState<Kind | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { assignee: OFFICERS[0], note: '' } })
  const def = open ? DEF[open] : null

  const submit = form.handleSubmit((v) => {
    const d = DEF[open!]
    toast.success(`${recordId} ${d.verb}${open === 'assign' ? ` to ${v.assignee}` : ''}`, {
      description: 'Simulated. In production: authorised server-side, persisted, and written to the audit trail with your reason.',
    })
    setOpen(null)
    form.reset()
  })

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => {
          const d = DEF[k]
          const allowed = can(role, d.action)
          const btn = (
            <Button key={k} size={size} variant={k === 'resolve' ? 'secondary' : k === 'escalate' ? 'outline' : 'outline'} disabled={!allowed} onClick={() => setOpen(k)}>
              <d.icon /> {d.label}
            </Button>
          )
          return allowed ? (
            btn
          ) : (
            <Tip key={k} content={`Not permitted for the ${role} role (demo RBAC).`}>
              <span tabIndex={0}>{btn}</span>
            </Tip>
          )
        })}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {def && (
          <DialogContent title={`${def.label} — ${recordId}`} description={def.consequential ? 'This is a consequential action and requires confirmation.' : undefined}>
            <form onSubmit={submit} className="space-y-3 px-5 py-4">
              {open === 'assign' && (
                <div className="space-y-1">
                  <Label htmlFor="assignee">Assign to</Label>
                  <NativeSelect id="assignee" className="w-full" {...form.register('assignee')}>
                    {OFFICERS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </NativeSelect>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="note">{open === 'comment' ? 'Comment' : 'Reason / note (recorded in audit trail)'}</Label>
                <Textarea id="note" aria-invalid={!!form.formState.errors.note} {...form.register('note')} placeholder={open === 'clarify' ? 'Describe the evidence the vendor must provide…' : 'Explain the basis for this action…'} />
                {form.formState.errors.note && <p className="text-xs text-destructive">{form.formState.errors.note.message}</p>}
              </div>
              <AuthNotice />
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant={def.consequential ? 'secondary' : 'default'}>
                  Confirm {def.label.toLowerCase()}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
