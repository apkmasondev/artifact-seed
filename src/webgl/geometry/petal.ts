import { BufferGeometry, BufferAttribute, Vector3 } from 'three'
import { profilePoint } from './profile'

export interface PetalOptions {
  /** Position along the seed profile, 0..1. */
  vStart: number
  vEnd: number
  /** Angular width of the panel, radians. Centred on +X. */
  thetaSpan: number
  /** Wall thickness in model units. */
  thickness: number
  /** Outward bulge at the middle of the panel — reads as a machined crown. */
  crown: number
  /** Shrinks the whole panel towards the axis (used for inner ribs). */
  radiusScale: number
  segV: number
  segU: number
}

const DEFAULTS: PetalOptions = {
  vStart: 0.025,
  vEnd: 0.975,
  thetaSpan: (Math.PI * 2) / 8 - 0.1,
  thickness: 0.016,
  crown: 0.045,
  radiusScale: 1,
  segV: 56,
  segU: 12,
}

const tmpA = new Vector3()
const tmpB = new Vector3()
const tmpC = new Vector3()

/**
 * One shell panel: an outer surface, an inner surface offset along the local
 * normal, and four rim walls joining them. Built once and shared by all eight
 * panels — the whole shell costs a single geometry.
 *
 * Material groups: 0 = surfaces, 1 = rim walls, so the machined edges can take
 * a brighter metal than the ceramic face.
 */
export function createPetalGeometry(options: Partial<PetalOptions> = {}): BufferGeometry {
  const o = { ...DEFAULTS, ...options }
  const { segU, segV } = o
  const cols = segU + 1
  const rows = segV + 1

  const surface = (u: number, v: number, out: Vector3) => {
    const { r, y } = profilePoint(v, o.radiusScale)
    // 0 at the panel edges, 1 in the middle.
    const crownK = 1 + o.crown * Math.sin(Math.PI * u)
    const theta = (u - 0.5) * o.thetaSpan
    const rr = r * crownK
    return out.set(rr * Math.cos(theta), y, rr * Math.sin(theta))
  }

  const normalAt = (u: number, v: number, out: Vector3) => {
    const h = 1e-3
    surface(Math.min(1, u + h), v, tmpA)
    surface(Math.max(0, u - h), v, tmpB)
    tmpA.sub(tmpB) // dP/du
    surface(u, Math.min(1, v + h), tmpB)
    surface(u, Math.max(0, v - h), tmpC)
    tmpB.sub(tmpC) // dP/dv
    out.copy(tmpA).cross(tmpB).normalize()
    return out
  }

  // Establish orientation once: the surface normal must point away from the axis.
  const probe = new Vector3()
  const probeP = new Vector3()
  surface(0.5, 0.5, probeP)
  normalAt(0.5, 0.5, probe)
  const flip = probe.x * probeP.x + probe.z * probeP.z < 0
  const sign = flip ? -1 : 1

  const outerPos: number[] = []
  const outerNor: number[] = []
  const innerPos: number[] = []
  const innerNor: number[] = []
  const uvs: number[] = []

  const p = new Vector3()
  const n = new Vector3()

  for (let iv = 0; iv < rows; iv++) {
    const v = o.vStart + ((o.vEnd - o.vStart) * iv) / segV
    const vNorm = iv / segV
    for (let iu = 0; iu < cols; iu++) {
      const u = iu / segU
      surface(u, v, p)
      normalAt(u, v, n).multiplyScalar(sign)
      outerPos.push(p.x, p.y, p.z)
      outerNor.push(n.x, n.y, n.z)
      innerPos.push(p.x - n.x * o.thickness, p.y - n.y * o.thickness, p.z - n.z * o.thickness)
      innerNor.push(-n.x, -n.y, -n.z)
      uvs.push(u, vNorm)
    }
  }

  const positions: number[] = [...outerPos, ...innerPos]
  const normals: number[] = [...outerNor, ...innerNor]
  const uv: number[] = [...uvs, ...uvs]
  const innerBase = rows * cols

  const surfaceIdx: number[] = []
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * cols + iu
      const b = a + 1
      const c = a + cols
      const d = c + 1
      if (flip) {
        surfaceIdx.push(a, b, c, b, d, c)
        surfaceIdx.push(innerBase + a, innerBase + c, innerBase + b, innerBase + b, innerBase + c, innerBase + d)
      } else {
        surfaceIdx.push(a, c, b, b, c, d)
        surfaceIdx.push(innerBase + a, innerBase + b, innerBase + c, innerBase + b, innerBase + d, innerBase + c)
      }
    }
  }

  // ---- rim walls, with their own vertices so the edges stay crisp ----------
  const wallIdx: number[] = []
  const edgeNormal = new Vector3()
  const edgeA = new Vector3()
  const edgeB = new Vector3()

  const pushWall = (indices: number[], outward: boolean) => {
    const start = positions.length / 3
    for (let i = 0; i < indices.length; i++) {
      const src = indices[i]
      const nxt = indices[Math.min(i + 1, indices.length - 1)]
      const prv = indices[Math.max(i - 1, 0)]
      edgeA.set(
        outerPos[nxt * 3] - outerPos[prv * 3],
        outerPos[nxt * 3 + 1] - outerPos[prv * 3 + 1],
        outerPos[nxt * 3 + 2] - outerPos[prv * 3 + 2],
      )
      edgeB.set(
        outerPos[src * 3] - innerPos[src * 3],
        outerPos[src * 3 + 1] - innerPos[src * 3 + 1],
        outerPos[src * 3 + 2] - innerPos[src * 3 + 2],
      )
      edgeNormal.copy(edgeA).cross(edgeB).normalize()
      if (!outward) edgeNormal.negate()
      positions.push(outerPos[src * 3], outerPos[src * 3 + 1], outerPos[src * 3 + 2])
      normals.push(edgeNormal.x, edgeNormal.y, edgeNormal.z)
      uv.push(i / (indices.length - 1), 1)
      positions.push(innerPos[src * 3], innerPos[src * 3 + 1], innerPos[src * 3 + 2])
      normals.push(edgeNormal.x, edgeNormal.y, edgeNormal.z)
      uv.push(i / (indices.length - 1), 0)
    }
    for (let i = 0; i < indices.length - 1; i++) {
      const a = start + i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      if (outward) wallIdx.push(a, b, c, b, d, c)
      else wallIdx.push(a, c, b, b, c, d)
    }
  }

  const leftEdge: number[] = []
  const rightEdge: number[] = []
  for (let iv = 0; iv < rows; iv++) {
    leftEdge.push(iv * cols)
    rightEdge.push(iv * cols + segU)
  }
  const bottomEdge: number[] = []
  const topEdge: number[] = []
  for (let iu = 0; iu < cols; iu++) {
    bottomEdge.push(iu)
    topEdge.push(segV * cols + iu)
  }

  pushWall(leftEdge, !flip)
  pushWall(rightEdge, flip)
  pushWall(bottomEdge, flip)
  pushWall(topEdge, !flip)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  geometry.setIndex([...surfaceIdx, ...wallIdx])
  geometry.addGroup(0, surfaceIdx.length, 0)
  geometry.addGroup(surfaceIdx.length, wallIdx.length, 1)
  geometry.computeBoundingSphere()
  return geometry
}
