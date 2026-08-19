export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityProfile {
  tier: QualityTier
  /** Upper bound for the WebGL drawing buffer ratio. */
  maxDpr: number
  /** Use the 1280x720 encode instead of the 1080p master. */
  useMobileVideo: boolean
  particles: number
  /** Angular resolution of the shell panels. */
  shellSegments: number
  /** Real refraction is expensive — only the top tier pays for it. */
  transmission: boolean
  grain: boolean
}

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number
  connection?: { effectiveType?: string; saveData?: boolean }
}

const isCoarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

export function detectQuality(): QualityProfile {
  const nav = navigator as NavigatorWithHints
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const conn = nav.connection
  const saveData = conn?.saveData === true
  const slowNet = conn?.effectiveType ? /(^|-)2g$|3g/.test(conn.effectiveType) : false
  const coarse = isCoarsePointer()
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
  const area = (innerWidth * innerHeight) / 1e6

  let score = 0
  score += cores >= 8 ? 2 : cores >= 6 ? 1 : cores <= 3 ? -2 : 0
  score += memory >= 8 ? 2 : memory >= 4 ? 0 : -2
  score += coarse ? -1 : 1
  // A big canvas at a high DPR is the most reliable way to run out of fill rate.
  score += area * dpr > 4 ? -1 : 0

  const tier: QualityTier = score >= 3 ? 'high' : score >= 0 ? 'medium' : 'low'

  return {
    tier,
    maxDpr: tier === 'high' ? (coarse ? 1.5 : 1.6) : tier === 'medium' ? 1.25 : 1,
    useMobileVideo: saveData || slowNet || tier === 'low' || (coarse && memory < 6),
    particles: tier === 'high' ? 520 : tier === 'medium' ? 260 : 110,
    shellSegments: tier === 'high' ? 22 : tier === 'medium' ? 16 : 12,
    transmission: tier === 'high',
    grain: tier !== 'low',
  }
}

export const prefersReducedMotion = () => {
  // Dev-only override so the reduced-motion path can be checked without
  // changing an OS setting. Stripped from production builds.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('reduced')) return true
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
