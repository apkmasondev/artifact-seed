import { useCallback, useEffect, useRef } from 'react'
import { AMBIENCE_SRC, HAS_AMBIENCE } from '../core/assets'
import { ambience, audioAvailableStore, audioStore } from '../core/runtime'
import { useStore } from '../hooks/useStore'

/**
 * The soundtrack layer, and the only control the piece needs beyond scrolling.
 *
 * It is optional by construction: with no track shipped the element never
 * mounts, the toggle never renders and the scene loop skips the volume ramp.
 * Volume itself is not handled here — it rides the same damped progress as
 * everything else, in `useSceneDriver`.
 *
 * Playback always starts from a click. Sound arriving unasked would be the
 * least premium thing in the whole experience, so there is no restore-on-load
 * and no remembered preference.
 */
export function Ambience() {
  const element = useRef<HTMLAudioElement>(null)
  const available = useStore(audioAvailableStore)
  const on = useStore(audioStore)

  useEffect(() => {
    const audio = element.current
    if (!audio) return
    audio.volume = 0
    ambience.element = audio
    return () => {
      ambience.element = null
      ambience.enabled = false
    }
  }, [])

  // A loop playing to a hidden tab is just noise on someone else's machine.
  useEffect(() => {
    const onVisibility = () => {
      const audio = element.current
      if (!audio) return
      if (document.hidden) audio.pause()
      else if (ambience.enabled) void audio.play().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const toggle = useCallback(() => {
    const audio = element.current
    if (!audio) return
    const next = !ambience.enabled
    ambience.enabled = next
    audioStore.set(next)
    // Called straight out of the click so the user activation still counts.
    if (next) void audio.play().catch(() => undefined)
  }, [])

  if (!HAS_AMBIENCE) return null

  return (
    <>
      {/* Only the header is fetched up front; the track itself downloads when
          — and only when — someone asks for it. */}
      <audio
        ref={element}
        src={AMBIENCE_SRC}
        loop
        preload="metadata"
        onLoadedMetadata={() => audioAvailableStore.set(true)}
        onError={() => audioAvailableStore.set(false)}
      />

      {available && (
        <button
          type="button"
          className="ui__sound"
          onClick={toggle}
          aria-pressed={on}
          aria-label={on ? 'Mute the soundtrack' : 'Play the soundtrack'}
        >
          {on ? 'Sound on' : 'Sound off'}
        </button>
      )}
    </>
  )
}
