import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { FlaskConical, Monitor, Moon, Pencil, RotateCcw, Sun, UserCircle2 } from 'lucide-react'
import type { ExceptionCategory, WorkflowStageName } from '@/types'
import { statutoryConfig } from '@/data/config'
import { SLA_DAYS } from '@/data/exceptions'
import { STAGES, STAGE_SLA } from '@/data/invoices'
import { DEMO_USER, can, roleScope } from '@/lib/rbac'
import { useUI, type ThemePref } from '@/store/ui'
import { PageHeader, Section, Field } from '@/components/layout/page'
import { AuthNotice } from '@/components/feedback/states'
import { Button, Input, Label, NativeSelect, Textarea } from '@/components/ui/primitives'
import { Dialog, DialogContent } from '@/components/ui/overlays'
import { cn, initials } from '@/lib/utils'
import { GatedButton, Switch, fmtDate } from './shared'

const CONFIG_ROWS: Array<{ key: keyof typeof statutoryConfig; label: string; fmt: (v: number) => string }> = [
  { key: 'pfEmployeeRatePct', label: 'PF — employee contribution rate', fmt: (v) => `${v}%` },
  { key: 'pfEmployerRatePct', label: 'PF — employer contribution rate', fmt: (v) => `${v}%` },
  { key: 'pfWageCeiling', label: 'PF — wage ceiling (₹/month)', fmt: (v) => `₹${v.toLocaleString('en-IN')}` },
  { key: 'esiEmployeeRatePct', label: 'ESI — employee contribution rate', fmt: (v) => `${v}%` },
  { key: 'esiEmployerRatePct', label: 'ESI — employer contribution rate', fmt: (v) => `${v}%` },
  { key: 'esiWageCeiling', label: 'ESI — wage ceiling (₹/month)', fmt: (v) => `₹${v.toLocaleString('en-IN')}` },
  { key: 'gstRatePct', label: 'GST on service charge', fmt: (v) => `${v}%` },
  { key: 'salaryDueDayOfNextMonth', label: 'Salary due — day of following month', fmt: (v) => `Day ${v}` },
]

const APPROVERS = ['N. Bhargava (Compliance Officer)', 'M. Agrawal (Finance)', 'V. Chaturvedi (HR)', 'R. N. Saxena (Competent Authority)']

const pctField = (max: number) => z.number({ invalid_type_error: 'Enter a number.' }).min(0, 'Must be ≥ 0.').max(max, `Must be ≤ ${max}.`)
const configSchema = z
  .object({
    pfEmployeeRatePct: pctField(25),
    pfEmployerRatePct: pctField(25),
    pfWageCeiling: z.number({ invalid_type_error: 'Enter a number.' }).int('Whole rupees only.').min(1000, 'Must be ≥ 1,000.').max(100000, 'Must be ≤ 1,00,000.'),
    esiEmployeeRatePct: pctField(10),
    esiEmployerRatePct: pctField(10),
    esiWageCeiling: z.number({ invalid_type_error: 'Enter a number.' }).int('Whole rupees only.').min(1000, 'Must be ≥ 1,000.').max(100000, 'Must be ≤ 1,00,000.'),
    gstRatePct: pctField(28),
    salaryDueDayOfNextMonth: z.number({ invalid_type_error: 'Enter a number.' }).int().min(1, 'Must be 1–28.').max(28, 'Must be 1–28.'),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.').refine((d) => d > statutoryConfig.effectiveFrom, 'Must be after the current effective date.'),
    approver: z.string().min(1, 'A second authoriser is required.'),
    reason: z.string().trim().min(15, 'Give a reason of at least 15 characters (reference the notification / order).').max(500),
  })
type ConfigForm = z.infer<typeof configSchema>

function ConfigEditDialog({ open, onOpenChange, requester }: { open: boolean; onOpenChange: (v: boolean) => void; requester: string }) {
  const defaults: ConfigForm = {
    pfEmployeeRatePct: statutoryConfig.pfEmployeeRatePct,
    pfEmployerRatePct: statutoryConfig.pfEmployerRatePct,
    pfWageCeiling: statutoryConfig.pfWageCeiling,
    esiEmployeeRatePct: statutoryConfig.esiEmployeeRatePct,
    esiEmployerRatePct: statutoryConfig.esiEmployerRatePct,
    esiWageCeiling: statutoryConfig.esiWageCeiling,
    gstRatePct: statutoryConfig.gstRatePct,
    salaryDueDayOfNextMonth: statutoryConfig.salaryDueDayOfNextMonth,
    effectiveFrom: '',
    approver: '',
    reason: '',
  }
  const schema = configSchema.refine((v) => !v.approver.startsWith(requester), { path: ['approver'], message: 'The second authoriser must be a different person from the requester.' })
  const form = useForm<ConfigForm>({ resolver: zodResolver(schema), defaultValues: defaults })
  const { errors, isSubmitting } = form.formState
  const close = (v: boolean) => {
    if (!v) form.reset(defaults)
    onOpenChange(v)
  }
  const submit = form.handleSubmit(async (v) => {
    await new Promise((r) => setTimeout(r, 450))
    const changed = CONFIG_ROWS.filter((r) => v[r.key as keyof ConfigForm] !== statutoryConfig[r.key]).length
    toast.success('Change request submitted for second authorisation (simulated)', {
      description: `${changed} parameter(s) changed, effective ${fmtDate(v.effectiveFrom)}, pending approval by ${v.approver}. Nothing was changed — in production this would be audit-logged.`,
    })
    close(false)
  })
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Edit statutory configuration" description="Dual authorisation: the change takes effect only after a second authoriser approves it." className="max-w-2xl">
        <form onSubmit={submit} noValidate className="max-h-[75vh] space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin">
          <div className="grid gap-3 sm:grid-cols-2">
            {CONFIG_ROWS.map((r) => {
              const k = r.key as keyof ConfigForm
              const err = errors[k]?.message
              return (
                <div key={r.key} className="space-y-1">
                  <Label htmlFor={`cfg-${r.key}`}>{r.label}</Label>
                  <Input id={`cfg-${r.key}`} type="number" step="any" aria-invalid={!!err} {...form.register(k, { valueAsNumber: true })} className="h-8" />
                  {err && <p className="text-xs text-destructive">{err}</p>}
                </div>
              )
            })}
            <div className="space-y-1">
              <Label htmlFor="cfg-eff">Effective from</Label>
              <Input id="cfg-eff" type="date" aria-invalid={!!errors.effectiveFrom} {...form.register('effectiveFrom')} className="h-8" />
              {errors.effectiveFrom && <p className="text-xs text-destructive">{errors.effectiveFrom.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="cfg-approver">Second authoriser</Label>
              <NativeSelect id="cfg-approver" aria-invalid={!!errors.approver} {...form.register('approver')} className="h-8 w-full text-sm">
                <option value="">Select…</option>
                {APPROVERS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </NativeSelect>
              {errors.approver && <p className="text-xs text-destructive">{errors.approver.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cfg-reason">Reason / reference (required)</Label>
            <Textarea id="cfg-reason" aria-invalid={!!errors.reason} placeholder="e.g. Revision per notification ref. …" {...form.register('reason')} />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
          </div>
          <p className="text-xs text-muted-foreground">Requested by: {requester}. Values are demo placeholders — they are not authoritative statutory rates.</p>
          <AuthNotice>
            In production, configuration changes require maker-checker (dual) authorisation enforced server-side, are versioned with an effective date, and are written to the immutable audit trail. This prototype only simulates the request.
          </AuthNotice>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit for approval'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const THEMES: Array<[ThemePref, string, typeof Sun]> = [
  ['light', 'Light', Sun],
  ['dark', 'Dark', Moon],
  ['system', 'System', Monitor],
]

export default function SettingsPage() {
  const role = useUI((s) => s.role)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const simulateErrors = useUI((s) => s.simulateErrors)
  const setSimulateErrors = useUI((s) => s.setSimulateErrors)
  const [editOpen, setEditOpen] = useState(false)
  const user = DEMO_USER[role]
  const scope = roleScope(role).label

  function resetDemo() {
    try {
      for (const k of ['mpp-ui', 'mpp-filters']) {
        localStorage.removeItem(k)
        sessionStorage.removeItem(k)
      }
    } catch {
      // Storage may be unavailable (private mode); reload anyway.
    }
    toast.info('Demo state reset — reloading…')
    setTimeout(() => window.location.reload(), 400)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Profile, appearance, configurable system parameters, SLAs and demo controls." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Profile" description="Demo identity for the currently selected role.">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground" aria-hidden>
              {initials(user) || <UserCircle2 />}
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-3">
              <Field label="Name" value={user} />
              <Field label="Role" value={role} />
              <Field label="Data scope" value={scope ?? 'Enterprise (all regions)'} className="col-span-2" />
            </dl>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Switch roles from the header. Identity would come from SSO in production.</p>
        </Section>

        <Section title="Appearance" description="Theme preference is stored in this browser.">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEMES.map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={theme === v}
                onClick={() => setTheme(v)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  theme === v ? 'border-secondary bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="Statutory configuration"
        description={
          <>
            Configurable system parameters (demo values — not authoritative). Version <span className="font-mono">{statutoryConfig.version}</span>, effective from {fmtDate(statutoryConfig.effectiveFrom)}.
          </>
        }
        actions={
          <GatedButton allowed={can(role, 'admin.manage')} reason={`Your current role (${role}) cannot edit configuration. Requires System Administrator (with a second authoriser).`} onClick={() => setEditOpen(true)}>
            <Pencil /> Edit
          </GatedButton>
        }
        bodyClassName="p-0"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">Statutory configuration parameters</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="border-b px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Parameter
              </th>
              <th scope="col" className="border-b px-4 py-2 text-right text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {CONFIG_ROWS.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="px-4 py-2">{r.label}</td>
                <td className="num px-4 py-2 text-right font-medium">{r.fmt(statutoryConfig[r.key] as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Placeholders for the prototype only. Production values must be sourced from the competent configuration authority and versioned with effective dates.
        </p>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Exception SLAs" description="Days to resolve, by exception category (demo configuration)." bodyClassName="p-0">
          <SlaTable rows={(Object.keys(SLA_DAYS) as ExceptionCategory[]).map((k) => [k, SLA_DAYS[k]])} label="Category" />
        </Section>
        <Section title="Invoice workflow SLAs" description="Days allowed at each approval stage (demo configuration)." bodyClassName="p-0">
          <SlaTable rows={STAGES.map((s: WorkflowStageName) => [s, STAGE_SLA[s]])} label="Stage" />
        </Section>
      </div>

      <Section
        title={
          <span className="inline-flex items-center gap-1.5">
            <FlaskConical className="size-4 text-warning" aria-hidden /> Demo controls
          </span>
        }
        description="For reviewers: exercise error and reset behaviour of the prototype."
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="sim-errors" className="text-sm font-medium">
                Simulate API errors
              </label>
              <p className="text-xs text-muted-foreground">Every simulated service call fails, so you can review error and retry states across the app.</p>
            </div>
            <Switch
              id="sim-errors"
              label="Simulate API errors"
              checked={simulateErrors}
              onCheckedChange={(v) => {
                setSimulateErrors(v)
                toast.info(v ? 'Simulated API errors ON' : 'Simulated API errors OFF', { description: v ? 'Data requests will now fail until switched off.' : 'Data requests will succeed again.' })
              }}
            />
          </div>
          <div className="flex items-start justify-between gap-4 border-t pt-4">
            <div>
              <p className="text-sm font-medium">Reset demo state</p>
              <p className="text-xs text-muted-foreground">Clears the stored role, theme, filters and notification read state, then reloads.</p>
            </div>
            <Button variant="outline" size="sm" onClick={resetDemo}>
              <RotateCcw /> Reset
            </Button>
          </div>
        </div>
      </Section>

      <ConfigEditDialog open={editOpen} onOpenChange={setEditOpen} requester={user} />
    </div>
  )
}

function SlaTable({ rows, label }: { rows: Array<[string, number]>; label: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{label} SLA</caption>
      <thead className="bg-muted/60">
        <tr>
          <th scope="col" className="border-b px-4 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </th>
          <th scope="col" className="border-b px-4 py-2 text-right text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            SLA (days)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b last:border-0">
            <td className="px-4 py-1.5">{k}</td>
            <td className="num px-4 py-1.5 text-right font-medium">{v === 0 ? '—' : v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
