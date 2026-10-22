import { useEffect, useMemo, useState } from 'react'
import { Filter, Lock, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import type { ComplianceFilter, EmployeeCategory, GlobalFilters } from '@/types'
import { Button } from '@/components/ui/primitives'
import { CIRCLES, DIVISIONS, LOCATIONS, REGIONS, circleById, divisionById, locationById, regionById } from '@/data/org'
import { CONTRACTS, VENDORS, contractById, vendorById } from '@/data/vendors'
import { CATEGORIES } from '@/data/roster'
import { CURRENT_MONTH, WAGE_MONTHS, monthLabel } from '@/data/config'
import { EMPTY_FILTERS, activeFilterCount, useFilters } from '@/store/filters'
import { useUI } from '@/store/ui'
import { roleScope } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { MultiSelect, type Option } from './MultiSelect'

const COMPLIANCE: ComplianceFilter[] = ['Fully Compliant', 'PF Exception', 'ESI Exception', 'Salary Issue']

/** Remove child selections that no longer belong to the selected parents (cascade). */
function cascade(f: GlobalFilters): GlobalFilters {
  const circles = f.regions.length ? f.circles.filter((c) => f.regions.includes(circleById.get(c)!.regionId)) : f.circles
  const divisions = f.divisions.filter((d) => {
    const dv = divisionById.get(d)!
    return (!f.regions.length || f.regions.includes(dv.regionId)) && (!circles.length || circles.includes(dv.circleId))
  })
  const locations = f.locations.filter((l) => {
    const lc = locationById.get(l)!
    return (!f.regions.length || f.regions.includes(lc.regionId)) && (!circles.length || circles.includes(lc.circleId)) && (!divisions.length || divisions.includes(lc.divisionId))
  })
  const contracts = f.vendors.length ? f.contracts.filter((c) => f.vendors.includes(contractById.get(c)!.vendorId)) : f.contracts
  return { ...f, circles, divisions, locations, contracts }
}

export function GlobalFilterBar() {
  const { applied, apply } = useFilters()
  const role = useUI((s) => s.role)
  const scope = roleScope(role)
  const [draft, setDraft] = useState<GlobalFilters>(applied)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => setDraft(applied), [applied])

  const set = (patch: Partial<GlobalFilters>) => setDraft((d) => cascade({ ...d, ...patch }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)
  const count = activeFilterCount(applied)

  const opts = useMemo(() => {
    const circleOpts: Option[] = CIRCLES.filter((c) => !draft.regions.length || draft.regions.includes(c.regionId)).map((c) => ({ value: c.id, label: c.name, hint: regionById.get(c.regionId)!.code }))
    const divOpts: Option[] = DIVISIONS.filter((d) => (!draft.regions.length || draft.regions.includes(d.regionId)) && (!draft.circles.length || draft.circles.includes(d.circleId))).map((d) => ({ value: d.id, label: d.name }))
    const locOpts: Option[] = LOCATIONS.filter(
      (l) => (!draft.regions.length || draft.regions.includes(l.regionId)) && (!draft.circles.length || draft.circles.includes(l.circleId)) && (!draft.divisions.length || draft.divisions.includes(l.divisionId)),
    ).map((l) => ({ value: l.id, label: l.name, hint: l.type }))
    const venOpts: Option[] = VENDORS.filter((v) => !scope.vendors || scope.vendors.includes(v.id)).map((v) => ({ value: v.id, label: v.shortName, hint: v.id }))
    const conOpts: Option[] = CONTRACTS.filter((c) => (!draft.vendors.length || draft.vendors.includes(c.vendorId)) && (!scope.vendors || scope.vendors.includes(c.vendorId))).map((c) => ({ value: c.id, label: c.number, hint: vendorById.get(c.vendorId)!.shortName }))
    return { circleOpts, divOpts, locOpts, venOpts, conOpts }
  }, [draft.regions, draft.circles, draft.divisions, draft.vendors, scope.vendors])

  const chips: Array<{ key: string; label: string; remove: () => void }> = []
  const addChips = (k: keyof Omit<GlobalFilters, 'wageMonth'>, name: (id: string) => string) =>
    (applied[k] as string[]).forEach((id) => chips.push({ key: `${k}-${id}`, label: name(id), remove: () => apply(cascade({ ...applied, [k]: (applied[k] as string[]).filter((x) => x !== id) })) }))
  addChips('regions', (id) => regionById.get(id)?.name ?? id)
  addChips('circles', (id) => circleById.get(id)?.name ?? id)
  addChips('divisions', (id) => divisionById.get(id)?.name ?? id)
  addChips('locations', (id) => locationById.get(id)?.name ?? id)
  addChips('vendors', (id) => vendorById.get(id)?.shortName ?? id)
  addChips('contracts', (id) => contractById.get(id)?.number ?? id)
  addChips('categories', (id) => id)
  addChips('compliance', (id) => id)
  if (applied.wageMonth !== CURRENT_MONTH) chips.unshift({ key: 'month', label: `Wage month: ${monthLabel(applied.wageMonth)}`, remove: () => apply({ ...applied, wageMonth: CURRENT_MONTH }) })

  const controls = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
      <MultiSelect label="Month" single options={[...WAGE_MONTHS].reverse().map((m) => ({ value: m, label: monthLabel(m), hint: m === CURRENT_MONTH ? 'Current' : undefined }))} value={[draft.wageMonth]} onChange={(v) => set({ wageMonth: v[0] ?? CURRENT_MONTH })} />
      <MultiSelect label="Region" options={REGIONS.map((r) => ({ value: r.id, label: r.name, hint: r.code }))} value={draft.regions} onChange={(v) => set({ regions: v })} />
      <MultiSelect label="Circle" options={opts.circleOpts} value={draft.circles} onChange={(v) => set({ circles: v })} />
      <MultiSelect label="Division" options={opts.divOpts} value={draft.divisions} onChange={(v) => set({ divisions: v })} />
      <MultiSelect label="Location" options={opts.locOpts} value={draft.locations} onChange={(v) => set({ locations: v })} />
      <MultiSelect label="Vendor" options={opts.venOpts} value={draft.vendors} onChange={(v) => set({ vendors: v })} />
      <MultiSelect label="Contract" options={opts.conOpts} value={draft.contracts} onChange={(v) => set({ contracts: v })} />
      <MultiSelect label="Category" options={CATEGORIES.map((c) => ({ value: c, label: c }))} value={draft.categories} onChange={(v) => set({ categories: v as EmployeeCategory[] })} />
      <MultiSelect label="Compliance" options={COMPLIANCE.map((c) => ({ value: c, label: c }))} value={draft.compliance} onChange={(v) => set({ compliance: v as ComplianceFilter[] })} />
      <div className="flex items-center gap-1.5 lg:ml-auto">
        <Button size="sm" variant="ghost" onClick={() => setDraft(applied)} disabled={!dirty} title="Discard unapplied changes">
          <RotateCcw /> Reset
        </Button>
        <Button size="sm" variant="outline" onClick={() => apply(EMPTY_FILTERS)} disabled={count === 0 && !dirty}>
          Clear all
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            apply(draft)
            setMobileOpen(false)
          }}
          disabled={!dirty}
          className={cn(dirty && 'ring-2 ring-secondary/30')}
        >
          <Filter /> Apply
        </Button>
      </div>
    </div>
  )

  return (
    <section aria-label="Global filters" className="border-b bg-card/70 px-4 py-2.5 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <Button size="sm" variant="outline" onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen}>
          <SlidersHorizontal /> Filters
          {count > 0 && <span className="rounded-full bg-secondary px-1.5 text-2xs text-secondary-foreground">{count}</span>}
        </Button>
        <span className="truncate text-xs text-muted-foreground">Wage month: {monthLabel(applied.wageMonth)}</span>
      </div>
      <div className={cn('mt-2 lg:mt-0', !mobileOpen && 'hidden lg:block')}>{controls}</div>
      {(chips.length > 0 || scope.label) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active <span className="num">({count})</span>
          </span>
          {scope.label && (
            <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-xs text-info" title="Mandatory role data scope (enforced server-side in production)">
              <Lock className="size-3" /> {scope.label}
            </span>
          )}
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full border bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {c.label}
              <button type="button" onClick={c.remove} className="rounded-full hover:bg-background/60" aria-label={`Remove filter ${c.label}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
