export interface ScrubberOptions {
  /** Ignore a target this close to where the head already is, in seconds. */
  epsilon?: number
  /** Snap targets onto the source's frame grid, in seconds. 0 disables. */
  frameStep?: number
  /** Never start two seeks closer together than this, in ms. */
  floorMs?: number
}

/** Never ask for the very last instant — some decoders refuse to land there. */
const TAIL = 0.02
/** A stalled seek must not park the scrubber forever. */
const WATCHDOG_MS = 900
/** Upper bound on self-imposed pacing, so the film can never feel detached. */
const MAX_PACE_MS = 90

/**
 * Scroll-driven seeking.
 *
 * Setting `currentTime` every frame floods the decoder, so writes are coalesced:
 * while a seek is in flight nothing is written, and the newest target is applied
 * on `seeked`. Two things beyond that keep a phone smooth:
 *
 *  - **Frame quantisation.** Scroll arrives at 60–120 Hz against a 24 fps
 *    source, so most targets land inside the frame already on screen. Snapping
 *    to the grid drops those seeks entirely rather than decoding the same frame
 *    again.
 *  - **Pacing.** Flushing the instant `seeked` fires runs the media thread at
 *    100 % occupancy, and the compositor is behind it in the same queue — which
 *    is felt as page-scroll jank, not as a stuttering film. Each seek is timed
 *    and the next one waits a fraction of that, so a slow decoder throttles
 *    itself and a fast one is never held back.
 */
export class VideoScrubber {
  private desired = 0
  private disposed = false
  private seekStartedAt = 0
  private lastTarget = -1
  private latency = 0
  private nextAllowedAt = 0
  private timer = 0
  private floorMs: number

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly options: ScrubberOptions = {},
  ) {
    this.floorMs = options.floorMs ?? 0
    video.addEventListener('seeked', this.onSeeked)
    video.addEventListener('loadeddata', this.flush)
  }

  set(time: number) {
    this.desired = time
    this.flush()
  }

  /** Raised by the frame governor once the device has proven it cannot keep up. */
  setFloor(ms: number) {
    this.floorMs = ms
  }

  private onSeeked = () => {
    const now = performance.now()
    const elapsed = now - this.seekStartedAt
    // Weighted towards history: one long seek across a cold part of the file
    // must not push the whole scene into slow motion.
    this.latency = this.latency === 0 ? elapsed : this.latency * 0.7 + elapsed * 0.3
    // The gap is measured from completion, not from the request: what has to be
    // handed back is decoder time the compositor can use, and none of it exists
    // while the seek is still running.
    this.nextAllowedAt = now + Math.max(this.floorMs, Math.min(this.latency * 0.5, MAX_PACE_MS))
    this.flush()
  }

  private flush = () => {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = 0
    }
    const v = this.video
    if (this.disposed || v.readyState < 2) return

    const now = performance.now()
    // `seeking` clears late on some decoders; the watchdog is what stops a
    // dropped `seeked` from parking the film on one frame for good.
    if (v.seeking && now - this.seekStartedAt < WATCHDOG_MS) {
      this.schedule(WATCHDOG_MS - (now - this.seekStartedAt))
      return
    }

    const duration = v.duration
    if (!Number.isFinite(duration) || duration <= 0) return

    const step = this.options.frameStep ?? 0
    const wanted = step > 0 ? Math.round(this.desired / step) * step : this.desired
    const target = Math.min(Math.max(wanted, 0), duration - TAIL)
    if (Math.abs(target - v.currentTime) < (this.options.epsilon ?? 1 / 60)) return
    // A decoder is allowed to land on the frame's own timestamp rather than the
    // instant that was asked for. Without this, a source whose grid sits further
    // than one epsilon from the requested time would seek to the same frame for
    // ever, since it never appears to have arrived.
    if (target === this.lastTarget) return

    const wait = this.nextAllowedAt - now
    if (wait > 0) {
      this.schedule(wait)
      return
    }

    this.seekStartedAt = now
    this.lastTarget = target
    try {
      v.currentTime = target
    } catch {
      /* seek rejected while the media is not ready — retried next frame */
    }
  }

  private schedule(delay: number) {
    if (this.timer) return
    this.timer = window.setTimeout(() => {
      this.timer = 0
      this.flush()
    }, Math.max(4, delay))
  }

  dispose() {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.video.removeEventListener('seeked', this.onSeeked)
    this.video.removeEventListener('loadeddata', this.flush)
  }
}
