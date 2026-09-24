#!/usr/bin/env python3
"""Extract source Aseprite theme cursor sprites as crisp SVG assets.

The SVGs retain the atlas' 16x16 source pixel grid. The runtime currently
ships only the intrinsic 16px cursor; additional sizes can still be requested
explicitly for a separate high-DPI experiment.
Hotspots are copied from the theme XML and scaled in the manifest and SVG
metadata.  This script intentionally does not invent a pencil cursor: the
upstream theme has a pencil *tool* icon but no cursor_pencil part.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from PIL import Image


DEFAULT_OUTPUT = Path("packages/ui/assets/cursors/aseprite")

# All source atlas cursor roles. Directional aliases are consumed by resize,
# selection-transform and skew handles; no invented glyphs or hotspots.
REQUESTED_PARTS: tuple[tuple[str, str], ...] = tuple(
    (name, "cursor_" + name) for name in (
        "normal", "normal_add", "crosshair", "forbidden", "hand", "scroll",
        "move", "move_selection", "size_ns", "size_we", "size_n", "size_ne",
        "size_e", "size_se", "size_s", "size_sw", "size_w", "size_nw",
        "rotate_n", "rotate_ne", "rotate_e", "rotate_se", "rotate_s", "rotate_sw",
        "rotate_w", "rotate_nw", "eyedropper", "magnifier", "skew_n", "skew_s",
        "skew_sw", "skew_se", "skew_w", "skew_e", "skew_nw", "skew_ne",
    )
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_parts(path: Path) -> dict[str, dict[str, int]]:
    root = ET.parse(path).getroot()
    parts: dict[str, dict[str, int]] = {}
    for element in root.findall("./parts/part"):
        part_id = element.attrib.get("id")
        if not part_id:
            continue
        required = ("x", "y", "w", "h", "focusx", "focusy")
        if not all(key in element.attrib for key in required):
            continue
        parts[part_id] = {key: int(element.attrib[key]) for key in required}
    return parts


def assert_same_geometry(
    light: dict[str, dict[str, int]], dark: dict[str, dict[str, int]]
) -> None:
    for _, part_id in REQUESTED_PARTS:
        if part_id not in light:
            raise ValueError(f"missing {part_id} in the light theme XML")
        if part_id not in dark:
            raise ValueError(f"missing {part_id} in the dark theme XML")
        if light[part_id] != dark[part_id]:
            raise ValueError(
                f"light/dark geometry differs for {part_id}: "
                f"{light[part_id]} != {dark[part_id]}"
            )


def assert_same_cursor_pixels(
    light: Image.Image,
    dark: Image.Image,
    parts: dict[str, dict[str, int]],
) -> None:
    """Ensure the two official sheets have the same requested cursor pixels.

    The dark atlas intentionally changes other UI artwork, so comparing the
    whole PNG would reject the valid shared cursor sprites.
    """
    for _, part_id in REQUESTED_PARTS:
        geometry = parts[part_id]
        for y in range(geometry["h"]):
            for x in range(geometry["w"]):
                point = (geometry["x"] + x, geometry["y"] + y)
                light_pixel = light.getpixel(point)
                dark_pixel = dark.getpixel(point)
                # Transparent RGB channels are atlas padding and differ
                # between light/dark exports; only visible RGBA matters.
                if light_pixel[3] != dark_pixel[3] or (
                    light_pixel[3] and light_pixel[:3] != dark_pixel[:3]
                ):
                    raise ValueError(
                        f"light/dark cursor pixels differ for {part_id} at {point}"
                    )


def color(value: tuple[int, int, int, int]) -> tuple[str, str | None]:
    r, g, b, alpha = value
    fill = f"#{r:02x}{g:02x}{b:02x}"
    opacity = None if alpha == 255 else f"{alpha / 255:.12g}"
    return fill, opacity


def svg_for_part(
    *,
    label: str,
    part_id: str,
    geometry: dict[str, int],
    image: Image.Image,
    source_sha256: str,
    source_xml_sha256: str,
    size: int,
) -> str:
    x0, y0 = geometry["x"], geometry["y"]
    width, height = geometry["w"], geometry["h"]
    focus_x, focus_y = geometry["focusx"], geometry["focusy"]
    scale = size // width
    # This mirrors Aseprite cursor implementations in
    # laf/os/{win,osx,x11}: scale * focus + scale / 2.  `scale` and the
    # division are integers there, so retain that exact platform behavior.
    hotspot_x = focus_x * scale + scale // 2
    hotspot_y = focus_y * scale + scale // 2

    # One rectangle per visible source pixel is deliberately verbose.  It is
    # lossless at the source grid and keeps transparent holes and white pixels
    # distinct from black pixels.
    rects: list[str] = []
    for y in range(height):
        for x in range(width):
            rgba = image.getpixel((x0 + x, y0 + y))
            fill, opacity = color(rgba)
            if rgba[3] == 0:
                continue
            extra = f' fill-opacity="{opacity}"' if opacity else ""
            rects.append(
                f'    <rect x="{x}" y="{y}" width="1" height="1" '
                f'fill="{fill}"{extra}/>'
            )

    metadata = {
        "sourcePart": part_id,
        "sourceAtlasRect": {"x": x0, "y": y0, "width": width, "height": height},
        "sourceHotspot": {"x": focus_x, "y": focus_y},
        "cssHotspot": {"x": hotspot_x, "y": hotspot_y},
        "sourceSheetSha256": source_sha256,
        "sourceThemeXmlSha256": source_xml_sha256,
    }
    metadata_json = json.dumps(metadata, sort_keys=True, separators=(",", ":"))
    return "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            f'<!-- Aseprite source cursor: {part_id}; source sheet SHA-256: {source_sha256} -->',
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
            f'viewBox="0 0 {width} {height}" preserveAspectRatio="none" '
            f'shape-rendering="crispEdges" data-cursor="{label}" '
            f'data-source-part="{part_id}" data-source-hotspot="{focus_x},{focus_y}" '
            f'data-css-hotspot="{hotspot_x},{hotspot_y}">',
            f"  <title>Aseprite {label} cursor ({size}px)</title>",
            f"  <metadata>{metadata_json}</metadata>",
            '  <g shape-rendering="crispEdges">',
            *rects,
            "  </g>",
            "</svg>",
            "",
        ]
    )


def extract(source_root: Path, output: Path, sizes: list[int]) -> None:
    theme_root = source_root / "data/extensions/aseprite-theme"
    light_xml = theme_root / "theme.xml"
    dark_xml = theme_root / "dark/theme.xml"
    light_sheet = theme_root / "sheet.png"
    dark_sheet = theme_root / "dark/sheet.png"
    for path in (light_xml, dark_xml, light_sheet, dark_sheet):
        if not path.is_file():
            raise FileNotFoundError(path)

    light_parts = parse_parts(light_xml)
    dark_parts = parse_parts(dark_xml)
    assert_same_geometry(light_parts, dark_parts)
    source_sheet_sha = sha256(light_sheet)
    dark_sheet_sha = sha256(dark_sheet)
    image = Image.open(light_sheet).convert("RGBA")
    dark_image = Image.open(dark_sheet).convert("RGBA")
    if image.size != dark_image.size or image.width < 304 or image.height < 304:
        raise ValueError(f"unexpected source atlas size: {image.size}")
    assert_same_cursor_pixels(image, dark_image, light_parts)

    output.mkdir(parents=True, exist_ok=True)
    records: dict[str, Any] = {}
    for label, part_id in REQUESTED_PARTS:
        geometry = light_parts[part_id]
        files: dict[str, dict[str, int | str]] = {}
        for size in sizes:
            if size <= 0 or size % geometry["w"]:
                raise ValueError(
                    f"size {size} must be a positive multiple of source width "
                    f"{geometry['w']} for {part_id}"
                )
            filename = f"{label}.svg" if size == geometry["w"] else f"{label}-{size}.svg"
            (output / filename).write_text(
                svg_for_part(
                    label=label,
                    part_id=part_id,
                    geometry=geometry,
                    image=image,
                    source_sha256=source_sheet_sha,
                    source_xml_sha256=sha256(light_xml),
                    size=size,
                ),
                encoding="utf-8",
            )
            files[str(size)] = {
                "file": filename,
                "hotspotX": geometry["focusx"] * (size // geometry["w"])
                + (size // geometry["w"]) // 2,
                "hotspotY": geometry["focusy"] * (size // geometry["h"])
                + (size // geometry["h"]) // 2,
            }
        records[label] = {"sizes": files}

    # Runtime data only. Attribution stays in LICENSES/aseprite-theme.txt and
    # per-asset notes, not in a machine-specific build-source manifest.
    manifest = {"cursors": records}
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--sizes",
        type=int,
        nargs="+",
        default=[16],
        help="intrinsic SVG sizes; each must be a multiple of the source 16px grid",
    )
    args = parser.parse_args()
    try:
        extract(args.source_root, args.output, args.sizes)
    except (ET.ParseError, OSError, ValueError) as error:
        print(f"extract-cursors.py: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
