import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const AUTHOR_URL = 'https://apkmason.dev'

/**
 * The one place in the piece that speaks in plain sentences.
 *
 * Everything else is tracked uppercase and four words at a time, which is right
 * for a caption and wrong for an explanation — so the panel deliberately breaks
 * the house voice: normal case, normal measure, something a person can read.
 */
export function About() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  const dismiss = useCallback(() => {
    setOpen(false)
    trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    close.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
        return
      }
      if (event.key !== 'Tab') return
      // Keep Tab inside the dialog; the scene's own controls are behind it.
      const focusable = panel.current?.querySelectorAll<HTMLElement>('a[href], button')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [open, dismiss])

  // The trigger belongs in the corner rail; the dialog belongs above every
  // layer in the scene, grain included. A portal is what keeps both true.
  const dialog = (
    <div
      className={`about${open ? ' is-open' : ''}`}
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="About Artifact Seed"
      // Hidden from the tab order and from screen readers when closed, so the
      // panel cannot be reached behind the scene.
      {...(open ? {} : { inert: '', 'aria-hidden': true })}
      >
      <div className="about__sheet">
          <button type="button" ref={close} className="about__close" onClick={dismiss}>
            Close
          </button>

          <h2 className="about__mark">Artifact Seed</h2>
          <p className="about__lead">
            A film and a piece of 3D, running as one continuous shot.
          </p>

          <p>
            Scroll, and the dancer moves. When she holds her hands apart, something starts
            to form in the space between them — a point of light, then a wire cage, then a
            machined black shell. Keep going and it opens, and the core lifts out of it.
          </p>

          <h3>Things to try</h3>
          <dl className="about__list">
            <dt>Scroll</dt>
            <dd>Moves through the whole piece, forwards or back.</dd>
            <dt>Drag</dt>
            <dd>
              Turns the object once it has formed. Works with a mouse, with touch, and
              with the arrow keys.
            </dd>
            <dt>Sound</dt>
            <dd>Optional, bottom left. Nothing plays until you ask for it.</dd>
          </dl>

          <h3>How it is made</h3>
          <p>
            Nothing here is a downloaded 3D model. The object&rsquo;s shape, its brushed
            ceramic surface and its light are all generated in your browser, in code. It is
            placed in the film&rsquo;s own coordinate space, and the dancer&rsquo;s hands
            are laid back over the top of it — which is why it sits between her palms
            instead of in front of them.
          </p>

          <p className="about__credit">
            A project by{' '}
            <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
              APKMason.dev
            </a>
          </p>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="ui__about"
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        About
      </button>
      {createPortal(dialog, document.body)}
    </>
  )
}
