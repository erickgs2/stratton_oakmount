#!/usr/bin/env python3
"""Generate a transparent orange PNG from the source lion brand mark.

Usage: python3 frontend/scripts/generate-orange-app-icon.py

The source artwork has four visually distinct regions that each need
different treatment, even though some share the same source tone:

- Lion silhouette (light in the source)      -> solid orange
- Globe grid lines (light in the source)     -> solid orange
- Globe disc fill (dark in the source)       -> transparent
- Outer ring border (dark in the source)     -> solid orange (unchanged)
- Everything outside the badge (light)       -> transparent (unchanged)

Because "lion + grid lines" and "true outside" are both light in the
source, and "disc fill" and "ring border" are both dark, a plain
brightness threshold can't tell them apart on its own. This script uses
flood fill to find the *connected* outside-background region and the
*connected* disc-fill region specifically, and treats everything else of
the same tone according to its actual role in the artwork.
"""
import os
from collections import deque
from PIL import Image, ImageFilter

# Grid lines occasionally cross the lion at a shallow enough angle that a
# thin (1-2px) dark bridge connects the lion's internal mane detail strokes
# to the main disc-fill background through the crossing. A plain flood fill
# would follow that bridge and misclassify isolated mane strokes as part of
# the disc fill. Eroding by this many pixels before flood-filling breaks
# bridges thinner than it, without visibly shrinking the actual disc-fill
# blob once dilated back by the same amount afterward.
BRIDGE_BREAK_RADIUS = 2

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
BACKGROUND_COLOR = (15, 23, 42)  # #0f172a
DARK_THRESHOLD = 190


def flood_fill_component(is_dark, start, visited):
    """BFS over 4-connected pixels matching is_dark[start], starting from start."""
    height = len(is_dark)
    width = len(is_dark[0])
    start_x, start_y = start
    if visited[start_y][start_x]:
        return set()

    target = is_dark[start_y][start_x]
    component = set()
    queue = deque([start])
    visited[start_y][start_x] = True

    while queue:
        x, y = queue.popleft()
        component.add((x, y))
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and not visited[ny][nx] and is_dark[ny][nx] == target:
                visited[ny][nx] = True
                queue.append((nx, ny))

    return component


def recolor(image: Image.Image) -> Image.Image:
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    width, height = rgba.size

    is_dark = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                is_dark[y][x] = False  # fully transparent source pixels count as "light"/outside
                continue
            brightness = (r * 0.299) + (g * 0.587) + (b * 0.114)
            is_dark[y][x] = brightness < DARK_THRESHOLD

    visited = [[False] * width for _ in range(height)]

    # The four image corners are guaranteed to be outside the badge, and
    # the outside background is light, so this flood fill finds exactly
    # the connected "true outside" region (stops at the dark ring border).
    true_outside = set()
    for corner in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        true_outside |= flood_fill_component(is_dark, corner, visited)

    # Erosion (a "morphological opening") is enough on its own to separate
    # the disc fill from thin features: the disc-fill lattice cells are
    # thick enough to survive erosion in their interior, while the thin
    # ring border and the lion's thin internal mane strokes are fully
    # eroded away (confirmed empirically — the ring measures thinner than
    # BRIDGE_BREAK_RADIUS). No connected-component/"largest piece" logic
    # is needed here: eroding then dilating back the *entire* mask already
    # keeps exactly the disc-fill cells and drops the thin features, even
    # though the disc-fill lattice cells turn out to not be connected to
    # each other at this thinness (confirmed via inspection: erosion split
    # the disc into ~100 separate small cells, so picking only the
    # largest one — an earlier version of this script — left most of the
    # disc undetected).
    kernel = BRIDGE_BREAK_RADIUS * 2 + 1
    dark_mask_img = Image.new('L', (width, height), 0)
    dark_mask_img.putdata([255 if is_dark[y][x] else 0 for y in range(height) for x in range(width)])
    opened_img = dark_mask_img.filter(ImageFilter.MinFilter(kernel)).filter(ImageFilter.MaxFilter(kernel))
    opened_data = list(opened_img.getdata())
    disc_fill = {
        (x, y)
        for y in range(height) for x in range(width)
        if opened_data[y * width + x] > 127 and is_dark[y][x]
    }

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if (x, y) in true_outside:
                pixels[x, y] = (0, 0, 0, 0)
            elif (x, y) in disc_fill:
                pixels[x, y] = (0, 0, 0, 0)
            elif is_dark[y][x]:
                # dark, not disc fill -> ring border, keep orange
                pixels[x, y] = (*TARGET_COLOR, 255)
            else:
                # light, not true outside -> lion or grid lines
                pixels[x, y] = (*TARGET_COLOR, 255)

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

    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(content, ((side - w) // 2, (side - h) // 2), content)

    icon = canvas.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    icon.save(DEST)
    print(f'Wrote {DEST} ({ICON_SIZE}x{ICON_SIZE})')


if __name__ == '__main__':
    main()
