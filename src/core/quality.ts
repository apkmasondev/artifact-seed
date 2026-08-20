export type QualityTier = 'high' | 'medium' | 'low'
/** Which encode of the two films to fetch. Keyed by frame height. */
export type VideoTier = '1080' | '720' | '540'

export interface QualityProfile {
  tier: QualityTier
  /**
   * A coarse pointer on a small viewport — a phone, not merely a touch screen.
   * This is a *budget*, not a layout flag: everything a phone cannot afford
   * hangs off it, because no feature test reports GPU class.
   */
  phone: boolean
  /** Upper bound for the WebGL drawing buffer ratio. */
  maxDpr: number
  video: VideoTier
  /** The 1280 px still set instead of the 1920 px originals. */
  compactStills: boolean
  particles: number
  /** Angular resolution of the shell panels. */
  shellSegments: number
  /** Real refraction is expensive — only the top tier pays for it. */
  transmission: boolean
  grain: boolean
  /**
   * Floor between two scrub seeks, in ms. The scrubber paces itself off
   * measured seek latency; this is the extra headroom a phone gets on top,
   * because there the decoder and the compositor share one thermal budget.
   */
  seekFloorMs: number
}

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number
  connection?: { effectiveType?: string; saveData?: boolean }
}

const matches = (query: string) =>
  typeof matchMedia === 'function' && matchMedia(query).matches

export function detectQuality(): QualityProfile {
  const nav = navigator as NavigatorWithHints
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const conn = nav.connection
  const saveData = conn?.saveData === true
  const slowNet = conn?.effectiveType ? /(^|-)2g$|3g/.test(conn.effectiveType) : false
  const coarse = matches('(pointer: coarse)')
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
  const area = (innerWidth * innerHeight) / 1e6
  // The short edge, so a phone is still a phone after it is turned sideways.
  // Tablets start at 744 CSS px across, which is the gap this sits in.
  const shortEdge = Math.min(innerWidth || 1024, innerHeight || 768)
  const phone = coarse && shortEdge <= 560

  let score = 0
  score += cores >= 8 ? 2 : cores >= 6 ? 1 : cores <= 3 ? -2 : 0
  score += memory >= 8 ? 2 : memory >= 4 ? 0 : -2
  score += coarse ? -1 : 1
  // A big canvas at a high DPR is the most reliable way to run out of fill rate.
  score += area * dpr > 4 ? -1 : 0

  let tier: QualityTier = score >= 3 ? 'high' : score >= 0 ? 'medium' : 'low'
  /*
   * A flagship phone reports eight cores and eight gigabytes and scores as a
   * workstation, which is how it ends up compiling a transmission shader and
   * rendering the scene into a second target on every frame. Nothing in the
   * platform reports GPU class, so the pointer type is the honest signal: a
   * touch device never takes the top tier, and a phone starts one lower again.
   */
  if (coarse && tier === 'high') tier = 'medium'
  if (phone && tier === 'medium' && (cores < 6 || memory < 4)) tier = 'low'

  const maxDpr = phone
    ? tier === 'low'
      ? 1
      : 1.25
    : tier === 'high'
      ? coarse
        ? 1.5
        : 1.6
      : tier === 'medium'
        ? 1.25
        : 1

  /*
   * 540p is not a smaller picture so much as a different *kind* of file: it is
   * the all-intra encode, where a scrub seek is one frame of decode and nothing
   * else. That is what a phone actually needs — see the README.
   */
  const video: VideoTier =
    saveData || slowNet || phone || tier === 'low' ? '540' : coarse ? '720' : '1080'

  return {
    tier,
    phone,
    maxDpr,
    video,
    compactStills: video === '540',
    particles: tier === 'high' ? 520 : tier === 'medium' ? (phone ? 180 : 260) : 110,
    shellSegments: tier === 'high' ? 22 : tier === 'medium' ? 16 : 12,
    transmission: tier === 'high',
    /*
     * A full-screen `mix-blend-mode` layer forces the whole stage to be
     * re-composited every time it steps, and on a phone it costs more than the
     * WebGL pass it sits over. The film carries its own grain; this only ever
     * added the last few percent.
     */
    grain: !coarse && tier !== 'low',
    seekFloorMs: phone ? 1000 / 30 : 0,
  }
}

export const prefersReducedMotion = () => {
  // Dev-only override so the reduced-motion path can be checked without
  // changing an OS setting. Stripped from production builds.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('reduced')) return true
  return matches('(prefers-reduced-motion: reduce)')
}
