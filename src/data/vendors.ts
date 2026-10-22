import type { Contract, EmployeeCategory, Vendor } from '@/types'
import { mulberry32, pick, shuffle } from '@/lib/rng'
import { mask } from '@/lib/utils'
import { REGIONS } from './org'

/** Entirely fictional service providers. */
const VENDOR_DEF: Array<[name: string, short: string, risk: number, size: number, scope: Scope]> = [
  ['ABC Manpower Services Pvt. Ltd.', 'ABC Manpower', 3.2, 6, 'O&M Support'],
  ['Narmada Workforce Solutions Pvt. Ltd.', 'Narmada Workforce', 0.6, 9, 'O&M Support'],
  ['Vindhya Facility Management LLP', 'Vindhya Facility', 0.9, 7, 'Housekeeping & Facility'],
  ['Satpura Security & Allied Services', 'Satpura Security', 1.4, 6, 'Security Services'],
  ['Malwa Industrial Staffing Pvt. Ltd.', 'Malwa Staffing', 1.0, 8, 'O&M Support'],
  ['Chambal Technical Services', 'Chambal Technical', 1.8, 4, 'Plant Operations Support'],
  ['XYZ Facility Management LLP', 'XYZ Facility', 2.4, 5, 'Housekeeping & Facility'],
  ['Mahakoshal Manpower Agency', 'Mahakoshal Manpower', 1.2, 4, 'O&M Support'],
  ['Bundelkhand Labour Contractors', 'Bundelkhand Labour', 2.0, 3, 'O&M Support'],
  ['Kshipra Integrated Services', 'Kshipra Integrated', 0.7, 5, 'Data Entry & Clerical'],
  ['Tapti Engineering Support Pvt. Ltd.', 'Tapti Engineering', 0.5, 4, 'Plant Operations Support'],
  ['Betwa Outsourcing Solutions', 'Betwa Outsourcing', 1.1, 3, 'Meter Reading & Billing'],
  ['Sonbhadra Plant Services', 'Sonbhadra Plant', 1.6, 4, 'Plant Operations Support'],
  ['Omkar Security Services', 'Omkar Security', 1.3, 3, 'Security Services'],
  ['Shreeji Facility Services', 'Shreeji Facility', 0.8, 3, 'Housekeeping & Facility'],
  ['Pragati Human Resource Pvt. Ltd.', 'Pragati HR', 0.6, 4, 'Data Entry & Clerical'],
  ['Unnati Staffing Solutions', 'Unnati Staffing', 1.0, 2.5, 'O&M Support'],
  ['Avanti Skilled Workforce', 'Avanti Skilled', 0.9, 2.5, 'O&M Support'],
  ['Bharat Industrial Manpower', 'Bharat Industrial', 1.5, 2.5, 'Plant Operations Support'],
  ['Sanjivani Housekeeping Services', 'Sanjivani Housekeeping', 1.2, 2, 'Housekeeping & Facility'],
  ['Vikas Meter Reading Services', 'Vikas Meter Reading', 1.7, 2.5, 'Meter Reading & Billing'],
  ['Rewa Technical Contractors', 'Rewa Technical', 1.4, 2, 'O&M Support'],
  ['Gwalior Guard & Allied', 'Gwalior Guard', 1.1, 2, 'Security Services'],
  ['Dhara Data Services Pvt. Ltd.', 'Dhara Data', 0.4, 2, 'Data Entry & Clerical'],
  ['Aarambh Fleet & Transport', 'Aarambh Fleet', 1.3, 1.5, 'Driver & Fleet'],
  ['Samarth Engineering Services', 'Samarth Engineering', 0.7, 2, 'Plant Operations Support'],
  ['Nirmal Utility Services', 'Nirmal Utility', 0.9, 1.5, 'Housekeeping & Facility'],
  ['Jai Ambe Manpower Agency', 'Jai Ambe Manpower', 2.2, 1.5, 'O&M Support'],
  ['Sahyog Contract Services', 'Sahyog Contract', 1.0, 1.2, 'Meter Reading & Billing'],
  ['Kalpana Enterprises', 'Kalpana Enterprises', 1.5, 1, 'Driver & Fleet'],
  ['Trident Power Services Pvt. Ltd.', 'Trident Power', 0.5, 1.8, 'Plant Operations Support'],
  ['Ujjwal Allied Services', 'Ujjwal Allied', 1.2, 1, 'Security Services'],
]

export type Scope =
  | 'O&M Support'
  | 'Security Services'
  | 'Housekeeping & Facility'
  | 'Data Entry & Clerical'
  | 'Plant Operations Support'
  | 'Driver & Fleet'
  | 'Meter Reading & Billing'

export const SCOPE_CATEGORY_MIX: Record<Scope, Array<[EmployeeCategory, number]>> = {
  'O&M Support': [['Unskilled', 30], ['Semi-skilled', 32], ['Skilled', 28], ['Highly Skilled', 6], ['Clerical', 4]],
  'Security Services': [['Security', 88], ['Semi-skilled', 8], ['Clerical', 4]],
  'Housekeeping & Facility': [['Unskilled', 70], ['Semi-skilled', 24], ['Clerical', 6]],
  'Data Entry & Clerical': [['Clerical', 78], ['Skilled', 14], ['Highly Skilled', 8]],
  'Plant Operations Support': [['Semi-skilled', 30], ['Skilled', 40], ['Highly Skilled', 18], ['Unskilled', 12]],
  'Driver & Fleet': [['Driver', 86], ['Unskilled', 14]],
  'Meter Reading & Billing': [['Semi-skilled', 52], ['Skilled', 20], ['Clerical', 28]],
}

const CONTACTS = ['A. Mishra', 'S. Tiwari', 'R. Dubey', 'P. Chouhan', 'K. Patel', 'M. Rathore', 'N. Saxena', 'V. Jain', 'D. Yadav', 'H. Thakur']
const CITIES = ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Rewa', 'Satna']

export const VENDORS: Vendor[] = VENDOR_DEF.map(([name, shortName, riskWeight], i) => {
  const rng = mulberry32(7000 + i)
  return {
    id: `V-${String(i + 1).padStart(3, '0')}`,
    name,
    shortName,
    riskWeight,
    gstinMasked: mask(`23AAB${String(1000 + i * 37).slice(0, 4)}F1Z${i % 9}`, 4),
    registeredOffice: pick(rng, CITIES),
    contactPerson: pick(rng, CONTACTS),
    since: 2012 + Math.floor(rng() * 11),
  }
})

export const VENDOR_SIZE_WEIGHT = VENDOR_DEF.map((d) => d[3])
export const VENDOR_SCOPE = VENDOR_DEF.map((d) => d[4])

export const CONTRACTS: Contract[] = []
/** Contracts with no statutory/salary exceptions this month (approved invoices). */
export const CLEAN_CONTRACT_IDS = new Set<string>()
export const CONTRACT_SCOPE = new Map<string, Scope>()

/** Hero demo contract — its Sep-2026 invoice is blocked by exactly 17 PF exceptions. */
export const HERO_CONTRACT_ID = 'CT-001'
export const HERO_VENDOR_ID = 'V-001'
export const XYZ_VENDOR_ID = 'V-007'

;(function buildContracts() {
  const rng = mulberry32(424242)
  let n = 0
  // Contracts expiring within 30 days of the demo date (7 required).
  const expiringSoon = new Set([5, 14, 22, 31, 40, 47]) // + XYZ (CT-018) = 7
  VENDORS.forEach((v, vi) => {
    const size = VENDOR_SIZE_WEIGHT[vi]!
    const count = size >= 5 ? 3 : size >= 2.5 ? 2 : vi % 2 === 0 ? 2 : 1
    const baseScope = VENDOR_SCOPE[vi]!
    const regionOrder = shuffle(rng, [...REGIONS])
    for (let k = 0; k < count; k++) {
      n++
      const id = `CT-${String(n).padStart(3, '0')}`
      let region = regionOrder[k % regionOrder.length]!
      if (id === HERO_CONTRACT_ID) region = REGIONS[0]!
      const scope: Scope = region.id === 'R-GT' && (baseScope === 'O&M Support' || baseScope === 'Meter Reading & Billing') ? 'Plant Operations Support' : baseScope
      const startYear = 2023 + Math.floor(rng() * 3)
      let end = `${startYear + 3}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 27)).padStart(2, '0')}`
      if (expiringSoon.has(n)) end = `2026-11-${String(2 + (n % 18)).padStart(2, '0')}`
      if (vi === 6 && k === 0) end = '2026-11-05' // "Contract XYZ expires in 14 days"
      if (end < '2026-10-22') end = `2027-${end.slice(5)}`
      // Only the designated contracts may fall inside the 30-day expiry window.
      if (!expiringSoon.has(n) && !(vi === 6 && k === 0) && end <= '2026-11-21') end = `2027-${end.slice(5)}`
      const start = `${startYear}-${end.slice(5, 7)}-01`
      CONTRACTS.push({
        id,
        number: `MPP/${region.code}/OS/${startYear}/${String(100 + n).slice(-3)}`,
        vendorId: v.id,
        title: `${scope} — ${region.name}`,
        scope,
        regionId: region.id,
        startDate: start,
        endDate: end,
        sanctionedManpower: 0,
        serviceChargePct: [3.85, 4.5, 5, 5.5, 6, 7][Math.floor(rng() * 6)]!,
        value: 0,
      })
      CONTRACT_SCOPE.set(id, scope)
      if (v.riskWeight <= 0.9 && k === count - 1 && id !== HERO_CONTRACT_ID) CLEAN_CONTRACT_IDS.add(id)
    }
  })
})()

export const vendorById = new Map(VENDORS.map((v) => [v.id, v]))
export const contractById = new Map(CONTRACTS.map((c) => [c.id, c]))
export const contractsByVendor = new Map<string, Contract[]>()
for (const c of CONTRACTS) {
  const arr = contractsByVendor.get(c.vendorId) ?? []
  arr.push(c)
  contractsByVendor.set(c.vendorId, arr)
}
