import { useEffect, useRef, useState } from 'react'
import { loadStore, readyStore } from '../core/runtime'
import { useStore } from '../hooks/useStore'

export function Loader() {
  const ready = useStore(readyStore)
  const [percent, setPercent] = useState(0)
  const bar = useRef<HTMLElement>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let raf = 0
    let shown = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const target = loadStore.get()
      // Never let the number run backwards or jump — it is the only thing on
      // screen, so its motion is the whole first impression.
      shown += Math.max(0.0016, (target - shown) * 0.06)
      if (shown > target) shown = target
      const next = Math.min(99, Math.floor(shown * 100))
      setPercent((prev) => (prev === next ? prev : next))
      if (bar.current) bar.current.style.transform = `scaleX(${shown.toFixed(3)})`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!ready) return
    setPercent(100)
    if (bar.current) bar.current.style.transform = 'scaleX(1)'
    const t = window.setTimeout(() => setGone(true), 1100)
    return () => clearTimeout(t)
  }, [ready])

  if (gone) return null

  return (
    <div className={`loader${ready ? ' is-hidden' : ''}`} role="status" aria-live="polite">
      <div className="loader__mark">ARTIFACT SEED</div>
      <div className="loader__status">
        <span>Initializing</span>
        <span className="loader__rule">
          <i ref={bar} />
        </span>
        <span>{percent}%</span>
      </div>
    </div>
  )
}
