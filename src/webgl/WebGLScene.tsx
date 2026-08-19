import { Canvas, invalidate, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { ACESFilmicToneMapping } from 'three'
import { QualityProfile } from '../core/quality'
import { contextLostStore, runtime } from '../core/runtime'
import { ArtifactSeed } from './ArtifactSeed'
import { Lighting } from './Lighting'
import { createSeedMaterials } from './materials'
import { SeedMotion } from './SeedMotion'
import { SeedRig } from './SeedRig'

/**
 * `frameloop="demand"` plus an explicit pump: nothing is rendered while the
 * film is on screen, and the GPU only wakes up once the seed exists.
 */
function RenderPump() {
  useEffect(() => {
    let raf = 0
    let tail = 6
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (runtime.seedOpacity > 0.001) tail = 4
      if (tail > 0) {
        tail -= 1
        invalidate()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}

function ContextGuard() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (event: Event) => {
      event.preventDefault()
      contextLostStore.set(true)
    }
    const onRestored = () => {
      contextLostStore.set(false)
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl])
  return null
}

function Scene({ quality }: { quality: QualityProfile }) {
  const materials = useMemo(() => createSeedMaterials(quality), [quality])
  useEffect(() => () => materials.dispose(), [materials])

  return (
    <>
      <Lighting tier={quality.tier} />
      <SeedRig>
        <SeedMotion>
          <ArtifactSeed materials={materials} quality={quality} />
        </SeedMotion>
      </SeedRig>
    </>
  )
}

export function WebGLScene({ quality }: { quality: QualityProfile }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, quality.maxDpr]}
      gl={{
        alpha: true,
        antialias: quality.tier !== 'low',
        stencil: false,
        depth: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
      camera={{ fov: 32, near: 0.05, far: 60, position: [0, 0, 10] }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 0.95
        gl.setClearAlpha(0)
      }}
    >
      <RenderPump />
      <ContextGuard />
      <Scene quality={quality} />
    </Canvas>
  )
}
