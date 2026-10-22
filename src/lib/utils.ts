import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const intFmt = new Intl.NumberFormat('en-IN')
const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

export const fmtNum = (n: number) => intFmt.format(Math.round(n))
export const fmtCompact = (n: number) => compactFmt.format(n)
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`

/** Indian-style currency with lakh/crore abbreviations for dashboards. */
export function fmtINR(n: number, opts: { compact?: boolean } = {}) {
  const sign = n < 0 ? '−' : ''
  const v = Math.abs(n)
  if (opts.compact) {
    if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(2)} Cr`
    if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(2)} L`
    if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(1)} K`
  }
  return `${sign}₹${intFmt.format(Math.round(v))}`
}

export const pct = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100)

/** Mask a sensitive identifier, keeping only the last `keep` characters. */
export function mask(value: string, keep = 4) {
  if (value.length <= keep) return value
  return 'X'.repeat(Math.max(6, value.length - keep)) + value.slice(-keep)
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function sumBy<T>(arr: readonly T[], f: (t: T) => number) {
  let s = 0
  for (const x of arr) s += f(x)
  return s
}

export function groupCount<T, K extends string>(arr: readonly T[], key: (t: T) => K) {
  const m = new Map<K, number>()
  for (const x of arr) {
    const k = key(x)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}
