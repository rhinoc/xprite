"""Decode original Mac OS 8.0 icon resources; requires machfs, macresources and Pillow.

Input is the preserved Infinite Mac Mac OS 8.0 HD image. Output contains original
32x32 and 16x16 indexed pixels with the original ICN# and ics# transparency masks.
Platinum system icons come from Appearance Extension, which overrides System.
"""
from pathlib import Path
import argparse
import hashlib
import itertools
import json

import machfs
import macresources
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE_URL = "https://github.com/mihaip/infinite-mac/releases/download/mac-os-disk-images-2025-11-30/Mac.OS.8.0.HD.dsk.zip"
PALETTE_REFERENCE = "https://deb.debian.org/debian/pool/main/libi/libicns/libicns_0.8.1.orig.tar.gz"
ICON_PLANES = ((32, b"icl8", b"ICN#", ""), (16, b"ics8", b"ics#", "-small"))
COLOR_LEVELS = (255, 204, 153, 102, 51, 0)
RAMP_LEVELS = (238, 221, 187, 170, 136, 119, 85, 68, 34, 17)
SELECTIONS = (
    ("folder", "System Folder/Extensions/Appearance Extension", -3999),
    ("document", "System Folder/Extensions/Appearance Extension", -4000),
    ("application", "System Folder/Extensions/Appearance Extension", -3996),
    ("find-file", "System Folder/Apple Menu Items/Find File", 128),
    ("scrapbook", "System Folder/Apple Menu Items/Scrapbook", 128),
    ("map", "System Folder/Control Panels/Map", -4064),
    ("stickies", "System Folder/Apple Menu Items/Stickies", 128),
    ("note-pad", "System Folder/Apple Menu Items/Note Pad", 128),
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def icon_palette():
    # Standard Macintosh 8-bit icon CLUT: cube, primary ramps, gray ramp, black.
    palette = list(itertools.product(COLOR_LEVELS, repeat=3))[:-1]
    for channel in range(3):
        for value in RAMP_LEVELS:
            color = [0, 0, 0]
            color[channel] = value
            palette.append(tuple(color))
    palette.extend((v, v, v) for v in RAMP_LEVELS)
    return palette + [(0, 0, 0)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disk", type=Path, default=ROOT / ".refs/macos8-icons/Mac OS 8.0 HD.dsk")
    args = parser.parse_args()
    disk = args.disk.read_bytes()
    volume = machfs.Volume()
    volume.read(disk)
    palette = icon_palette()
    output = ROOT / "packages/ui/assets/icons/desktop/macos8"
    output.mkdir(parents=True, exist_ok=True)
    icons = []
    for name, path, resource_id in SELECTIONS:
        file = volume
        for part in path.split("/"):
            file = file[part]
        resources = {(r.type, r.id): r for r in macresources.parse_file(file.rsrc)}
        for size, color_type, mask_type, suffix in ICON_PLANES:
            color = resources[(color_type, resource_id)]
            mono = resources[(mask_type, resource_id)]
            plane_bytes = size * size // 8
            row_bytes = size // 8
            if color.attribs & 1 or mono.attribs & 1:
                raise ValueError("Expected uncompressed source icon resources")
            if len(color.data) != size * size or len(mono.data) != plane_bytes * 2:
                raise ValueError("Unexpected source icon geometry")
            rgba = bytearray()
            mask = mono.data[plane_bytes:]
            for y in range(size):
                for x in range(size):
                    alpha = 255 if mask[y * row_bytes + x // 8] & (0x80 >> (x % 8)) else 0
                    rgba.extend((*palette[color.data[y * size + x]], alpha))
            png = output / f"{name}{suffix}.png"
            image = Image.frombytes("RGBA", (size, size), bytes(rgba))
            image.save(png)
            webp = png.with_suffix(".webp")
            image.save(webp, lossless=True, exact=True, method=6)
            icons.append({"file": webp.name, "sourcePng": png.name,
                          "webpSha256": digest(webp.read_bytes()), "systemVersion": "8.0",
                          "sourceFile": path, "resourceType": color_type.decode("ascii"),
                          "resourceId": resource_id, "resourceSha256": digest(color.data),
                          "maskResourceType": mask_type.decode("ascii"),
                          "maskSha256": digest(mask), "pngSha256": digest(png.read_bytes()),
                          "width": size, "height": size, "depth": 8})
    provenance = {"copyright": "Apple Computer, Inc.", "source": SOURCE_URL,
                  "diskSha256": digest(disk), "paletteReference": PALETTE_REFERENCE,
                  "paletteSha256": digest(bytes(c for rgb in palette for c in rgb)),
                  "conversion": "Direct 32x32 icl8/ICN# and 16x16 ics8/ics# indexed pixel and mask decoding; no redrawing, recoloring or resampling.",
                  "icons": icons}
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")


if __name__ == "__main__":
    main()
