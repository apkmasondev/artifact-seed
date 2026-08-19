import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three'

export interface SurfaceMaps {
  roughness: Texture
  normal: Texture
  dispose: () => void
}

/** Deterministic value noise so the surface looks identical on every load. */
function makeRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Brushed-ceramic micro detail, generated once at runtime: fine directional
 * scratches plus a slow roughness drift. Deliberately shallow — the object is
 * laboratory-precise, not weathered.
 */
export function createSurfaceMaps(size = 512): SurfaceMaps {
  const rand = makeRandom(0x5eed)

  // Height field: streaks constant along y, broken by a low-frequency ripple.
  const columns = new Float32Array(size)
  for (let x = 0; x < size; x++) columns[x] = rand() * 2 - 1

  // Two octaves of smoothed column noise keeps the brushing from looking like TV static.
  const smooth = (src: Float32Array, radius: number) => {
    const out = new Float32Array(src.length)
    for (let i = 0; i < src.length; i++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) sum += src[(i + k + src.length) % src.length]
      out[i] = sum / (radius * 2 + 1)
    }
    return out
  }
  const fine = columns
  const broad = smooth(smooth(columns, 6), 6)

  const blotch = new Float32Array(size * size)
  const cells = 8
  const grid = new Float32Array((cells + 1) * (cells + 1))
  for (let i = 0; i < grid.length; i++) grid[i] = rand()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells
      const gy = (y / size) * cells
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const tx = gx - x0
      const ty = gy - y0
      const sx = tx * tx * (3 - 2 * tx)
      const sy = ty * ty * (3 - 2 * ty)
      const g = (cx: number, cy: number) => grid[cy * (cells + 1) + cx]
      const top = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx
      const bot = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx
      blotch[y * size + x] = top + (bot - top) * sy
    }
  }

  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    // Scratches break up along their length instead of running edge to edge.
    const wobble = Math.sin((y / size) * Math.PI * 2 * 3) * 0.5
    for (let x = 0; x < size; x++) {
      const xf = (x + Math.round(wobble)) % size
      const i = y * size + x
      height[i] = fine[xf] * 0.22 + broad[xf] * 0.78
      // A few sparse, deeper scratches.
      if (((xf * 2654435761) >>> 0) % 311 === 0) height[i] += 0.35
    }
  }

  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = roughCanvas.height = size
  const rc = roughCanvas.getContext('2d')!
  const roughData = rc.createImageData(size, size)

  const normCanvas = document.createElement('canvas')
  normCanvas.width = normCanvas.height = size
  const nc = normCanvas.getContext('2d')!
  const normData = nc.createImageData(size, size)

  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const o = i * 4

      const micro = height[i]
      const drift = blotch[i]
      // 0.5 is neutral; the material's own roughness scales this.
      const rough = 0.5 + micro * 0.05 + (drift - 0.5) * 0.1
      const r8 = Math.max(0, Math.min(255, Math.round(rough * 255)))
      roughData.data[o] = r8
      roughData.data[o + 1] = r8
      roughData.data[o + 2] = r8
      roughData.data[o + 3] = 255

      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5
      const strength = 0.9
      let nx = -dx * strength
      let ny = -dy * strength
      const len = Math.hypot(nx, ny, 1)
      nx /= len
      ny /= len
      const nz = 1 / len
      normData.data[o] = Math.round((nx * 0.5 + 0.5) * 255)
      normData.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      normData.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      normData.data[o + 3] = 255
    }
  }

  rc.putImageData(roughData, 0, 0)
  nc.putImageData(normData, 0, 0)

  const finish = (canvas: HTMLCanvasElement, repeatX: number, repeatY: number) => {
    const tex = new CanvasTexture(canvas)
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.repeat.set(repeatX, repeatY)
    // Mipmaps are not optional here: a 512px brush pattern minified onto a
    // small curved panel turns into crawling static without them.
    tex.minFilter = LinearMipmapLinearFilter
    tex.magFilter = LinearFilter
    tex.generateMipmaps = true
    tex.anisotropy = 8
    return tex
  }

  const roughness = finish(roughCanvas, 1, 1)
  const normal = finish(normCanvas, 1, 1)

  return {
    roughness,
    normal,
    dispose: () => {
      roughness.dispose()
      normal.dispose()
    },
  }
}

/**
 * Stacked light segments inside the core rod — the bright column that reads
 * through the shell gaps when the seed is closed.
 */
export function createCoreStripes(height = 256): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0b0906'
  ctx.fillRect(0, 0, 8, height)
  const bands = 11
  for (let i = 0; i < bands; i++) {
    const center = ((i + 0.5) / bands) * height
    const half = (height / bands) * 0.29
    const gradient = ctx.createLinearGradient(0, center - half, 0, center + half)
    gradient.addColorStop(0, '#241d12')
    gradient.addColorStop(0.5, '#fff3dc')
    gradient.addColorStop(1, '#241d12')
    ctx.fillStyle = gradient
    ctx.fillRect(0, center - half, 8, half * 2)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = false
  return tex
}
