#!/usr/bin/env python3
"""Generate an orange AppIcon PNG from the source lion brand mark.

Usage: python3 generate-orange-app-icon.py

Recolors the dark parts of the source image to #f59e0b, crops tightly around
its non-white content, pads it to a square, and scales it to the 1024x1024
size Xcode expects for the single-entry AppIcon.appiconset used by this project.
"""
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
DARK_THRESHOLD = 190


def recolor_dark_pixels(image: Image.Image) -> Image.Image:
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    width, height = rgba.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            brightness = (r * 0.299) + (g * 0.587) + (b * 0.114)
            if brightness < DARK_THRESHOLD:
                pixels[x, y] = (*TARGET_COLOR, a)

    return rgba


def main() -> None:
    source_image = Image.open(SOURCE)
    recolored = recolor_dark_pixels(source_image)
    gray = recolored.convert('L')
    mask = gray.point(lambda p: 255 if p < CONTENT_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit(f'No content found in {SOURCE}')

    content = recolored.crop(bbox)
    w, h = content.size
    pad = int(max(w, h) * MARGIN_FRACTION)
    side = max(w, h) + pad * 2

    canvas = Image.new('RGBA', (side, side), (255, 255, 255, 255))
    canvas.paste(content, ((side - w) // 2, (side - h) // 2), content)

    icon = canvas.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    icon.save(DEST)
    print(f'Wrote {DEST} ({ICON_SIZE}x{ICON_SIZE})')


if __name__ == '__main__':
    main()
