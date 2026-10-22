import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { GlobalFilters } from '@/types'
import { CURRENT_MONTH } from '@/data/config'

export const EMPTY_FILTERS: GlobalFilters = {
  wageMonth: CURRENT_MONTH,
  regions: [],
  circles: [],
  divisions: [],
  locations: [],
  vendors: [],
  contracts: [],
  categories: [],
  compliance: [],
}

interface FilterState {
  applied: GlobalFilters
  apply: (f: GlobalFilters) => void
  patch: (f: Partial<GlobalFilters>) => void
  reset: () => void
}

/** Applied global filters; persisted for the session so they survive navigation. */
export const useFilters = create<FilterState>()(
  persist(
    (set) => ({
      applied: EMPTY_FILTERS,
      apply: (applied) => set({ applied }),
      patch: (f) => set((s) => ({ applied: { ...s.applied, ...f } })),
      reset: () => set({ applied: EMPTY_FILTERS }),
    }),
    { name: 'mpp-filters', storage: createJSONStorage(() => sessionStorage) },
  ),
)

export const activeFilterCount = (f: GlobalFilters) =>
  f.regions.length + f.circles.length + f.divisions.length + f.locations.length + f.vendors.length + f.contracts.length + f.categories.length + f.compliance.length + (f.wageMonth !== CURRENT_MONTH ? 1 : 0)
