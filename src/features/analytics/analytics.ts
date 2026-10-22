import type { ExceptionCategory, GlobalFilters, RiskLevel } from '@/types'
import { hash01 } from '@/lib/rng'
import { CURRENT_MONTH } from '@/data/config'
import { attendanceTrend, complianceTrend, summarize } from '@/services/metrics'
import { type VendorRow, scopedAttendanceExceptions, scopedExceptions, vendorRows } from '@/services/entities'

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const stdev = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// ---------- Vendor risk matrix ----------
export type Quadrant = 'Act now' | 'Watch exposure' | 'Watch compliance' | 'Stable'
export interface MatrixPoint {
  id: string
  name: string
  score: number
  exposure: number
  employees: number
  riskLevel: RiskLevel
  riskScore: number
  quadrant: Quadrant
}

export const SCORE_THRESHOLD = 95

export function riskMatrix(f: GlobalFilters) {
  const rows = vendorRows(f)
  const exposureThreshold = median(rows.map((r) => r.amountAtRisk))
  const points: MatrixPoint[] = rows.map((r) => {
    const score = +((r.pfPct + r.esiPct + r.salaryPct) / 3).toFixed(2)
    const highExp = r.amountAtRisk > exposureThreshold
    const lowScore = score < SCORE_THRESHOLD
    return {
      id: r.id,
      name: r.shortName,
      score,
      exposure: r.amountAtRisk,
      employees: r.employees,
      riskLevel: r.riskLevel,
      riskScore: r.riskScore,
      quadrant: highExp && lowScore ? 'Act now' : highExp ? 'Watch exposure' : lowScore ? 'Watch compliance' : 'Stable',
    }
  })
  const minScore = points.length ? Math.min(...points.map((p) => p.score)) : 90
  return { points, exposureThreshold, xMin: Math.max(0, Math.floor(Math.min(minScore, SCORE_THRESHOLD) - 1)) }
}

// ---------- Attendance anomalies (> 1.5σ) ----------
export function attendanceAnomalies(f: GlobalFilters) {
  const data = attendanceTrend(f)
  const vals = data.map((d) => d.pct)
  const m = mean(vals)
  const sd = stdev(vals)
  const points = data.map((d) => ({ ...d, anomaly: sd > 0 && Math.abs(d.pct - m) > 1.5 * sd }))
  return { data: points, mean: +m.toFixed(2), sd: +sd.toFixed(2), anomalies: points.filter((p) => p.anomaly) }
}

// ---------- Compliance-risk trend ----------
export function complianceRisk(f: GlobalFilters) {
  const cur = summarize({ ...f, wageMonth: CURRENT_MONTH })
  const avgPf = cur.pfExceptions ? cur.pfAtRisk / cur.pfExceptions : 0
  const avgEsi = cur.esiExceptions ? cur.esiAtRisk / cur.esiExceptions : 0
  return complianceTrend(f, 12).map((t) => ({
    label: t.label,
    pfExceptions: t.pfExceptions,
    esiExceptions: t.esiExceptions,
    amount: Math.round(t.pfExceptions * avgPf + t.esiExceptions * avgEsi),
  }))
}

// ---------- Overtime anomaly (derived demo metric) ----------
/**
 * Weekly overtime hours are NOT in the source data at weekly grain. This series
 * is derived deterministically: scoped headcount × a baseline of 1.6 OT hours
 * per worker per week, with deterministic variation, and the latest week
 * scaled by the scope's "Excessive hours" attendance-exception rate.
 */
export function overtimeSeries(f: GlobalFilters) {
  const cur = summarize({ ...f, wageMonth: CURRENT_MONTH })
  const excessive = scopedAttendanceExceptions(f).filter((a) => a.exception === 'Excessive hours').length
  const rate = cur.workforce ? excessive / cur.workforce : 0
  const weeks = 12
  const data = Array.from({ length: weeks }, (_, w) => {
    const end = new Date(Date.UTC(2026, 9, 22 - (weeks - 1 - w) * 7))
    const label = end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    let mult = 1 + (hash01(4100, w) - 0.5) * 0.14
    if (w === weeks - 1) mult += Math.min(0.3, rate * 120)
    return { label, hours: Math.round(cur.workforce * 1.6 * mult) }
  })
  const m = mean(data.map((d) => d.hours))
  const sd = stdev(data.map((d) => d.hours))
  const points = data.map((d) => ({ ...d, anomaly: sd > 0 && d.hours - m > 1.5 * sd }))
  return { data: points, mean: Math.round(m), sd: Math.round(sd), excessive }
}

// ---------- Salary-delay risk (heuristic) ----------
export interface SalaryRiskRow {
  id: string
  name: string
  salaryPct: number
  openSalary: number
  employees: number
  score: number
}
export function salaryDelayRisk(f: GlobalFilters): SalaryRiskRow[] {
  const ex = scopedExceptions(f).filter((e) => e.category === 'Salary' && e.status !== 'Resolved')
  const byVendor = new Map<string, number>()
  for (const e of ex) byVendor.set(e.vendorId, (byVendor.get(e.vendorId) ?? 0) + 1)
  return vendorRows(f)
    .map((r) => {
      const open = byVendor.get(r.id) ?? 0
      const per100 = (open / Math.max(1, r.employees)) * 100
      const score = Math.min(100, Math.round((100 - r.salaryPct) * 7 + per100 * 6 + (r.blockedInvoices > 0 ? 5 : 0)))
      return { id: r.id, name: r.shortName, salaryPct: r.salaryPct, openSalary: open, employees: r.employees, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

// ---------- Exception recurrence heat table ----------
export function exceptionRecurrence(f: GlobalFilters) {
  const ex = scopedExceptions(f).filter((e) => e.status !== 'Resolved')
  const catTotals = new Map<ExceptionCategory, number>()
  const vendorTotals = new Map<string, number>()
  const cell = new Map<string, number>()
  for (const e of ex) {
    catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + 1)
    vendorTotals.set(e.vendorId, (vendorTotals.get(e.vendorId) ?? 0) + 1)
    const k = `${e.vendorId}|${e.category}`
    cell.set(k, (cell.get(k) ?? 0) + 1)
  }
  const categories = Array.from(catTotals).sort((a, b) => b[1] - a[1]).map(([c]) => c)
  const names = new Map(vendorRows(f).map((v) => [v.id, v.shortName]))
  const rows = Array.from(vendorTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, total]) => ({ id, name: names.get(id) ?? id, total, counts: categories.map((c) => cell.get(`${id}|${c}`) ?? 0) }))
  const max = Math.max(1, ...rows.flatMap((r) => r.counts))
  return { categories, rows, max }
}

// ---------- Vendor performance ranking ----------
export interface RankRow extends VendorRow {
  rank: number
  exPer100: number
}
export function vendorRanking(f: GlobalFilters): RankRow[] {
  return vendorRows(f)
    .sort((a, b) => b.riskScore - a.riskScore)
    .map((r, k) => ({ ...r, rank: k + 1, exPer100: +((r.openExceptions / Math.max(1, r.employees)) * 100).toFixed(2) }))
}
