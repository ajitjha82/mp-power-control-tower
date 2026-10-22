import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Read/write a single URL search param (drill-down state lives in the URL so links are shareable). */
export function useUrlParam(name: string): [string | null, (v: string | null) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(name)
  const set = useCallback(
    (v: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (v === null || v === '') next.delete(name)
          else next.set(name, v)
          return next
        },
        { replace: true },
      )
    },
    [name, setParams],
  )
  return [value, set]
}
