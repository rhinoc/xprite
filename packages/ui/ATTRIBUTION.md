# Third-party asset attribution

The package's original React and CSS code is licensed under the MIT License in
`LICENSE`. The following bundled assets retain their own licenses and are not
relicensed under MIT.

## Aseprite Default Theme

Copyright © 2009–2017 David Capello and Ilija Melentijevic. Source: [Aseprite](https://www.aseprite.org/). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

This package includes the light and dark theme atlases, selected sprite artwork,
cursor artwork and hotspots, theme definitions, and derived CSS metrics. The
sprites are cropped or embedded for browser controls and the layout values are
expressed as CSS measurements. The theme artwork remains available under CC BY
4.0; using this package does not imply endorsement by Aseprite or its developers.

The Macintosh skin in `assets/themes/macintosh/` includes monochrome derivatives
of Aseprite icon silhouettes and retains its control metrics. Its nine-slice
frames and striped titlebar were redrawn for Xprite. The derived atlases retain
CC BY 4.0 attribution and licensing. The theme atlases themselves contain no Apple artwork; separately bundled system icons are listed below.

## Aseprite Font

Copyright © 2001–2023 David Capello. Source: [Aseprite](https://www.aseprite.org/). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

This package includes a WOFF2 conversion of the bitmap font and generated glyph
atlas/metrics for browser text rendering. The font material remains available
under CC BY 4.0.

## Fusion Pixel Font

The UI includes the 10px monospaced Simplified Chinese fallback from Fusion
Pixel Font release 2026.09.01. It is licensed under the SIL Open Font License
1.1; the upstream and bundled notices are in `LICENSES/fusion-pixel-font/`.
Source: [TakWolf/fusion-pixel-font](https://github.com/TakWolf/fusion-pixel-font).

## ChiKareGo2 and FindersKeepers

Giles Booth. Source: [ChiKareGo2](https://www.pentacom.jp/pentacom/bitfontmaker2/gallery/?id=3780)
and [FindersKeepers](https://www.pentacom.jp/pentacom/bitfontmaker2/gallery/?id=3809).
Both original author pages state Creative Commons Attribution without specifying
a version. The package includes TTF-to-WOFF2 conversions and advance
metrics. Vertical metrics were adjusted to integer browser baselines; glyph
outlines are unchanged. The Macintosh theme uses ChiKareGo2 for
controls and FindersKeepers for balloon help and compact text.

The design reference is [Classic Macintosh UI Kit by Brian Levy](https://www.figma.com/design/vtQqsdZXxS62lGC06GeFll/Classic-Macintosh-UI-Kit--Community-).
Stepped button frames, balloon frames and pointers, generic warning contours,
frame geometry and scrollbar track textures are adapted from the Kit's
geometry under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), in
accordance with [Figma's free Community file licensing](https://help.figma.com/hc/en-us/articles/360042296374-Figma-Community-copyright-and-licensing).
The original Figma file and Apple/Susan Kare icon artwork are not bundled.

## Desktop patterns

`assets/patterns/macintosh/` contains 125 curated repeating patterns decoded from
Apple System 7.0, System 7.5 and Mac OS 8.0 system resources. The former nineteen
Xprite imitation tiles have been replaced. Exact repeating pixels are deduplicated;
two-color masks also share translations and inversions. A vertical gradient with
an abrupt repeating seam and the sample full desktop pictures are excluded.

Apple Computer, Inc. retains copyright in the underlying resources. These assets
are not relicensed under the UI package's MIT License. See
`LICENSES/apple-desktop-patterns.txt`; resource identifiers, related variants,
decoded source dimensions and tile hashes are in `provenance.json`.

Fixed-color PNGs retain the source RGB16 palette values. Two-color SVGs retain
pixel geometry, with default source colors and optional user-selected foreground
and background colors. Reducing a tile to its exact repeating period does not
resample or interpolate pixels. UI software and presentation code remain
separately licensed.

## Apple Mac OS 8.0 icons

`assets/icons/desktop/macos8/` contains original 32×32 and 16×16 indexed-color Apple Mac OS 8.0
bitmap and mask resources decoded to transparent PNG and lossless WebP. Platinum folder,
document and application artwork comes from Appearance Extension, which overrides
the older icons retained in the System file. The folder, document,
generic application, Find File, Scrapbook, Map, Stickies and Note Pad icons are
not redrawn. Source: [Infinite Mac's preserved Mac OS 8.0 disk](https://github.com/mihaip/infinite-mac/releases/download/mac-os-disk-images-2025-11-30/Mac.OS.8.0.HD.dsk.zip).
Apple Computer, Inc. retains its copyright; these assets are not MIT licensed.
`LICENSES/apple-macos8-icons.txt` records this distinction. Resource IDs, source
files and pixel provenance are in the asset catalog.

The Note paper colors, hairline edges and stippled header follow Brian Levy's
Classic Macintosh UI Kit Misc / Notes components under CC BY 4.0. The original
Notes use seven paper colors and two chrome states. The component uses those
colors and its native 126×47 CSS geometry. The caption texture and corner paths
follow the original export. Framed notes provide real close, collapse and resize
controls. Fourteen complete samples (seven colors × two states) were captured at
DPR 2 and compared against the Figma export with zero color tolerance.

The shared Icon volume glyphs come from [pixelarticons](https://github.com/halfmage/pixelarticons), commit 8275e0af7c16aa40c54ea2b90b7af83b1fe4eb4c, under MIT. Their original SVG bytes and source hashes are retained in `assets/icons/system/pixelarticons-sources.json`; the notice is in `LICENSES/pixelarticons-MIT.txt`.
