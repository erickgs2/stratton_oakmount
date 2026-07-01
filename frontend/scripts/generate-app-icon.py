#!/usr/bin/env python3
"""Generate the iOS AppIcon PNG from the source brand mark.

Usage: python3 generate-app-icon.py

Crops the source image tightly around its non-white content, pads it to a
square with a small white margin, and scales it to the 1024x1024 size Xcode
expects for the single-entry AppIcon.appiconset used by this project.
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
CONTENT_THRESHOLD = 230  # grayscale value below which a pixel counts as "content"

def main() -> None:
    im = Image.open(SOURCE).convert('RGB')
    gray = im.convert('L')
    mask = gray.point(lambda p: 255 if p < CONTENT_THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit(f'No content found in {SOURCE}')

    content = im.crop(bbox)
    w, h = content.size
    pad = int(max(w, h) * MARGIN_FRACTION)
    side = max(w, h) + pad * 2

    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(content, ((side - w) // 2, (side - h) // 2))

    icon = canvas.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    icon.save(DEST)
    print(f'Wrote {DEST} ({ICON_SIZE}x{ICON_SIZE})')

if __name__ == '__main__':
    main()
