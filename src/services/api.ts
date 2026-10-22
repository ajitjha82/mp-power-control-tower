import type { PageRequest, PageResult } from '@/types'
import { useUI } from '@/store/ui'

export class ApiError extends Error {}

/**
 * Simulated network boundary. Every service call goes through here so the UI
 * exercises real async loading / error states. Swap the body for `fetch()`
 * against the production API without touching components.
 */
export async function simulate<T>(fn: () => T, latency = 260): Promise<T> {
  await new Promise((r) => setTimeout(r, latency + Math.random() * 180))
  if (useUI.getState().simulateErrors) throw new ApiError('The service did not respond (simulated failure — toggle off in Settings › Demo controls).')
  return fn()
}

type Getter<T> = (row: T) => string | number | null | undefined

/** Server-style sort + paginate helper (shape mirrors a paged REST response). */
export function paginate<T>(rows: T[], req: PageRequest, getters: Record<string, Getter<T>> = {}): PageResult<T> {
  let out = rows
  if (req.sort) {
    const key = req.sort.id
    const g: Getter<T> = getters[key] ?? ((r: T) => (r as Record<string, unknown>)[key] as string | number)
    const dir = req.sort.desc ? -1 : 1
    out = [...rows].sort((a, b) => {
      const x = g(a)
      const y = g(b)
      if (x == null) return 1
      if (y == null) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * dir
    })
  }
  const start = req.page * req.pageSize
  return { rows: out.slice(start, start + req.pageSize), total: rows.length, page: req.page, pageSize: req.pageSize }
}

export const matchesSearch = (q: string | undefined, ...fields: Array<string | null | undefined>) => {
  if (!q) return true
  const s = q.trim().toLowerCase()
  if (!s) return true
  return fields.some((f) => f?.toLowerCase().includes(s))
}
