import { ChevronRight, Home } from 'lucide-react'
import type { GlobalFilters } from '@/types'
import { circleById, divisionById, regionById } from '@/data/org'
import { useFilters } from '@/store/filters'
import type { Dim } from '@/services/scope'
import type { GroupRow } from '@/services/metrics'
import { cn, fmtNum, fmtPct } from '@/lib/utils'
import { pctTone, toneText } from '@/components/feedback/status'

/** Which hierarchy level to show next, given the applied org filters. */
export function nextLevel(f: GlobalFilters): Dim {
  if (f.divisions.length === 1) return 'location'
  if (f.circles.length === 1) return 'division'
  if (f.regions.length === 1) return 'circle'
  return 'region'
}

export function OrgBreadcrumb() {
  const { applied, patch } = useFilters()
  const crumbs: Array<{ label: string; onClick: () => void }> = [{ label: 'MP Power', onClick: () => patch({ regions: [], circles: [], divisions: [], locations: [] }) }]
  if (applied.regions.length === 1) crumbs.push({ label: regionById.get(applied.regions[0]!)!.name, onClick: () => patch({ circles: [], divisions: [], locations: [] }) })
  if (applied.circles.length === 1) crumbs.push({ label: circleById.get(applied.circles[0]!)!.name, onClick: () => patch({ divisions: [], locations: [] }) })
  if (applied.divisions.length === 1) crumbs.push({ label: divisionById.get(applied.divisions[0]!)!.name, onClick: () => patch({ locations: [] }) })
  return (
    <nav aria-label="Organisation hierarchy" className="flex flex-wrap items-center gap-1 text-xs">
      {crumbs.map((c, i) => (
        <span key={c.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3 text-muted-foreground" aria-hidden />}
          <button
            type="button"
            onClick={c.onClick}
            disabled={i === crumbs.length - 1}
            className={cn('inline-flex items-center gap-1 rounded px-1 py-0.5', i === crumbs.length - 1 ? 'font-semibold text-foreground' : 'text-secondary hover:underline')}
          >
            {i === 0 && <Home className="size-3" aria-hidden />}
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  )
}

/** Clickable hierarchy table — clicking a row filters the whole application to it. */
export function OrgTable({ rows, level }: { rows: GroupRow[]; level: Dim }) {
  const { applied, patch } = useFilters()
  const drill = (id: string) => {
    if (level === 'region') patch({ regions: [id], circles: [], divisions: [], locations: [] })
    else if (level === 'circle') patch({ regions: [circleById.get(id)!.regionId], circles: [id], divisions: [], locations: [] })
    else if (level === 'division') {
      const d = divisionById.get(id)!
      patch({ regions: [d.regionId], circles: [d.circleId], divisions: [id], locations: [] })
    } else patch({ locations: applied.locations.includes(id) ? [] : [id] })
  }
  const levelLabel = { region: 'Region', circle: 'Circle', division: 'Division', location: 'Location' }[level as 'region']
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <caption className="sr-only">Workforce and compliance by {levelLabel}</caption>
        <thead>
          <tr className="border-b text-2xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 text-left font-semibold">{levelLabel}</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Sanctioned</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Deployed</th>
            <th scope="col" className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Present</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">Attend.</th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">PF</th>
            <th scope="col" className="hidden px-2 py-2 text-right font-semibold md:table-cell">ESI</th>
            <th scope="col" className="hidden py-2 pl-2 text-right font-semibold md:table-cell">Salary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              onClick={() => drill(r.id)}
              onKeyDown={(e) => e.key === 'Enter' && drill(r.id)}
              className="cursor-pointer border-b last:border-0 hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
              aria-label={`Drill into ${r.name}`}
            >
              <td className="max-w-[220px] truncate py-2 pr-3 font-medium text-secondary">{r.name}</td>
              <td className="num px-2 py-2 text-right">{fmtNum(r.sanctioned)}</td>
              <td className="num px-2 py-2 text-right">{fmtNum(r.workforce)}</td>
              <td className="num hidden px-2 py-2 text-right sm:table-cell">{fmtNum(r.present)}</td>
              <td className={cn('num px-2 py-2 text-right', toneText[pctTone(r.attendancePct, 94, 92)])}>{fmtPct(r.attendancePct)}</td>
              <td className={cn('num px-2 py-2 text-right', toneText[pctTone(r.pfPct)])}>{fmtPct(r.pfPct)}</td>
              <td className={cn('num hidden px-2 py-2 text-right md:table-cell', toneText[pctTone(r.esiPct)])}>{fmtPct(r.esiPct)}</td>
              <td className={cn('num hidden py-2 pl-2 text-right md:table-cell', toneText[pctTone(r.salaryPct, 98, 96)])}>{fmtPct(r.salaryPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
