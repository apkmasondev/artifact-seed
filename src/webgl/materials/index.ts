import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'
import { QualityProfile } from '../../core/quality'
import { createCoreStripes, createSurfaceMaps } from './surfaceMaps'

export interface RevealUniform {
  value: number
}

/**
 * Shared "materialise" dissolve. Every solid material knits itself together
 * from the core outwards instead of cross-fading, which keeps the shell opaque
 * and avoids any transparency sorting between the eight panels.
 */
export function attachReveal(material: Material, uReveal: RevealUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uReveal
    shader.vertexShader = `varying vec3 vSeedPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vSeedPos = position;',
    )
    shader.fragmentShader = `
uniform float uReveal;
varying vec3 vSeedPos;
float seedHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
${shader.fragmentShader}`.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
  if (uReveal < 0.999) {
    float d = abs(vSeedPos.y) * 1.55 + length(vSeedPos.xz) * 1.25;
    float n = seedHash(vSeedPos * 42.0) * 0.25;
    if (d > uReveal * 1.15 - 0.02 + n) discard;
  }`,
    )
  }
  material.customProgramCacheKey = () => 'artifact-reveal'
}

function radialSprite(size = 128, softness = 4.5) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(size, size)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c)
      const a = Math.pow(1 - d, softness)
      const o = (y * size + x) * 4
      image.data[o] = 255
      image.data[o + 1] = 246
      image.data[o + 2] = 228
      image.data[o + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(image, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export interface SeedMaterials {
  shell: MeshPhysicalMaterial
  rim: MeshStandardMaterial
  frame: MeshStandardMaterial
  polished: MeshStandardMaterial
  glass: MeshPhysicalMaterial
  coreGlass: MeshPhysicalMaterial
  core: MeshStandardMaterial
  coreLamp: MeshStandardMaterial
  glow: SpriteMaterial
  glowSoft: SpriteMaterial
  wire: ShaderMaterial
  particle: ShaderMaterial
  reveal: RevealUniform
  dispose: () => void
}

export function createSeedMaterials(profile: QualityProfile): SeedMaterials {
  const maps = createSurfaceMaps(profile.tier === 'low' ? 256 : 512)
  const reveal: RevealUniform = { value: 0 }
  const glowSprite = radialSprite()

  // Black ceramic over brushed titanium: nearly black, but never flat. The
  // reference render is a dark object with thin highlights, not chrome — so
  // reflectivity is deliberately restrained.
  const shell = new MeshPhysicalMaterial({
    color: new Color(0x070708),
    metalness: 0.4,
    roughness: 0.58,
    roughnessMap: maps.roughness,
    normalMap: maps.normal,
    clearcoat: 0.22,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.3,
  })
  shell.normalScale.set(0.07, 0.07)
  shell.anisotropy = 0.15
  shell.anisotropyRotation = Math.PI / 2

  // Machined edges of every panel — the line of light that defines the segments.
  const rim = new MeshStandardMaterial({
    color: new Color(0x7a6c56),
    metalness: 1,
    roughness: 0.18,
    envMapIntensity: 1.6,
  })

  const frame = new MeshStandardMaterial({
    color: new Color(0x7d6647),
    metalness: 1,
    roughness: 0.34,
    roughnessMap: maps.roughness,
    envMapIntensity: 0.9,
  })

  const polished = new MeshStandardMaterial({
    color: new Color(0x9c8459),
    metalness: 1,
    roughness: 0.16,
    envMapIntensity: 1.0,
  })

  const glass = profile.transmission
    ? new MeshPhysicalMaterial({
        color: new Color(0x8d8377),
        metalness: 0,
        roughness: 0.12,
        transmission: 1,
        thickness: 0.14,
        ior: 1.46,
        attenuationColor: new Color(0x6a5a44),
        attenuationDistance: 1.4,
        envMapIntensity: 0.6,
        transparent: true,
        side: DoubleSide,
      })
    : new MeshPhysicalMaterial({
        color: new Color(0x241e17),
        metalness: 0.25,
        roughness: 0.16,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 0.7,
        side: DoubleSide,
      })

  // Milky crystal, not a lens. A polished sphere around a small bright lamp
  // focuses it into a clipped hot spot with a hard caustic edge; frosting the
  // surface diffuses it into an even glow and matches the brief's material.
  const coreGlass = profile.transmission
    ? new MeshPhysicalMaterial({
        color: new Color(0xfdf6e8),
        metalness: 0,
        roughness: 0.34,
        transmission: 1,
        thickness: 0.3,
        ior: 1.44,
        attenuationColor: new Color(0xfff0d4),
        attenuationDistance: 0.85,
        envMapIntensity: 0.8,
        transparent: true,
        // A transparent shell that writes depth clips the additive halo drawn
        // at its centre straight down the middle. It must not.
        depthWrite: false,
      })
    : new MeshPhysicalMaterial({
        color: new Color(0xefe6d4),
        metalness: 0,
        roughness: 0.08,
        transparent: true,
        opacity: 0.42,
        envMapIntensity: 0.9,
        depthWrite: false,
      })

  // Milky crystal with its own light. Neutral-warm, never neon.
  const coreStripes = createCoreStripes()
  const core = new MeshStandardMaterial({
    color: new Color(0x0d0b08),
    emissive: new Color(0xfff1d8),
    emissiveMap: coreStripes,
    emissiveIntensity: 1.6,
    roughness: 0.45,
    metalness: 0,
  })

  // The lamp at the centre of the sphere has no banding.
  const coreLamp = new MeshStandardMaterial({
    color: new Color(0x0d0b08),
    emissive: new Color(0xfff4e2),
    emissiveIntensity: 1.6,
    roughness: 0.5,
    metalness: 0,
  })

  const glowSpriteSoft = radialSprite(128, 3.0)
  const glow = new SpriteMaterial({
    map: glowSprite,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    opacity: 0,
  })
  const glowSoft = new SpriteMaterial({
    map: glowSpriteSoft,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    opacity: 0,
  })

  const wire = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new Color(0xd8cbb4) },
    },
    vertexShader: `
      attribute float aSeed;
      varying float vSeed;
      void main() {
        vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vSeed;
      void main() {
        // Segments switch on in a stable but scattered order, so the cage
        // closes progressively instead of fading in as a whole.
        float appear = smoothstep(vSeed - 0.12, vSeed + 0.02, uProgress);
        float a = appear * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * (0.7 + 0.5 * appear), a);
      }
    `,
  })

  const particle = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uConverge: { value: 0 },
      uOpacity: { value: 0 },
      uScale: { value: 1 },
      uSpread: { value: 1 },
      uColor: { value: new Color(0xffeed2) },
    },
    vertexShader: `
      attribute vec3 aTarget;
      attribute float aSeed;
      uniform float uTime;
      uniform float uConverge;
      uniform float uScale;
      uniform float uSpread;
      varying float vFade;
      void main() {
        float phase = uTime * (0.16 + aSeed * 0.28) + aSeed * 6.2831;
        vec3 drift = vec3(sin(phase), cos(phase * 0.83), sin(phase * 0.61)) * 0.02;
        vec3 far = position * uSpread + drift;
        vec3 near = aTarget + drift * 0.4;
        float k = smoothstep(0.0, 1.0, clamp(uConverge - aSeed * 0.35, 0.0, 1.0));
        vec3 pos = mix(far, near, k);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        // Most of the cloud is consumed by the seed; a few motes stay behind.
        vFade = mix(1.0, step(0.86, aSeed) * 0.75 + 0.05, smoothstep(0.6, 1.0, uConverge));
        gl_PointSize = uScale * (0.9 + aSeed * 1.5) / max(0.0001, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vFade;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d);
        if (r > 0.25) discard;
        float a = pow(1.0 - r * 4.0, 1.8) * uOpacity * vFade;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  })

  attachReveal(shell, reveal)
  attachReveal(rim, reveal)
  attachReveal(frame, reveal)
  attachReveal(polished, reveal)
  attachReveal(glass, reveal)
  attachReveal(coreGlass, reveal)
  attachReveal(core, reveal)
  attachReveal(coreLamp, reveal)

  const all: Material[] = [
    shell,
    rim,
    frame,
    polished,
    glass,
    coreGlass,
    core,
    coreLamp,
    glow,
    glowSoft,
    wire,
    particle,
  ]

  return {
    shell,
    rim,
    frame,
    polished,
    glass,
    coreGlass,
    core,
    coreLamp,
    glow,
    glowSoft,
    wire,
    particle,
    reveal,
    dispose: () => {
      all.forEach((m) => m.dispose())
      glowSprite.dispose()
      glowSpriteSoft.dispose()
      coreStripes.dispose()
      maps.dispose()
    },
  }
}
