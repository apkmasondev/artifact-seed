import { TIMELINE, Timeline } from './scene'
import { VideoRect } from './videoFit'

export type StageName = 'intro' | 'approach' | 'gesture' | 'materialise' | 'inspect' | 'core'

/**
 * One mutable object drives film, WebGL, mask and UI. It is written by a single
 * RAF loop and read everywhere else, so the layers can never drift apart.
 * Nothing here triggers React renders — discrete UI changes go through `stage`.
 */
export interface Runtime {
  timeline: Timeline
  reducedMotion: boolean

  /** Damped progress — the single source of truth for every layer. */
  p: number

  viewport: { w: number; h: number }
  rect: VideoRect

  film1Time: number
  film2Time: number
  /** 0 = film 01 only, 1 = film 02 only. */
  cross: number
  /** 0 = live video, 1 = frozen final-pose still. */
  freeze: number
  handMask: number
  /**
   * How strongly the specimen lights the dancer. Drives the cross-fade to the
   * lit variants of the frozen frame and the hand mask — the only channel by
   * which the WebGL layer reaches back into the film.
   */
  coreLight: number

  spark: number
  dust: number
  wire: number
  solid: number
  open: number
  rise: number
  /** Overall WebGL layer opacity. */
  seedOpacity: number

  interactive: boolean
}

export const runtime: Runtime = {
  timeline: TIMELINE,
  reducedMotion: false,
  p: 0,
  viewport: { w: 1, h: 1 },
  rect: { x: 0, y: 0, w: 1, h: 1, scale: 1 },
  film1Time: 0,
  film2Time: 0,
  cross: 0,
  freeze: 0,
  handMask: 0,
  coreLight: 0,
  spark: 0,
  dust: 0,
  wire: 0,
  solid: 0,
  open: 0,
  rise: 0,
  seedOpacity: 0,
  interactive: false,
}

type Listener<T> = (value: T) => void

export function createStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<Listener<T>>()
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach((l) => l(value))
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * The ambience track. It is optional by design: if no audio file ships, the
 * element errors, the toggle never renders and the scene loop skips it.
 */
export const ambience = {
  element: null as HTMLAudioElement | null,
  enabled: false,
}

export const stageStore = createStore<StageName>('intro')
export const audioStore = createStore(false)
export const audioAvailableStore = createStore(false)
export const readyStore = createStore(false)
export const loadStore = createStore(0)
export const contextLostStore = createStore(false)
/**
 * 0 = run at the profile the device was detected as, 1 = the frame governor has
 * seen sustained slow frames and stepped it down. One-way: a scene that flips
 * quality back and forth under load is worse than one that stays where it
 * landed, and the step itself costs a framebuffer reallocation.
 */
export const perfStore = createStore<0 | 1>(0)
/**
 * The about sheet covers the scene completely. While it is up there is nothing
 * to render behind it, and on a phone that idle pump is a real share of the
 * budget the blurred panel itself is asking for.
 */
export const overlayStore = createStore(false)
