import type { GlobalFilters, Role } from '@/types'
import { roleScope } from '@/lib/rbac'
import { apportion, hash01, mulberry32, weightedSample } from '@/lib/rng'
import { CIRCLES, DIVISIONS, LOCATIONS, REGIONS } from '@/data/org'
import { CONTRACTS, VENDORS } from '@/data/vendors'
import { CATEGORIES, IDX, N, R } from '@/data/roster'
import { CURRENT_QUOTAS } from '@/data/config'
import { getSnapshot } from '@/data/snapshot'

/** Merge the user's filters with the role's mandatory data scope (intersection). */
export function effectiveFilters(f: GlobalFilters, role: Role): GlobalFilters {
  const scope = roleScope(role)
  const out = { ...f }
  const merge = (k: 'vendors' | 'divisions' | 'locations') => {
    const forced = scope[k]
    if (!forced) return
    out[k] = f[k].length ? f[k].filter((x) => forced.includes(x)) : [...forced]
    if (!out[k].length) out[k] = ['__none__']
  }
  merge('vendors')
  merge('divisions')
  merge('locations')
  return out
}

export const scopeKey = (f: GlobalFilters) => JSON.stringify(f)

const toIdxSet = (ids: string[], map: Map<string, number>) => {
  if (!ids.length) return null
  const s = new Set<number>()
  for (const id of ids) {
    const v = map.get(id)
    if (v !== undefined) s.add(v)
  }
  return s
}

interface Matcher {
  reg: Set<number> | null
  cir: Set<number> | null
  div: Set<number> | null
  loc: Set<number> | null
  ven: Set<number> | null
  con: Set<number> | null
  cat: Set<number> | null
}
function matcher(f: GlobalFilters): Matcher {
  return {
    reg: toIdxSet(f.regions, IDX.regionIndex),
    cir: toIdxSet(f.circles, IDX.circleIndex),
    div: toIdxSet(f.divisions, IDX.divIndex),
    loc: toIdxSet(f.locations, IDX.locIndex),
    ven: toIdxSet(f.vendors, IDX.vendorIndex),
    con: toIdxSet(f.contracts, IDX.contractIndex),
    cat: f.categories.length ? new Set(f.categories.map((c) => CATEGORIES.indexOf(c))) : null,
  }
}
const hasEmptyForced = (f: GlobalFilters) => f.vendors.includes('__none__') || f.divisions.includes('__none__') || f.locations.includes('__none__')

const idxCache = new Map<string, Int32Array>()

/** Roster indices (on roll in the wage month) matching the effective filters. */
export function scopeIndices(f: GlobalFilters): Int32Array {
  const key = scopeKey(f)
  const hit = idxCache.get(key)
  if (hit) return hit
  const s = getSnapshot(f.wageMonth)
  const m = matcher(f)
  const comp = new Set(f.compliance)
  const out: number[] = []
  if (!hasEmptyForced(f)) {
    for (let i = 0; i < N; i++) {
      if (!s.onRoll[i]) continue
      if (m.reg && !m.reg.has(R.region[i]!)) continue
      if (m.cir && !m.cir.has(R.circle[i]!)) continue
      if (m.div && !m.div.has(R.division[i]!)) continue
      if (m.loc && !m.loc.has(R.location[i]!)) continue
      if (m.ven && !m.ven.has(R.vendor[i]!)) continue
      if (m.con && !m.con.has(R.contract[i]!)) continue
      if (m.cat && !m.cat.has(R.category[i]!)) continue
      if (comp.size) {
        const pf = s.pfEx[i]! > 0, esi = s.esiEx[i]! > 0, sal = s.salary[i]! > 0
        const ok =
          (comp.has('PF Exception') && pf) ||
          (comp.has('ESI Exception') && esi) ||
          (comp.has('Salary Issue') && sal) ||
          (comp.has('Fully Compliant') && !pf && !esi && !sal)
        if (!ok) continue
      }
      out.push(i)
    }
  }
  const arr = Int32Array.from(out)
  if (idxCache.size > 40) idxCache.clear()
  idxCache.set(key, arr)
  return arr
}

// ---------- Vacancies (sanctioned − deployed), as positional records ----------
export const VACANCY = (() => {
  const total = CURRENT_QUOTAS.sanctioned - CURRENT_QUOTAS.workforce
  const rng = mulberry32(2252)
  const pool = Array.from({ length: N }, (_, i) => i)
  // Vacancies cluster where vendors are weaker (attrition) — templates drawn from roster.
  const templates = weightedSample(rng, pool, (i) => VENDORS[R.vendor[i]!]!.riskWeight, total)
  return {
    total,
    division: Uint8Array.from(templates.map((i) => R.division[i]!)),
    circle: Uint8Array.from(templates.map((i) => R.circle[i]!)),
    region: Uint8Array.from(templates.map((i) => R.region[i]!)),
    location: Uint16Array.from(templates.map((i) => R.location[i]!)),
    vendor: Uint8Array.from(templates.map((i) => R.vendor[i]!)),
    contract: Uint8Array.from(templates.map((i) => R.contract[i]!)),
    category: Uint8Array.from(templates.map((i) => R.category[i]!)),
  }
})()

/** Vacant sanctioned posts within scope (compliance filter ignored — posts are not people). */
export function vacancyList(f: GlobalFilters): number[] {
  if (hasEmptyForced(f)) return []
  const m = matcher(f)
  const out: number[] = []
  for (let k = 0; k < VACANCY.total; k++) {
    if (m.reg && !m.reg.has(VACANCY.region[k]!)) continue
    if (m.cir && !m.cir.has(VACANCY.circle[k]!)) continue
    if (m.div && !m.div.has(VACANCY.division[k]!)) continue
    if (m.loc && !m.loc.has(VACANCY.location[k]!)) continue
    if (m.ven && !m.ven.has(VACANCY.vendor[k]!)) continue
    if (m.con && !m.con.has(VACANCY.contract[k]!)) continue
    if (m.cat && !m.cat.has(VACANCY.category[k]!)) continue
    out.push(k)
  }
  return out
}
export const vacanciesInScope = (f: GlobalFilters) => vacancyList(f).length

// Division sanctioned strength (for masters / drilldowns).
;(function setSanctioned() {
  const deployed = new Array(DIVISIONS.length).fill(0)
  for (let i = 0; i < N; i++) deployed[R.division[i]!]++
  const vac = new Array(DIVISIONS.length).fill(0)
  for (let k = 0; k < VACANCY.total; k++) vac[VACANCY.division[k]!]++
  DIVISIONS.forEach((d, k) => (d.sanctioned = deployed[k] + vac[k]))
  const cDeployed = new Array(CONTRACTS.length).fill(0)
  for (let i = 0; i < N; i++) cDeployed[R.contract[i]!]++
  const cVac = new Array(CONTRACTS.length).fill(0)
  for (let k = 0; k < VACANCY.total; k++) cVac[VACANCY.contract[k]!]++
  CONTRACTS.forEach((c, k) => {
    c.sanctionedManpower = cDeployed[k] + cVac[k]
    c.value = Math.round(c.sanctionedManpower * 19500 * 1.2 * 36 * (0.9 + hash01(77, k) * 0.2))
  })
  void apportion
})()

export type Dim = 'region' | 'circle' | 'division' | 'location' | 'vendor' | 'contract' | 'category'
export const DIM_LIST: Record<Dim, { ids: string[]; names: string[]; col: ArrayLike<number> }> = {
  region: { ids: REGIONS.map((r) => r.id), names: REGIONS.map((r) => r.name), col: R.region },
  circle: { ids: CIRCLES.map((c) => c.id), names: CIRCLES.map((c) => c.name), col: R.circle },
  division: { ids: DIVISIONS.map((d) => d.id), names: DIVISIONS.map((d) => d.name), col: R.division },
  location: { ids: LOCATIONS.map((l) => l.id), names: LOCATIONS.map((l) => l.name), col: R.location },
  vendor: { ids: VENDORS.map((v) => v.id), names: VENDORS.map((v) => v.shortName), col: R.vendor },
  contract: { ids: CONTRACTS.map((c) => c.id), names: CONTRACTS.map((c) => c.number), col: R.contract },
  category: { ids: CATEGORIES as string[], names: CATEGORIES as string[], col: R.category },
}
