#!/usr/bin/env python3
"""Extract research bitmap atlas using Aseprite sprite_sheet_typeface glyph delimiters."""
import json
import os
import sys
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[3]
output = root / 'packages/ui/assets/fonts/aseprite'
output.mkdir(parents=True, exist_ok=True)
source_root = Path(os.environ.get('ASEPRITE_SOURCE', root / '.refs/aseprite'))
source = Path(sys.argv[1]) if len(sys.argv) > 1 else source_root / 'data/fonts/aseprite_mini.png'
im = Image.open(source).convert('RGBA')
key = im.getpixel((0, 0))
x = y = 0
h = 1
glyphs = []
while y < im.height:
    while y < im.height and im.getpixel((x, y)) == key:
        x += 1
        if x >= im.width:
            x = 0
            y += h
            h = 1
    if y >= im.height:
        break
    first = im.getpixel((x, y))
    w = h = 0
    while x + w < im.width and im.getpixel((x + w, y)) != key:
        w += 1
    while y + h < im.height and im.getpixel((x, y + h)) != key:
        h += 1
    glyphs.append(None if first == (255, 0, 0, 255) else [x, y, w, h])
    x += w
    if x >= im.width:
        x = 0
        y += h
        h = 1
atlas = Image.new('RGBA', im.size)
metrics = {}
for i, bounds in enumerate(glyphs):
    if bounds is None:
        continue
    x, y, w, h = bounds
    metrics[str(i + 32)] = bounds
    for py in range(h):
        for px in range(w):
            color = im.getpixel((x + px, y + py))
            if color[3] and color[:3] == (0, 0, 0):
                atlas.putpixel((x + px, y + py), (255, 255, 255, 255))
atlas.save(output / 'aseprite-mini-glyphs.webp', lossless=True, exact=True, method=6)
(output / 'aseprite-mini-glyphs.json').write_text(json.dumps(metrics, separators=(',', ':')) + '\n')
print(f'{len(metrics)} glyphs, height {glyphs[0][3]}, mini descent 1')
