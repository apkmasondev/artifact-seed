const base = import.meta.env.BASE_URL

/**
 * Absolute at runtime, on purpose. The build emits document-relative URLs so a
 * single `dist/` works at any path, but a relative `url()` handed to a CSS
 * custom property is resolved against the *stylesheet* rather than the
 * document — which silently 404s once the CSS lives in /assets/.
 */
export const asset = (path: string) => {
  const relative = `${base}${path.replace(/^\//, '')}`
  if (typeof document === 'undefined') return relative
  return new URL(relative, document.baseURI).href
}

/**
 * Three encodes of each film, keyed by frame height. `540` is the phone tier and
 * is all-intra: every frame is a keyframe, so a scrub seek is one frame of
 * decode instead of a walk down a GOP. It is a slightly larger file than `720`
 * and several times cheaper to scrub, which is the trade a phone wants.
 */
export const MEDIA = {
  film1: {
    '1080': asset('media/film-01-1080.mp4'),
    '720': asset('media/film-01-720.mp4'),
    '540': asset('media/film-01-540.mp4'),
    poster: asset('media/film-01-poster.webp'),
  },
  film2: {
    '1080': asset('media/film-02-1080.mp4'),
    '720': asset('media/film-02-720.mp4'),
    '540': asset('media/film-02-540.mp4'),
    poster: asset('media/film-02-poster.webp'),
  },
  /**
   * Every full-frame layer ships twice. A phone composites six of these on top
   * of each other and can never display more than a third of the width, so the
   * 1280 px set is a quarter of the image memory for no visible difference —
   * see scripts/make_mobile_assets.py.
   */
  finalPose: { full: asset('media/final-pose.webp'), compact: asset('media/final-pose-720.webp') },
  /** The same frame with the specimen's light added — see scripts/make_lit_pose.py. */
  finalPoseLit: {
    full: asset('media/final-pose-lit.webp'),
    compact: asset('media/final-pose-lit-720.webp'),
  },
  hands: {
    full: asset('artifact/hand-foreground.webp'),
    compact: asset('artifact/hand-foreground-720.webp'),
  },
  handsLit: {
    full: asset('artifact/hand-foreground-lit.webp'),
    compact: asset('artifact/hand-foreground-lit-720.webp'),
  },
  reference: asset('artifact/artifact-seed-reference.webp'),
  /** The generated concept sheet the whole object was designed against. */
  conceptSheet: asset('artifact/concept-sheet.webp'),
}

/** Picks the variant a profile asked for out of any of the paired sets above. */
export const variant = (set: { full: string; compact: string }, compact: boolean) =>
  compact ? set.compact : set.full

/**
 * The soundtrack ships, so the layer is on by default. `VITE_AMBIENCE=0` takes
 * it out of the DOM entirely — for a silent deployment, or if the track is
 * removed, since an <audio> element pointed at a missing file would 404 on
 * every load.
 */
export const HAS_AMBIENCE = import.meta.env.VITE_AMBIENCE !== '0'

export const AMBIENCE_SRC = asset('audio/ambience.m4a')
