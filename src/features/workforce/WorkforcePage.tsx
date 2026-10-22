import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronRight, Home } from 'lucide-react'
import type { GlobalFilters } from '@/types'
import { PageHeader, Section } from '@/components/layout/page'
import { DataTable, useTableState } from '@/components/tables/DataTable'
import { BarList, C, ChartBox, ChartTooltip, Legend, axisProps } from '@/components/charts/chart-kit'
import { KpiCard, KpiGrid } from '@/components/feedback/kpi'
import { pctTone, toneText } from '@/components/feedback/status'
import { BlockSkeleton, ChartSkeleton, EmptyState, ErrorState, KpiSkeleton } from '@/components/feedback/states'
import { useScope } from '@/hooks/useScope'
import { useFilters } from '@/store/filters'
import { matchesSearch, paginate, simulate } from '@/services/api'
import { type GroupRow, breakdown, summarize } from '@/services/metrics'
import { circleById, divisionById, locationById, regionById } from '@/data/org'
import { CATEGORIES } from '@/data/roster'
import { cn, fmtNum, fmtPct, pct } from '@/lib/utils'

type Level = 'region' | 'circle' | 'division' | 'location'
const LEVEL_LABEL: Record<Level, string> = { region: 'Region', circle: 'Circle', division: 'Division', location: 'Location' }
const LEVEL_PLURAL: Record<Level, string> = { region: 'Regions', circle: 'Circles', division: 'Divisions', location: 'Locations' }

const attTone = (v: number) => pctTone(v, 94, 90)

interface Crumb {
  key: string
  label: string
  onClick: (() => void) | null
}

/** Current hierarchy level + ancestors, derived from the deepest single selection. */
function useHierarchy(filters: GlobalFilters) {
  const patch = useFilters((s) => s.patch)
  return useMemo(() => {
    const div = filters.divisions.length === 1 ? divisionById.get(filters.divisions[0]!) : undefined
    const cir = div ? circleById.get(div.circleId) : filters.circles.length === 1 ? circleById.get(filters.circles[0]!) : undefined
    const regId = div?.regionId ?? cir?.regionId ?? (filters.regions.length === 1 ? filters.regions[0] : undefined)
    const reg = regId ? regionById.get(regId) : undefined
    const level: Level = div ? 'location' : cir ? 'division' : reg ? 'circle' : 'region'

    const loc = div && filters.locations.length === 1 ? locationById.get(filters.locations[0]!) : undefined
    const anySelected = !!(filters.regions.length || filters.circles.length || filters.divisions.length || filters.locations.length)

    const toRoot = () => patch({ regions: [], circles: [], divisions: [], locations: [] })
    const toRegion = (id: string) => {
      if (!regionById.has(id)) return
      patch({ regions: [id], circles: [], divisions: [], locations: [] })
    }
    const toCircle = (id: string) => {
      const c = circleById.get(id)
      if (!c) return
      patch({ regions: [c.regionId], circles: [id], divisions: [], locations: [] })
    }
    const toDivision = (id: string) => {
      const d = divisionById.get(id)
      if (!d) return
      patch({ regions: [d.regionId], circles: [d.circleId], divisions: [id], locations: [] })
    }

    const crumbs: Crumb[] = [{ key: 'root', label: 'MP Power', onClick: anySelected ? toRoot : null }]
    if (reg) crumbs.push({ key: reg.id, label: reg.name, onClick: level === 'circle' && !filters.circles.length && !filters.divisions.length && !filters.locations.length ? null : () => toRegion(reg.id) })
    if (cir) crumbs.push({ key: cir.id, label: cir.name, onClick: level === 'division' && !filters.divisions.length && !filters.locations.length ? null : () => toCircle(cir.id) })
    if (div) crumbs.push({ key: div.id, label: div.name, onClick: loc ? () => toDivision(div.id) : null })
    if (loc) crumbs.push({ key: loc.id, label: loc.name, onClick: null })

    const drill: ((id: string) => void) | null =
      level === 'region' ? toRegion : level === 'circle' ? toCircle : level === 'division' ? toDivision : null
    return { level, crumbs, drill }
  }, [filters.divisions, filters.circles, filters.regions, filters.locations, patch])
}

export default function WorkforcePage() {
  const { filters, key } = useScope()
  const patch = useFilters((s) => s.patch)
  const { level, crumbs, drill } = useHierarchy(filters)

  const q = useQuery({
    queryKey: ['workforce', level, ...key],
    queryFn: () =>
      simulate(() => ({
        summary: summarize(filters),
        groups: breakdown(filters, level).sort((a, b) => b.sanctioned - a.sanctioned),
        vendors: breakdown(filters, 'vendor').sort((a, b) => b.sanctioned - a.sanctioned).slice(0, 12),
        categories: breakdown(filters, 'category').sort((a, b) => b.workforce - a.workforce),
      })),
  })

  const t = useTableState({ sort: { id: 'sanctioned', desc: true } })
  const tableResult = useMemo(() => {
    if (!q.data) return undefined
    const rows = q.data.groups.filter((g) => matchesSearch(t.request.search, g.name, g.id))
    return paginate(rows, t.request)
  }, [q.data, t.request])

  const columns = useMemo<ColumnDef<GroupRow, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: LEVEL_LABEL[level],
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 font-medium">
            {row.original.name}
            {drill && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
          </span>
        ),
      },
      { id: 'sanctioned', accessorKey: 'sanctioned', header: 'Sanctioned', cell: ({ row }) => fmtNum(row.original.sanctioned), meta: { align: 'right', hideBelow: 'md' } },
      { id: 'workforce', accessorKey: 'workforce', header: 'Deployed', cell: ({ row }) => fmtNum(row.original.workforce), meta: { align: 'right' } },
      { id: 'present', accessorKey: 'present', header: 'Present', cell: ({ row }) => fmtNum(row.original.present), meta: { align: 'right', hideBelow: 'lg' } },
      { id: 'absent', accessorKey: 'absent', header: 'Absent', cell: ({ row }) => fmtNum(row.original.absent), meta: { align: 'right', hideBelow: 'lg' } },
      {
        id: 'vacant',
        accessorKey: 'vacant',
        header: 'Vacant',
        cell: ({ row }) => <span className={cn(row.original.vacant > 0 && 'text-warning')}>{fmtNum(row.original.vacant)}</span>,
        meta: { align: 'right', hideBelow: 'md' },
      },
      {
        id: 'attendancePct',
        accessorKey: 'attendancePct',
        header: 'Attendance %',
        cell: ({ row }) => <span className={cn('font-medium', toneText[attTone(row.original.attendancePct)])}>{fmtPct(row.original.attendancePct)}</span>,
        meta: { align: 'right', csv: (r: GroupRow) => r.attendancePct.toFixed(2) },
      },
      {
        id: 'pfPct',
        accessorKey: 'pfPct',
        header: 'PF %',
        cell: ({ row }) => <span className={toneText[pctTone(row.original.pfPct)]}>{row.original.pfApplicable ? fmtPct(row.original.pfPct) : '—'}</span>,
        meta: { align: 'right', hideBelow: 'sm', csv: (r: GroupRow) => r.pfPct.toFixed(2) },
      },
      {
        id: 'esiPct',
        accessorKey: 'esiPct',
        header: 'ESI %',
        cell: ({ row }) => <span className={toneText[pctTone(row.original.esiPct)]}>{row.original.esiApplicable ? fmtPct(row.original.esiPct) : '—'}</span>,
        meta: { align: 'right', hideBelow: 'sm', csv: (r: GroupRow) => r.esiPct.toFixed(2) },
      },
    ],
    [level, drill],
  )

  const s = q.data?.summary
  const groups = q.data?.groups ?? []
  const chartGroups = groups.slice(0, 16)

  const funnel = s
    ? [
        { key: 'sanctioned', label: 'Sanctioned', value: s.sanctioned, color: C.c1, note: 'Posts sanctioned under contracts' },
        { key: 'deployed', label: 'Deployed', value: s.workforce, color: C.c2, note: `${fmtPct(pct(s.workforce, s.sanctioned))} of sanctioned` },
        { key: 'present', label: 'Present', value: s.present, color: C.success, note: `${fmtPct(s.attendancePct)} of deployed` },
        { key: 'absent', label: 'Absent', value: s.absent, color: C.danger, note: `${fmtPct(pct(s.absent, s.workforce))} of deployed` },
        { key: 'vacant', label: 'Vacant', value: s.vacant, color: C.warning, note: `${fmtPct(pct(s.vacant, s.sanctioned))} of sanctioned` },
      ]
    : []

  const stackLegend = [
    { label: 'Present', color: C.success },
    { label: 'Absent', color: C.danger },
    { label: 'Vacant', color: C.warning },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Workforce" subtitle="Sanctioned strength vs. deployment vs. today's attendance across the organisation hierarchy. Click any group to drill down." />

      <nav aria-label="Organisation hierarchy" className="flex flex-wrap items-center gap-1 rounded-lg border bg-card px-3 py-2 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.key} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
            {c.onClick ? (
              <button type="button" onClick={c.onClick} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-secondary hover:bg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {i === 0 && <Home className="size-3.5" aria-hidden />}
                {c.label}
              </button>
            ) : (
              <span aria-current="page" className="inline-flex items-center gap-1 px-1.5 py-0.5 font-semibold">
                {i === 0 && <Home className="size-3.5" aria-hidden />}
                {c.label}
              </span>
            )}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Showing {LEVEL_PLURAL[level].toLowerCase()}</span>
      </nav>

      {q.isPending ? (
        <KpiSkeleton count={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : s ? (
        <KpiGrid className="md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Sanctioned" value={fmtNum(s.sanctioned)} secondary="Contracted posts" tooltip="Sanctioned manpower across contracts in scope (deployed + vacant)." />
          <KpiCard label="Deployed" value={fmtNum(s.workforce)} secondary={`${fmtPct(pct(s.workforce, s.sanctioned))} of sanctioned`} tooltip="Outsourced employees on roll and deployed in the wage month." />
          <KpiCard label="Present" value={fmtNum(s.present)} secondary="Today" tone="success" tooltip="Deployed employees marked present today." href="/attendance" />
          <KpiCard label="Absent" value={fmtNum(s.absent)} secondary={`${fmtPct(pct(s.absent, s.workforce))} of deployed`} tone={s.absent > 0 ? 'warning' : 'neutral'} tooltip="Deployed employees without attendance today." href="/attendance?type=Missing%20attendance" />
          <KpiCard label="Vacant" value={fmtNum(s.vacant)} secondary={`${fmtPct(pct(s.vacant, s.sanctioned))} of sanctioned`} tone={s.vacant > 0 ? 'warning' : 'success'} tooltip="Sanctioned posts not currently filled by the vendor." />
          <KpiCard label="Attendance %" value={fmtPct(s.attendancePct)} secondary="Present ÷ deployed" tone={attTone(s.attendancePct)} tooltip="Share of deployed employees present today." href="/attendance" />
        </KpiGrid>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Manpower funnel" description="Sanctioned → deployed → present">
          {q.isPending ? (
            <BlockSkeleton rows={5} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : s && s.sanctioned > 0 ? (
            <div className="space-y-4">
              <ul className="space-y-2.5">
                {funnel.map((f) => (
                  <li key={f.key}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-medium">{f.label}</span>
                      <span className="num font-semibold">
                        {fmtNum(f.value)} <span className="font-normal text-muted-foreground">{f.note}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full rounded-full bg-muted">
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct(f.value, s.sanctioned)}%`, background: f.color }} />
                    </div>
                  </li>
                ))}
              </ul>
              <div>
                <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Composition of sanctioned posts</p>
                <div className="flex h-4 w-full overflow-hidden rounded" role="img" aria-label={`Present ${fmtNum(s.present)}, absent ${fmtNum(s.absent)}, vacant ${fmtNum(s.vacant)} of ${fmtNum(s.sanctioned)} sanctioned`}>
                  <div style={{ width: `${pct(s.present, s.sanctioned)}%`, background: C.success }} />
                  <div style={{ width: `${pct(s.absent, s.sanctioned)}%`, background: C.danger }} />
                  <div style={{ width: `${pct(s.vacant, s.sanctioned)}%`, background: C.warning }} />
                </div>
                <div className="mt-2">
                  <Legend items={stackLegend} />
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="No sanctioned posts in scope." />
          )}
        </Section>

        <Section
          title={`By ${LEVEL_LABEL[level].toLowerCase()}`}
          description={drill ? `Present / absent / vacant · click a bar to drill into the ${LEVEL_LABEL[level].toLowerCase()}` : 'Present / absent / vacant · click a bar to filter by location'}
          className="xl:col-span-2"
          actions={<Legend items={stackLegend} />}
        >
          {q.isPending ? (
            <ChartSkeleton height={280} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : !chartGroups.length ? (
            <EmptyState title="No groups match the current filters." />
          ) : (
            <ChartBox height={280} label={`Present, absent and vacant posts by ${LEVEL_LABEL[level].toLowerCase()}`}>
              <BarChart data={chartGroups} margin={{ top: 8, right: 8, bottom: 0, left: -4 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" {...axisProps} interval={0} tick={{ fontSize: 10 }} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
                <YAxis {...axisProps} tickFormatter={(v: number) => fmtNum(v)} />
                <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip extra={(p) => `Attendance ${fmtPct(Number(p.attendancePct))}`} />} />
                {(['present', 'absent', 'vacant'] as const).map((k, ki) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={stackLegend[ki]!.label}
                    stackId="s"
                    fill={stackLegend[ki]!.color}
                    className="cursor-pointer"
                    radius={k === 'vacant' ? [3, 3, 0, 0] : undefined}
                    onClick={(_, i) => {
                      const g = chartGroups[i]
                      if (!g) return
                      if (drill) drill(g.id)
                      else patch({ locations: [g.id] })
                    }}
                  />
                ))}
              </BarChart>
            </ChartBox>
          )}
          {groups.length > chartGroups.length && <p className="mt-2 text-xs text-muted-foreground">Showing the 16 largest of {groups.length} groups; all are listed in the table below.</p>}
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="By vendor" description="Top 12 vendors by sanctioned posts · click to filter globally" className="xl:col-span-2" actions={<Legend items={stackLegend} />}>
          {q.isPending ? (
            <ChartSkeleton height={340} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : !q.data?.vendors.length ? (
            <EmptyState title="No vendors in scope." />
          ) : (
            <ChartBox height={Math.max(160, q.data.vendors.length * 26 + 30)} label="Present, absent and vacant posts by vendor, top 12">
              <BarChart data={q.data.vendors} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }} barCategoryGap="20%">
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" {...axisProps} tickFormatter={(v: number) => fmtNum(v)} />
                <YAxis type="category" dataKey="name" {...axisProps} width={120} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'hsl(var(--accent))' }} content={<ChartTooltip extra={(p) => `Deployed ${fmtNum(Number(p.workforce))} · Attendance ${fmtPct(Number(p.attendancePct))}`} />} />
                {(['present', 'absent', 'vacant'] as const).map((k, ki) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    name={stackLegend[ki]!.label}
                    stackId="v"
                    fill={stackLegend[ki]!.color}
                    className="cursor-pointer"
                    onClick={(_, i) => {
                      const v = q.data?.vendors[i]
                      if (v) patch({ vendors: [v.id] })
                    }}
                  />
                ))}
              </BarChart>
            </ChartBox>
          )}
        </Section>

        <Section title="By employee category" description="Deployed headcount · attendance % · click to filter globally">
          {q.isPending ? (
            <BlockSkeleton rows={7} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : !q.data?.categories.length ? (
            <EmptyState title="No employees in scope." />
          ) : (
            <BarList
              items={q.data.categories.map((c) => ({ key: c.id, label: c.name, value: c.workforce, sub: `${fmtPct(c.attendancePct)} att.`, color: C.c2 }))}
              selected={filters.categories.length === 1 ? filters.categories[0] : null}
              onSelect={(k) => {
                const cat = CATEGORIES.find((c) => c === k)
                if (!cat) return
                patch({ categories: filters.categories.length === 1 && filters.categories[0] === cat ? [] : [cat] })
              }}
            />
          )}
        </Section>
      </div>

      <Section
        title={`${LEVEL_PLURAL[level]} in scope`}
        description={drill ? `Select a row to drill into that ${LEVEL_LABEL[level].toLowerCase()}.` : 'Lowest level of the hierarchy. Select a row to filter by that location.'}
        bodyClassName="p-0"
        actions={
          <Link to="/attendance" className="text-xs font-medium text-secondary hover:underline">
            Attendance exceptions →
          </Link>
        }
      >
        <DataTable
          caption={`Workforce by ${LEVEL_LABEL[level].toLowerCase()}`}
          columns={columns}
          result={tableResult}
          state={t}
          isPending={q.isPending}
          isFetching={q.isFetching}
          error={q.error}
          onRetry={() => q.refetch()}
          getRowId={(r) => r.id}
          onRowClick={(r) => (drill ? drill(r.id) : patch({ locations: [r.id] }))}
          searchPlaceholder={`Search ${LEVEL_PLURAL[level].toLowerCase()}…`}
          exportName={`workforce-by-${level}`}
          exportAll={async () => groups}
        />
      </Section>
    </div>
  )
}
