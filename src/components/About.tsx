import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MEDIA } from '../core/assets'

const AUTHOR_URL = 'https://apkmason.dev'

const CONCEPT_ALT =
  'Concept sheet for the Artifact Seed: front, side, back and top views of a ' +
  'segmented black capsule, a materials list, and three states — closed, opening ' +
  'and fully open.'

/** Straight from the concept sheet the object was designed against. */
const MATERIALS = [
  ['Black ceramic', '#1a1a1d'],
  ['Brushed titanium', '#6f6f76'],
  ['Polished gunmetal', '#9c8459'],
  ['Smoked glass', '#4a4139'],
  ['Energy core', '#fff1d8'],
] as const

/**
 * The one place in the piece that speaks in plain sentences — laid out as the
 * specimen sheet the object was designed from, rather than as a text box on
 * black. Small tracked labels in the left rail, prose in the right, hairline
 * rules between them: the same vocabulary as the rest of the UI, given enough
 * structure to survive a wide screen.
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
      // Out of the tab order and hidden from screen readers when closed, so the
      // panel cannot be reached behind the scene.
      {...(open ? {} : { inert: '', 'aria-hidden': true })}
    >
      <article className="about__sheet">
        <header className="about__head">
          <p className="about__mark">Artifact Seed</p>
          <button type="button" ref={close} className="about__close" onClick={dismiss}>
            Close
          </button>
        </header>

        <p className="about__lead">
          A film and a piece of 3D, running as one continuous shot.
        </p>

        <div className="about__row">
          <h2>The piece</h2>
          <div className="about__body">
            <p>
              Scroll, and the dancer moves. When she holds her hands apart, something
              starts to form in the space between them — a point of light, then a wire
              cage, then a machined black shell. Keep going and it opens, and the core
              lifts out of it.
            </p>
          </div>
        </div>

        <div className="about__row">
          <h2>Things to try</h2>
          <div className="about__body">
            <dl className="about__keys">
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
          </div>
        </div>

        <div className="about__row">
          <h2>Where it started</h2>
          <div className="about__body about__body--wide">
            <figure className="about__figure">
              <img
                src={MEDIA.conceptSheet}
                alt={CONCEPT_ALT}
                loading="lazy"
                decoding="async"
                width={1254}
                height={1254}
              />
              <figcaption>
                The concept sheet everything was built from. The object in the browser is
                modelled to it — eight panels, the inner frame, the smoked glass and the
                lit core — but nothing from this image is used at runtime.
              </figcaption>
            </figure>
          </div>
        </div>

        <div className="about__row">
          <h2>Materials</h2>
          <div className="about__body">
            <ul className="about__materials">
              {MATERIALS.map(([name, swatch]) => (
                <li key={name}>
                  <i style={{ background: swatch }} aria-hidden="true" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="about__row">
          <h2>How it is made</h2>
          <div className="about__body">
            <p>
              Nothing here is a downloaded 3D model. The object&rsquo;s shape, its brushed
              ceramic surface and its light are all generated in your browser, in code.
            </p>
            <p>
              It is placed in the film&rsquo;s own coordinate space, and the
              dancer&rsquo;s hands are laid back over the top of it — which is why it sits
              between her palms instead of in front of them.
            </p>
          </div>
        </div>

        <footer className="about__credit">
          <span>A project by</span>
          <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
            APKMason.dev
          </a>
        </footer>
      </article>
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
