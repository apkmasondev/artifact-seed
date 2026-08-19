import { useEffect, useMemo, useRef, useState } from 'react'
import { MEDIA } from '../core/assets'
import { detectQuality, prefersReducedMotion } from '../core/quality'
import { contextLostStore, readyStore } from '../core/runtime'
import { useMediaUnlock, usePreload } from '../hooks/usePreload'
import { useSceneDriver } from '../hooks/useSceneDriver'
import { useStore } from '../hooks/useStore'
import { WebGLScene } from '../webgl/WebGLScene'
import { Interface } from './Interface'
import { Loader } from './Loader'

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    )
  } catch {
    return false
  }
}

export function Experience() {
  const quality = useMemo(detectQuality, [])
  const reduced = useMemo(prefersReducedMotion, [])
  const webgl = useMemo(hasWebGL, [])
  const ready = useStore(readyStore)
  const contextLost = useStore(contextLostStore)
  const [mountCanvas, setMountCanvas] = useState(false)

  const stage = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const film1 = useRef<HTMLVideoElement>(null)
  const film2 = useRef<HTMLVideoElement>(null)
  const still = useRef<HTMLImageElement>(null)
  const stillLit = useRef<HTMLImageElement>(null)
  const hands = useRef<HTMLImageElement>(null)
  const handsLit = useRef<HTMLImageElement>(null)
  const shadow = useRef<HTMLDivElement>(null)
  const meter = useRef<HTMLElement>(null)

  const refs = useMemo(
    () => ({ stage, track, film1, film2, still, stillLit, hands, handsLit, shadow, meter }),
    [],
  )
  const mediaRefs = useMemo(() => ({ film1, film2 }), [])
  const preloadSources = useMemo(
    () => [MEDIA.film1.poster, MEDIA.finalPose, MEDIA.finalPoseLit, MEDIA.hands, MEDIA.handsLit],
    [],
  )

  const film1Src = quality.useMobileVideo ? MEDIA.film1.sd : MEDIA.film1.hd
  const film2Src = quality.useMobileVideo ? MEDIA.film2.sd : MEDIA.film2.hd

  useSceneDriver(refs, reduced)
  usePreload(mediaRefs, preloadSources, !reduced)
  useMediaUnlock(mediaRefs)

  // The 3D scene compiles while the film is already on screen.
  useEffect(() => {
    if (!ready || !webgl) return
    const id = window.setTimeout(() => setMountCanvas(true), 60)
    return () => clearTimeout(id)
  }, [ready, webgl])

  const showFallback = !webgl || contextLost

  return (
    <>
      <div className="track" ref={track} aria-hidden="true" />

      <div className="stage" ref={stage}>
        <p className="sr-only">
          A dancer dressed in black raises her hands and holds an empty space between her
          palms. As you scroll, a black segmented capsule called the Artifact Seed
          materialises in that space, then opens to reveal a glowing core.
        </p>

        <div className="frame frame--film" aria-hidden="true">
          {/* Reduced motion never scrubs, so the films are never downloaded. */}
          {!reduced && (
            <>
              <video
                className="film film--01"
                ref={film1}
                src={film1Src}
                poster={MEDIA.film1.poster}
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                tabIndex={-1}
              />
              <video
                className="film film--02"
                ref={film2}
                src={film2Src}
                poster={MEDIA.film2.poster}
                muted
                playsInline
                preload="metadata"
                disablePictureInPicture
                tabIndex={-1}
              />
            </>
          )}
          <img className="still" ref={still} src={MEDIA.finalPose} alt="" decoding="async" />
          <img
            className="still still--lit"
            ref={stillLit}
            src={MEDIA.finalPoseLit}
            alt=""
            decoding="async"
          />
        </div>

        {/* Between the film and the canvas: the specimen has to darken her. */}
        <div className="frame frame--shadow" aria-hidden="true">
          <div className="contact-shadow" ref={shadow} />
        </div>

        <div
          className="canvas-layer"
          role="img"
          aria-label="Artifact Seed — an interactive three-dimensional specimen held between the dancer's hands."
        >
          {mountCanvas && !contextLost && <WebGLScene quality={quality} />}
        </div>

        {showFallback && ready && (
          <div className="fallback">
            <img src={MEDIA.reference} alt="Artifact Seed — segmented black capsule with a lit core." />
            <p>{webgl ? 'Restoring renderer' : 'WebGL unavailable — reference render'}</p>
          </div>
        )}

        <div className="frame frame--front" aria-hidden="true">
          <img className="hands" ref={hands} src={MEDIA.hands} alt="" decoding="async" />
          <img
            className="hands hands--lit"
            ref={handsLit}
            src={MEDIA.handsLit}
            alt=""
            decoding="async"
          />
          <div className="frame-feather" />
        </div>

        <div className="vignette" aria-hidden="true" />
        {quality.grain && <div className="grain" aria-hidden="true" />}

        <Interface meter={meter} />
      </div>

      <Loader />
    </>
  )
}
