# Showcase assets

These assets are maintained in `apps/growth/public/showcase/` and served by the growth application.

## Hello sprite projects

The lettering in `hello/` is original repository artwork generated from `scripts/showcase/ipad/hello-path.json`. Native Aseprite writes each integer pixel into the layered `.aseprite` documents and exports the PNG sheets and GIF. These artwork files use the repository's GPL-2.0-only license; no Apple lettering artwork or Aseprite implementation code is included. `hello/frames.json` records the actual frame durations, color counts, recorded brush positions and source SHA-256 hashes.

## Editor captures

The computer editor surfaces in `../devices/computer/` are unmodified native Chromium captures of Xprite at 1440 × 840 CSS pixels, in English and Simplified Chinese. Their capture receipts, original PNG profiles, and measured control/artwork coordinates are preserved beside the images. The landing screenshots in `../landing/` are native captures of Xprite in the Moss theme; `capture.json` records their source and hashes. The editor captures retain the original Aseprite font, credited in `ATTRIBUTION.md` and `LICENSES/aseprite-font.txt`.
