import { clamp } from '../../core/math'
import { SEED_ASPECT } from '../../core/scene'

/**
 * The seed silhouette, authored 1.0 units tall and centred on the origin.
 * `v` runs 0 (bottom tip) -> 1 (top tip).
 */
export const MAX_RADIUS = SEED_ASPECT / 2

/** Normalised radius, 0..1. */
export function seedRadius(v: number): number {
  const t = clamp(v)
  // Bias the widest point below the middle: a seed, not a rugby ball.
  const biased = Math.pow(t, 0.9)
  // Slightly fuller than an ellipse near the tips, which reads as a machined
  // capsule rather than a balloon.
  const body = Math.pow(1 - Math.pow(Math.abs(2 * biased - 1), 2.05), 0.5)
  // The top tapers a touch more than the bottom, as in the reference render.
  const taper = 1 - 0.16 * Math.pow(t, 2.3)
  return body * taper
}

export const seedY = (v: number) => v - 0.5

export interface ProfilePoint {
  r: number
  y: number
}

export const profilePoint = (v: number, radiusScale = 1): ProfilePoint => ({
  r: seedRadius(v) * MAX_RADIUS * radiusScale,
  y: seedY(v),
})
