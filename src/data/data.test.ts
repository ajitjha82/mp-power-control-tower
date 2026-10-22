import { describe, expect, it } from 'vitest'
import { CURRENT_QUOTAS } from './config'
import { HERO_IDX, N, R, getEmployee } from './roster'
import { getSnapshot } from './snapshot'
import { contractStats, getInvoices } from './invoices'
import { getExceptions } from './exceptions'
import { CONTRACTS, HERO_CONTRACT_ID } from './vendors'

describe('mock data consistency', () => {
  const s = getSnapshot()
  const count = (f: (i: number) => boolean) => { let c = 0; for (let i = 0; i < N; i++) if (f(i)) c++; return c }

  it('reproduces the executive demo quotas exactly', () => {
    expect(count((i) => !!s.onRoll[i])).toBe(CURRENT_QUOTAS.workforce)
    expect(count((i) => !!s.present[i])).toBe(CURRENT_QUOTAS.presentToday)
    expect(count((i) => !!R.pfApplicable[i])).toBe(CURRENT_QUOTAS.pfApplicable)
    expect(count((i) => !!s.pfEx[i])).toBe(CURRENT_QUOTAS.pfExceptions)
    expect(count((i) => !!R.esiApplicable[i])).toBe(CURRENT_QUOTAS.esiApplicable)
    expect(count((i) => !!s.esiEx[i])).toBe(CURRENT_QUOTAS.esiExceptions)
    expect(count((i) => s.salary[i] === 0)).toBe(59103)
  })

  it('places the hero demo story', () => {
    const e = getEmployee(HERO_IDX)
    expect(e.id).toBe('EMP-10234')
    expect(e.name).toBe('Rajesh Sharma')
    expect(e.contractId).toBe(HERO_CONTRACT_ID)
    expect(s.pfEx[HERO_IDX]).toBe(1)
    const st = contractStats().get(HERO_CONTRACT_ID)!
    expect(st.pfEx).toBe(17)
    expect(st.esiEx).toBe(0)
    expect(st.salaryIssues).toBe(0)
    const inv = getInvoices().filter((i) => i.billingMonth === '2026-09')
    expect(inv.filter((i) => i.status === 'Blocked')).toHaveLength(23)
    expect(inv.find((i) => i.contractId === HERO_CONTRACT_ID)!.status).toBe('Blocked')
  })

  it('keeps generated names varied and contract expiries as specified', () => {
    const counts = new Map<number, number>()
    for (let i = 0; i < N; i++) counts.set(R.last[i]!, (counts.get(R.last[i]!) ?? 0) + 1)
    const max = Math.max(...counts.values())
    expect(max / N).toBeLessThan(0.06)
    const expiring = CONTRACTS.filter((c) => (Date.parse(c.endDate) - Date.parse('2026-10-22')) / 86400000 <= 30)
    expect(expiring).toHaveLength(7)
  })

  it('builds the unified exception register', () => {
    const ex = getExceptions()
    expect(ex.filter((e) => e.category === 'PF')).toHaveLength(1598)
    expect(ex.find((e) => e.id === 'EXC-PF-10234')!.status).toBe('Under Review')
    console.log('total open exceptions', ex.length, 'critical', ex.filter((e) => e.severity === 'Critical').length)
  })
})
