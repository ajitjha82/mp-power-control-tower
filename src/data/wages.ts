import type { ESIRecord, PFRecord, SalaryPayment, Severity, WageRecord } from '@/types'
import { hash01 } from '@/lib/rng'
import { mask } from '@/lib/utils'
import { statutoryConfig as cfg } from './config'
import { R, empId, esicMasked, uanMasked } from './roster'
import { ESI_TYPES, PF_TYPES, SALARY_STATUSES, type Snapshot, esiStatusOf, pfStatusOf } from './snapshot'

/**
 * Deterministic wage / statutory computations for one employee-month.
 * Rates and ceilings come from the configurable `statutoryConfig`.
 */
const r2 = (n: number) => Math.round(n)

export function wageRecord(s: Snapshot, i: number): WageRecord {
  const rate = R.rate[i]!
  const factor = s.payable[i]! / s.monthDays
  const basicDA = r2(rate * 0.62 * factor)
  const hra = r2(rate * 0.18 * factor)
  const otherAllowances = r2(rate * 0.2 * factor)
  const overtime = hash01(41 + s.monthIdx, i) < 0.14 ? r2(rate * 0.04 * (1 + hash01(42, i) * 3)) : 0
  const grossEarned = basicDA + hra + otherAllowances + overtime
  const pfWage = R.pfApplicable[i] ? Math.min(basicDA, cfg.pfWageCeiling) : 0
  const esiWage = R.esiApplicable[i] ? grossEarned : 0
  const employeePF = r2((pfWage * cfg.pfEmployeeRatePct) / 100)
  const employeeESI = Math.ceil((esiWage * cfg.esiEmployeeRatePct) / 100)
  const otherDeductions = hash01(43, i) < 0.08 ? 200 : 0
  return {
    employeeId: empId(i),
    month: s.month,
    monthDays: s.monthDays,
    payableDays: s.payable[i]!,
    basicDA,
    hra,
    otherAllowances,
    overtime,
    grossEarned,
    pfWage,
    esiWage,
    employeePF,
    employeeESI,
    otherDeductions,
    netPayable: grossEarned - employeePF - employeeESI - otherDeductions,
  }
}

function severityFor(type: number, amount: number, ageDays: number, escalated: boolean): Severity {
  if (escalated || (ageDays > 21 && amount > 2500)) return 'Critical'
  if (type === 1 || type === 5 || amount > 3000) return 'High'
  if (type === 8) return 'Low'
  return 'Medium'
}

export function pfRecord(s: Snapshot, i: number): PFRecord {
  const w = wageRecord(s, i)
  const applicable = !!R.pfApplicable[i] && !!s.onRoll[i]
  const expectedEmployee = w.employeePF
  const expectedEmployer = r2((w.pfWage * cfg.pfEmployerRatePct) / 100)
  const t = s.pfEx[i]!
  let reportedWage = w.pfWage
  let reportedEmployee = expectedEmployee
  let reportedEmployer = expectedEmployer
  switch (t) {
    case 1: // Contribution Not Found
    case 5: // Employee Missing in ECR
      reportedWage = 0
      reportedEmployee = 0
      reportedEmployer = 0
      break
    case 2: {
      const f = 0.45 + hash01(51, i) * 0.4
      reportedEmployee = r2(expectedEmployee * f)
      reportedEmployer = r2(expectedEmployer * f)
      break
    }
    case 3: {
      const f = 0.68 + hash01(52, i) * 0.22
      reportedWage = r2(w.pfWage * f)
      reportedEmployee = r2((reportedWage * cfg.pfEmployeeRatePct) / 100)
      reportedEmployer = r2((reportedWage * cfg.pfEmployerRatePct) / 100)
      break
    }
  }
  const expected = expectedEmployee + expectedEmployer
  const reported = reportedEmployee + reportedEmployer
  const difference = reported - expected
  return {
    employeeId: empId(i),
    month: s.month,
    applicable,
    uanMasked: uanMasked(i),
    payableDays: w.payableDays,
    eligibleWage: w.basicDA,
    pfWage: w.pfWage,
    expectedEmployee,
    expectedEmployer,
    reportedWage,
    reportedEmployee,
    reportedEmployer,
    difference,
    status: pfStatusOf(s, i),
    exception: t ? PF_TYPES[t - 1]! : null,
    severity: t ? severityFor(t, pfAtRisk(expected, difference, t), s.pfAge[i]!, s.pfWf[i] === 4) : null,
  }
}

/** Amount at risk: shortfall for amount defects, full liability for identity/evidence defects. */
export function pfAtRisk(expected: number, difference: number, t: number) {
  if (!t) return 0
  return t === 2 || t === 3 ? Math.abs(difference) : expected
}

export function esiRecord(s: Snapshot, i: number): ESIRecord {
  const w = wageRecord(s, i)
  const applicable = !!R.esiApplicable[i] && !!s.onRoll[i]
  const expectedEmployee = w.employeeESI
  const expectedEmployer = Math.ceil((w.esiWage * cfg.esiEmployerRatePct) / 100)
  const t = s.esiEx[i]!
  let reportedEmployee = expectedEmployee
  let reportedEmployer = expectedEmployer
  if (t === 1 || t === 5) {
    reportedEmployee = 0
    reportedEmployer = 0
  } else if (t === 2 || t === 3) {
    const f = t === 2 ? 0.4 + hash01(61, i) * 0.45 : 0.7 + hash01(62, i) * 0.2
    reportedEmployee = r2(expectedEmployee * f)
    reportedEmployer = r2(expectedEmployer * f)
  }
  const expected = expectedEmployee + expectedEmployer
  const difference = reportedEmployee + reportedEmployer - expected
  return {
    employeeId: empId(i),
    month: s.month,
    applicable,
    esicMasked: esicMasked(i),
    payableDays: w.payableDays,
    eligibleWage: w.esiWage,
    expectedEmployee,
    expectedEmployer,
    reportedEmployee,
    reportedEmployer,
    difference,
    status: esiStatusOf(s, i),
    exception: t ? ESI_TYPES[t - 1]! : null,
    severity: t ? severityFor(t, t === 2 || t === 3 ? Math.abs(difference) : expected, s.esiAge[i]!, s.esiWf[i] === 4) : null,
  }
}

export function salaryPayment(s: Snapshot, i: number): SalaryPayment {
  const w = wageRecord(s, i)
  const st = s.salary[i]!
  const [y, m] = s.month.split('-').map(Number)
  const due = new Date(Date.UTC(m === 12 ? y! + 1 : y!, m! % 12, 7))
  const dueDate = due.toISOString().slice(0, 10)
  let reportedPaid = w.netPayable
  let paymentDate: string | null = new Date(due.getTime() - Math.floor(hash01(71, i) * 4) * 86400000).toISOString().slice(0, 10)
  let delayDays = 0
  if (st === 1) {
    paymentDate = null // reported by vendor; bank confirmation awaited
  } else if (st === 2) {
    delayDays = s.delay[i]!
    const paidLate = hash01(72, i) < 0.55
    reportedPaid = paidLate ? w.netPayable : 0
    paymentDate = paidLate ? new Date(due.getTime() + delayDays * 86400000).toISOString().slice(0, 10) : null
  } else if (st === 3) {
    reportedPaid = r2(w.netPayable * (0.5 + hash01(73, i) * 0.4))
  } else if (st === 4) {
    reportedPaid = w.netPayable + (hash01(74, i) < 0.5 ? -1 : 1) * (150 + Math.floor(hash01(75, i) * 1400))
  }
  return {
    employeeId: empId(i),
    month: s.month,
    netPayable: w.netPayable,
    reportedPaid,
    difference: reportedPaid - w.netPayable,
    dueDate,
    paymentDate,
    delayDays,
    mode: paymentDate ? 'Bank Transfer' : 'Pending',
    utrMasked: paymentDate ? mask(`UTR${Math.floor(hash01(76, i) * 1e10)}`, 4) : null,
    status: SALARY_STATUSES[st]!,
  }
}

/** Salary amount at risk for monitoring (unpaid / short amount). */
export function salaryAtRisk(p: SalaryPayment) {
  if (p.status === 'Paid' || p.status === 'Pending') return 0
  return Math.abs(p.difference)
}
