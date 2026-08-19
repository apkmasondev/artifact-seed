export const clamp = (v: number, min = 0, max = 1) => (v < min ? min : v > max ? max : v)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Inverse lerp, clamped to 0..1. Returns 0 when the range is degenerate. */
export const range = (v: number, a: number, b: number) => (b === a ? 0 : clamp((v - a) / (b - a)))

export const smoothstep = (v: number, a: number, b: number) => {
  const t = range(v, a, b)
  return t * t * (3 - 2 * t)
}

export const smootherstep = (v: number, a: number, b: number) => {
  const t = range(v, a, b)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/**
 * Frame-rate independent exponential damping.
 * `lambda` is the convergence rate in units of 1/second.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt))
