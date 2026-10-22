import type { Attendance, AttendanceDay, AttendanceException, AttendanceExceptionType, AttendanceSource, Deployment, Severity } from '@/types'
import { hash01, mulberry32, weightedSample } from '@/lib/rng'
import { CONTRACTS, VENDORS } from './vendors'
import { LOCATIONS } from './org'
import { HERO_IDX, N, R, SEPARATED_POOL, empId, employeeName } from './roster'
import { type Snapshot, getSnapshot } from './snapshot'
import { CURRENT_MONTH } from './config'

export const ATT_TYPES: AttendanceExceptionType[] = [
  'Missing attendance',
  'Missing checkout',
  'Duplicate transaction',
  'Wrong location',
  'Excessive hours',
  'Attendance after separation',
  'Wrong vendor/contract',
  'Manual modification',
]
const ATT_COUNTS = [1184, 932, 143, 287, 96, 12, 37, 418]
const ATT_SEVERITY: Severity[] = ['Medium', 'Low', 'Low', 'High', 'Medium', 'Critical', 'High', 'Medium']
const SOURCES: AttendanceSource[] = ['Biometric', 'Face (Mobile)', 'Geo-fenced App', 'Register Upload']
const SHIFTS: Deployment['shift'][] = ['General', 'A', 'B', 'C']
const SHIFT_IN: Record<Deployment['shift'], number> = { General: 9 * 60 + 30, A: 6 * 60, B: 14 * 60, C: 22 * 60 }

export const shiftOf = (i: number) => SHIFTS[Math.floor(hash01(81, i) * (hash01(82, i) < 0.55 ? 1 : 4))]!
const hhmm = (mins: number) => `${String(Math.floor((mins / 60) % 24)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

let cached: AttendanceException[] | null = null

/** Attendance exceptions raised over the last 7 days (to the demo date). */
export function getAttendanceExceptions(): AttendanceException[] {
  if (cached) return cached
  const s = getSnapshot(CURRENT_MONTH)
  const rng = mulberry32(31337)
  const out: AttendanceException[] = []
  const used = new Set<number>([HERO_IDX])
  const absent: number[] = []
  const present: number[] = []
  for (let i = 0; i < N; i++) {
    if (!s.onRoll[i] || i === HERO_IDX) continue
    ;(s.present[i] ? present : absent).push(i)
  }
  const risk = (i: number) => VENDORS[R.vendor[i]!]!.riskWeight
  let n = 0
  ATT_COUNTS.forEach((count, t) => {
    let pool = t === 0 ? absent : t === 5 ? SEPARATED_POOL : present
    pool = pool.filter((i) => !used.has(i))
    const picked = t === 5 ? pool.slice(0, count) : weightedSample(rng, pool, risk, count)
    for (const i of picked) {
      used.add(i)
      n++
      const shift = shiftOf(i)
      const dayOffset = t === 0 ? 0 : Math.floor(hash01(83, i) * 7)
      const date = new Date(Date.UTC(2026, 9, 22 - dayOffset)).toISOString().slice(0, 10)
      const inMin = SHIFT_IN[shift] + Math.floor(hash01(84, i) * 40) - 10
      const hours = t === 4 ? 13 + Math.floor(hash01(85, i) * 4) : 8 + Math.floor(hash01(86, i) * 2)
      const h = hash01(87, i)
      const status: AttendanceException['status'] =
        t === 7 ? (h < 0.72 ? 'Pending Approval' : h < 0.92 ? 'Corrected' : 'Rejected') : h < 0.11 ? 'Pending Approval' : h < 0.2 ? 'Corrected' : 'Open'
      const loc = LOCATIONS[R.location[i]!]!
      out.push({
        id: `ATX-${String(n).padStart(5, '0')}`,
        employeeId: empId(i),
        employeeName: employeeName(i),
        vendorId: VENDORS[R.vendor[i]!]!.id,
        locationId: loc.id,
        divisionId: loc.divisionId,
        date,
        shift,
        checkIn: t === 0 ? null : hhmm(inMin),
        checkOut: t === 0 || t === 1 ? null : hhmm(inMin + hours * 60),
        source: t === 0 ? null : t === 7 ? 'Manual' : SOURCES[Math.floor(hash01(88, i) * SOURCES.length)]!,
        exception: ATT_TYPES[t]!,
        severity: ATT_SEVERITY[t]!,
        status,
      })
    }
  })
  cached = out
  return out
}

/** Daily attendance register for one employee-month (consistent with payable days). */
export function attendanceFor(s: Snapshot, i: number): Attendance {
  const [y, m] = s.month.split('-').map(Number)
  const days: AttendanceDay[] = []
  const shift = shiftOf(i)
  const payable = s.payable[i]!
  const weekly: number[] = []
  for (let d = 1; d <= s.monthDays; d++) if (new Date(Date.UTC(y!, m! - 1, d)).getUTCDay() === 0) weekly.push(d)
  const absences = s.monthDays - payable
  // Absent days chosen deterministically among working days.
  const working = Array.from({ length: s.monthDays }, (_, k) => k + 1).filter((d) => !weekly.includes(d))
  const absentDays = new Set(
    working
      .map((d) => [hash01(90 + d, i), d] as const)
      .sort((a, b) => a[0] - b[0])
      .slice(0, absences)
      .map((x) => x[1]),
  )
  const joinedThisMonth = R.joinMonth[i] === s.monthIdx && s.monthIdx > 0
  let present = 0
  for (let d = 1; d <= s.monthDays; d++) {
    const date = `${s.month}-${String(d).padStart(2, '0')}`
    if (weekly.includes(d)) {
      days.push({ date, status: 'W', checkIn: null, checkOut: null, hours: 0, source: null, exception: null })
      continue
    }
    if (absentDays.has(d) || (joinedThisMonth && d <= absences)) {
      const leave = hash01(110 + d, i) < 0.45
      days.push({ date, status: leave ? 'L' : 'A', checkIn: null, checkOut: null, hours: 0, source: null, exception: null })
      continue
    }
    present++
    const inMin = SHIFT_IN[shift] + Math.floor(hash01(120 + d, i) * 30) - 10
    const hrs = 8 + Math.round(hash01(130 + d, i) * 10) / 10
    days.push({
      date,
      status: 'P',
      checkIn: hhmm(inMin),
      checkOut: hhmm(inMin + Math.round(hrs * 60)),
      hours: hrs,
      source: hash01(140 + d, i) < 0.04 ? 'Manual' : SOURCES[Math.floor(hash01(141, i) * 3)]!,
      exception: hash01(140 + d, i) < 0.04 ? 'Manual modification' : null,
    })
  }
  return { employeeId: empId(i), month: s.month, days, present, payableDays: payable }
}

export const contractOf = (i: number) => CONTRACTS[R.contract[i]!]!
