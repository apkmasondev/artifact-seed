import { RefObject, useEffect } from 'react'
import { clamp, damp, range, smoothstep, smootherstep } from '../core/math'
import { QualityProfile } from '../core/quality'
import { ambience, perfStore, runtime, stageStore, StageName } from '../core/runtime'
import {
  FILM2_START,
  FILM_DURATION,
  FILM_FPS,
  SAFE_TIGHT,
  SAFE_TIGHT_PORTRAIT,
  SAFE_WIDE,
  SAFE_WIDE_PORTRAIT,
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

/*
 * Frame governor. Detection reads what a device *says* about itself; this reads
 * what it actually delivers. Two consecutive seconds under 45 fps, while the
 * scene is genuinely running, is not a hitch — it is the wrong profile.
 */
const GOVERNOR_WINDOW_MS = 1000
const GOVERNOR_FLOOR_FPS = 45
const GOVERNOR_STRIKES = 2
/** How far apart seeks are pushed once the governor has stepped in. */
const DEGRADED_SEEK_FLOOR_MS = 1000 / 15

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
export function useSceneDriver(
  refs: SceneRefs,
  reducedMotion: boolean,
  quality: QualityProfile,
) {
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
    let safeWide = SAFE_WIDE
    let safeTight = SAFE_TIGHT
    let governorStart = 0
    let governorFrames = 0
    let governorStrikes = 0
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

    /**
     * Locks the stage to a height, rather than letting CSS follow the viewport.
     *
     * A mobile browser slides its toolbar away *during* the scroll, and `100dvh`
     * follows it pixel by pixel. Every one of those pixels relaid out the stage,
     * which resized the WebGL drawing buffer — a framebuffer reallocation, on
     * most of the frames of the most performance-critical gesture in the piece.
     * So the height is committed only on a real resize, and the band the
     * retracting toolbar uncovers is left to the black page behind it, where it
     * is invisible.
     */
    const measure = (force = false) => {
      const vw = stage.clientWidth || innerWidth
      const vh = innerHeight
      const widthChanged = vw !== lastViewportW
      const heightChanged = Math.abs(vh - lastViewportH) > lastViewportH * 0.2
      if (force || widthChanged || heightChanged) {
        lastViewportW = vw
        lastViewportH = vh
        stage.style.height = `${vh}px`
        trackHeight = Math.round(vh * runtime.timeline.trackMultiplier)
        const track = refs.track.current
        if (track) track.style.height = `${trackHeight}px`
        // Keyed on the shape of the viewport, not on the device: a tall narrow
        // window is the one case where the 16:9 frame cannot fill the screen
        // from the wide box, so it gets its own pair.
        const portrait = vh > vw * 1.2 && vw <= 560
        safeWide = portrait ? SAFE_WIDE_PORTRAIT : SAFE_WIDE
        safeTight = portrait ? SAFE_TIGHT_PORTRAIT : SAFE_TIGHT
      }
      runtime.viewport.w = lastViewportW
      runtime.viewport.h = lastViewportH
      scrollMax = Math.max(1, trackHeight - lastViewportH)
    }

    const resetGovernor = () => {
      governorStart = 0
      governorFrames = 0
    }

    /**
     * What the device said it was, versus what it turned out to be. One step
     * down, once: the canvas drops to a 1:1 drawing buffer, the grain layer
     * leaves the DOM and the two scrubbers stop competing with the compositor.
     */
    const governFrame = (now: number) => {
      if (perfStore.get() !== 0 || runtime.p < 0.02) return
      if (governorStart === 0) {
        governorStart = now
        governorFrames = 0
        return
      }
      governorFrames += 1
      const elapsed = now - governorStart
      if (elapsed < GOVERNOR_WINDOW_MS) return
      const fps = (governorFrames * 1000) / elapsed
      governorStrikes = fps < GOVERNOR_FLOOR_FPS ? governorStrikes + 1 : 0
      resetGovernor()
      if (governorStrikes < GOVERNOR_STRIKES) return
      perfStore.set(1)
      filmScrubber?.setFloor(DEGRADED_SEEK_FLOOR_MS)
      poseScrubber?.setFloor(DEGRADED_SEEK_FLOOR_MS)
    }

    const applyFrame = (now: number) => {
      raf = requestAnimationFrame(applyFrame)

      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      governFrame(now)

      const raw = pinned ?? clamp(scrollY / scrollMax)
      runtime.p = runtime.reducedMotion ? raw : damp(runtime.p, raw, DAMPING, dt)
      // Snap out of the asymptote so the last pixels of scroll still resolve.
      if (Math.abs(raw - runtime.p) < 0.0002) runtime.p = raw

      const p = runtime.p
      const T = runtime.timeline

      // ---- frame transform (shared by film, still and hand mask) -----------
      const pushT = smoothstep(p, T.push[0], T.push[1])
      const safe = lerpSafeBox(safeWide, safeTight, pushT)
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
    // A backgrounded tab stops producing frames, and the first one back would
    // otherwise be read as a second of catastrophic frame rate.
    const onVisibility = () => resetGovernor()
    addEventListener('resize', onResize, { passive: true })
    addEventListener('orientationchange', onResize, { passive: true })
    visualViewport?.addEventListener('resize', onResize, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    // Quantised to the source's own frame grid: scroll arrives far faster than
    // 24 fps, and a seek that lands inside the frame already decoded is pure
    // decoder load for an identical picture.
    const scrubOptions = {
      epsilon: SEEK_EPSILON,
      frameStep: 1 / FILM_FPS,
      floorMs: quality.seekFloorMs,
    }
    if (refs.film1.current) filmScrubber = new VideoScrubber(refs.film1.current, scrubOptions)
    if (refs.film2.current) poseScrubber = new VideoScrubber(refs.film2.current, scrubOptions)

    raf = requestAnimationFrame(applyFrame)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
      removeEventListener('orientationchange', onResize)
      visualViewport?.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      filmScrubber?.dispose()
      poseScrubber?.dispose()
    }
  }, [refs, reducedMotion, quality])
}
