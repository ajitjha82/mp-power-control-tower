import type { GlobalFilters, Severity } from '@/types'
import { fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import { CURRENT_MONTH } from '@/data/config'
import { HERO_VENDOR_ID, XYZ_VENDOR_ID, vendorById } from '@/data/vendors'
import { ESI_TYPES } from '@/data/snapshot'
import { breakdown, complianceTrend, summarize } from '@/services/metrics'
import { contractRows, scopedAttendanceExceptions, scopedExceptions, scopedInvoices } from '@/services/entities'

/**
 * Deterministic "AI insight" generator. Every insight is a simple statistical
 * pattern detection computed from the scoped demo data — no model inference,
 * no automatic action. Confidence is a heuristic based on sample size and
 * effect magnitude.
 */
export type Confidence = 'High' | 'Medium' | 'Low'

export interface InsightMetric {
  label: string
  value: string
}

export interface Insight {
  id: string
  title: string
  explanation: string
  metrics: InsightMetric[]
  confidence: Confidence
  confidencePct: number | null
  severity: Severity
  evidenceHref: string
  evidenceLabel: string
  review: string
  /** Higher = more important (used for ordering / compact mode). */
  priority: number
}

const SEV_WEIGHT: Record<Severity, number> = { Critical: 40, High: 30, Medium: 20, Low: 10 }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const stdev = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const confidenceOf = (pct: number): Confidence => (pct >= 80 ? 'High' : pct >= 65 ? 'Medium' : 'Low')

// ---------- 1. PF exceptions vs six-month baseline ----------
function pfVendorInsight(f: GlobalFilters): Insight | null {
  const vendors = breakdown(f, 'vendor').filter((v) => v.pfApplicable > 0)
  if (!vendors.length) return null
  const trend = complianceTrend(f, 7)
  const prior = trend.slice(0, -1)
  const avgScope = mean(prior.map((p) => p.pfExceptions))
  const scopeApp = vendors.reduce((a, v) => a + v.pfApplicable, 0)
  if (!avgScope || !scopeApp) return null
  const cands = vendors
    .filter((v) => v.pfApplicable >= 50)
    .map((v) => {
      const baseline = (avgScope * v.pfApplicable) / scopeApp
      return { v, baseline, ratio: baseline > 0 ? v.pfExceptions / baseline - 1 : 0 }
    })
  if (!cands.length) return null
  const hero = cands.find((c) => c.v.id === HERO_VENDOR_ID && c.ratio > 0.1)
  const pick = hero ?? [...cands].sort((a, b) => b.ratio - a.ratio)[0]!
  if (pick.ratio <= 0.1) return null
  const pctMore = Math.round(pick.ratio * 100)
  const cpct = Math.round(clamp(55 + pick.ratio * 18 + Math.log10(Math.max(1, pick.v.pfExceptions)) * 8, 50, 95))
  const name = vendorById.get(pick.v.id)?.shortName ?? pick.v.name
  return {
    id: 'pf-vendor',
    title: `${name} has generated ${pctMore}% more PF exceptions than its peer-based baseline`,
    explanation: `${fmtNum(pick.v.pfExceptions)} PF exceptions this wage month against a baseline of ~${fmtNum(pick.baseline)} — the scope's six-month average apportioned by ${name}'s share of PF-applicable headcount.`,
    metrics: [
      { label: 'PF exceptions (current)', value: fmtNum(pick.v.pfExceptions) },
      { label: 'Peer-based baseline (6-mo avg)', value: fmtNum(pick.baseline) },
      { label: 'PF compliance', value: fmtPct(pick.v.pfPct) },
    ],
    confidence: confidenceOf(cpct),
    confidencePct: cpct,
    severity: pick.ratio >= 1 ? 'Critical' : pick.ratio >= 0.5 ? 'High' : 'Medium',
    evidenceHref: `/pf?status=exception&vendor=${pick.v.id}`,
    evidenceLabel: 'PF exceptions for this vendor',
    review: 'Compliance Officer to verify the vendor ECR filings and confirm whether the increase reflects a filing gap or a data-quality issue.',
    priority: 0,
  }
}

// ---------- 2. Division attendance-correction rate ----------
function divisionCorrectionInsight(f: GlobalFilters): Insight | null {
  const manual = scopedAttendanceExceptions(f).filter((a) => a.exception === 'Manual modification')
  if (manual.length < 5) return null
  const counts = new Map<string, number>()
  for (const a of manual) counts.set(a.divisionId, (counts.get(a.divisionId) ?? 0) + 1)
  const divs = breakdown(f, 'division').filter((d) => d.workforce >= 100)
  if (divs.length < 3) return null
  const rates = divs.map((d) => ({ d, n: counts.get(d.id) ?? 0, rate: ((counts.get(d.id) ?? 0) / d.workforce) * 1000 }))
  const m = mean(rates.map((r) => r.rate))
  const sd = stdev(rates.map((r) => r.rate))
  if (!sd) return null
  const top = [...rates].sort((a, b) => b.rate - a.rate)[0]!
  const z = (top.rate - m) / sd
  if (z < 1) return null
  const cpct = Math.round(clamp(50 + z * 10 + Math.min(10, top.n), 50, 92))
  return {
    id: 'division-corrections',
    title: `${top.d.name} has an unusually high attendance-correction rate`,
    explanation: `${fmtNum(top.n)} manual attendance modifications — ${top.rate.toFixed(1)} per 1,000 workers versus a division mean of ${m.toFixed(1)} (${z.toFixed(1)}σ above the mean).`,
    metrics: [
      { label: 'Manual corrections', value: fmtNum(top.n) },
      { label: 'Rate / 1,000', value: top.rate.toFixed(1) },
      { label: 'Division mean', value: m.toFixed(1) },
    ],
    confidence: confidenceOf(cpct),
    confidencePct: cpct,
    severity: z >= 2.5 ? 'High' : 'Medium',
    evidenceHref: `/attendance?type=${encodeURIComponent('Manual modification')}&division=${top.d.id}`,
    evidenceLabel: 'Manual attendance modifications',
    review: 'Division Officer to sample the corrected attendance entries and confirm approvals were made by authorised site officers.',
    priority: 0,
  }
}

// ---------- 3. Salary-payment SLA risk ----------
function salarySlaInsight(f: GlobalFilters): Insight | null {
  const vendors = breakdown(f, 'vendor').filter((v) => v.workforce >= 50)
  if (!vendors.length) return null
  const scope = summarize({ ...f, wageMonth: CURRENT_MONTH })
  const xyz = vendors.find((v) => v.id === XYZ_VENDOR_ID && v.salaryPct < scope.salaryPct)
  const pick = xyz ?? [...vendors].sort((a, b) => a.salaryPct - b.salaryPct)[0]!
  if (pick.salaryPct >= scope.salaryPct) return null
  const salEx = scopedExceptions(f).filter((e) => e.vendorId === pick.id && e.category === 'Salary' && e.status !== 'Resolved').length
  const trend = complianceTrend({ ...f, vendors: [pick.id], contracts: [], compliance: [] }, 6)
  const monthsBelow = trend.filter((t) => t.salaryPct < 97).length
  const per100 = (salEx / Math.max(1, pick.workforce)) * 100
  const likelihood = Math.round(clamp(35 + (scope.salaryPct - pick.salaryPct) * 9 + monthsBelow * 4 + Math.min(15, per100 * 1.5), 5, 95))
  const name = vendorById.get(pick.id)?.shortName ?? pick.name
  return {
    id: 'salary-sla',
    title: `${name} has a ${likelihood >= 70 ? 'high' : likelihood >= 45 ? 'moderate' : 'low'} probability of missing its salary-payment SLA`,
    explanation: `Based on recent patterns: salary paid on time for ${fmtPct(pick.salaryPct)} of workers versus ${fmtPct(scope.salaryPct)} for the scope, ${monthsBelow} of the last 6 months below 97%, and ${fmtNum(salEx)} open salary exceptions. Heuristic likelihood, not a prediction of fact.`,
    metrics: [
      { label: 'Heuristic likelihood', value: `${likelihood}%` },
      { label: 'Salary paid on time', value: fmtPct(pick.salaryPct) },
      { label: 'Open salary exceptions', value: fmtNum(salEx) },
    ],
    confidence: 'Medium',
    confidencePct: null,
    severity: likelihood >= 70 ? 'High' : likelihood >= 45 ? 'Medium' : 'Low',
    evidenceHref: `/salary?vendor=${pick.id}`,
    evidenceLabel: 'Salary payments for this vendor',
    review: 'HR / Contract Cell to request the vendor bank payment file before the next due date and confirm credit for delayed workers.',
    priority: 0,
  }
}

// ---------- 4. Blocked invoice concentration ----------
function blockedInvoiceInsight(f: GlobalFilters): Insight | null {
  const blocked = scopedInvoices(f).filter((i) => i.status === 'Blocked')
  if (!blocked.length) return null
  const total = blocked.reduce((a, i) => a + i.amount, 0)
  const byVendor = new Map<string, number>()
  for (const i of blocked) byVendor.set(i.vendorId, (byVendor.get(i.vendorId) ?? 0) + i.amount)
  const sorted = Array.from(byVendor).sort((a, b) => b[1] - a[1])
  const top3 = sorted.slice(0, 3)
  const share = total ? (top3.reduce((a, [, v]) => a + v, 0) / total) * 100 : 0
  const names = top3.map(([id]) => vendorById.get(id)?.shortName ?? id)
  return {
    id: 'blocked-invoices',
    title: `${fmtPct(share, 0)} of blocked invoice value is concentrated in ${top3.length === 1 ? 'one vendor' : `${top3.length} vendors`}`,
    explanation: `${fmtNum(blocked.length)} invoices worth ${fmtINR(total, { compact: true })} are blocked by the compliance gate; ${names.join(', ')} account for ${fmtINR(top3.reduce((a, [, v]) => a + v, 0), { compact: true })}.`,
    metrics: [
      { label: 'Blocked invoices', value: fmtNum(blocked.length) },
      { label: 'Blocked value', value: fmtINR(total, { compact: true }) },
      { label: `Top ${top3.length} share`, value: fmtPct(share, 0) },
    ],
    confidence: 'High',
    confidencePct: null,
    severity: share >= 60 ? 'High' : 'Medium',
    evidenceHref: '/invoices?status=Blocked',
    evidenceLabel: 'Blocked invoices',
    review: 'Finance to prioritise vendor engagement on the concentrated exposure; gate decisions remain with the competent authority.',
    priority: 0,
  }
}

// ---------- 5. ESI exception clustering ----------
function esiClusterInsight(f: GlobalFilters): Insight | null {
  const s = summarize({ ...f, wageMonth: CURRENT_MONTH })
  const total = s.esiByType.reduce((a, b) => a + b, 0)
  if (total < 10) return null
  let top = 0
  s.esiByType.forEach((v, k) => {
    if (v > s.esiByType[top]!) top = k
  })
  const n = s.esiByType[top]!
  const share = (n / total) * 100
  const active = s.esiByType.filter((v) => v > 0).length
  const expected = active ? 100 / active : 0
  if (share < 25) return null
  const type = ESI_TYPES[top]!
  const cpct = Math.round(clamp(50 + (share - expected) * 0.6 + Math.log10(total) * 6, 50, 93))
  return {
    id: 'esi-cluster',
    title: `ESI exceptions are clustering in "${type}"`,
    explanation: `${fmtNum(n)} of ${fmtNum(total)} ESI exceptions (${fmtPct(share, 0)}) fall in a single category, against ~${fmtPct(expected, 0)} if spread evenly across the ${active} active categories.`,
    metrics: [
      { label: 'In category', value: fmtNum(n) },
      { label: 'Share of ESI exceptions', value: fmtPct(share, 0) },
      { label: 'ESI amount at risk', value: fmtINR(s.esiAtRisk, { compact: true }) },
    ],
    confidence: confidenceOf(cpct),
    confidencePct: cpct,
    severity: share >= 45 ? 'High' : 'Medium',
    evidenceHref: `/esi?status=exception&exception=${encodeURIComponent(type)}`,
    evidenceLabel: 'ESI exceptions in this category',
    review: 'Compliance Officer to check whether a common root cause (e.g. a vendor-side filing template) explains the cluster.',
    priority: 0,
  }
}

// ---------- 6. Contracts expiring with high headcount ----------
function expiringContractsInsight(f: GlobalFilters): Insight | null {
  const exp = contractRows(f)
    .filter((c) => c.daysLeft >= 0 && c.daysLeft <= 30)
    .sort((a, b) => b.deployed - a.deployed)
  if (!exp.length) return null
  const heads = exp.reduce((a, c) => a + c.deployed, 0)
  const top = exp[0]!
  return {
    id: 'contracts-expiring',
    title: `${exp.length} contract${exp.length === 1 ? '' : 's'} covering ${fmtNum(heads)} workers expire within 30 days`,
    explanation: `The largest is ${top.number} (${top.vendorName}) with ${fmtNum(top.deployed)} deployed workers, expiring in ${top.daysLeft} days. Continuity of deployment and statutory filings depends on timely renewal.`,
    metrics: [
      { label: 'Contracts expiring', value: fmtNum(exp.length) },
      { label: 'Workers covered', value: fmtNum(heads) },
      { label: 'Soonest expiry', value: `${Math.min(...exp.map((c) => c.daysLeft))} days` },
    ],
    confidence: 'High',
    confidencePct: null,
    severity: heads >= 2000 ? 'High' : 'Medium',
    evidenceHref: '/contracts?expiring=1',
    evidenceLabel: 'Contract register',
    review: 'HR / Contract Cell to confirm renewal or extension decisions and notify affected divisions.',
    priority: 0,
  }
}

const GENERATORS: Array<[number, (f: GlobalFilters) => Insight | null]> = [
  [6, pfVendorInsight],
  [5, salarySlaInsight],
  [4, blockedInvoiceInsight],
  [3, divisionCorrectionInsight],
  [2, esiClusterInsight],
  [1, expiringContractsInsight],
]

export function computeInsights(f: GlobalFilters): Insight[] {
  const out: Insight[] = []
  for (const [base, gen] of GENERATORS) {
    const ins = gen(f)
    if (ins) out.push({ ...ins, priority: SEV_WEIGHT[ins.severity] + base })
  }
  return out.sort((a, b) => b.priority - a.priority)
}
