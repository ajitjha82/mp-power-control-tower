import type { Employee, EmployeeCategory, EmploymentStatus } from '@/types'
import { apportion, hash01, mulberry32, shuffle, weightedSample } from '@/lib/rng'
import { mask } from '@/lib/utils'
import { CIRCLES, DIVISIONS, HERO_LOCATION_ID, LOCATIONS, REGIONS, locationsByRegion } from './org'
import { CLEAN_CONTRACT_IDS, CONTRACTS, CONTRACT_SCOPE, HERO_CONTRACT_ID, SCOPE_CATEGORY_MIX, VENDORS, VENDOR_SIZE_WEIGHT } from './vendors'
import { CURRENT_QUOTAS, WAGE_MONTHS } from './config'

/**
 * Columnar roster of ~60k fictional outsourced personnel. Stored in typed
 * arrays (not 60k objects) so filtering stays fast; `getEmployee(idx)`
 * materialises a full record on demand.
 */
export const N = CURRENT_QUOTAS.workforce
export const HERO_IDX = 234 // EMP-10234
export const empId = (idx: number) => `EMP-${10000 + idx}`
export const idxFromEmpId = (id: string) => {
  const m = /^EMP-(\d+)$/i.exec(id.trim())
  if (!m) return -1
  const i = Number(m[1]) - 10000
  return i >= 0 && i < N ? i : -1
}

export const CATEGORIES: EmployeeCategory[] = ['Unskilled', 'Semi-skilled', 'Skilled', 'Highly Skilled', 'Clerical', 'Security', 'Driver']
const DESIGNATIONS: Record<EmployeeCategory, string[]> = {
  Unskilled: ['Helper', 'Sweeper', 'Peon', 'Loader', 'General Labour'],
  'Semi-skilled': ['Lineman Helper', 'Meter Reader', 'Store Assistant', 'Pump Operator', 'Assistant Operator'],
  Skilled: ['Substation Operator', 'Electrician', 'Fitter', 'Welder', 'Lineman'],
  'Highly Skilled': ['Plant Technician', 'Instrument Technician', 'Shift Supervisor', 'Junior Engineer (Contract)'],
  Clerical: ['Data Entry Operator', 'Office Assistant', 'Computer Operator', 'Billing Clerk'],
  Security: ['Security Guard', 'Security Supervisor', 'Gunman'],
  Driver: ['Driver (LMV)', 'Driver (HMV)'],
}
const RATE_RANGE: Record<EmployeeCategory, [number, number]> = {
  Unskilled: [12400, 15600],
  'Semi-skilled': [14000, 17800],
  Skilled: [16400, 21800],
  'Highly Skilled': [21000, 32500],
  Clerical: [15000, 20500],
  Security: [13200, 17400],
  Driver: [16000, 21200],
}
const FIRST_M = ['Rajesh', 'Suresh', 'Ramesh', 'Mahesh', 'Dinesh', 'Anil', 'Sunil', 'Vijay', 'Ajay', 'Sanjay', 'Manoj', 'Rakesh', 'Mukesh', 'Arvind', 'Ashok', 'Deepak', 'Pradeep', 'Santosh', 'Rahul', 'Amit', 'Sachin', 'Vikas', 'Rohit', 'Nitin', 'Ravi', 'Gopal', 'Kamlesh', 'Brijesh', 'Shailendra', 'Yogesh', 'Hemant', 'Lokesh', 'Pankaj', 'Narendra', 'Devendra', 'Jitendra', 'Raju', 'Mohan', 'Shyam', 'Bharat']
const FIRST_F = ['Sunita', 'Anita', 'Kavita', 'Rekha', 'Pooja', 'Neha', 'Priya', 'Seema', 'Geeta', 'Meena', 'Sarita', 'Usha', 'Rani', 'Lata', 'Asha', 'Jyoti', 'Sapna', 'Mamta', 'Ritu', 'Nisha']
const LAST = ['Sharma', 'Verma', 'Patel', 'Yadav', 'Singh', 'Chouhan', 'Rajput', 'Tiwari', 'Mishra', 'Dubey', 'Pandey', 'Gupta', 'Jain', 'Sahu', 'Kushwaha', 'Lodhi', 'Thakur', 'Rathore', 'Prajapati', 'Ahirwar', 'Malviya', 'Meena', 'Dhakad', 'Kurmi', 'Namdev', 'Solanki', 'Bhadoriya', 'Tomar', 'Raghuvanshi', 'Vishwakarma']
const STATUSES: EmploymentStatus[] = ['Active', 'Separated', 'On Notice', 'Suspended']

/** Workforce on roll at the end of each wage month (drives month snapshots). */
const WORKFORCE_BY_MONTH = [57880, 58071, 58260, 58402, 58611, 58830, 59012, 59265, 59490, 59733, 59981, 60248]

export const R = {
  vendor: new Uint8Array(N),
  contract: new Uint8Array(N),
  location: new Uint16Array(N),
  division: new Uint8Array(N),
  circle: new Uint8Array(N),
  region: new Uint8Array(N),
  category: new Uint8Array(N),
  designation: new Uint8Array(N),
  gender: new Uint8Array(N),
  first: new Uint8Array(N),
  last: new Uint8Array(N),
  status: new Uint8Array(N),
  /** Index into WAGE_MONTHS of first month on roll (0 = on roll since before Oct-2025). */
  joinMonth: new Uint8Array(N),
  joinDay: new Uint16Array(N), // days since 2016-01-01 for pre-window joiners
  pfApplicable: new Uint8Array(N),
  esiApplicable: new Uint8Array(N),
  rate: new Uint16Array(N),
}

const contractIndex = new Map(CONTRACTS.map((c, i) => [c.id, i]))
const vendorIndex = new Map(VENDORS.map((v, i) => [v.id, i]))
const locIndex = new Map(LOCATIONS.map((l, i) => [l.id, i]))
const divIndex = new Map(DIVISIONS.map((d, i) => [d.id, i]))
const circleIndex = new Map(CIRCLES.map((c, i) => [c.id, i]))
const regionIndex = new Map(REGIONS.map((r, i) => [r.id, i]))
export const IDX = { contractIndex, vendorIndex, locIndex, divIndex, circleIndex, regionIndex }

export const contractSize = new Map<string, number>()
export const SEPARATED_POOL: number[] = []

;(function generate() {
  const rng = mulberry32(60248)

  // 1. Vendor → contract head-counts (exact via largest remainder).
  const vendorSizes = apportion(N, VENDOR_SIZE_WEIGHT)
  const slots: number[] = []
  VENDORS.forEach((v, vi) => {
    const cs = CONTRACTS.map((c, ci) => [c, ci] as const).filter(([c]) => c.vendorId === v.id)
    let sizes = apportion(vendorSizes[vi]!, cs.map((_, k) => [1.25, 1, 0.75][k] ?? 0.6))
    if (v.id === 'V-001') {
      // Hero contract fixed at 640 heads; remainder spread over siblings.
      const rest = vendorSizes[vi]! - 640
      sizes = [640, ...apportion(rest, cs.slice(1).map(() => 1))]
    }
    cs.forEach(([c, ci], k) => {
      contractSize.set(c.id, sizes[k]!)
      for (let s = 0; s < sizes[k]!; s++) slots.push(ci)
    })
  })
  shuffle(rng, slots)
  const heroCi = contractIndex.get(HERO_CONTRACT_ID)!
  if (slots[HERO_IDX] !== heroCi) {
    const j = slots.indexOf(heroCi)
    ;[slots[HERO_IDX], slots[j]] = [slots[j]!, slots[HERO_IDX]!]
  }

  // 2. Per-employee attributes.
  for (let i = 0; i < N; i++) {
    const ci = slots[i]!
    const c = CONTRACTS[ci]!
    R.contract[i] = ci
    R.vendor[i] = vendorIndex.get(c.vendorId)!
    const locs = locationsByRegion.get(c.regionId)!
    // Prefer field sites over offices; deterministic per employee.
    let loc = locs[Math.floor(hash01(11, i) * locs.length)]!
    if (loc.type === 'Division Office' && hash01(12, i) < 0.6) loc = locs[Math.floor(hash01(13, i) * locs.length)]!
    if (i === HERO_IDX) loc = LOCATIONS[locIndex.get(HERO_LOCATION_ID)!]!
    R.location[i] = locIndex.get(loc.id)!
    R.division[i] = divIndex.get(loc.divisionId)!
    R.circle[i] = circleIndex.get(loc.circleId)!
    R.region[i] = regionIndex.get(loc.regionId)!

    const mix = SCOPE_CATEGORY_MIX[CONTRACT_SCOPE.get(c.id)!]
    const total = mix.reduce((a, [, w]) => a + w, 0)
    let r = hash01(21, i) * total
    let cat: EmployeeCategory = mix[0]![0]
    for (const [k, w] of mix) {
      if ((r -= w) <= 0) { cat = k; break }
    }
    if (i === HERO_IDX) cat = 'Skilled'
    R.category[i] = CATEGORIES.indexOf(cat)
    const designations = DESIGNATIONS[cat]
    R.designation[i] = i === HERO_IDX ? 0 : Math.floor(hash01(22, i) * designations.length)
    const female = cat !== 'Security' && cat !== 'Driver' ? hash01(23, i) < (cat === 'Clerical' ? 0.34 : 0.1) : hash01(23, i) < 0.03
    R.gender[i] = i === HERO_IDX ? 0 : female ? 1 : 0
    R.first[i] = Math.floor(hash01(24, i) * (female ? FIRST_F.length : FIRST_M.length))
    R.last[i] = Math.floor(hash01(25, i) * LAST.length)
    R.joinDay[i] = Math.floor(hash01(26, i) * 3570) // 2016-01-01 … 2025-10
  }
  R.first[HERO_IDX] = 0 // Rajesh
  R.last[HERO_IDX] = 0 // Sharma
  R.joinDay[HERO_IDX] = 1900

  // 3. Recent joiners: on-roll counts per month follow WORKFORCE_BY_MONTH.
  const recent = weightedSample(rng, Array.from({ length: N }, (_, i) => i).filter((i) => i !== HERO_IDX), () => 1, N - WORKFORCE_BY_MONTH[0]!)
  let p = 0
  for (let m = 1; m < WORKFORCE_BY_MONTH.length; m++) {
    const add = WORKFORCE_BY_MONTH[m]! - WORKFORCE_BY_MONTH[m - 1]!
    for (let k = 0; k < add; k++) R.joinMonth[recent[p++]!] = m
  }

  // 4. Statutory applicability (roster attributes, exact quotas).
  const all = Array.from({ length: N }, (_, i) => i)
  const esiW = [10, 6, 1.5, 0.15, 4, 8, 3]
  const esiSet = new Set(weightedSample(rng, all.filter((i) => i !== HERO_IDX), (i) => esiW[R.category[i]!]!, CURRENT_QUOTAS.esiApplicable - 1))
  esiSet.add(HERO_IDX)
  const pfW = [6, 6, 4, 1.2, 3, 5, 2.5]
  const pfSet = new Set(weightedSample(rng, all.filter((i) => i !== HERO_IDX), (i) => pfW[R.category[i]!]! * (esiSet.has(i) ? 3 : 1), CURRENT_QUOTAS.pfApplicable - 1))
  pfSet.add(HERO_IDX)
  for (let i = 0; i < N; i++) {
    R.esiApplicable[i] = esiSet.has(i) ? 1 : 0
    R.pfApplicable[i] = pfSet.has(i) ? 1 : 0
    const [lo, hi] = RATE_RANGE[CATEGORIES[R.category[i]!]!]
    let rate = lo + Math.floor(hash01(31, i) * (hi - lo))
    // Rate wage must be consistent with ESI applicability vs the configured ceiling.
    if (R.esiApplicable[i]) rate = Math.min(rate, 20600 - Math.floor(hash01(32, i) * 1800))
    else rate = Math.max(rate, 21400 + Math.floor(hash01(33, i) * 4200))
    R.rate[i] = Math.round(rate / 10) * 10
  }
  R.rate[HERO_IDX] = 18640

  // 5. Mid-month separations (feed "separated" exception types).
  const pool = all.filter(
    (i) => i !== HERO_IDX && R.pfApplicable[i] && R.esiApplicable[i] && !CLEAN_CONTRACT_IDS.has(CONTRACTS[R.contract[i]!]!.id) && R.contract[i] !== heroCi && R.joinMonth[i] === 0,
  )
  const separated = weightedSample(rng, pool, () => 1, 70)
  separated.forEach((i, k) => {
    R.status[i] = k < 56 ? 1 : 2 // Separated / On Notice
    if (k < 56) SEPARATED_POOL.push(i)
  })
  const suspended = weightedSample(rng, pool.filter((i) => R.status[i] === 0), () => 1, 18)
  suspended.forEach((i) => (R.status[i] = 3))
})()

// ---------- Accessors ----------
const BASE = Date.UTC(2016, 0, 1)
export function joinDate(idx: number) {
  const m = R.joinMonth[idx]!
  if (m > 0) {
    const month = WAGE_MONTHS[m]!
    return `${month}-${String(1 + Math.floor(hash01(27, idx) * 27)).padStart(2, '0')}`
  }
  return new Date(BASE + R.joinDay[idx]! * 86400000).toISOString().slice(0, 10)
}

export const employeeName = (i: number) =>
  `${R.gender[i] ? FIRST_F[R.first[i]!] : FIRST_M[R.first[i]!]} ${LAST[R.last[i]!]}`

function digits(seed: number, i: number, n: number) {
  let s = ''
  for (let k = 0; k < n; k++) s += Math.floor(hash01(seed + k, i) * 10)
  return s
}

export const uanMasked = (idx: number) => mask('1012' + digits(100, idx, 8), 4)
export const esicMasked = (idx: number) => (R.esiApplicable[idx] ? mask('31' + digits(200, idx, 8), 4) : '—')

export function getEmployee(idx: number): Employee {
  const cat = CATEGORIES[R.category[idx]!]!
  const c = CONTRACTS[R.contract[idx]!]!
  const loc = LOCATIONS[R.location[idx]!]!
  return {
    idx,
    id: empId(idx),
    name: employeeName(idx),
    gender: R.gender[idx] ? 'F' : 'M',
    vendorId: c.vendorId,
    contractId: c.id,
    locationId: loc.id,
    divisionId: loc.divisionId,
    circleId: loc.circleId,
    regionId: loc.regionId,
    category: cat,
    designation: DESIGNATIONS[cat][R.designation[idx]!]!,
    joinDate: joinDate(idx),
    status: STATUSES[R.status[idx]!]!,
    uanMasked: uanMasked(idx),
    esicMasked: esicMasked(idx),
    bankMasked: mask(digits(300, idx, 12), 4),
    aadhaarMasked: mask(digits(400, idx, 12), 4),
    mobileMasked: mask('9' + digits(500, idx, 9), 3),
  }
}

/** Rate (monthly gross at full attendance) — not shown as PII. */
export const rateWage = (idx: number) => R.rate[idx]!
