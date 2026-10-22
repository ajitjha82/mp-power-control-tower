import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { LucideIcon } from 'lucide-react'
import { Banknote, Bell, Fingerprint, FileInput, KeyRound, Landmark, HeartPulse, RefreshCw, Smartphone, Users, Info } from 'lucide-react'
import { toast } from 'sonner'
import { hash01 } from '@/lib/rng'
import { simulate } from '@/services/api'
import { can } from '@/lib/rbac'
import { useUI } from '@/store/ui'
import { PageHeader, Section } from '@/components/layout/page'
import { StatusBadge } from '@/components/feedback/status'
import { BlockSkeleton, ErrorState } from '@/components/feedback/states'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { Card } from '@/components/ui/primitives'
import { cn, fmtNum, fmtPct } from '@/lib/utils'
import { GatedButton, fmtIST, useClientPage } from './shared'

type IntegrationStatus = 'Connected' | 'Degraded' | 'Planned'
interface Integration {
  id: string
  name: string
  description: string
  icon: LucideIcon
  status: IntegrationStatus
  mode: string
  lastSync: string | null
  recordsToday: number
  errorRatePct: number
  note?: string
}

const INTEGRATIONS: Integration[] = [
  { id: 'INT-BIO', name: 'Biometric / attendance devices', description: 'Punch data from site biometric terminals via device gateway.', icon: Fingerprint, status: 'Degraded', mode: 'Push, every 5 min', lastSync: '2026-10-22T08:43:00+05:30', recordsToday: 48210, errorRatePct: 1.8, note: 'Sarni Generation Circle feed delayed 47 min.' },
  { id: 'INT-GEO', name: 'Mobile geo-attendance app', description: 'Face + geo-fenced attendance from the field mobile app.', icon: Smartphone, status: 'Connected', mode: 'Real-time API', lastSync: '2026-10-22T09:29:00+05:30', recordsToday: 8532, errorRatePct: 0.4 },
  { id: 'INT-HRMS', name: 'HRMS / Payroll', description: 'Employee master, wage computation and payable days.', icon: Users, status: 'Connected', mode: 'Batch, hourly', lastSync: '2026-10-22T09:00:00+05:30', recordsToday: 60248, errorRatePct: 0.1 },
  { id: 'INT-BANK', name: 'Bank payment files', description: 'Vendor salary credit files for employee-level salary verification.', icon: Banknote, status: 'Connected', mode: 'Vendor upload (SFTP)', lastSync: '2026-10-22T07:15:00+05:30', recordsToday: 12904, errorRatePct: 0.9 },
  { id: 'INT-ECR', name: 'EPFO ECR file ingestion', description: 'Vendor-uploaded ECR text files parsed for employee-level PF reconciliation.', icon: Landmark, status: 'Connected', mode: 'Vendor upload', lastSync: '2026-10-22T06:05:00+05:30', recordsToday: 4120, errorRatePct: 2.6, note: 'Modelled as vendor uploads — not a portal connection.' },
  { id: 'INT-ESIC', name: 'ESIC contribution file ingestion', description: 'Vendor-uploaded ESI contribution statements for reconciliation.', icon: HeartPulse, status: 'Connected', mode: 'Vendor upload', lastSync: '2026-10-21T22:40:00+05:30', recordsToday: 2210, errorRatePct: 1.2, note: 'Modelled as vendor uploads — not a portal connection.' },
  { id: 'INT-ERP', name: 'ERP / Finance (invoice)', description: 'Invoice approval status and payment release to finance ERP.', icon: FileInput, status: 'Degraded', mode: 'API, every 15 min', lastSync: '2026-10-22T08:15:00+05:30', recordsToday: 214, errorRatePct: 4.7, note: 'Intermittent timeouts on payment status callbacks.' },
  { id: 'INT-SSO', name: 'SSO / Identity provider', description: 'Single sign-on, MFA and role claims (SAML / OIDC).', icon: KeyRound, status: 'Planned', mode: 'SAML 2.0 / OIDC', lastSync: null, recordsToday: 0, errorRatePct: 0, note: 'Prototype uses a simulated role switcher.' },
  { id: 'INT-NOTIFY', name: 'Notification gateway (SMS / Email)', description: 'Alerts to officers and vendors on exceptions and SLA breaches.', icon: Bell, status: 'Planned', mode: 'SMTP / SMS API', lastSync: null, recordsToday: 0, errorRatePct: 0 },
]

interface SyncLog {
  id: string
  at: string
  integration: string
  records: number
  failed: number
  durationSec: number
  result: 'Connected' | 'Degraded'
  message: string
}

const ACTIVE = INTEGRATIONS.filter((i) => i.status !== 'Planned')
const SYNC_LOG: SyncLog[] = Array.from({ length: 60 }, (_, k) => {
  const it = ACTIVE[Math.floor(hash01(4101, k) * ACTIVE.length)]!
  const records = Math.round(50 + hash01(4102, k) * 4000)
  const failRate = it.errorRatePct / 100 * (0.4 + hash01(4103, k) * 1.4)
  const failed = Math.round(records * failRate)
  const degraded = failed / records > 0.03
  const ts = Date.parse('2026-10-22T09:29:00+05:30') - Math.floor(k * 11 + hash01(4104, k) * 9) * 60000
  return {
    id: `SYNC-${String(52000 - k)}`,
    at: new Date(ts).toISOString(),
    integration: it.name,
    records,
    failed,
    durationSec: Math.round(3 + hash01(4105, k) * 90),
    result: degraded ? 'Degraded' : 'Connected',
    message: degraded ? 'Partial failure — rejected rows queued for retry' : failed ? 'Completed with validation warnings' : 'Completed',
  }
})

const logColumns: ColumnDef<SyncLog, unknown>[] = [
  { accessorKey: 'at', header: 'Time', cell: ({ row }) => <span className="num text-[13px]">{fmtIST(row.original.at)}</span> },
  { accessorKey: 'integration', header: 'Integration' },
  { accessorKey: 'records', header: 'Records', cell: ({ row }) => fmtNum(row.original.records), meta: { align: 'right' } },
  { accessorKey: 'failed', header: 'Failed', cell: ({ row }) => <span className={cn(row.original.failed > 0 && 'text-destructive')}>{fmtNum(row.original.failed)}</span>, meta: { align: 'right' } },
  { accessorKey: 'durationSec', header: 'Duration (s)', meta: { align: 'right', hideBelow: 'md' } },
  { accessorKey: 'result', header: 'Result', cell: ({ row }) => <StatusBadge status={row.original.result} size="xs" /> },
  { accessorKey: 'message', header: 'Message', meta: { hideBelow: 'lg' } },
]

export default function IntegrationsPage() {
  const role = useUI((s) => s.role)
  const isAdmin = can(role, 'admin.manage')
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => simulate(() => ({ integrations: INTEGRATIONS, log: SYNC_LOG })) })
  const t = useTableState({ sort: { id: 'at', desc: true }, pageSize: 10 })
  const page = useClientPage(['sync-log'], q.data?.log, t, (l) => [l.integration, l.message, l.id])

  return (
    <div className="space-y-5">
      <PageHeader title="Integrations" subtitle="Source systems feeding attendance, wages, salary credit, statutory files and finance workflow." />

      <div role="note" className="flex gap-2 rounded-md border border-info/25 bg-info-soft px-3 py-2.5 text-sm text-info">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>No direct government portal integration is implemented in this prototype — statutory files are modelled as vendor uploads/ingestion. All connection statuses and volumes are simulated.</span>
      </div>

      {q.isPending ? (
        <Card>
          <BlockSkeleton rows={6} />
        </Card>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {q.data.integrations.map((it) => (
            <Card key={it.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="rounded-md bg-muted p-2 text-muted-foreground">
                    <it.icon className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{it.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{it.description}</p>
                  </div>
                </div>
                <StatusBadge status={it.status} size="xs" />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Last sync</dt>
                  <dd className="num mt-0.5 font-medium">{it.lastSync ? fmtIST(it.lastSync).replace(' 2026', '') : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Records today</dt>
                  <dd className="num mt-0.5 font-medium">{it.status === 'Planned' ? '—' : fmtNum(it.recordsToday)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Error rate</dt>
                  <dd className={cn('num mt-0.5 font-medium', it.errorRatePct >= 3 ? 'text-destructive' : it.errorRatePct >= 1.5 && 'text-warning')}>{it.status === 'Planned' ? '—' : fmtPct(it.errorRatePct)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-1 items-end justify-between gap-2 border-t pt-3">
                <span className="text-2xs text-muted-foreground">
                  {it.mode}
                  {it.note && <span className="block text-foreground/80">{it.note}</span>}
                </span>
                {it.status !== 'Planned' && (
                  <GatedButton
                    allowed={isAdmin}
                    reason={`Your current role (${role}) cannot trigger syncs. Requires System Administrator.`}
                    size="xs"
                    onClick={() => toast.info(`Re-sync requested: ${it.name}`, { description: 'Simulated — no external system was contacted. In production this would be audit-logged.' })}
                  >
                    <RefreshCw /> Re-sync
                  </GatedButton>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Section title="Recent sync log" description="Most recent ingestion runs across connected sources (simulated)." bodyClassName="p-0">
        <DataTable
          caption="Recent sync log"
          columns={logColumns}
          result={page.data}
          state={t}
          isPending={q.isPending || page.isPending}
          isFetching={page.isFetching}
          error={q.error ?? page.error}
          onRetry={() => (q.isError ? q.refetch() : page.refetch())}
          getRowId={(r) => r.id}
          searchPlaceholder="Search integration or message…"
          dense
        />
      </Section>
    </div>
  )
}
