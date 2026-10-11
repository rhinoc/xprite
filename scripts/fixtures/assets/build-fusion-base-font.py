#!/usr/bin/env python3
"""Split the non-Han part of Fusion Pixel 12px into a small face for UI text.

Requires fonttools and brotli.

`MacintoshCjkPixel` is the CJK fallback after ChiKareGo2. English pages still
reach it for punctuation and Latin glyphs ChiKareGo2 lacks, and for the
"简体中文" language switch, which made every page download the 651 KB font.

The base face keeps every glyph outside the CJK blocks plus the four Han
characters of the language switch, with the font's metrics, kerning and
contextual alternates unchanged (both features only touch non-Han glyphs).
`fusion-12.woff2` stays byte-identical and the stylesheet limits it to the
complementary `unicode-range`, so the browser only fetches it for Han text.
Keep `CJK_RANGES` and `UI_HAN` in sync with
`packages/ui/assets/fonts/macintosh/fonts.css`.
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# Code points served by the full font; everything else is in the base face.
CJK_RANGES = (
    (0x2E80, 0x9FFF),
    (0xAC00, 0xD7AF),
    (0xF900, 0xFAFF),
    (0xFE30, 0xFE4F),
    (0xFF00, 0xFFEF),
    (0x20000, 0x10FFFF),
)
UI_HAN = "简体中文"

root = Path(__file__).resolve().parents[3]
fonts = root / "packages/ui/assets/fonts/fusion-pixel"
source = fonts / "fusion-12.woff2"
output = fonts / "fusion-12-base.woff2"


def is_cjk(code_point: int) -> bool:
    return any(start <= code_point <= end for start, end in CJK_RANGES)


font = TTFont(source, recalcTimestamp=False)
ui_han = {ord(character) for character in UI_HAN}
unicodes = [
    code_point
    for code_point in font.getBestCmap()
    if not is_cjk(code_point) or code_point in ui_han
]
options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = ["*"]
options.name_languages = ["*"]
options.name_legacy = True
options.notdef_outline = True
options.glyph_names = True
options.legacy_kern = True
options.symbol_cmap = True
options.prune_unicode_ranges = False
options.recalc_timestamp = False
options.flavor = "woff2"
subsetter = subset.Subsetter(options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
subset.save_font(font, str(output), options)

print(f"{output.relative_to(root)}: {output.stat().st_size} bytes, {len(unicodes)} code points")

# The two faces' unicode-range descriptors, for fonts.css.
base, full, cursor = [], [], 0
for start, end in CJK_RANGES:
    if cursor < start:
        base.append((cursor, start - 1))
    cursor = start
    for code_point in sorted(point for point in ui_han if start <= point <= end):
        if cursor < code_point:
            full.append((cursor, code_point - 1))
        base.append((code_point, code_point))
        cursor = code_point + 1
    if cursor <= end:
        full.append((cursor, end))
    cursor = end + 1
if cursor <= 0x10FFFF:
    base.append((cursor, 0x10FFFF))


def css(ranges: list[tuple[int, int]]) -> str:
    return ", ".join(
        f"U+{start:X}" if start == end else f"U+{start:X}-{end:X}" for start, end in sorted(ranges)
    )


print(f"base unicode-range: {css(base)};")
print(f"full unicode-range: {css(full)};")
