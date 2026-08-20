"""
Derives the phone-tier still set from the shipped 1920x1080 originals.

A phone shows the safe box across ~390 CSS px, so a 1920 px still is decoded at
four times the resolution it can ever display — 8 MB of image memory per layer,
and six of those layers are composited on every scrolled frame. Halving the edge
quarters both.

1280 x 720, not 960 x 540: the phone film is a 960 px encode, and the freeze
cross-fades the film into this still over four frames of scroll. Matching the
film exactly would carry the film's softness through the whole finale; going
much sharper would read as a snap into focus at the cut. 1.33x is the largest
lift that stays invisible across the dissolve.

Alpha is resampled in premultiplied space — straight-alpha bilinear pulls the
transparent black outside the hand mask into its edge and leaves a dark fringe
along every finger.

Run from the project root:

    python scripts/make_mobile_assets.py
"""

import numpy as np
from PIL import Image

WIDTH, HEIGHT = 1280, 720
# 45.7 dB against the downscaled originals — comfortably transparent on a dark,
# denoised frame, and the grain overlay is re-applied in CSS afterwards anyway.
QUALITY = 90

SOURCES = [
    ("public/media/final-pose.webp", "public/media/final-pose-720.webp"),
    ("public/media/final-pose-lit.webp", "public/media/final-pose-lit-720.webp"),
    ("public/artifact/hand-foreground.webp", "public/artifact/hand-foreground-720.webp"),
    ("public/artifact/hand-foreground-lit.webp", "public/artifact/hand-foreground-lit-720.webp"),
]


def resize(image: Image.Image) -> Image.Image:
    if image.mode != "RGBA":
        return image.resize((WIDTH, HEIGHT), Image.LANCZOS)

    rgba = np.asarray(image, dtype=np.float32) / 255.0
    alpha = rgba[..., 3:4]
    premultiplied = np.concatenate([rgba[..., :3] * alpha, alpha], axis=2)

    small = np.asarray(
        Image.fromarray((premultiplied * 255.0 + 0.5).astype(np.uint8), "RGBA").resize(
            (WIDTH, HEIGHT), Image.LANCZOS
        ),
        dtype=np.float32,
    ) / 255.0

    a = np.clip(small[..., 3:4], 0.0, 1.0)
    rgb = np.divide(small[..., :3], a, out=np.zeros_like(small[..., :3]), where=a > 1e-4)
    out = np.concatenate([np.clip(rgb, 0.0, 1.0), a], axis=2)
    return Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), "RGBA")


def main() -> None:
    for src, dst in SOURCES:
        image = Image.open(src)
        resize(image).save(dst, "WEBP", quality=QUALITY, method=6)
        print(f"{dst}  {image.size[0]}x{image.size[1]} -> {WIDTH}x{HEIGHT}")


if __name__ == "__main__":
    main()
