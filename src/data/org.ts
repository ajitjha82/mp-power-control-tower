import type { Circle, Division, Location, Region } from '@/types'
import { mulberry32, pick } from '@/lib/rng'

/**
 * Fictional organisational hierarchy for the demo. Place names are generic
 * geography only; division/location naming is invented.
 */
export const REGIONS: Region[] = [
  { id: 'R-CZ', code: 'CZ', name: 'Central Region' },
  { id: 'R-WZ', code: 'WZ', name: 'West Region' },
  { id: 'R-EZ', code: 'EZ', name: 'East Region' },
  { id: 'R-NZ', code: 'NZ', name: 'North Region' },
  { id: 'R-GT', code: 'GT', name: 'Generation & Transmission' },
]

const CIRCLE_DEF: Array<[regionId: string, name: string, kind: 'dist' | 'gen']> = [
  ['R-CZ', 'Bhopal', 'dist'],
  ['R-CZ', 'Vidisha', 'dist'],
  ['R-CZ', 'Narmadapuram', 'dist'],
  ['R-WZ', 'Indore', 'dist'],
  ['R-WZ', 'Ujjain', 'dist'],
  ['R-WZ', 'Ratlam', 'dist'],
  ['R-WZ', 'Khandwa', 'dist'],
  ['R-EZ', 'Jabalpur', 'dist'],
  ['R-EZ', 'Sagar', 'dist'],
  ['R-EZ', 'Rewa', 'dist'],
  ['R-EZ', 'Katni', 'dist'],
  ['R-NZ', 'Gwalior', 'dist'],
  ['R-NZ', 'Morena', 'dist'],
  ['R-NZ', 'Guna', 'dist'],
  ['R-GT', 'Sarni Generation', 'gen'],
  ['R-GT', 'Birsinghpur Generation', 'gen'],
  ['R-GT', 'EHV Transmission', 'gen'],
]

const DIST_DIVISIONS = ['City Division I', 'City Division II', 'East Division', 'West Division', 'Rural Division']
const GEN_DIVISIONS = ['Unit Operations', 'Coal & Ash Handling', 'Plant Maintenance', 'EHV Substations']
const LOCALITIES = [
  'Nehru Nagar', 'Station Road', 'Industrial Area', 'Civil Lines', 'Ring Road', 'Old City', 'New Market',
  'Shanti Nagar', 'Rajiv Nagar', 'Subhash Nagar', 'Patel Nagar', 'Tilak Nagar', 'Indira Colony', 'Kamla Nagar',
  'Ashok Vihar', 'Housing Board', 'Gandhi Chowk', 'Bypass Road', 'Sector 4', 'Railway Colony', 'Shivaji Nagar',
  'Govindpura', 'Sindhi Colony', 'Lal Ghati', 'Bairagarh Road', 'Mandi Area', 'Hospital Road', 'Collectorate',
]

export const CIRCLES: Circle[] = []
export const DIVISIONS: Division[] = []
export const LOCATIONS: Location[] = []

;(function build() {
  const rng = mulberry32(20260901)
  CIRCLE_DEF.forEach(([regionId, name, kind], ci) => {
    const circleId = `C-${String(ci + 1).padStart(2, '0')}`
    CIRCLES.push({ id: circleId, name: kind === 'gen' ? `${name} Circle` : `${name} Circle`, regionId })
    const defs = kind === 'gen' ? GEN_DIVISIONS : DIST_DIVISIONS
    // Larger city circles get all divisions, others 3–4.
    const nDiv = kind === 'gen' ? 3 + Math.floor(rng() * 2) : ci === 0 || ci === 3 || ci === 7 || ci === 11 ? 5 : 3 + Math.floor(rng() * 2)
    defs.slice(0, nDiv).forEach((dname, di) => {
      const divisionId = `D-${String(ci + 1).padStart(2, '0')}${di + 1}`
      DIVISIONS.push({ id: divisionId, name: `${name.replace(' Generation', '')} ${dname}`, circleId, regionId, sanctioned: 0 })
      const nLoc = 3 + Math.floor(rng() * 3)
      for (let li = 0; li < nLoc; li++) {
        const type: Location['type'] =
          li === 0
            ? 'Division Office'
            : kind === 'gen'
              ? (pick(rng, ['Power Plant', 'Substation', 'Store', 'Project Site'] as const))
              : (pick(rng, ['Substation', 'Substation', 'Substation', 'Store', 'Project Site'] as const))
        const loc = pick(rng, LOCALITIES)
        const label =
          type === 'Division Office'
            ? `${name.replace(' Generation', '')} ${dname} Office`
            : type === 'Substation'
              ? `${kind === 'gen' ? '220/132 kV' : '33/11 kV'} SS ${loc}`
              : type === 'Power Plant'
                ? `${name.replace(' Generation', '')} TPS Unit ${li}`
                : type === 'Store'
                  ? `Area Store ${loc}`
                  : `Project Site ${loc}`
        LOCATIONS.push({ id: `L-${divisionId.slice(2)}${li + 1}`, name: label, type, divisionId, circleId, regionId })
      }
    })
  })
})()

export const regionById = new Map(REGIONS.map((r) => [r.id, r]))
export const circleById = new Map(CIRCLES.map((c) => [c.id, c]))
export const divisionById = new Map(DIVISIONS.map((d) => [d.id, d]))
export const locationById = new Map(LOCATIONS.map((l) => [l.id, l]))

export const locationsByRegion = new Map<string, Location[]>()
for (const l of LOCATIONS) {
  const arr = locationsByRegion.get(l.regionId) ?? []
  arr.push(l)
  locationsByRegion.set(l.regionId, arr)
}

/** The hero demo location: Bhopal City Division I substation. */
export const HERO_DIVISION_ID = 'D-011'
export const HERO_LOCATION_ID = LOCATIONS.find((l) => l.divisionId === HERO_DIVISION_ID && l.type !== 'Division Office')!.id
