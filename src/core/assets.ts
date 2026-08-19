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

export const MEDIA = {
  film1: {
    hd: asset('media/film-01-1080.mp4'),
    sd: asset('media/film-01-720.mp4'),
    poster: asset('media/film-01-poster.webp'),
  },
  film2: {
    hd: asset('media/film-02-1080.mp4'),
    sd: asset('media/film-02-720.mp4'),
    poster: asset('media/film-02-poster.webp'),
  },
  finalPose: asset('media/final-pose.webp'),
  /** The same frame with the specimen's light added — see scripts/make_lit_pose.py. */
  finalPoseLit: asset('media/final-pose-lit.webp'),
  hands: asset('artifact/hand-foreground.webp'),
  handsLit: asset('artifact/hand-foreground-lit.webp'),
  reference: asset('artifact/artifact-seed-reference.webp'),
  /** The generated concept sheet the whole object was designed against. */
  conceptSheet: asset('artifact/concept-sheet.webp'),
}

/**
 * The soundtrack ships, so the layer is on by default. `VITE_AMBIENCE=0` takes
 * it out of the DOM entirely — for a silent deployment, or if the track is
 * removed, since an <audio> element pointed at a missing file would 404 on
 * every load.
 */
export const HAS_AMBIENCE = import.meta.env.VITE_AMBIENCE !== '0'

export const AMBIENCE_SRC = asset('audio/ambience.m4a')
