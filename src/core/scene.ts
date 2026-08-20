/**
 * Every spatial constant in this file lives in *video space*: the 1920x1080
 * coordinate system of the source masters. Nothing is expressed as a viewport
 * percentage, because the illusion depends on the seed staying locked to the
 * film frame, not to the browser window.
 *
 * Numbers below were measured from the encoded masters, not guessed:
 *   - hands in the final pose occupy x 762..1162, y 481..663
 *   - the narrowest gap between the palms is 856..1070 at y = 555
 *   - the dancer + arms never leave x 428..1428 in film 01
 *   - the dancer + arms never leave x 580..1364 in film 02
 */

export const VIDEO_W = 1920
export const VIDEO_H = 1080

export interface SafeBox {
  x: number
  y: number
  w: number
  h: number
}

/** Choreography of film 01 — arms reach wide, so the safe box is wide. */
export const SAFE_WIDE: SafeBox = { x: 560, y: 0, w: 800, h: VIDEO_H }
/** Final pose — only the hands, the shoulders and the seed survive the crop. */
export const SAFE_TIGHT: SafeBox = { x: 690, y: 0, w: 540, h: VIDEO_H }

/*
 * Portrait phones get their own pair.
 *
 * A 16:9 frame held to the 800 px wide box fills 62 % of a phone screen and
 * letterboxes the rest — which reads as a video embedded in a page, not as a
 * piece you are inside of. Narrowing the box raises the scale, and the height
 * follows. 720 takes 40 px off each side of an already-cropped reach (the arms
 * run 428..1428 and the wide box has always clipped their extremes) and buys
 * seven points of screen; 520 all but fills the phone at the final pose, where
 * nothing outside the shoulders is load-bearing anyway.
 */
export const SAFE_WIDE_PORTRAIT: SafeBox = { x: 600, y: 0, w: 720, h: VIDEO_H }
export const SAFE_TIGHT_PORTRAIT: SafeBox = { x: 700, y: 0, w: 520, h: VIDEO_H }

/** Centre of the empty space the dancer builds between her palms. */
export const SEED_ANCHOR = { x: 963, y: 562 }
/**
 * Seed height in video-space pixels; width follows from the model aspect.
 * 437 x 0.6 puts the widest point at 261 px against a 214 px gap, so the belly
 * of the capsule tucks ~23 px behind each palm — enough for the occlusion to
 * read without the hands swallowing the silhouette.
 */
export const SEED_HEIGHT = 437
/** Model is authored 1.0 units tall — this is width / height. */
export const SEED_ASPECT = 0.6

export const FILM_DURATION = 10
export const FILM_FPS = 24

/**
 * Film 02 is entered one frame in. Frame 1 is its closest match to film 01's
 * frame 238 — both by image difference and by direction of motion, which is
 * what keeps the arms travelling the same way across the cut.
 */
export const FILM2_START = 1 / FILM_FPS

/** Scroll timeline. Keys are [start, end] in damped progress. */
export interface Timeline {
  film1: [number, number]
  film2: [number, number]
  /**
   * Straight cut, not a dissolve. A cross-fade here double-exposes the arms,
   * because film 01 is frozen on its last frame while film 02 is still moving.
   * A cut on a matched frame pair is invisible; a dissolve is not.
   */
  cut: number
  push: [number, number]
  freeze: [number, number]
  spark: [number, number]
  dust: [number, number]
  wire: [number, number]
  solid: [number, number]
  open: [number, number]
  /** The core leaves the opened shell — a seed germinating, not an ejection. */
  rise: [number, number]
  /** Page height as a multiple of the viewport height. */
  trackMultiplier: number
}

export const TIMELINE: Timeline = {
  film1: [0.0, 0.3],
  cut: 0.3,
  film2: [0.3, 0.62],
  push: [0.4, 0.6],
  freeze: [0.61, 0.65],
  spark: [0.645, 0.69],
  dust: [0.675, 0.74],
  wire: [0.72, 0.79],
  solid: [0.78, 0.84],
  open: [0.84, 0.925],
  rise: [0.92, 0.985],
  trackMultiplier: 12,
}

/** Reduced-motion timeline: no scrubbing, a short page, the object still opens. */
export const TIMELINE_REDUCED: Timeline = {
  film1: [0.0, 0.0],
  cut: 0.0,
  film2: [0.0, 0.0],
  push: [0.0, 0.05],
  // Always frozen: reduced motion never scrubs, so the still is the scene.
  freeze: [-0.2, -0.1],
  spark: [0.06, 0.14],
  dust: [0.1, 0.22],
  wire: [0.18, 0.3],
  solid: [0.27, 0.4],
  open: [0.44, 0.76],
  rise: [0.74, 0.95],
  trackMultiplier: 4,
}
