import type { GlobalFilters } from '@/types'
import { hash01 } from '@/lib/rng'
import { pct } from '@/lib/utils'
import { CURRENT_MONTH, MONTH_TARGETS, WAGE_MONTHS, monthLabel } from '@/data/config'
import { N, R } from '@/data/roster'
import { type Snapshot, getSnapshot } from '@/data/snapshot'
import { esiRecord, pfAtRisk, pfRecord, salaryPayment } from '@/data/wages'
import { DIM_LIST, type Dim, VACANCY, scopeIndices, vacanciesInScope, vacancyList } from './scope'

export interface Summary {
  workforce: number
  sanctioned: number
  vacant: number
  present: number
  absent: number
  attendancePct: number
  pfApplicable: number
  pfCompliant: number
  pfExceptions: number
  pfPct: number
  pfAtRisk: number
  pfByType: number[]
  esiApplicable: number
  esiCompliant: number
  esiExceptions: number
  esiPct: number
  esiAtRisk: number
  esiByType: number[]
  salaryByStatus: number[] // Paid, Pending, Delayed, Partial, Mismatch
  salaryPct: number
  salaryAtRisk: number
  totalAtRisk: number
}

const sumCache = new Map<string, Summary>()

export function summarize(f: GlobalFilters): Summary {
  const key = JSON.stringify(f)
  const hit = sumCache.get(key)
  if (hit) return hit
  const s = getSnapshot(f.wageMonth)
  const idx = scopeIndices(f)
  let present = 0, pfApp = 0, pfEx = 0, esiApp = 0, esiEx = 0, pfRisk = 0, esiRisk = 0, salRisk = 0
  const pfByType = new Array(8).fill(0)
  const esiByType = new Array(8).fill(0)
  const sal = [0, 0, 0, 0, 0]
  for (const i of idx) {
    present += s.present[i]!
    if (R.pfApplicable[i]) {
      pfApp++
      const t = s.pfEx[i]!
      if (t) {
        pfEx++
        pfByType[t - 1]++
        const r = pfRecord(s, i)
        pfRisk += pfAtRisk(r.expectedEmployee + r.expectedEmployer, r.difference, t)
      }
    }
    if (R.esiApplicable[i]) {
      esiApp++
      const t = s.esiEx[i]!
      if (t) {
        esiEx++
        esiByType[t - 1]++
        const r = esiRecord(s, i)
        esiRisk += t === 2 || t === 3 ? Math.abs(r.difference) : r.expectedEmployee + r.expectedEmployer
      }
    }
    sal[s.salary[i]!]++
    if (s.salary[i]! >= 2) salRisk += Math.abs(salaryPayment(s, i).difference)
  }
  const workforce = idx.length
  const vacant = f.compliance.length ? 0 : vacanciesInScope(f)
  const out: Summary = {
    workforce,
    sanctioned: workforce + vacant,
    vacant,
    present,
    absent: workforce - present,
    attendancePct: pct(present, workforce),
    pfApplicable: pfApp,
    pfCompliant: pfApp - pfEx,
    pfExceptions: pfEx,
    pfPct: pct(pfApp - pfEx, pfApp),
    pfAtRisk: pfRisk,
    pfByType,
    esiApplicable: esiApp,
    esiCompliant: esiApp - esiEx,
    esiExceptions: esiEx,
    esiPct: pct(esiApp - esiEx, esiApp),
    esiAtRisk: esiRisk,
    esiByType,
    salaryByStatus: sal,
    salaryPct: pct(sal[0]!, workforce),
    salaryAtRisk: salRisk,
    totalAtRisk: pfRisk + esiRisk + salRisk,
  }
  if (sumCache.size > 40) sumCache.clear()
  sumCache.set(key, out)
  return out
}

export interface GroupRow {
  id: string
  name: string
  workforce: number
  sanctioned: number
  present: number
  absent: number
  vacant: number
  attendancePct: number
  pfApplicable: number
  pfExceptions: number
  pfPct: number
  esiApplicable: number
  esiExceptions: number
  esiPct: number
  salaryIssues: number
  salaryPct: number
}

/** Cheap group-by over the scoped roster (no wage computation). */
export function breakdown(f: GlobalFilters, dim: Dim): GroupRow[] {
  const s: Snapshot = getSnapshot(f.wageMonth)
  const idx = scopeIndices(f)
  const { ids, names, col } = DIM_LIST[dim]
  const acc = ids.map(() => ({ w: 0, p: 0, pa: 0, pe: 0, ea: 0, ee: 0, si: 0, v: 0 }))
  for (const i of idx) {
    const a = acc[col[i]!]!
    a.w++
    a.p += s.present[i]!
    if (R.pfApplicable[i]) { a.pa++; if (s.pfEx[i]) a.pe++ }
    if (R.esiApplicable[i]) { a.ea++; if (s.esiEx[i]) a.ee++ }
    if (s.salary[i]) a.si++
  }
  if (!f.compliance.length) {
    const vcol = dim === 'region' ? VACANCY.region : dim === 'circle' ? VACANCY.circle : dim === 'division' ? VACANCY.division : dim === 'location' ? VACANCY.location : dim === 'vendor' ? VACANCY.vendor : dim === 'contract' ? VACANCY.contract : VACANCY.category
    for (const k of vacancyList(f)) acc[vcol[k]!]!.v++
  }
  return ids
    .map((id, k) => {
      const a = acc[k]!
      return {
        id,
        name: names[k]!,
        workforce: a.w,
        sanctioned: a.w + a.v,
        present: a.p,
        absent: a.w - a.p,
        vacant: a.v,
        attendancePct: pct(a.p, a.w),
        pfApplicable: a.pa,
        pfExceptions: a.pe,
        pfPct: pct(a.pa - a.pe, a.pa),
        esiApplicable: a.ea,
        esiExceptions: a.ee,
        esiPct: pct(a.ea - a.ee, a.ea),
        salaryIssues: a.si,
        salaryPct: pct(a.w - a.si, a.w),
      }
    })
    .filter((r) => r.workforce > 0)
}

// ---------- Trends ----------
export interface CompliancePoint {
  month: string
  label: string
  pfPct: number
  esiPct: number
  pfExceptions: number
  esiExceptions: number
  salaryPct: number
  attendancePct: number
  workforce: number
}

/**
 * Monthly compliance trend for the scope. Unfiltered values follow the monthly
 * targets used to generate each snapshot; scoped values are anchored to the
 * scope's actual current value and carry the enterprise month-on-month shape.
 */
export function complianceTrend(f: GlobalFilters, months: number): CompliancePoint[] {
  const cur = summarize({ ...f, wageMonth: CURRENT_MONTH })
  const base = MONTH_TARGETS[CURRENT_MONTH]!
  // Window ends at the selected wage month so month-on-month deltas stay meaningful.
  const end = WAGE_MONTHS.indexOf(f.wageMonth as (typeof WAGE_MONTHS)[number]) + 1 || WAGE_MONTHS.length
  const list = WAGE_MONTHS.slice(Math.max(0, end - months), end)
  const idx = scopeIndices({ ...f, wageMonth: CURRENT_MONTH })
  return list.map((m) => {
    const t = MONTH_TARGETS[m]!
    const mi = WAGE_MONTHS.indexOf(m)
    let w = 0, pa = 0, ea = 0
    for (const i of idx) {
      if (R.joinMonth[i]! <= mi) {
        w++
        if (R.pfApplicable[i]) pa++
        if (R.esiApplicable[i]) ea++
      }
    }
    const clamp = (v: number) => Math.max(80, Math.min(100, v))
    const pfPct = m === CURRENT_MONTH ? cur.pfPct : clamp(cur.pfPct + (t.pfCompliancePct - base.pfCompliancePct))
    const esiPct = m === CURRENT_MONTH ? cur.esiPct : clamp(cur.esiPct + (t.esiCompliancePct - base.esiCompliancePct))
    return {
      month: m,
      label: monthLabel(m, true),
      pfPct: +pfPct.toFixed(2),
      esiPct: +esiPct.toFixed(2),
      pfExceptions: m === CURRENT_MONTH ? cur.pfExceptions : Math.round((pa * (100 - pfPct)) / 100),
      esiExceptions: m === CURRENT_MONTH ? cur.esiExceptions : Math.round((ea * (100 - esiPct)) / 100),
      salaryPct: +(m === CURRENT_MONTH ? cur.salaryPct : clamp(cur.salaryPct + (t.salaryPaidPct - base.salaryPaidPct))).toFixed(2),
      attendancePct: +(m === CURRENT_MONTH ? cur.attendancePct : clamp(cur.attendancePct + (t.attendancePct - base.attendancePct))).toFixed(2),
      workforce: w,
    }
  })
}

/** 30-day daily attendance trend ending on the demo date. */
export function attendanceTrend(f: GlobalFilters) {
  const cur = summarize({ ...f, wageMonth: CURRENT_MONTH })
  const out: Array<{ date: string; label: string; pct: number; present: number; absent: number }> = []
  for (let d = 29; d >= 0; d--) {
    const t = Date.UTC(2026, 9, 22 - d)
    const date = new Date(t).toISOString().slice(0, 10)
    const dow = new Date(t).getUTCDay()
    const noise = d === 0 ? 0 : (hash01(3001, d) - 0.5) * 2.2 - (dow === 1 ? 0.6 : 0) + (dow === 0 ? -1.4 : 0)
    const p = Math.max(70, Math.min(99.5, cur.attendancePct + noise))
    const present = Math.round((cur.workforce * p) / 100)
    out.push({ date, label: new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), pct: +p.toFixed(2), present, absent: cur.workforce - present })
  }
  return out
}

export const totalRoster = N
