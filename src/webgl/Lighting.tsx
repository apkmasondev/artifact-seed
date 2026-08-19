import { Environment, Lightformer } from '@react-three/drei'
import { QualityTier } from '../core/quality'

/**
 * No HDRI download: the environment is a tiny studio built from emissive
 * rectangles and baked once. It is what gives the shell its long vertical
 * highlights, and it keeps the black field completely empty.
 */
export function Lighting({ tier }: { tier: QualityTier }) {
  return (
    <>
      <Environment resolution={tier === 'low' ? 128 : 256} frames={1} background={false}>
        <color attach="background" args={['#000000']} />

        {/* Key — a long soft box above and slightly in front. */}
        <Lightformer
          form="rect"
          intensity={2.6}
          color="#fff4e6"
          position={[0.4, 3.1, 1.4]}
          rotation={[-Math.PI / 2.1, 0, 0]}
          scale={[2.4, 0.9, 1]}
        />
        {/* Rims — the two vertical strips that draw the silhouette edges. */}
        <Lightformer
          form="rect"
          intensity={4.2}
          color="#e8ecff"
          position={[-4.0, 0.25, 0.9]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[0.34, 5.2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={3.6}
          color="#ffe8c8"
          position={[4.0, 0.05, 0.7]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[0.26, 4.8, 1]}
        />
        {/* Back halo — separates the object from the black field. */}
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 0.5, -3.2]} scale={2.6} />
        {/* Front fill, deliberately weak so the face stays dark and tactile. */}
        <Lightformer
          form="rect"
          intensity={0.35}
          color="#7f8698"
          position={[0, -0.2, 3.4]}
          scale={[3.4, 3.4, 1]}
        />
      </Environment>

      <directionalLight position={[2.4, 3.6, 2.8]} intensity={0.85} color="#fff1de" />
      <directionalLight position={[-3.2, 0.7, -1.6]} intensity={0.45} color="#c3ccff" />
      <ambientLight intensity={0.03} />
    </>
  )
}
