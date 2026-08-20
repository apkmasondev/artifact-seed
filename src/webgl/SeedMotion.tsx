import { useFrame } from '@react-three/fiber'
import { ReactNode, useEffect, useRef } from 'react'
import { Group } from 'three'
import { clamp, damp } from '../core/math'
import { runtime } from '../core/runtime'

const DRAG_SENSITIVITY = 0.0052
const MAX_SPIN = 3.0
const SPIN_FRICTION = 2.4
const IDLE_SPIN = 0.075
const MAX_PITCH = 0.44

interface PointerState {
  dragging: boolean
  pointerId: number
  lastX: number
  lastY: number
  yaw: number
  pitch: number
  yawVel: number
  pitchVel: number
  parallaxX: number
  parallaxY: number
  targetParallaxX: number
  targetParallaxY: number
  moved: boolean
}

/**
 * Drag to inspect, with inertia and damping. Vertical touch gestures are left
 * to the page — the canvas declares `touch-action: pan-y`, so a swipe down
 * still scrolls and only sideways movement reaches the object.
 */
export function SeedMotion({ children }: { children: ReactNode }) {
  const spin = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const state = useRef<PointerState>({
    dragging: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    yaw: 0.24,
    pitch: 0.05,
    yawVel: 0,
    pitchVel: 0,
    parallaxX: 0,
    parallaxY: 0,
    targetParallaxX: 0,
    targetParallaxY: 0,
    moved: false,
  })

  useEffect(() => {
    const s = state.current
    /*
     * Parallax is a cursor idea. A finger has no resting position — it arrives,
     * moves once and leaves — so on touch the object would tip to wherever the
     * last scroll gesture ended and simply stay there. Drag still turns it.
     */
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

    const isInteractiveTarget = (target: EventTarget | null) =>
      target instanceof Element && target.closest('button, a, [role="button"]') !== null

    const onDown = (event: PointerEvent) => {
      if (!runtime.interactive || event.button !== 0) return
      if (isInteractiveTarget(event.target)) return
      s.dragging = true
      s.pointerId = event.pointerId
      s.lastX = event.clientX
      s.lastY = event.clientY
      s.moved = false
      document.body.style.cursor = 'grabbing'
    }

    const onMove = (event: PointerEvent) => {
      if (!coarse) {
        s.targetParallaxX = (event.clientX / innerWidth) * 2 - 1
        s.targetParallaxY = (event.clientY / innerHeight) * 2 - 1
      }

      if (!s.dragging || event.pointerId !== s.pointerId) return
      const dx = event.clientX - s.lastX
      const dy = event.clientY - s.lastY
      s.lastX = event.clientX
      s.lastY = event.clientY
      if (Math.abs(dx) + Math.abs(dy) > 2) s.moved = true
      s.yawVel = clamp(s.yawVel + dx * DRAG_SENSITIVITY * 60, -MAX_SPIN, MAX_SPIN)
      s.pitchVel = clamp(s.pitchVel + dy * DRAG_SENSITIVITY * 34, -MAX_SPIN, MAX_SPIN)
    }

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== s.pointerId) return
      s.dragging = false
      s.pointerId = -1
      document.body.style.cursor = ''
    }

    // Left/right arrows do what a drag does, so the object is not locked behind
    // a pointer. Up/down are left alone — they belong to the page.
    const onKeyDown = (event: KeyboardEvent) => {
      if (!runtime.interactive || event.altKey || event.metaKey || event.ctrlKey) return
      if (isInteractiveTarget(event.target)) return
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!direction) return
      event.preventDefault()
      s.yawVel = clamp(s.yawVel + direction * 1.6, -MAX_SPIN, MAX_SPIN)
    }

    addEventListener('pointerdown', onDown, { passive: true })
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerup', onUp, { passive: true })
    addEventListener('pointercancel', onUp, { passive: true })
    addEventListener('keydown', onKeyDown)
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointercancel', onUp)
      removeEventListener('keydown', onKeyDown)
      document.body.style.cursor = ''
    }
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta)
    const s = state.current
    const g = spin.current
    const t = tilt.current
    if (!g || !t) return

    if (!s.dragging) {
      const friction = Math.exp(-SPIN_FRICTION * dt)
      s.yawVel *= friction
      s.pitchVel *= friction
      // The object never spins like a loading indicator; idle drift only.
      s.yaw += IDLE_SPIN * dt * (runtime.reducedMotion ? 0.35 : 1)
      // Pitch relaxes back to level so the seed cannot end up upside down.
      s.pitch = damp(s.pitch, 0, 1.6, dt)
    }

    s.yaw += s.yawVel * dt
    s.pitch = clamp(s.pitch + s.pitchVel * dt, -MAX_PITCH, MAX_PITCH)

    g.rotation.y = s.yaw
    g.rotation.x = s.pitch

    // Very small parallax so the object feels seated in space, not attached to
    // the cursor. Disabled while dragging.
    const strength = runtime.interactive && !s.dragging ? 1 : 0
    s.parallaxX = damp(s.parallaxX, s.targetParallaxX * strength, 3.2, dt)
    s.parallaxY = damp(s.parallaxY, s.targetParallaxY * strength, 3.2, dt)
    t.rotation.y = s.parallaxX * 0.075
    t.rotation.x = -s.parallaxY * 0.05
    t.position.x = s.parallaxX * 0.012
    t.position.y = -s.parallaxY * 0.008
  })

  return (
    <group ref={tilt}>
      <group ref={spin}>{children}</group>
    </group>
  )
}
