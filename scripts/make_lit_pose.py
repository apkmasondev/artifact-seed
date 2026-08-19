"""
Generates the core-lit variant of the frozen final pose.

The specimen has to light the dancer, not just sit in front of her — that is the
one cue that makes both layers read as the same space. There is no depth data to
work from, so the added source is modelled as:

    lit = base + warm * strength * falloff(distance from the core) * albedo

`albedo` is the frame's own exposure with the background floor subtracted, which
does three jobs at once: skin picks the light up, the black suit stays black, and
the background cannot glow (which is what kills every naive version of this).

Shape-from-shading was tried and discarded: blurring the frame to recover surface
normals turns the silhouette into a wide ramp, and the ramp shades into a halo
around her whole body.

Requires ffmpeg on PATH. Run from the project root:

    python scripts/make_lit_pose.py
"""

import os
import subprocess
import tempfile

import cv2
import numpy as np
from PIL import Image

FILM = "public/media/film-02-1080.mp4"
MASK_ALPHA = "public/artifact/hand-foreground.webp"
OUT_POSE = "public/media/final-pose-lit.webp"
OUT_HANDS = "public/artifact/hand-foreground-lit.webp"

# The core, in 1920x1080 video space. Keep in sync with SEED_ANCHOR.
CX, CY = 963.0, 562.0
# Radius of the light pool, and how far it throws sideways vs. upwards.
RADIUS, ASPECT_X, ASPECT_Y = 230.0, 1.15, 0.92
STRENGTH = 92.0
WARM = np.array([1.0, 0.88, 0.70], np.float32)
# Anything at or below this luminance is background, and stays untouched.
FLOOR, RANGE = 14.0, 85.0


def final_frame() -> np.ndarray:
    """The frozen pose, pulled straight from the shipped encode so the lit
    variant can never drift from the frame the scene actually freezes on."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "frame.png")
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-sseof", "-0.05", "-i", FILM,
             "-frames:v", "1", "-update", "1", path],
            check=True,
        )
        return np.asarray(Image.open(path).convert("RGB")).astype(np.float32)


def main() -> None:
    base = final_frame()
    h, w, _ = base.shape

    lum = 0.299 * base[..., 0] + 0.587 * base[..., 1] + 0.114 * base[..., 2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.sqrt(((xx - CX) / ASPECT_X) ** 2 + ((yy - CY) / ASPECT_Y) ** 2)
    falloff = 1.0 / (1.0 + (dist / RADIUS) ** 2)

    albedo = np.clip((cv2.GaussianBlur(lum, (0, 0), 2.5) - FLOOR) / RANGE, 0, 1) ** 0.85
    contrib = cv2.GaussianBlur(falloff * albedo, (0, 0), 2.0)
    lit = np.clip(base + WARM[None, None, :] * (contrib[..., None] * STRENGTH), 0, 255)
    lit8 = lit.astype("uint8")

    Image.fromarray(lit8).save(OUT_POSE, quality=94, method=6)

    # The hand mask has to exist in both lighting states, or the hands would snap
    # back to unlit the moment the mask fades in over the lit body.
    alpha = np.asarray(Image.open(MASK_ALPHA).convert("RGBA"))[..., 3]
    Image.fromarray(np.dstack([lit8, alpha]), "RGBA").save(
        OUT_HANDS, quality=94, method=6
    )

    for path in (OUT_POSE, OUT_HANDS):
        print(f"{path}  {os.path.getsize(path) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
