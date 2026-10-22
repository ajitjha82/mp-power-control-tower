import type { ESIExceptionType, ExceptionStatus, PFExceptionType, SalaryStatus } from '@/types'
import { apportion, hash01, mulberry32, weightedSample } from '@/lib/rng'
import { CURRENT_MONTH, CURRENT_QUOTAS, MONTH_TARGETS, WAGE_MONTHS, daysInMonth } from './config'
import { CLEAN_CONTRACT_IDS, CONTRACTS, HERO_CONTRACT_ID, VENDORS } from './vendors'
import { HERO_IDX, N, R, SEPARATED_POOL } from './roster'

/**
 * Monthly status snapshot over the roster. Statuses are assigned by exact
 * quota (weighted toward riskier vendors) so every aggregate reconciles.
 */
export const PF_TYPES: PFExceptionType[] = [
  'Contribution Not Found',
  'Short Contribution',
  'Wage Mismatch',
  'UAN Mismatch',
  'Employee Missing',
  'Duplicate Identifier',
  'Separated Employee Contribution',
  'Evidence Pending',
]
export const ESI_TYPES: ESIExceptionType[] = [
  'Contribution Not Found',
  'Short Contribution',
  'Wage Mismatch',
  'ESIC Number Mismatch',
  'Employee Missing',
  'Duplicate Identifier',
  'Separated Employee Contribution',
  'Evidence Pending',
]
const PF_TYPE_COUNTS = [412, 386, 298, 214, 96, 58, 44, 90] // = 1,598
const ESI_TYPE_COUNTS = [214, 198, 162, 141, 52, 31, 22, 42] // = 862
export const WORKFLOW: ExceptionStatus[] = ['Open', 'Awaiting Vendor', 'Vendor Responded', 'Under Review', 'Escalated']
export const SALARY_STATUSES: SalaryStatus[] = ['Paid', 'Pending', 'Delayed', 'Partial', 'Amount Mismatch']

export interface Snapshot {
  month: string
  monthIdx: number
  monthDays: number
  onRoll: Uint8Array
  present: Uint8Array
  payable: Uint8Array
  /** 0 = none, else 1-based index into PF_TYPES */
  pfEx: Uint8Array
  esiEx: Uint8Array
  pfWf: Uint8Array
  esiWf: Uint8Array
  pfAge: Uint8Array
  esiAge: Uint8Array
  /** index into SALARY_STATUSES */
  salary: Uint8Array
  delay: Uint8Array
  salAge: Uint8Array
}

const cache = new Map<string, Snapshot>()
const heroCi = CONTRACTS.findIndex((c) => c.id === HERO_CONTRACT_ID)
const cleanCi = new Set(CONTRACTS.map((c, i) => (CLEAN_CONTRACT_IDS.has(c.id) ? i : -1)).filter((i) => i >= 0))
const risk = (i: number) => VENDORS[R.vendor[i]!]!.riskWeight

function workflowFor(seed: number, i: number) {
  const h = hash01(seed, i)
  return h < 0.32 ? 0 : h < 0.58 ? 1 : h < 0.74 ? 2 : h < 0.92 ? 3 : 4
}

export function getSnapshot(month: string = CURRENT_MONTH): Snapshot {
  const hit = cache.get(month)
  if (hit) return hit
  const monthIdx = WAGE_MONTHS.indexOf(month as (typeof WAGE_MONTHS)[number])
  const isCurrent = month === CURRENT_MONTH
  const target = MONTH_TARGETS[month]!
  const rng = mulberry32(9100 + monthIdx * 131)
  const monthDays = daysInMonth(month)

  const s: Snapshot = {
    month,
    monthIdx,
    monthDays,
    onRoll: new Uint8Array(N),
    present: new Uint8Array(N),
    payable: new Uint8Array(N),
    pfEx: new Uint8Array(N),
    esiEx: new Uint8Array(N),
    pfWf: new Uint8Array(N),
    esiWf: new Uint8Array(N),
    pfAge: new Uint8Array(N),
    esiAge: new Uint8Array(N),
    salary: new Uint8Array(N),
    delay: new Uint8Array(N),
    salAge: new Uint8Array(N),
  }

  const roll: number[] = []
  for (let i = 0; i < N; i++) {
    if (R.joinMonth[i]! <= monthIdx) {
      s.onRoll[i] = 1
      roll.push(i)
      const h = hash01(500 + monthIdx, i)
      const absences = Math.floor(h * h * 9 * Math.min(1.6, risk(i)))
      let payable = monthDays - absences
      if (R.joinMonth[i] === monthIdx && monthIdx > 0) payable = Math.max(4, Math.floor(payable * hash01(501, i)))
      s.payable[i] = Math.max(0, payable)
      s.present[i] = 1
    }
  }
  if (isCurrent) s.payable[HERO_IDX] = 26

  // Attendance (present on reference day)
  const W = roll.length
  const presentN = isCurrent ? CURRENT_QUOTAS.presentToday : Math.round((W * target.attendancePct) / 100)
  for (const i of weightedSample(rng, roll.filter((i) => i !== HERO_IDX), risk, W - presentN)) s.present[i] = 0

  // PF
  const pfApp = roll.filter((i) => R.pfApplicable[i])
  const pfExN = isCurrent ? CURRENT_QUOTAS.pfExceptions : Math.round((pfApp.length * (100 - target.pfCompliancePct)) / 100)
  const pfTypeN = isCurrent ? [...PF_TYPE_COUNTS] : apportion(pfExN, PF_TYPE_COUNTS)
  const assignPf = (i: number, t: number) => {
    s.pfEx[i] = t + 1
    s.pfWf[i] = workflowFor(700 + monthIdx, i)
    s.pfAge[i] = s.pfWf[i] === 4 ? 18 + Math.floor(hash01(701, i) * 28) : 1 + Math.floor(hash01(702, i) * 34)
    pfTypeN[t]!--
  }
  if (isCurrent) {
    // Hero contract: exactly 17 PF exceptions (hero = Contribution Not Found, under review).
    assignPf(HERO_IDX, 0)
    s.pfWf[HERO_IDX] = 3
    s.pfAge[HERO_IDX] = 12
    const heroPeers = pfApp.filter((i) => R.contract[i] === heroCi && i !== HERO_IDX)
    const picked = weightedSample(rng, heroPeers, () => 1, 16)
    const mix = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 7, 7]
    picked.forEach((i, k) => assignPf(i, mix[k]!))
    // Separated-employee contributions come from the separated pool.
    SEPARATED_POOL.slice(0, pfTypeN[6]!).forEach((i) => assignPf(i, 6))
  }
  // Current month: keep the hero as the first PF exception in Employee-ID order (demo path).
  const pfPool = pfApp.filter((i) => !s.pfEx[i] && R.contract[i] !== heroCi && !cleanCi.has(R.contract[i]!) && !(isCurrent && i < HERO_IDX))
  const pfRemaining = pfTypeN.reduce((a, b) => a + b, 0)
  const pfPicked = weightedSample(rng, pfPool, (i) => Math.pow(risk(i), 1.6), pfRemaining)
  let k = 0
  pfTypeN.forEach((cnt, t) => {
    for (let c = 0; c < cnt; c++) assignPf(pfPicked[k++]!, t)
  })

  // ESI
  const esiApp = roll.filter((i) => R.esiApplicable[i])
  const esiExN = isCurrent ? CURRENT_QUOTAS.esiExceptions : Math.round((esiApp.length * (100 - target.esiCompliancePct)) / 100)
  const esiTypeN = isCurrent ? [...ESI_TYPE_COUNTS] : apportion(esiExN, ESI_TYPE_COUNTS)
  const assignEsi = (i: number, t: number) => {
    s.esiEx[i] = t + 1
    s.esiWf[i] = workflowFor(800 + monthIdx, i)
    s.esiAge[i] = s.esiWf[i] === 4 ? 18 + Math.floor(hash01(801, i) * 26) : 1 + Math.floor(hash01(802, i) * 30)
    esiTypeN[t]!--
  }
  if (isCurrent) SEPARATED_POOL.slice(0, esiTypeN[6]!).forEach((i) => assignEsi(i, 6))
  const esiPool = esiApp.filter((i) => !s.esiEx[i] && R.contract[i] !== heroCi && !cleanCi.has(R.contract[i]!))
  const esiPicked = weightedSample(rng, esiPool, (i) => Math.pow(risk(i), 1.4) * (s.pfEx[i] ? 2.5 : 1), esiTypeN.reduce((a, b) => a + b, 0))
  k = 0
  esiTypeN.forEach((cnt, t) => {
    for (let c = 0; c < cnt; c++) assignEsi(esiPicked[k++]!, t)
  })

  // Salary
  const q = CURRENT_QUOTAS.salary
  const issueN = isCurrent ? q.Delayed + q.Pending + q.Partial + q['Amount Mismatch'] : Math.round((W * (100 - target.salaryPaidPct)) / 100)
  const split = isCurrent ? [q.Pending, q.Delayed, q.Partial, q['Amount Mismatch']] : apportion(issueN, [521, 412, 128, 84])
  const salPool = roll.filter((i) => R.contract[i] !== heroCi && !cleanCi.has(R.contract[i]!))
  const salPicked = weightedSample(rng, salPool, (i) => Math.pow(risk(i), 1.5), issueN)
  k = 0
  split.forEach((cnt, t) => {
    for (let c = 0; c < cnt; c++) {
      const i = salPicked[k++]!
      s.salary[i] = t + 1
      s.salAge[i] = 1 + Math.floor(hash01(901, i) * 15)
      if (t === 1) s.delay[i] = 2 + Math.floor(hash01(902, i) * 14)
    }
  })

  cache.set(month, s)
  return s
}

export const pfStatusOf = (s: Snapshot, i: number) => {
  if (!R.pfApplicable[i] || !s.onRoll[i]) return 'Not Applicable' as const
  const t = s.pfEx[i]!
  if (!t) return 'Compliant' as const
  if (s.pfWf[i] === 3) return 'Under Review' as const
  return t === 1 || t === 5 ? ('Missing' as const) : t === 2 ? ('Short' as const) : t === 8 ? ('Pending' as const) : ('Mismatch' as const)
}
export const esiStatusOf = (s: Snapshot, i: number) => {
  if (!R.esiApplicable[i] || !s.onRoll[i]) return 'Not Applicable' as const
  const t = s.esiEx[i]!
  if (!t) return 'Compliant' as const
  if (s.esiWf[i] === 3) return 'Under Review' as const
  return t === 1 || t === 5 ? ('Missing' as const) : t === 2 ? ('Short' as const) : t === 8 ? ('Pending' as const) : ('Mismatch' as const)
}
