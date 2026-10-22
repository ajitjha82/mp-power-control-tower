import { useMemo } from 'react'
import { useFilters } from '@/store/filters'
import { useUI } from '@/store/ui'
import { effectiveFilters } from '@/services/scope'

/**
 * Effective filters = user's global filters ∩ role data scope.
 * Returned `key` is a stable query-key fragment for TanStack Query.
 */
export function useScope() {
  const applied = useFilters((s) => s.applied)
  const role = useUI((s) => s.role)
  return useMemo(() => {
    const filters = effectiveFilters(applied, role)
    return { filters, role, key: [role, filters] as const }
  }, [applied, role])
}
