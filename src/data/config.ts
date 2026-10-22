/**
 * Demo configuration. Statutory rates and ceilings are CONFIGURABLE SYSTEM
 * PARAMETERS in the proposed platform — the values below are placeholders for
 * the prototype only and must be sourced from the competent configuration
 * authority in production. UI copy must never present them as legal facts.
 */
export const statutoryConfig = {
  pfEmployeeRatePct: 12,
  pfEmployerRatePct: 12,
  pfWageCeiling: 15000,
  esiEmployeeRatePct: 0.75,
  esiEmployerRatePct: 3.25,
  esiWageCeiling: 21000,
  gstRatePct: 18,
  salaryDueDayOfNextMonth: 7,
  effectiveFrom: '2026-04-01',
  version: 'CFG-DEMO-2026.04',
} as const

export type StatutoryConfig = typeof statutoryConfig

/** "Now" for the prototype — all ageing is computed against this instant. */
export const DATA_AS_OF = '2026-10-22T09:30:00+05:30'
export const TODAY = '2026-10-22'
export const CURRENT_MONTH = '2026-09'

/** Wage months available in the selector (oldest → newest). */
export const WAGE_MONTHS = [
  '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
] as const

export function monthLabel(m: string, short = false) {
  const [y, mm] = m.split('-').map(Number)
  const d = new Date(y!, mm! - 1, 1)
  return d.toLocaleDateString('en-IN', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' })
}

export function daysInMonth(m: string) {
  const [y, mm] = m.split('-').map(Number)
  return new Date(y!, mm!, 0).getDate()
}

/**
 * Headline targets per wage month. The roster snapshot generator assigns
 * statuses by exact quota against these, so every KPI, table and trend
 * reconciles. The current month reproduces the demonstration values.
 */
export interface MonthTarget {
  month: string
  pfApplicablePct: number
  pfCompliancePct: number
  esiCompliancePct: number
  salaryPaidPct: number
  attendancePct: number
}

export const MONTH_TARGETS: Record<string, MonthTarget> = Object.fromEntries(
  (
    [
      ['2025-10', 95.1, 96.2, 96.4, 93.1],
      ['2025-11', 95.4, 96.5, 96.9, 93.4],
      ['2025-12', 95.0, 96.4, 97.2, 92.8],
      ['2026-01', 95.8, 96.8, 97.0, 93.6],
      ['2026-02', 96.0, 97.0, 97.5, 93.9],
      ['2026-03', 96.3, 96.9, 97.8, 93.5],
      ['2026-04', 95.9, 97.1, 97.4, 93.8],
      ['2026-05', 96.4, 97.0, 97.9, 93.2],
      ['2026-06', 96.6, 97.3, 98.0, 94.0],
      ['2026-07', 96.2, 97.2, 97.7, 93.7],
      ['2026-08', 96.5, 97.1, 97.9, 94.0],
      ['2026-09', 96.8, 97.4, 98.1, 94.2],
    ] as const
  ).map(([month, pf, esi, sal, att]) => [
    month,
    { month, pfApplicablePct: 82.84, pfCompliancePct: pf, esiCompliancePct: esi, salaryPaidPct: sal, attendancePct: att },
  ]),
)

/** Exact demonstration quotas for the current wage month. */
export const CURRENT_QUOTAS = {
  workforce: 60248,
  sanctioned: 62500,
  presentToday: 56742,
  pfApplicable: 49910,
  pfExceptions: 1598,
  esiApplicable: 33046,
  esiExceptions: 862,
  salary: { Delayed: 412, Pending: 521, Partial: 128, 'Amount Mismatch': 84 },
} as const
