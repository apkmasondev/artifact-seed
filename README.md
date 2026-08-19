# ARTIFACT SEED

A single-screen, scroll-driven experience: a dancer builds an empty space between
her palms, an object materialises inside it, and opens.

Film and WebGL are not two layers stacked on top of each other — the specimen is
positioned in the coordinate space of the film, and the dancer's hands are
composited back **over** the 3D object so it sits between them rather than in
front of them.

```
HUMAN → GESTURE → EMPTY SPACE → MATERIALISATION → ARTIFACT → INTERACTION → REVEAL
```

---

## Stack

| | |
|---|---|
| Build | Vite 5 + TypeScript |
| UI | React 18 |
| 3D | three.js · @react-three/fiber · @react-three/drei |
| Motion | custom RAF driver — no animation library |
| Deploy | GitHub Actions → GitHub Pages |

There is no post-processing pass, no scroll library and no HDRI download. The
environment is built from emissive rectangles and baked once; the "bloom" is two
additive sprites, because a composer cannot write a glow into the transparent
pixels the film shows through.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run preview
```

Checks:

```bash
npm run typecheck
```

```bash
npm run lint
```

### Dev-only query flags

Stripped from production builds; useful for inspecting one moment of the
timeline without fighting the scroll position.

| Flag | Effect |
|---|---|
| `?p=0.86` | Pins the timeline to that progress value |
| `?reduced=1` | Forces the reduced-motion path |

---

## Assets

```
public/
├── media/
│   ├── film-01-1080.mp4      1920×1080  ·  3.8 MB   desktop master
│   ├── film-01-720.mp4       1280×720   ·  1.3 MB   mobile / save-data
│   ├── film-02-1080.mp4      1920×1080  ·  6.5 MB
│   ├── film-02-720.mp4       1280×720   ·  1.7 MB
│   ├── film-01-poster.webp
│   ├── film-02-poster.webp
│   ├── final-pose.webp                             frozen last frame of film 02
│   └── final-pose-lit.webp                         the same frame, lit by the core
├── artifact/
│   ├── hand-foreground.webp                        the hands, alpha-cut
│   ├── hand-foreground-lit.webp                    the same cut, lit by the core
│   └── artifact-seed-reference.webp                WebGL-unavailable fallback
├── audio/
│   └── ambience.m4a         4:06       ·  4.2 MB   fetched only if asked for
├── og-image.jpg
└── favicon.svg
```

The Artifact Seed itself is **not** an asset. Its geometry, its brushed-ceramic
micro detail and its core light stack are all generated in code at runtime, so
there is no model to download and the silhouette can be tuned numerically
(`src/webgl/geometry/profile.ts`).

### Video encoding

Both sources arrived as 1920×1080, 24 fps, 10.000 s, H.264 High, with an AAC
track. They were re-encoded, not upscaled:

```bash
ffmpeg -i source.mp4 -an \
  -vf "hqdn3d=1.5:1.5:4:6,lutyuv=y='clip(val+1,0,255)'" \
  -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -preset slow -crf 20 \
  -g 6 -keyint_min 6 -sc_threshold 0 \
  -x264-params ref=3:bframes=0:aq-mode=2 \
  -movflags +faststart \
  film-02-1080.mp4
```

The `lutyuv` lift applies to film 02 only; film 01 is encoded without it.

The choices that matter for scrubbing:

- **`-g 6`** — a keyframe every quarter second. All-I encodes seek perfectly but
  cost 24.7 MB per clip; GOP 24 is 6.9 MB but seeks visibly worse. GOP 6 lands at
  7–11 MB with a worst case of five frames of forward decode.
- **`bframes=0`** — no frame reordering, so a seek is a decode and nothing else.
- **`hqdn3d`, light** — the sources carry heavy sensor grain, which is the single
  most expensive thing in the bitrate. Removing the temporal component costs
  1.4 dB PSNR and no visible detail (verified against the masters), and pays for
  the small GOP. A uniform grain overlay is re-applied in CSS.
- **`lutyuv` +1, film 02 only** — a shot-to-shot match. The two clips sit 1.5/255
  apart in the blacks at the cut point; lifting film 02 by one code value brings
  the background corners to within ~1/255 of film 01 and halves the seam error.
- **audio stripped** — the experience never plays sound, and the architecture
  keeps an audio layer addable later without restructuring.

The 720p variants are chosen at runtime from device memory, core count, pointer
type and `navigator.connection`. Only one resolution is ever fetched.

---

## How the illusion is built

### 1. One progress value

A single RAF loop reads `scrollY`, damps it, and derives everything else from the
damped value — both films' `currentTime`, the cut, the frame transform, the
materialisation stages, the open amount, the light on the palms and the progress
rule. Nothing in the scene owns a second timeline, so nothing can drift. (Two
other loops exist and touch no scene state: the loader's own counter, and the
one-line pump that wakes the on-demand renderer.)

```
scrollY → raw → damped p → { film, mask, WebGL, UI }
```

Damping is frame-rate independent (`1 - exp(-λ·dt)`), so a 144 Hz display and a
30 Hz one converge identically.

### 2. Seeking, not playing

`currentTime` is never written unconditionally. Writes are coalesced: while a
seek is in flight nothing is written, and the newest target is applied on
`seeked`. Without this, a fast scroll queues dozens of seeks and the decoder
stutters for seconds.

### 3. A cut, not a dissolve

Film 01 frame 238 and film 02 frame 1 are the closest matching pair across the
two clips — searched exhaustively over the last three seconds of one against the
first three of the other, scoring image difference **plus motion continuity**, so
the arms are travelling the same direction on both sides of the cut. A cross-fade
there double-exposes the arms, because film 01 is frozen while film 02 is still
moving. A straight cut on a matched pair is invisible.

Film 02 is entered one frame in, and its gesture starts immediately — there is no
hesitation to scroll through.

### 4. Germination

Past full open, the core climbs out of the shell and stops just above the palms
— a seed opening, not an ejection. The top cap withdraws into the body as it
goes (a lid left in place would run straight through the rising sphere), the
husk settles, the column that fed the core dims, and the halo travels with the
core rather than staying with the shell it came from. It never leaves the space
her hands are holding, which is the whole point.

### 5. Video space, not viewport space

Every spatial constant lives in the 1920×1080 coordinate system of the source
(`src/core/scene.ts`), measured from the encoded masters rather than guessed:

| | |
|---|---|
| Hands, final pose | x 762–1162, y 481–663 |
| Narrowest gap between the palms | x 856–1070 at y 555 |
| Seed anchor | (963, 562) |
| Seed height | 437 px of video space |

`computeVideoRect()` maps that space onto the viewport, and `SeedRig` projects
the anchor through the **same** rect into world units on the camera's z = 0
plane. Change the window aspect ratio and the seed stays between the palms —
the projection round-trips back to the anchor pixel it was derived from.

### 6. Cover, but never crop the safe box

`object-fit: cover` eats the dancer's arms on a phone. `object-fit: contain`
shrinks the film to a postage stamp in portrait — a 16:9 frame in a 9:19.5
viewport is 219 px tall. Instead the fit picks the largest scale that still shows
a declared safe box, capped at the scale that fills the viewport.

The safe box itself interpolates from wide (film 01's choreography reaches
x 428–1428) to tight (the final pose only needs x 690–1230) as the gesture
resolves. On a 16:9 desktop both resolve to the same full-bleed transform, so
nothing moves; in portrait it reads as a slow push-in.

### 7. The specimen lights her back

Everything above is the WebGL layer reacting to the film. These two channels run
the other way, and they are what stop the object reading as a sticker:

**A contact shadow.** A soft ellipse in video space, between the film and the
canvas, that spreads and lightens as the shell unfolds — an open flower blocks
less light than a sealed capsule. It is pure black, so plain alpha compositing
is identical to `multiply` and costs a blend mode less.

**A lit variant of the frozen frame.** `scripts/make_lit_pose.py` renders a
second copy of the final pose with the core's light added, and the driver
cross-fades to it as the specimen forms. The added source is
`falloff(distance) × albedo`, where albedo is the frame's own exposure with the
background floor subtracted — so skin picks the light up, the black suit stays
black, and the background cannot glow. (Shape-from-shading was tried and thrown
away: blurring the frame to recover normals turns the silhouette into a ramp,
and the ramp shades into a halo around her whole body.)

The hand mask gets the same treatment, because a mask cut from the unlit frame
would snap the hands back to unlit the moment it faded in over a lit body.

### 8. Foreground occlusion

The hands were alpha-cut from the frozen final frame by skin chroma (`R − B` is
strongly positive on skin and negative on both the suit and the background),
cleaned up with connected components and hole filling, and feathered.

Layer order, all sharing one CSS transform:

```
z 0    film / frozen still / lit still
z 5    contact shadow
z 10   WebGL canvas
z 20   hand mask + lit hand mask  ←  what puts the object *between* the palms
z 25   vignette
z 30   UI
z 40   grain
```

The seed is 261 px wide in video space against a 214 px gap, so its belly tucks
about 23 px behind each palm — enough for the occlusion to read, and the panels
pass well behind the fingers once they open.

---

## Performance

| | Desktop | Mobile |
|---|---|---|
| DPR cap | 1.6 | 1.25–1.5 |
| Draw calls | ~89 (44 without the transmission pass) | ~44 |
| Triangles | ~110 k | ~50 k |
| Measured | 60 fps, worst frame 17 ms | — |

- The canvas runs `frameloop="demand"` and is pumped only while the specimen
  exists. During the film there is no WebGL work at all.
- One petal geometry is shared by all eight panels; materials are memoised and
  disposed on unmount; nothing is allocated in `useFrame`.
- Real refraction (`transmission`) is high tier only, and `transmission` is never
  toggled at runtime — that recompiles the shader mid-scroll.
- The solid shell materialises through a dissolve injected into the existing PBR
  shaders, so the eight panels stay opaque and never need transparency sorting.
- `webglcontextlost` is handled; the reference render stands in until the context
  comes back.

### Quality tiers

Chosen from `hardwareConcurrency`, `deviceMemory`, pointer type, viewport area ×
DPR and `navigator.connection`. There is no quality menu.

| | High | Medium | Low |
|---|---|---|---|
| Video | 1080p | 1080p | 720p |
| DPR | 1.6 | 1.25 | 1.0 |
| Particles | 520 | 260 | 110 |
| Shell segments | 22 | 16 | 12 |
| Transmission | yes | no | no |
| MSAA | yes | yes | no |
| Grain | yes | yes | no |

### Reduced motion

`prefers-reduced-motion: reduce` cuts the page to 3 viewports, skips scrubbing
entirely — **the films are never downloaded** — and presents the frozen pose with
the specimen still materialising and opening on scroll.

---

## Soundtrack

*Titanium Bloom* — 4:06, AAC-LC 128 kbps, 4.2 MB, mastered for the piece rather
than for streaming:

```bash
ffmpeg -i track.mp3 -map 0:a -t 246.2 -af "volume=-6.2dB"   -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart   public/audio/ambience.m4a
```

- **`-map 0:a`** drops the embedded cover art the source carried.
- **`volume=-6.2dB`** brings the master from −13.8 LUFS to −20.1 LUFS with
  −6.8 dBTP of headroom. A static gain, not `loudnorm`: dynamic normalisation
  pumps on music, and a bed under a cinematic piece has no business sitting at
  streaming loudness.
- **`-t 246.2`** trims the trailing digital silence, so the loop turns over
  sooner. The track fades out naturally, so the seam reads as a breath.

A `SOUND` control appears opposite `RESTART` in the same typographic voice.
Playback only ever starts from that click: no autoplay, no restore-on-load, no
remembered preference — sound arriving unasked would be the least premium thing
here. Only the file header is fetched up front, so a visitor who never asks for
sound never pays for it. Volume rides the same damped progress as everything
else, opening at 0.30 and swelling to 0.85 as the specimen forms, and the loop
pauses itself when the tab is hidden.

`VITE_AMBIENCE=0` removes the whole layer from the DOM.

---

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main` and publishes to
GitHub Pages.

Asset URLs are document-relative (`base: './'`), so one `dist/` works unchanged
at `/` (user site or custom domain) and at `/<repo>/` (project site) with no
base-path configuration. Runtime URLs are resolved against `document.baseURI` —
a relative `url()` handed to a CSS custom property would otherwise be resolved
against the stylesheet and 404 once the CSS lives in `/assets/`.

To enable it: **Settings → Pages → Source → GitHub Actions**, then push to
`main`.

```bash
git remote add origin git@github.com:<owner>/<repo>.git && git push -u origin main
```

---

## Credits

Films and concept art generated by APKMason.dev. Soundtrack *Titanium Bloom*.
The Artifact Seed itself is procedural — no model, no HDRI, no purchased asset.

An `ABOUT` panel in the top right explains the piece in plain language and
carries the credit in the experience itself. It is the one place that breaks the
house voice — everything else is tracked uppercase four words at a time, which is
right for a caption and wrong for an explanation.

---

## Structure

```
src/
├── app/App.tsx
├── components/
│   ├── Experience.tsx      layer composition, refs, preload wiring
│   ├── Interface.tsx       the four words of UI
│   ├── About.tsx           the plain-language panel + credit
│   ├── Ambience.tsx        optional soundtrack + its toggle
│   └── Loader.tsx
├── core/
│   ├── scene.ts            video-space constants + the scroll timeline
│   ├── videoFit.ts         "cover, but never crop the safe box"
│   ├── videoScrubber.ts    coalesced seeking
│   ├── runtime.ts          the single mutable frame state
│   ├── quality.ts          tier detection
│   ├── assets.ts
│   └── math.ts
├── hooks/
│   ├── useSceneDriver.ts   the one RAF loop
│   ├── usePreload.ts
│   └── useStore.ts
├── webgl/
│   ├── WebGLScene.tsx      canvas, render pump, context loss
│   ├── SeedRig.tsx         video space → world space
│   ├── SeedMotion.tsx      drag, inertia, idle drift, parallax
│   ├── ArtifactSeed.tsx    the specimen and its mechanism
│   ├── Lighting.tsx        procedural studio environment
│   ├── geometry/           profile · petal · cage
│   └── materials/          PBR set · brushed micro detail · reveal dissolve
└── styles/global.css

scripts/
└── make_lit_pose.py        renders the core-lit variants of the frozen frame
```

---

## Known limits

- The two clips are choreographed in place; the "approach" in the narrative is
  carried by the tightening safe box, not by camera movement in the footage.
- The camera-original masters, the brief and the concept art are git-ignored:
  they are working material, not deliverables. `public/media` holds the encoded
  results, and `scripts/make_lit_pose.py` regenerates the lit variants straight
  from the shipped encode, so a clean checkout is self-contained.
- On viewports wider than 16:9 the frame is pillarboxed. Filling them would mean
  cropping the dancer's feet, and the letterbox is black on black.
- Scrubbing an H.264 file is decoder-bound. A very fast flick can outrun the
  decoder by a few hundred milliseconds before it catches up; this is inherent to
  scroll-driven video and is why the GOP is short.
- The hand mask is cut from one frozen frame, so occlusion is only active from
  the freeze onwards — which is exactly when the specimen appears.
- The lit variant is baked for the core's resting position. Once the core rises
  the light source has moved ~150 px up, but the pool is broad enough that the
  approximation holds; a second bake would cost another 145 KB for very little.
