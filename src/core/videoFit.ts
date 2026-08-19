import { SafeBox, VIDEO_H, VIDEO_W } from './scene'

export interface VideoRect {
  /** Top-left of the 1920x1080 frame in CSS pixels, relative to the viewport. */
  x: number
  y: number
  /** Displayed size of the full frame in CSS pixels. */
  w: number
  h: number
  /** CSS pixels per video-space pixel. */
  scale: number
}

/**
 * "Cover, but never crop the safe box."
 *
 * `object-fit: cover` guarantees a full-bleed frame but eats the dancer's arms
 * on a phone. `object-fit: contain` keeps everything but shrinks the film to a
 * postage stamp in portrait. This picks the largest scale that still shows the
 * whole safe box, capped at the scale that fills the viewport.
 */
export function computeVideoRect(vw: number, vh: number, safe: SafeBox): VideoRect {
  const cover = Math.max(vw / VIDEO_W, vh / VIDEO_H)
  const safeFit = Math.min(vw / safe.w, vh / safe.h)
  const scale = Math.min(cover, safeFit)

  const w = VIDEO_W * scale
  const h = VIDEO_H * scale

  // Centre the safe box, then pull back so we never expose a gap on an axis
  // that the frame already covers.
  let x = vw / 2 - (safe.x + safe.w / 2) * scale
  let y = vh / 2 - (safe.y + safe.h / 2) * scale
  x = w >= vw ? Math.min(0, Math.max(vw - w, x)) : (vw - w) / 2
  y = h >= vh ? Math.min(0, Math.max(vh - h, y)) : (vh - h) / 2

  return { x, y, w, h, scale }
}

export const lerpSafeBox = (a: SafeBox, b: SafeBox, t: number): SafeBox => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
})
