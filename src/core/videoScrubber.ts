/**
 * Scroll-driven seeking. Setting `currentTime` on every frame floods the
 * decoder and produces stutter, so writes are coalesced: while a seek is in
 * flight nothing is written, and the newest target is applied on `seeked`.
 */
export class VideoScrubber {
  private desired = 0
  private disposed = false

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly epsilon = 1 / 60,
  ) {
    video.addEventListener('seeked', this.flush)
    video.addEventListener('loadeddata', this.flush)
  }

  set(time: number) {
    this.desired = time
    this.flush()
  }

  private flush = () => {
    const v = this.video
    if (this.disposed || v.readyState < 2 || v.seeking) return
    const duration = v.duration
    if (!Number.isFinite(duration) || duration <= 0) return
    // Never ask for the very last instant — some decoders refuse to land there.
    const target = Math.min(Math.max(this.desired, 0), duration - 0.02)
    if (Math.abs(target - v.currentTime) < this.epsilon) return
    try {
      v.currentTime = target
    } catch {
      /* seek rejected while the media is not ready — retried next frame */
    }
  }

  dispose() {
    this.disposed = true
    this.video.removeEventListener('seeked', this.flush)
    this.video.removeEventListener('loadeddata', this.flush)
  }
}
