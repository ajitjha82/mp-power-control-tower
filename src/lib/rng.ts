/**
 * Deterministic pseudo-random utilities. Every mock dataset is derived from
 * fixed seeds so numbers never change between renders or reloads.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = ReturnType<typeof mulberry32>

/** Stable hash → [0,1) for (seed, n) pairs; used for per-record derived values. */
export function hash01(seed: number, n: number) {
  let h = (seed ^ Math.imul(n + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!
export const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))

/**
 * Split `total` across `weights` so the parts sum exactly to `total`
 * (largest-remainder / Hamilton method).
 */
export function apportion(total: number, weights: readonly number[]): number[] {
  const wsum = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((w) => (w / wsum) * total)
  const floors = raw.map(Math.floor)
  let rem = total - floors.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; rem > 0; k++, rem--) floors[order[k % order.length]![1]]! += 1
  return floors
}

/**
 * Weighted sampling without replacement of exactly `n` items from `candidates`
 * (Efraimidis–Spirakis). Gives exact quotas while skewing toward heavier weights.
 */
export function weightedSample(rng: Rng, candidates: readonly number[], weight: (c: number) => number, n: number): number[] {
  if (n <= 0) return []
  const keyed = candidates.map((c) => {
    const w = Math.max(weight(c), 1e-6)
    return [Math.pow(rng(), 1 / w), c] as const
  })
  keyed.sort((a, b) => b[0] - a[0])
  return keyed.slice(0, n).map((k) => k[1])
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}
