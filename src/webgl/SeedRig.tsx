import { useFrame, useThree } from '@react-three/fiber'
import { ReactNode, useRef } from 'react'
import { Group, PerspectiveCamera } from 'three'
import { runtime } from '../core/runtime'
import { SEED_ANCHOR, SEED_HEIGHT, VIDEO_H } from '../core/scene'

/**
 * Locks the seed to the film, not to the viewport.
 *
 * The anchor is a point in 1920x1080 video space; it is projected through the
 * same rect the video layer is drawn with, then converted into world units on
 * the camera's z = 0 plane. Change the window aspect and the seed stays exactly
 * between the palms.
 */
export function SeedRig({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  const { camera, size } = useThree()

  useFrame(() => {
    const g = group.current
    if (!g) return
    const cam = camera as PerspectiveCamera
    const rect = runtime.rect
    if (rect.w <= 1 || size.height <= 1) return

    const distance = cam.position.z
    const visibleHeight = 2 * distance * Math.tan(((cam.fov * Math.PI) / 180) / 2)
    const unitsPerPixel = visibleHeight / size.height

    const sx = rect.x + SEED_ANCHOR.x * rect.scale
    const sy = rect.y + SEED_ANCHOR.y * rect.scale

    g.position.set(
      (sx - size.width / 2) * unitsPerPixel,
      -(sy - size.height / 2) * unitsPerPixel,
      0,
    )
    g.scale.setScalar((SEED_HEIGHT / VIDEO_H) * rect.h * unitsPerPixel)
  })

  return <group ref={group}>{children}</group>
}
