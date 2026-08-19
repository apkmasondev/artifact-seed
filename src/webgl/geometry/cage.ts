import { BufferAttribute, BufferGeometry } from 'three'
import { profilePoint } from './profile'

/**
 * The construction cage the seed is drawn from before it gains a surface:
 * the sixteen panel-edge meridians plus a set of latitude rings. One geometry,
 * one draw call, and a per-segment seed so the cage closes progressively.
 */
export function createCageGeometry(panels = 8, thetaSpan = (Math.PI * 2) / 8 - 0.15) {
  const positions: number[] = []
  const seeds: number[] = []

  let rng = 0x1234567
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return rng / 4294967296
  }

  const pushSegment = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    seed: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz)
    seeds.push(seed, seed)
  }

  const V0 = 0.045
  const V1 = 0.955
  const steps = 34

  // Meridians along both edges of every panel.
  for (let p = 0; p < panels; p++) {
    const base = (p / panels) * Math.PI * 2
    for (const edge of [-0.5, 0.5]) {
      const theta = base + edge * thetaSpan
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      let prev = profilePoint(V0)
      for (let i = 1; i <= steps; i++) {
        const v = V0 + ((V1 - V0) * i) / steps
        const cur = profilePoint(v)
        // Bias the seed by height so the cage grows from the middle outwards.
        const height = Math.abs((v - 0.5) * 2)
        pushSegment(
          prev.r * cos,
          prev.y,
          prev.r * sin,
          cur.r * cos,
          cur.y,
          cur.r * sin,
          Math.min(0.98, height * 0.55 + rand() * 0.45),
        )
        prev = cur
      }
    }
  }

  // Latitude rings.
  const rings = [0.12, 0.24, 0.36, 0.5, 0.64, 0.76, 0.88]
  const ringSteps = panels * 6
  for (const v of rings) {
    const { r, y } = profilePoint(v)
    const height = Math.abs((v - 0.5) * 2)
    for (let i = 0; i < ringSteps; i++) {
      const a = (i / ringSteps) * Math.PI * 2
      const b = ((i + 1) / ringSteps) * Math.PI * 2
      pushSegment(
        r * Math.cos(a),
        y,
        r * Math.sin(a),
        r * Math.cos(b),
        y,
        r * Math.sin(b),
        Math.min(0.98, height * 0.5 + rand() * 0.5),
      )
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 1))
  geometry.computeBoundingSphere()
  return geometry
}
