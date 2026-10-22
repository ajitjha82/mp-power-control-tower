import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookmarkPlus, CalendarClock, ChevronRight, Download, FileSpreadsheet, FileText, FolderOpen, Info, Trash2, X } from 'lucide-react'
import type { GlobalFilters, RiskLevel, Severity } from '@/types'
import { WAGE_MONTHS, monthLabel } from '@/data/config'
import { REGIONS } from '@/data/org'
import { VENDORS } from '@/data/vendors'
import { simulate } from '@/services/api'
import { can } from '@/lib/rbac'
import { useUI } from '@/store/ui'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { PageHeader, Section } from '@/components/layout/page'
import { StatusBadge, SeverityBadge, RiskBadge } from '@/components/feedback/status'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/feedback/states'
import { Button, Card, Input, Label, NativeSelect } from '@/components/ui/primitives'
import { Dialog, DialogContent, Tabs, TabsList, TabsTrigger } from '@/components/ui/overlays'
import { cn, fmtNum } from '@/lib/utils'
import { GatedButton, downloadCsv, fmtIST } from '@/features/admin/shared'
import { REPORTS, type ReportCategory, type ReportDef } from './catalog'
import { PREVIEW_LIMIT, REPORT_FILTERS, buildPreview, type Cell, type PreviewCol } from './preview'

const CATEGORIES: ReportCategory[] = ['Workforce', 'Attendance', 'PF', 'ESI', 'Salary', 'Vendor', 'Invoice', 'Compliance', 'Audit']
const STORAGE_KEY = 'mpp-saved-reports'

interface ReportFilters {
  month: string
  region: string
  vendor: string
}
interface SavedReport {
  id: string
  name: string
  reportId: string
  filters: ReportFilters
  savedAt: string
}

function loadSaved(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedReport[]).filter((s) => s && typeof s.id === 'string' && typeof s.reportId === 'string') : []
  } catch {
    return []
  }
}
function persistSaved(list: SavedReport[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable — saved reports remain for this session only.
  }
}

/** Narrow (never widen) the role-scoped filters with the report-local selections. */
function narrow(base: GlobalFilters, rf: ReportFilters, applies: { month: boolean; org: boolean }): GlobalFilters {
  const out: GlobalFilters = { ...base, compliance: [] }
  if (applies.month && rf.month) out.wageMonth = rf.month
  if (applies.org && rf.region) out.regions = base.regions.length && !base.regions.includes(rf.region) ? ['__none__'] : [rf.region]
  if (applies.org && rf.vendor) out.vendors = base.vendors.length && !base.vendors.includes(rf.vendor) ? ['__none__'] : [rf.vendor]
  return out
}

function CellView({ col, value }: { col: PreviewCol; value: Cell }) {
  if (col.kind === 'status') return <StatusBadge status={String(value)} size="xs" />
  if (col.kind === 'severity') return <SeverityBadge severity={value as Severity} />
  if (col.kind === 'risk') return <RiskBadge level={value as RiskLevel} />
  if (col.kind === 'mono') return <span className="font-mono text-[13px]">{value}</span>
  return <>{typeof value === 'number' ? fmtNum(value) : value}</>
}

export default function ReportsPage() {
  const { filters, key } = useScope()
  const role = useUI((s) => s.role)
  const canExport = can(role, 'report.export')
  const deny = `Your current role (${role}) cannot export or schedule reports.`
  const [reportId, setReportId] = useUrlParam('report')
  const [cat, setCat] = useState<'All' | ReportCategory>('All')
  const [rf, setRf] = useState<ReportFilters>({ month: filters.wageMonth, region: '', vendor: '' })
  const [saved, setSaved] = useState<SavedReport[]>(() => loadSaved())
  const [saveOpen, setSaveOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const report = REPORTS.find((r) => r.id === reportId) ?? null
  const applies = (report && REPORT_FILTERS[report.id]) ?? { month: false, org: false }
  const effective = useMemo(() => narrow(filters, rf, applies), [filters, rf, applies])

  useEffect(() => {
    if (report) setCat((c) => (c === 'All' || c === report.category ? c : report.category))
  }, [report])

  const regionOptions = filters.regions.length ? REGIONS.filter((r) => filters.regions.includes(r.id)) : REGIONS
  const vendorOptions = filters.vendors.length ? VENDORS.filter((v) => filters.vendors.includes(v.id)) : VENDORS

  const preview = useQuery({
    queryKey: ['report-preview', reportId, key, rf],
    enabled: !!report,
    queryFn: () => simulate(() => buildPreview(reportId!, effective), 380),
  })

  const visible = cat === 'All' ? REPORTS : REPORTS.filter((r) => r.category === cat)

  function updateSaved(list: SavedReport[]) {
    setSaved(list)
    persistSaved(list)
  }

  function openReport(r: ReportDef) {
    setReportId(r.id)
  }

  function exportCsv() {
    if (!report || !preview.data) return
    downloadCsv(report.id, preview.data.cols.map((c) => c.label), preview.data.rows)
    toast.success(`Exported ${fmtNum(preview.data.rows.length)} preview rows (CSV)`, { description: 'Demo data with masked identifiers. In production, exports are audit-logged.' })
  }
  function exportSimulated(fmt: 'Excel' | 'PDF') {
    toast.info(`${fmt} export simulated`, { description: `Prototype only: no ${fmt} file was produced. In production it would be generated server-side with masking and an audit entry. CSV export of the preview is functional.` })
  }

  const filterLabel = (f: ReportFilters) =>
    [f.month && monthLabel(f.month, true), f.region && REGIONS.find((r) => r.id === f.region)?.name, f.vendor && VENDORS.find((v) => v.id === f.vendor)?.shortName].filter(Boolean).join(' · ') || 'Default filters'

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" subtitle="Management reports built from the same reconciled data as the dashboards. Pick a report to preview, export, save or schedule it." />

      <Tabs value={cat} onValueChange={(v) => setCat(v as 'All' | ReportCategory)}>
        <TabsList aria-label="Report categories">
          <TabsTrigger value="All">All</TabsTrigger>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => openReport(r)}
            aria-pressed={r.id === reportId}
            className={cn(
              'group flex flex-col rounded-lg border bg-card p-4 text-left transition-[border-color,box-shadow] hover:border-secondary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              r.id === reportId && 'border-secondary ring-1 ring-secondary/40',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                {r.name}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </div>
            <p className="mt-1.5 flex-1 text-xs text-muted-foreground">{r.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-2xs">
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{r.category}</span>
              <span className="rounded bg-muted px-1.5 py-0.5">{r.frequency}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{r.audience}</span>
            </div>
          </button>
        ))}
      </div>

      {report ? (
        <Section
          title={report.name}
          description={report.description}
          actions={
            <Button variant="ghost" size="icon-sm" aria-label="Close report" onClick={() => setReportId(null)}>
              <X />
            </Button>
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="rf-month">Wage month</Label>
              <NativeSelect id="rf-month" value={rf.month} disabled={!applies.month} onChange={(e) => setRf({ ...rf, month: e.target.value })} className="h-8 text-xs">
                {[...WAGE_MONTHS].reverse().map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rf-region">Region</Label>
              <NativeSelect id="rf-region" value={rf.region} disabled={!applies.org} onChange={(e) => setRf({ ...rf, region: e.target.value })} className="h-8 text-xs">
                <option value="">All regions in scope</option>
                {regionOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rf-vendor">Vendor</Label>
              <NativeSelect id="rf-vendor" value={rf.vendor} disabled={!applies.org} onChange={(e) => setRf({ ...rf, vendor: e.target.value })} className="h-8 max-w-[220px] text-xs">
                <option value="">All vendors in scope</option>
                {vendorOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.shortName}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <GatedButton allowed={canExport && !!preview.data?.rows.length} reason={canExport ? 'Nothing to export yet.' : deny} onClick={exportCsv}>
                <Download /> CSV
              </GatedButton>
              <GatedButton allowed={canExport} reason={deny} onClick={() => exportSimulated('Excel')}>
                <FileSpreadsheet /> Excel
              </GatedButton>
              <GatedButton allowed={canExport} reason={deny} onClick={() => exportSimulated('PDF')}>
                <FileText /> PDF
              </GatedButton>
              <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
                <BookmarkPlus /> Save report
              </Button>
              <GatedButton allowed={canExport} reason={deny} onClick={() => setScheduleOpen(true)}>
                <CalendarClock /> Schedule
              </GatedButton>
            </div>
          </div>
          <p className="px-4 pt-3 text-xs text-muted-foreground">
            Your role's data scope and global filters apply; report filters can only narrow them.
            {!applies.month && applies.org && ' Wage-month filter does not apply to this report.'}
            {!applies.org && ' Organisation and vendor filters do not apply to this report.'}
          </p>

          {preview.isPending ? (
            <BlockSkeleton rows={6} />
          ) : preview.isError ? (
            <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
          ) : preview.data.total === 0 ? (
            <EmptyState title="No rows for these filters." description="Try a different month, region or vendor." />
          ) : (
            <div className={cn(preview.isFetching && 'opacity-70 transition-opacity')}>
              {preview.data.summary && (
                <div className="flex flex-wrap gap-2 px-4 pt-3">
                  {preview.data.summary.map((s) => (
                    <span key={s.label} className="rounded-md border px-2.5 py-1 text-xs">
                      <span className="text-muted-foreground">{s.label}: </span>
                      <span className="num font-semibold">{fmtNum(Number(s.value))}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 overflow-x-auto border-y scrollbar-thin">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">{report.name} preview</caption>
                  <thead className="bg-muted/60">
                    <tr>
                      {preview.data.cols.map((c) => (
                        <th key={c.label} scope="col" className={cn('whitespace-nowrap border-b px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground', c.kind === 'num' && 'text-right')}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.rows.map((row, ri) => (
                      <tr key={ri} className="border-b last:border-0">
                        {row.map((v, ci) => {
                          const col = preview.data.cols[ci]!
                          return (
                            <td key={ci} className={cn('whitespace-nowrap px-3 py-1.5', col.kind === 'num' && 'num text-right')}>
                              <CellView col={col} value={v} />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground">
                <span>
                  Preview: showing <span className="num font-medium text-foreground">{fmtNum(preview.data.rows.length)}</span> of{' '}
                  <span className="num font-medium text-foreground">{fmtNum(preview.data.total)}</span> rows
                  {preview.data.total > PREVIEW_LIMIT && ' (preview limited)'}
                </span>
                {preview.data.note && (
                  <span className="inline-flex items-center gap-1">
                    <Info className="size-3.5" aria-hidden /> {preview.data.note}
                  </span>
                )}
              </div>
            </div>
          )}
        </Section>
      ) : (
        <Card>
          <EmptyState title="Select a report to preview it." description="Report cards above open a live preview with filters, export, save and schedule options. You can also link directly with ?report=<id>." />
        </Card>
      )}

      <Section title="Saved reports" description="Stored in this browser only (demo).">
        {saved.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved reports yet. Open a report, set filters and choose “Save report”.</p>
        ) : (
          <ul className="divide-y">
            {saved.map((s) => {
              const def = REPORTS.find((r) => r.id === s.reportId)
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {def?.name ?? s.reportId} · {filterLabel(s.filters)} · saved {fmtIST(s.savedAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={!def}
                      onClick={() => {
                        setRf(s.filters)
                        setReportId(s.reportId)
                        toast.success(`Opened “${s.name}”`)
                      }}
                    >
                      <FolderOpen /> Open
                    </Button>
                    <Button variant="ghost" size="xs" aria-label={`Delete saved report ${s.name}`} onClick={() => updateSaved(saved.filter((x) => x.id !== s.id))}>
                      <Trash2 /> Delete
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        Reports contain fictional demo data. Generation of official statutory returns (e.g. ECR, ESI returns) is out of scope for this prototype.
      </p>

      {report && (
        <SaveDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          defaultName={`${report.name} — ${filterLabel(rf)}`}
          onSave={(name) => {
            updateSaved([{ id: `SR-${Date.now()}`, name, reportId: report.id, filters: rf, savedAt: new Date().toISOString() }, ...saved])
            toast.success('Report saved', { description: 'Saved in this browser (demo).' })
          }}
        />
      )}
      {report && <ScheduleDialog key={report.id} open={scheduleOpen} onOpenChange={setScheduleOpen} report={report} />}
    </div>
  )
}

function SaveDialog({ open, onOpenChange, defaultName, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; defaultName: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(defaultName)
  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])
  const valid = name.trim().length >= 3
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Save report" description="Save the report with its current filters.">
        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            onSave(name.trim())
            onOpenChange(false)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="save-name">Name</Label>
            <Input id="save-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-invalid={!valid} />
            {!valid && <p className="text-xs text-destructive">Name must be at least 3 characters.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ScheduleDialog({ open, onOpenChange, report }: { open: boolean; onOpenChange: (v: boolean) => void; report: ReportDef }) {
  const [freq, setFreq] = useState<string>(report.frequency)
  const [format, setFormat] = useState('CSV')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Schedule report" description={report.name}>
        <form
          className="space-y-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            toast.info('Schedule simulated', { description: `${freq} ${format} delivery of “${report.name}” would be configured server-side. Nothing was scheduled in this prototype.` })
            onOpenChange(false)
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sch-freq">Frequency</Label>
              <NativeSelect id="sch-freq" value={freq} onChange={(e) => setFreq(e.target.value)} className="h-8 w-full text-sm">
                {['Daily', 'Weekly', 'Monthly'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sch-format">Format</Label>
              <NativeSelect id="sch-format" value={format} onChange={(e) => setFormat(e.target.value)} className="h-8 w-full text-sm">
                {['CSV', 'Excel', 'PDF'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Delivery to role mailboxes for: {report.audience}. Simulated — no email is sent.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Schedule</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
