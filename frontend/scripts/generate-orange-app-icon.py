#!/usr/bin/env python3
"""Generate a transparent orange PNG from the source lion brand mark.

Usage: python3 frontend/scripts/generate-orange-app-icon.py

The source artwork has two regions that need opposite treatment despite
overlapping in radius but not in tone:

- Interior (lion silhouette, its internal mane-detail linework, the globe
  grid lines, and the disc fill in between all of it): a straight tone
  inversion — dark source pixels (disc fill, mane detail strokes) become
  transparent, light source pixels (lion body, grid lines) become solid
  orange. This preserves every bit of the original artwork's detail,
  including the lion's internal mane texture, as fine transparent negative
  space within the orange silhouette.
- Ring border (the outer double-ring band): kept as a normal orange-on-dark
  recolor, unchanged — dark stays orange, light stays transparent. This is
  a thin, clean band; inverting it like the interior would erase it.

Because the ring border and the disc fill are both dark, and the lion body
and the true outside background are both light, a plain per-pixel
brightness threshold can't tell them apart — but they occupy different
radius bands from the badge's center, which a plain tone threshold can't
see either. This script classifies each pixel by radius first (interior
vs. ring vs. outside), then applies the right tone rule for that band.
"""
import math
import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(SCRIPT_DIR, '..', 'src', 'assets', 'branding', 'lion-globe-mark.png')
DEST = os.path.join(
    SCRIPT_DIR, '..', 'ios', 'App', 'App', 'Assets.xcassets',
    'AppIcon.appiconset', 'AppIcon-512@2x.png',
)
ICON_SIZE = 1024
MARGIN_FRACTION = 0.03
CONTENT_THRESHOLD = 230
TARGET_COLOR = (245, 158, 11)  # #f59e0b
BACKGROUND_COLOR = (17, 24, 39)  # #111827
DARK_THRESHOLD = 190

# Empirically measured on the current source image (377x304): the interior
# (lion + grid + disc fill) is essentially fully accounted for by radius
# 126 from the badge center, and the double-ring band spans roughly
# radius 127-139 before falling off to true background. If the source
# artwork changes, re-measure with scripts/measure-ring-radius.py-style
# radial dark-fraction sampling rather than guessing new constants.
RING_INNER_RADIUS = 126
RING_OUTER_RADIUS = 139


def recolor(image: Image.Image) -> Image.Image:
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    width, height = rgba.size

    is_dark = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            brightness = (r * 0.299) + (g * 0.587) + (b * 0.114)
            is_dark[y][x] = brightness < DARK_THRESHOLD

    dark_xs = [x for y in range(height) for x in range(width) if is_dark[y][x]]
    dark_ys = [y for y in range(height) for x in range(width) if is_dark[y][x]]
    center_x = (min(dark_xs) + max(dark_xs)) / 2
    center_y = (min(dark_ys) + max(dark_ys)) / 2

    for y in range(height):
        for x in range(width):
            radius = math.hypot(x - center_x, y - center_y)
            dark = is_dark[y][x]

            if RING_INNER_RADIUS < radius <= RING_OUTER_RADIUS:
                # Ring band: unchanged recolor (dark -> orange).
                pixels[x, y] = (*TARGET_COLOR, 255) if dark else (0, 0, 0, 0)
            elif radius <= RING_INNER_RADIUS:
                # Interior: inverted recolor (light -> orange), preserving
                # every dark internal line (mane detail, disc fill) as
                # transparent negative space.
                pixels[x, y] = (0, 0, 0, 0) if dark else (*TARGET_COLOR, 255)
            else:
                # Outside the ring entirely: always transparent.
                pixels[x, y] = (0, 0, 0, 0)

    return rgba


def main() -> None:
    source_image = Image.open(SOURCE)
    recolored = recolor(source_image)
    gray = recolored.convert('L')
    mask = gray.point(lambda p: 255 if p < CONTENT_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit(f'No content found in {SOURCE}')

    content = recolored.crop(bbox)
    w, h = content.size
    pad = int(max(w, h) * MARGIN_FRACTION)
    side = max(w, h) + pad * 2

    canvas = Image.new('RGBA', (side, side), (*BACKGROUND_COLOR, 255))
    canvas.paste(content, ((side - w) // 2, (side - h) // 2), content)

    icon = canvas.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    icon.save(DEST)
    print(f'Wrote {DEST} ({ICON_SIZE}x{ICON_SIZE})')


if __name__ == '__main__':
    main()
