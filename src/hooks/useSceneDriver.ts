import { RefObject, useEffect } from 'react'
import { clamp, damp, range, smoothstep, smootherstep } from '../core/math'
import { ambience, runtime, stageStore, StageName } from '../core/runtime'
import {
  FILM2_START,
  FILM_DURATION,
  FILM_FPS,
  SAFE_TIGHT,
  SAFE_WIDE,
  TIMELINE,
  TIMELINE_REDUCED,
} from '../core/scene'
import { computeVideoRect, lerpSafeBox } from '../core/videoFit'
import { VideoScrubber } from '../core/videoScrubber'

export interface SceneRefs {
  stage: RefObject<HTMLDivElement>
  track: RefObject<HTMLDivElement>
  film1: RefObject<HTMLVideoElement>
  film2: RefObject<HTMLVideoElement>
  still: RefObject<HTMLImageElement>
  stillLit: RefObject<HTMLImageElement>
  hands: RefObject<HTMLImageElement>
  handsLit: RefObject<HTMLImageElement>
  shadow: RefObject<HTMLDivElement>
  meter: RefObject<HTMLElement>
}

const SEEK_EPSILON = 1 / (FILM_FPS * 2.4)
/** Damping strength, 1/s. High enough to catch a flick, low enough to glide. */
const DAMPING = 9

/**
 * Dev-only: `?p=0.82` pins the timeline so a single moment can be inspected
 * without fighting the scroll position. Stripped from production builds.
 */
function debugProgress(): number | null {
  if (!import.meta.env.DEV) return null
  const value = new URLSearchParams(location.search).get('p')
  if (value === null) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? clamp(parsed) : null
}

/** Writes a style property only when it actually changed. */
function setStyle(
  el: HTMLElement | null,
  prop: string,
  value: string,
  cache: Record<string, string>,
) {
  if (!el || cache[prop] === value) return
  cache[prop] = value
  el.style.setProperty(prop, value)
}

/**
 * The one loop. It reads the scroll position, damps it, and derives every other
 * value in the scene from that single number before writing them out — so the
 * film, the mask, the WebGL rig and the UI are always describing the same
 * instant.
 */
export function useSceneDriver(refs: SceneRefs, reducedMotion: boolean) {
  useEffect(() => {
    const stage = refs.stage.current
    if (!stage) return

    runtime.reducedMotion = reducedMotion
    runtime.timeline = reducedMotion ? TIMELINE_REDUCED : TIMELINE

    let filmScrubber: VideoScrubber | null = null
    let poseScrubber: VideoScrubber | null = null
    let raf = 0
    let last = performance.now()
    let scrollMax = 1
    let trackHeight = 0
    let lastViewportW = 0
    let lastViewportH = 0
    const pinned = debugProgress()
    // Latched, never re-tested: `readyState` drops back below HAVE_CURRENT_DATA
    // while a seek is in flight, and re-testing it would punch film 01's last
    // frame back through the cut every time a fast scroll forced a long seek.
    let film2Armed = false

    const styleCache: Record<string, Record<string, string>> = {
      stage: {},
      film1: {},
      film2: {},
      still: {},
      stillLit: {},
      hands: {},
      handsLit: {},
      shadow: {},
      meter: {},
    }

    const measure = (force = false) => {
      // Measure the stage, not the window: the WebGL canvas is sized from the
      // same box, so the film rect and the 3D projection cannot disagree.
      const vw = stage.clientWidth || innerWidth
      const vh = stage.clientHeight || innerHeight
      // Mobile browsers resize the viewport when the toolbar slides away. Only a
      // real resize should relayout the scroll track, otherwise progress jumps.
      const widthChanged = vw !== lastViewportW
      const heightChanged = Math.abs(vh - lastViewportH) > lastViewportH * 0.2
      if (force || widthChanged || heightChanged) {
        lastViewportW = vw
        lastViewportH = vh
        // innerHeight, not the stage: the track has to keep a stable length
        // while the toolbar animates, or progress jumps under the reader.
        trackHeight = Math.round(innerHeight * runtime.timeline.trackMultiplier)
        const track = refs.track.current
        if (track) track.style.height = `${trackHeight}px`
      }
      runtime.viewport.w = vw
      runtime.viewport.h = vh
      scrollMax = Math.max(1, trackHeight - vh)
    }

    const applyFrame = (now: number) => {
      raf = requestAnimationFrame(applyFrame)

      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const raw = pinned ?? clamp(scrollY / scrollMax)
      runtime.p = runtime.reducedMotion ? raw : damp(runtime.p, raw, DAMPING, dt)
      // Snap out of the asymptote so the last pixels of scroll still resolve.
      if (Math.abs(raw - runtime.p) < 0.0002) runtime.p = raw

      const p = runtime.p
      const T = runtime.timeline

      // ---- frame transform (shared by film, still and hand mask) -----------
      const pushT = smoothstep(p, T.push[0], T.push[1])
      const safe = lerpSafeBox(SAFE_WIDE, SAFE_TIGHT, pushT)
      const rect = computeVideoRect(runtime.viewport.w, runtime.viewport.h, safe)
      runtime.rect = rect
      setStyle(stage, '--fx', `${rect.x.toFixed(2)}px`, styleCache.stage)
      setStyle(stage, '--fy', `${rect.y.toFixed(2)}px`, styleCache.stage)
      setStyle(stage, '--fs', rect.scale.toFixed(5), styleCache.stage)

      // ---- timeline --------------------------------------------------------
      runtime.film1Time = range(p, T.film1[0], T.film1[1]) * FILM_DURATION
      runtime.film2Time =
        FILM2_START + range(p, T.film2[0], T.film2[1]) * (FILM_DURATION - FILM2_START)
      // Straight cut, armed once film 02 has ever produced a frame, so a cold
      // cache can never punch a black hole through the sequence.
      if (!film2Armed && (refs.film2.current?.readyState ?? 0) >= 2) film2Armed = true
      runtime.cross = p >= T.cut && film2Armed ? 1 : 0
      runtime.freeze = smoothstep(p, T.freeze[0], T.freeze[1])
      runtime.handMask = runtime.freeze
      runtime.spark = smoothstep(p, T.spark[0], T.spark[1])
      runtime.dust = smoothstep(p, T.dust[0], T.dust[1])
      runtime.wire = smoothstep(p, T.wire[0], T.wire[1])
      runtime.solid = smoothstep(p, T.solid[0], T.solid[1])
      runtime.open = smootherstep(p, T.open[0], T.open[1])
      runtime.rise = smootherstep(p, T.rise[0], T.rise[1])
      runtime.seedOpacity = Math.max(runtime.spark, runtime.dust, runtime.wire, runtime.solid)
      // A hint at ignition, most of it as the core is exposed, the rest as the
      // core clears the shell and there is nothing left between it and her.
      runtime.coreLight = clamp(
        runtime.spark * 0.22 + runtime.open * 0.55 + runtime.rise * 0.23,
      )
      runtime.interactive = p >= T.solid[0]

      // ---- DOM ------------------------------------------------------------
      setStyle(refs.film2.current, 'opacity', runtime.cross.toFixed(3), styleCache.film2)
      setStyle(refs.still.current, 'opacity', runtime.freeze.toFixed(3), styleCache.still)
      setStyle(refs.hands.current, 'opacity', runtime.handMask.toFixed(3), styleCache.hands)
      // The lit variants sit directly over their unlit twins, so the specimen
      // appears to throw light onto her rather than merely float in front.
      const lit = (runtime.freeze * runtime.coreLight).toFixed(3)
      setStyle(refs.stillLit.current, 'opacity', lit, styleCache.stillLit)
      setStyle(refs.handsLit.current, 'opacity', lit, styleCache.handsLit)

      // Contact shadow: it spreads and softens as the shell unfolds, because an
      // open flower blocks less light than a sealed capsule.
      const shadowIn = smoothstep(p, T.solid[0], T.solid[1])
      setStyle(
        refs.shadow.current,
        'opacity',
        (shadowIn * (0.95 - runtime.open * 0.25 - runtime.rise * 0.3)).toFixed(3),
        styleCache.shadow,
      )
      setStyle(
        refs.shadow.current,
        'transform',
        `translate(0, ${(runtime.open * 22 + runtime.rise * 30).toFixed(1)}px) scale(${(
          1 + runtime.open * 0.42 + runtime.rise * 0.18
        ).toFixed(3)})`,
        styleCache.shadow,
      )
      setStyle(
        refs.meter.current,
        'transform',
        `scaleX(${p.toFixed(4)})`,
        styleCache.meter,
      )
      // Once the still covers the film there is nothing left to decode.
      setStyle(
        refs.film1.current,
        'visibility',
        runtime.cross > 0.5 && p > T.cut + 0.05 ? 'hidden' : 'visible',
        styleCache.film1,
      )

      if (!runtime.reducedMotion) {
        if (p < T.cut + 0.03) filmScrubber?.set(runtime.film1Time)
        // Film 02 is parked on its entry frame from the start, so the cut has
        // something decoded to switch to the instant it happens.
        if (runtime.freeze < 0.999) poseScrubber?.set(runtime.film2Time)
      }

      // ---- discrete UI stage ----------------------------------------------
      let next: StageName = 'intro'
      // 'core' only once the shell is actually open, not the moment it starts.
      if (p >= T.open[1] - 0.03) next = 'core'
      else if (p >= T.solid[0]) next = 'inspect'
      else if (p >= T.spark[0]) next = 'materialise'
      else if (p >= T.cut) next = 'gesture'
      else if (p > 0.03) next = 'approach'
      stageStore.set(next)

      // ---- ambience --------------------------------------------------------
      // Volume rides the same progress as everything else: the track opens
      // quietly and swells as the specimen forms.
      const audio = ambience.element
      if (audio) {
        // Never reaches full: the track is a bed, and the ramp needs headroom.
        const swell = 0.3 + 0.55 * smoothstep(p, T.spark[0], T.open[1])
        const target = ambience.enabled ? swell : 0
        audio.volume = clamp(damp(audio.volume, target, 2.6, dt))
        if (!ambience.enabled && audio.volume < 0.005 && !audio.paused) audio.pause()
      }
    }

    measure(true)

    const onResize = () => measure()
    addEventListener('resize', onResize, { passive: true })
    addEventListener('orientationchange', onResize, { passive: true })
    visualViewport?.addEventListener('resize', onResize, { passive: true })

    if (refs.film1.current) filmScrubber = new VideoScrubber(refs.film1.current, SEEK_EPSILON)
    if (refs.film2.current) poseScrubber = new VideoScrubber(refs.film2.current, SEEK_EPSILON)

    raf = requestAnimationFrame(applyFrame)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
      removeEventListener('orientationchange', onResize)
      visualViewport?.removeEventListener('resize', onResize)
      filmScrubber?.dispose()
      poseScrubber?.dispose()
    }
  }, [refs, reducedMotion])
}
