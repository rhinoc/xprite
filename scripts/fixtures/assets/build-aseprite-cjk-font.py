#!/usr/bin/env python3
"""Derive the Fusion Pixel 10px face that sits on the Aseprite UI font's baseline.

Requires fonttools and brotli.

Aseprite's WOFF2 has a 10/14 em ascent; at the 14px UI size its capitals ink
rows -10..+1 around the baseline. Fusion Pixel 10px (1000 upm, 1100/300
metrics) inks Han glyphs about 1px higher at 14px, which makes mixed lines
taller with `line-height: normal` and pushes Han into the row above with a fixed
14px line.

The derived face moves every outline down 71 units (1px at 14px) and matches
Aseprite's line box (714/285, just under Aseprite's 320/448 and 128/448 em
ratios so neither rounding nor FreeType's hinted ceil/floor of the scaled
metrics can make the box taller than Aseprite's). Only the primary 14px
Aseprite role uses it; compact text and the text tool keep the official
10px-grid face, because 71 units is 0.71px at 10px.
"""

from pathlib import Path

from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

SHIFT = 71
ASCENT = 714
DESCENT = 285
FAMILY = "Fusion Pixel 10px Prop zh-Hans Xprite Aseprite"
POSTSCRIPT = "FusionPixel10pxPropzh-HansXpriteAseprite-Regular"

root = Path(__file__).resolve().parents[3]
fonts = root / "packages/ui/assets/fonts/fusion-pixel"
source = fonts / "fusion-10.woff2"
output = fonts / "fusion-10-aseprite.woff2"

font = TTFont(source, recalcTimestamp=False)
charstrings = font["CFF "].cff.topDictIndex[0].CharStrings
glyph_set = font.getGlyphSet()
hmtx = font["hmtx"]
shifted = {}
for name in font.getGlyphOrder():
    pen = T2CharStringPen(hmtx[name][0], glyph_set)
    glyph_set[name].draw(TransformPen(pen, (1, 0, 0, 1, 0, -SHIFT)))
    original = charstrings[name]
    shifted[name] = pen.getCharString(
        private=original.private, globalSubrs=original.globalSubrs
    )
for name, charstring in shifted.items():
    charstrings[name] = charstring
top_dict = font["CFF "].cff.topDictIndex[0]
top_dict.recalcFontBBox()
head = font["head"]
head.xMin, head.yMin, head.xMax, head.yMax = (round(value) for value in top_dict.FontBBox)

# Keep the vertical-layout origin (top side bearing + yMax) unchanged.
if "vmtx" in font:
    vmtx = font["vmtx"]
    for name, (advance, top) in list(vmtx.metrics.items()):
        vmtx.metrics[name] = (advance, top + SHIFT)

hhea = font["hhea"]
hhea.ascent, hhea.descent, hhea.lineGap = ASCENT, -DESCENT, 0
os2 = font["OS/2"]
os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = ASCENT, -DESCENT, 0
os2.usWinAscent, os2.usWinDescent = ASCENT, DESCENT
if os2.version >= 2:
    os2.sxHeight -= SHIFT
    os2.sCapHeight -= SHIFT

# OFL 1.1: name the modified version distinctly (upstream reserves no names).
names = font["name"]
for record in list(names.names):
    if record.nameID in (1, 4, 16):
        names.setName(
            FAMILY if record.nameID != 4 else f"{FAMILY} Regular",
            record.nameID,
            record.platformID,
            record.platEncID,
            record.langID,
        )
    elif record.nameID == 3:
        names.setName(
            f"{POSTSCRIPT};{record.toUnicode().split(';')[-1]}",
            3,
            record.platformID,
            record.platEncID,
            record.langID,
        )
    elif record.nameID == 6:
        names.setName(POSTSCRIPT, 6, record.platformID, record.platEncID, record.langID)
font["CFF "].cff.fontNames = [POSTSCRIPT]
top_dict.FullName = f"{FAMILY} Regular"
top_dict.FamilyName = FAMILY

font.flavor = "woff2"
font.save(output)
print(f"{output.relative_to(root)}: {output.stat().st_size} bytes")
