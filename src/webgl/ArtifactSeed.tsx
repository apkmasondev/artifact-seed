import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Points,
  SphereGeometry,
  Sprite,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { clamp, damp, easeInOutCubic, lerp, smoothstep } from '../core/math'
import { QualityProfile } from '../core/quality'
import { runtime } from '../core/runtime'
import { createCageGeometry } from './geometry/cage'
import { createPetalGeometry } from './geometry/petal'
import { profilePoint } from './geometry/profile'
import { SeedMaterials } from './materials'

const PANEL_COUNT = 8
const PITCH = (Math.PI * 2) / PANEL_COUNT
const PANEL_SPAN = PITCH - 0.15
/**
 * The inner blades sit directly behind the outer panels but are narrower, so
 * every gap in the shell looks straight through to the smoked glass and the lit
 * core column — the bright slit that defines the reference render.
 */
const INNER_SPAN = PITCH - 0.18

/**
 * Both shells hinge near the widest part of the body rather than at the tip.
 * A base hinge throws the panels far outside the hands; hinging at the belly
 * keeps the open flower close to the size of the closed capsule.
 */
const OUTER_PIVOT = profilePoint(0.3)
const INNER_PIVOT = profilePoint(0.36, 0.8)
const OUTER_ANGLE = 0.62
const INNER_ANGLE = 0.3
/** Particle diameter as a fraction of the seed height. */
const PARTICLE_SIZE = 0.0045
/**
 * How far the core climbs out of the opened shell, in model heights. Enough to
 * clear the splayed petal tips (which reach y ~= 0.33) so the idle rotation can
 * never swing a dark panel across the finale, and no further — the object
 * germinates, it does not launch, and it must never leave the space her hands
 * are holding.
 */
const RISE_HEIGHT = 0.52

const tmpScale = new Vector3()

interface Props {
  materials: SeedMaterials
  quality: QualityProfile
}

function useSeedGeometries(quality: QualityProfile) {
  return useMemo(() => {
    const segU = Math.max(8, Math.round(quality.shellSegments * 0.6))
    const segV = quality.shellSegments * 3
    const low = quality.tier === 'low'

    const panel = createPetalGeometry({
      thetaSpan: PANEL_SPAN,
      segU,
      segV,
      thickness: 0.016,
      crown: 0.042,
    })

    // Second, shorter shell of gunmetal blades. It never widens the silhouette
    // much, but it gives the open mechanism real depth.
    const inner = createPetalGeometry({
      thetaSpan: INNER_SPAN,
      segU: Math.max(6, Math.round(segU * 0.7)),
      segV: Math.round(segV * 0.7),
      thickness: 0.012,
      crown: 0.02,
      radiusScale: 0.8,
      vStart: 0.13,
      vEnd: 0.87,
    })

    const lathePoints: Vector2[] = []
    const latheSteps = 40
    for (let i = 0; i <= latheSteps; i++) {
      const v = 0.1 + (0.8 * i) / latheSteps
      const { r, y } = profilePoint(v, 0.5)
      lathePoints.push(new Vector2(Math.max(0.002, r), y))
    }
    const glass = new LatheGeometry(lathePoints, low ? 24 : 48)

    const rod = new CylinderGeometry(0.052, 0.052, 0.72, low ? 14 : 24, 1)
    const sphere = new SphereGeometry(0.108, low ? 20 : 40, low ? 14 : 28)
    const lamp = new SphereGeometry(0.058, 20, 14)

    const ring = (v: number, tube: number) =>
      new TorusGeometry(profilePoint(v, 0.68).r, tube, 6, low ? 28 : 44)
    const ringA = ring(0.3, 0.0038)
    const ringB = ring(0.5, 0.005)
    const ringC = ring(0.7, 0.0038)

    // Machined polar caps that close the openings the panels leave behind.
    const hub = new CylinderGeometry(0.016, 0.066, 0.045, 20)
    const hubRing = new TorusGeometry(0.068, 0.005, 6, 30)
    const cage = createCageGeometry(PANEL_COUNT, PANEL_SPAN)

    const all: BufferGeometry[] = [
      panel,
      inner,
      glass,
      rod,
      sphere,
      lamp,
      ringA,
      ringB,
      ringC,
      hub,
      hubRing,
      cage,
    ]

    return {
      panel,
      inner,
      glass,
      rod,
      sphere,
      lamp,
      ringA,
      ringB,
      ringC,
      hub,
      hubRing,
      cage,
      dispose: () => all.forEach((g) => g.dispose()),
    }
  }, [quality])
}

function useParticleGeometry(count: number) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3)
    const targets = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    let rng = 0xa17fac
    const rand = () => {
      rng = (rng * 1664525 + 1013904223) >>> 0
      return rng / 4294967296
    }
    for (let i = 0; i < count; i++) {
      // A small, deliberate cloud around the hands — not a field of fairy dust.
      const a = rand() * Math.PI * 2
      const r = 0.3 + Math.pow(rand(), 0.6) * 0.34
      positions[i * 3] = Math.cos(a) * r
      positions[i * 3 + 1] = (rand() - 0.5) * 0.95
      positions[i * 3 + 2] = Math.sin(a) * r * 0.9

      const v = 0.08 + rand() * 0.84
      const p = profilePoint(v, 1.04 + rand() * 0.12)
      const ta = rand() * Math.PI * 2
      targets[i * 3] = Math.cos(ta) * p.r
      targets[i * 3 + 1] = p.y
      targets[i * 3 + 2] = Math.sin(ta) * p.r
      seeds[i] = rand()
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aTarget', new BufferAttribute(targets, 3))
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    geometry.computeBoundingSphere()
    return geometry
  }, [count])
}

export function ArtifactSeed({ materials, quality }: Props) {
  const geo = useSeedGeometries(quality)
  const particleGeo = useParticleGeometry(quality.particles)

  const solidGroup = useRef<Group>(null)
  const outerPivots = useRef<Group[]>([])
  const innerPivots = useRef<Group[]>([])
  const cageRef = useRef<LineSegments>(null)
  const pointsRef = useRef<Points>(null)
  const glassRef = useRef<Mesh>(null)
  const sphereRef = useRef<Group>(null)
  const rodRef = useRef<Mesh>(null)
  const capTop = useRef<Group>(null)
  const capBottom = useRef<Group>(null)
  const glowGroup = useRef<Group>(null)
  const glowInner = useRef<Sprite>(null)
  const glowOuter = useRef<Sprite>(null)
  const clock = useRef(0)
  /**
   * Three.js compiles a material the first time it is actually drawn, and every
   * part of the seed is gated on the beat that reveals it — so the whole shader
   * set, envmap bindings included, was being compiled halfway through the
   * materialise. On a phone that is a visible stall in the one moment the piece
   * cannot afford one. These first frames draw the entire object with the
   * dissolve closed: nothing reaches the screen, everything reaches the
   * compiler, and it happens while the film is still playing.
   */
  const warmup = useRef(4)

  useEffect(
    () => () => {
      geo.dispose()
      particleGeo.dispose()
    },
    [geo, particleGeo],
  )

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta)
    const { open, wire, dust, spark, solid, rise } = runtime
    clock.current += dt
    const warming = warmup.current > 0
    if (warming) warmup.current -= 1

    // ---- shell panels -----------------------------------------------------
    for (let i = 0; i < PANEL_COUNT; i++) {
      // A whisper of stagger keeps the mechanism from feeling like one rigid part.
      const local = clamp((open - i * 0.01) / 0.93)
      const eased = easeInOutCubic(smoothstep(local, 0.14, 1))

      const outer = outerPivots.current[i]
      if (outer) {
        outer.position.x = OUTER_PIVOT.r + smoothstep(local, 0, 0.4) * 0.075
        outer.rotation.z = -eased * OUTER_ANGLE
      }
      const inner = innerPivots.current[i]
      if (inner) {
        inner.position.x = INNER_PIVOT.r + smoothstep(local, 0.1, 0.55) * 0.032
        inner.rotation.z = -eased * INNER_ANGLE
      }
    }

    // ---- solid shell reveal ----------------------------------------------
    const shellScale = lerp(1, 0.86, open)
    const shellY = Math.sin(clock.current * 0.55) * 0.006 - rise * 0.05
    materials.reveal.value = solid
    if (solidGroup.current) {
      solidGroup.current.visible = warming || solid > 0.002
      // The body compacts as it unfolds, so the bloom stays inside the hands.
      solidGroup.current.scale.setScalar(shellScale)
      // The husk settles as the core leaves it.
      solidGroup.current.position.y = damp(solidGroup.current.position.y, shellY, 6, dt)
    }

    // ---- construction cage ------------------------------------------------
    const cageOpacity = Math.min(wire, 1 - smoothstep(solid, 0.15, 0.85))
    materials.wire.uniforms.uProgress.value = wire
    materials.wire.uniforms.uOpacity.value = cageOpacity * 0.85
    if (cageRef.current) cageRef.current.visible = warming || cageOpacity > 0.005

    // ---- particles --------------------------------------------------------
    const dustOpacity = Math.min(dust, 0.25 + 0.75 * (1 - smoothstep(solid, 0.3, 1)))
    materials.particle.uniforms.uTime.value = clock.current
    materials.particle.uniforms.uConverge.value = smoothstep(dust, 0.05, 1) * 0.75 + solid * 0.25
    materials.particle.uniforms.uOpacity.value = dustOpacity * 0.75
    materials.particle.uniforms.uSpread.value = 1 + open * 0.1
    if (pointsRef.current) {
      pointsRef.current.visible = warming || dustOpacity > 0.005
      // gl_PointSize is in framebuffer pixels, so it has to be derived from the
      // projection every frame — the rig rescales with the film rect.
      const worldScale = pointsRef.current.getWorldScale(tmpScale).x
      const camera = state.camera as PerspectiveCamera
      const halfFov = Math.tan(((camera.fov * Math.PI) / 180) / 2)
      const pixelsPerUnit = (state.size.height * state.viewport.dpr) / (2 * halfFov)
      materials.particle.uniforms.uScale.value = pixelsPerUnit * PARTICLE_SIZE * worldScale
    }

    // ---- core -------------------------------------------------------------
    const pulse = 1 + Math.sin(clock.current * 0.9) * 0.06
    const ignition = smoothstep(spark, 0, 1)
    // The column is spent once the core detaches from it.
    materials.core.emissiveIntensity = (1.6 + ignition * 2.2 + open * 1.1) * (1 - rise * 0.85) * pulse
    // Bright, but never clipped — the inner detail has to survive full reveal.
    materials.coreLamp.emissiveIntensity =
      (0.6 + ignition * 0.7 + open * 0.8 + rise * 0.4) * pulse

    // The end caps ride inwards with the shell so they stay part of the
    // mechanism instead of floating away from it. The top cap then withdraws
    // into the body — it is the seal the core has to get past, and leaving it
    // in place would put a machined lid straight through the rising sphere.
    if (capTop.current) capTop.current.position.y = lerp(0.455, 0.315, open) - rise * 0.26
    if (capBottom.current) capBottom.current.position.y = -lerp(0.455, 0.315, open)
    if (rodRef.current) rodRef.current.scale.set(1, (1 - open * 0.45) * (1 - rise * 0.8), 1)

    // ---- germination ------------------------------------------------------
    const coreY = RISE_HEIGHT * rise
    if (sphereRef.current) {
      sphereRef.current.position.y = coreY
      // It swells very slightly as it clears the shell, the way a held breath
      // releases — not as a growth effect.
      sphereRef.current.scale.setScalar((0.34 + open * 0.66) * (1 + rise * 0.14))
      sphereRef.current.rotation.y = clock.current * 0.12
      sphereRef.current.visible = warming || open > 0.02
    }
    if (glassRef.current) {
      // Never touch `transmission` at runtime — flipping it recompiles the shader.
      const fade = 1 - smoothstep(open, 0.3, 0.85)
      materials.glass.opacity = (quality.transmission ? 1 : 0.55) * fade
      glassRef.current.visible = warming || (fade > 0.02 && solid > 0.02)
    }

    // ---- additive glow ----------------------------------------------------
    // Stands in for a bloom pass: a composer cannot write a halo into the
    // transparent pixels the film shows through, but additive sprites can.
    // A pinpoint, not a wash: the first sign of the specimen is one small,
    // genuinely bright point of light rather than an early bloom.
    // Deliberately does not grow at the finale: once the core is out of the
    // shell it has to stay a readable object, not a blown-out disc.
    const glowBase = clamp(ignition * 0.95 + open * 0.05) * pulse
    materials.glow.opacity = clamp(glowBase * (1 - rise * 0.45))
    materials.glowSoft.opacity = clamp(glowBase * (0.2 + rise * 0.12))
    // The halo travels with the core. The sprites live outside the shell group
    // (they have to survive its reveal gate), so the shell's own scale and
    // settle have to be folded in by hand or the glow drifts off the sphere.
    if (glowGroup.current) glowGroup.current.position.y = shellY + shellScale * coreY
    if (glowInner.current) {
      glowInner.current.scale.setScalar(0.016 + ignition * 0.05 + open * 0.045)
    }
    if (glowOuter.current) {
      glowOuter.current.scale.setScalar(0.04 + ignition * 0.06 + open * 0.24 + rise * 0.1)
    }
  })

  const indices = useMemo(() => Array.from({ length: PANEL_COUNT }, (_, i) => i), [])

  return (
    <group>
      <group ref={solidGroup}>
        {/* ---- outer shell: black ceramic panels --------------------------- */}
        {indices.map((i) => (
          <group key={`panel-${i}`} rotation={[0, i * PITCH, 0]}>
            <group
              ref={(el) => {
                if (el) outerPivots.current[i] = el
              }}
              position={[OUTER_PIVOT.r, OUTER_PIVOT.y, 0]}
            >
              <mesh
                geometry={geo.panel}
                material={[materials.shell, materials.rim]}
                position={[-OUTER_PIVOT.r, -OUTER_PIVOT.y, 0]}
              />
            </group>
          </group>
        ))}

        {/* ---- inner frame: gunmetal blades under every gap ---------------- */}
        {indices.map((i) => (
          <group key={`inner-${i}`} rotation={[0, i * PITCH, 0]}>
            <group
              ref={(el) => {
                if (el) innerPivots.current[i] = el
              }}
              position={[INNER_PIVOT.r, INNER_PIVOT.y, 0]}
            >
              <mesh
                geometry={geo.inner}
                material={[materials.frame, materials.polished]}
                position={[-INNER_PIVOT.r, -INNER_PIVOT.y, 0]}
              />
            </group>
          </group>
        ))}

        <mesh
          geometry={geo.ringA}
          material={materials.frame}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, profilePoint(0.3).y, 0]}
        />
        <mesh
          geometry={geo.ringB}
          material={materials.polished}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, profilePoint(0.5).y, 0]}
        />
        <mesh
          geometry={geo.ringC}
          material={materials.frame}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, profilePoint(0.7).y, 0]}
        />

        <group ref={capTop} position={[0, 0.455, 0]}>
          <mesh geometry={geo.hub} material={materials.polished} />
          <mesh
            geometry={geo.hubRing}
            material={materials.frame}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, -0.019, 0]}
          />
        </group>
        <group ref={capBottom} position={[0, -0.455, 0]} rotation={[Math.PI, 0, 0]}>
          <mesh geometry={geo.hub} material={materials.frame} />
          <mesh
            geometry={geo.hubRing}
            material={materials.frame}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, -0.019, 0]}
          />
        </group>

        {/* ---- smoked glass ----------------------------------------------- */}
        <mesh ref={glassRef} geometry={geo.glass} material={materials.glass} renderOrder={2} />

        {/* ---- core -------------------------------------------------------- */}
        <mesh ref={rodRef} geometry={geo.rod} material={materials.core} />
        <group ref={sphereRef}>
          <mesh geometry={geo.sphere} material={materials.coreGlass} renderOrder={3} />
          <mesh geometry={geo.lamp} material={materials.coreLamp} />
        </group>
      </group>

      <lineSegments ref={cageRef} geometry={geo.cage} material={materials.wire} />

      <points
        ref={pointsRef}
        geometry={particleGeo}
        material={materials.particle}
        frustumCulled={false}
      />

      <group ref={glowGroup}>
        <sprite ref={glowInner} material={materials.glow} scale={0.05} renderOrder={9} />
        <sprite ref={glowOuter} material={materials.glowSoft} scale={0.16} renderOrder={8} />
      </group>
    </group>
  )
}
