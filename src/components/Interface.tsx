import { MouseEvent, RefObject, useCallback } from 'react'
import { runtime, stageStore, StageName } from '../core/runtime'
import { useStore } from '../hooks/useStore'
import { About } from './About'
import { Ambience } from './Ambience'

/**
 * Four words, and a deliberate silence while the gesture plays — the
 * choreography does not need a caption.
 */
const HINTS: Record<StageName, string> = {
  intro: 'Scroll to approach',
  approach: 'Scroll to approach',
  gesture: '',
  materialise: 'Specimen forming',
  inspect: 'Drag to inspect',
  core: 'Core exposed',
}

/** The progress rule is driven by the scene loop, not by a second RAF here. */
export function Interface({ meter }: { meter: RefObject<HTMLElement> }) {
  const stage = useStore(stageStore)

  const restart = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // This control hides itself the moment progress leaves the end of the
    // timeline — about 400 ms into the journey back. If it still holds focus
    // then, the browser has to move focus off a now-hidden element, and that
    // focus shift cancels the smooth scroll where it stands. Let it go first.
    event.currentTarget.blur()
    scrollTo({ top: 0, behavior: runtime.reducedMotion ? 'auto' : 'smooth' })
  }, [])

  // Once the viewer is inside the piece the descriptor retires, but the
  // wordmark stays — dimmed to a corner mark rather than switched off.
  const entered = stage !== 'intro' && stage !== 'approach'
  const restartHidden = stage !== 'core'

  return (
    <div className="ui">
      <div className={`ui__title${entered ? ' is-quiet' : ''}`}>
        <h1>Artifact Seed</h1>
        <p className={entered ? 'is-hidden' : ''}>An interactive specimen</p>
      </div>

      {/* One rail in the corner: the progress rule, then the label. */}
      <div className="ui__corner">
        <span className="ui__meter" aria-hidden="true">
          <span className="ui__meter-bar">
            <i ref={meter} />
          </span>
        </span>
        <About />
      </div>

      <p className={`ui__hint${HINTS[stage] ? '' : ' is-hidden'}`} aria-live="polite">
        {HINTS[stage]}
      </p>

      <Ambience />

      <button
        type="button"
        className={`ui__restart${restartHidden ? ' is-hidden' : ''}`}
        onClick={restart}
        tabIndex={restartHidden ? -1 : 0}
      >
        Restart
      </button>
    </div>
  )
}
