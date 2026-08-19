import { RefObject, useEffect } from 'react'
import { clamp } from '../core/math'
import { loadStore, readyStore } from '../core/runtime'

interface PreloadRefs {
  film1: RefObject<HTMLVideoElement>
  film2: RefObject<HTMLVideoElement>
}

const IMAGE_WEIGHT = 1
const FILM_WEIGHT = 4
/** Enough of film 01 to scrub the opening without a stall. */
const FILM_READY_FRACTION = 0.45
/** Film 02 starts downloading once film 01 is comfortably ahead. */
const SECONDARY_START_FRACTION = 0.55
const MAX_WAIT_MS = 12000

/**
 * Only what the first viewport needs gates the start: the poster, the still,
 * the hand mask and the head of film 01. Film 02 keeps downloading while the
 * viewer is already watching film 01.
 */
export function usePreload(refs: PreloadRefs, sources: string[], withFilm = true) {
  useEffect(() => {
    let cancelled = false
    let filmFraction = 0
    const images = new Map<string, number>(sources.map((src) => [src, 0]))
    const total = sources.length * IMAGE_WEIGHT + FILM_WEIGHT
    let released = false

    const report = () => {
      if (cancelled) return
      let done = 0
      images.forEach((v) => (done += v * IMAGE_WEIGHT))
      if (withFilm) done += Math.min(1, filmFraction / FILM_READY_FRACTION) * FILM_WEIGHT
      loadStore.set(clamp(done / (withFilm ? total : sources.length * IMAGE_WEIGHT)))
    }

    let secondaryStarted = false
    /**
     * Film 02 must own a decoded frame well before the viewer can scroll to the
     * cut, otherwise the cut has nothing to switch to and film 01's last frame
     * stays on screen. So this runs ahead of the release, not with it.
     */
    const startSecondary = () => {
      if (secondaryStarted || cancelled) return
      const film2 = refs.film2.current
      if (!film2) return
      secondaryStarted = true
      film2.preload = 'auto'
      // load() restarts the fetch from zero, so only force it when nothing has
      // been read yet; otherwise raising `preload` is enough to keep buffering.
      if (film2.readyState === 0) film2.load()
    }

    const release = () => {
      if (released || cancelled) return
      released = true
      loadStore.set(1)
      readyStore.set(true)
      startSecondary()
    }

    const maybeRelease = () => {
      let allImages = true
      images.forEach((v) => {
        if (v < 1) allImages = false
      })
      if (allImages && (!withFilm || filmFraction >= FILM_READY_FRACTION)) release()
    }

    sources.forEach((src) => {
      const img = new Image()
      img.decoding = 'async'
      const done = () => {
        images.set(src, 1)
        report()
        maybeRelease()
      }
      img.onload = done
      // A missing decoration must never trap the viewer on the loader.
      img.onerror = done
      img.src = src
    })

    const film1 = refs.film1.current
    const onProgress = () => {
      const v = refs.film1.current
      if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return
      let buffered = 0
      for (let i = 0; i < v.buffered.length; i++) {
        buffered += v.buffered.end(i) - v.buffered.start(i)
      }
      filmFraction = clamp(buffered / v.duration)
      if (filmFraction >= SECONDARY_START_FRACTION) startSecondary()
      report()
      maybeRelease()
    }
    const onCanPlayThrough = () => {
      filmFraction = 1
      startSecondary()
      report()
      maybeRelease()
    }
    const onError = () => {
      filmFraction = 1
      report()
      release()
    }

    film1?.addEventListener('progress', onProgress)
    film1?.addEventListener('loadeddata', onProgress)
    film1?.addEventListener('canplaythrough', onCanPlayThrough)
    film1?.addEventListener('error', onError)

    const poll = window.setInterval(onProgress, 250)
    const timeout = window.setTimeout(release, MAX_WAIT_MS)
    report()

    return () => {
      cancelled = true
      clearInterval(poll)
      clearTimeout(timeout)
      film1?.removeEventListener('progress', onProgress)
      film1?.removeEventListener('loadeddata', onProgress)
      film1?.removeEventListener('canplaythrough', onCanPlayThrough)
      film1?.removeEventListener('error', onError)
    }
  }, [refs, sources, withFilm])
}

/**
 * iOS refuses to decode a video that has never been asked to play. One silent
 * play/pause on the first gesture unlocks scrubbing.
 */
export function useMediaUnlock(refs: PreloadRefs) {
  useEffect(() => {
    let done = false
    const unlock = () => {
      if (done) return
      done = true
      ;[refs.film1.current, refs.film2.current].forEach((v) => {
        if (!v) return
        const promise = v.play()
        if (promise && typeof promise.then === 'function') {
          promise.then(() => v.pause()).catch(() => undefined)
        } else {
          v.pause()
        }
      })
      cleanup()
    }
    const cleanup = () => {
      removeEventListener('pointerdown', unlock)
      removeEventListener('touchstart', unlock)
      removeEventListener('keydown', unlock)
      removeEventListener('wheel', unlock)
      removeEventListener('scroll', unlock)
    }
    addEventListener('pointerdown', unlock, { passive: true })
    addEventListener('touchstart', unlock, { passive: true })
    addEventListener('keydown', unlock, { passive: true })
    addEventListener('wheel', unlock, { passive: true })
    addEventListener('scroll', unlock, { passive: true })
    return cleanup
  }, [refs])
}
