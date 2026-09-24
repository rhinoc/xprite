# Source and asset attribution

The editor application is licensed under GPL version 2; see [LICENSE](LICENSE).
The separately packaged React primitives retain their own MIT license in
`packages/ui/LICENSE`. Bundled third-party material keeps its own
license and is not relicensed by the application's GPL notice.

## Xprite brand assets

The Xprite brand icon, logo, favicons, mascot animations and their bundled
source project and preview are copyright (c) 2026 rhinoc, with all rights
reserved except for the limited permissions in
[`LICENSES/xprite-branding.txt`](LICENSES/xprite-branding.txt). That notice lists
the covered files and also applies to copies and derived sizes or frames.
These brand assets are excluded from the application's GPL and the UI package's
MIT license and are not licensed under CC BY 4.0. Local editing of the source
project for learning and personal experimentation is permitted. Other
modification or reuse as another product's branding requires prior written
permission.
Ordinary tool and interface icons retain their applicable licenses.

## LibreSprite

Selected editor behavior and interaction rules use the GPLv2 LibreSprite source
at commit `eb34acd` as an open-source reference, including its `data/gui.xml`
menu organization and common command tree, shape controllers, palette lookup,
history transactions, cel transfer, frame reversal, wheel handling, and
selection cursor direction. Product-specific menu actions are maintained here.
The applicable [GPLv2 text](LICENSE)
is distributed with this repository. Source: [LibreSprite](https://github.com/LibreSprite/LibreSprite).

## Xprite sample artwork

The bundled `apps/editor/assets/examples/xprite/xprite.ase` project was created
by rhinoc and is the source artwork for Xprite's brand icon and favicons. It is
included without modification as an editable example.
`apps/editor/assets/examples/xprite/xprite-preview.webp` is a nearest-neighbor
preview extracted from its first frame. Both the source project and the preview
are covered by the [Xprite brand asset license](LICENSES/xprite-branding.txt),
as are their derived exports and animation frames.

## Palette presets

The 38 bundled LibreSprite palettes are copied from
[`LibreSprite/LibreSprite`'s `data/palettes`](https://github.com/LibreSprite/LibreSprite/tree/eb34acdf27805504fe6637093685944877b51fe5/data/palettes)
and redistributed under GPL-2.0-only, matching LibreSprite's published
program license. Original author and source comments are preserved. PICO-8 has
an additional CC0 grant, and Solarized retains its MIT license. AAP-RadiantXV
is an extra preset retained under the permission in its PixelJoint competition
terms. See [`LICENSES/libresprite-palettes.txt`](LICENSES/libresprite-palettes.txt)
for the current inventory. The catalog also includes five Lospec palettes
under creator permissions and nine Paleto palettes under CC0 1.0; see
[`LICENSES/lospec-palettes.txt`](LICENSES/lospec-palettes.txt) for each source
and permission record. The creator-permission palettes are not relicensed
under this project's GPL license. See
[`LICENSES/PALETTE-REVIEW.md`](LICENSES/PALETTE-REVIEW.md) for the separate
review of the original Aseprite palette copies.

## PostHog

The PostHog browser SDK is used as a third-party dependency. Its Apache-2.0
license and included third-party notices are retained in
[`LICENSES/posthog-js.txt`](LICENSES/posthog-js.txt). These notices are included
with the deployed application. The build-only PostHog CLI is MIT licensed.

## MIT libraries

Pixel rasterization, blending, palette operations, playback, viewport rendering,
UI skin geometry, and some font layout use separately MIT-licensed Aseprite document/render/UI/LAF
library files. Their original notices are retained in `LICENSES/aseprite-doc.txt`,
`LICENSES/aseprite-render.txt`, `LICENSES/aseprite-ui.txt`, and `LICENSES/laf.txt`. These libraries have
distinct licenses from Aseprite's application layer.

Six selected Pixelarticons 2.4.1 SVGs by Gerrit Halfmann are included
in `apps/editor/assets/icons/pixelarticons/`. They retain the upstream MIT license in
[`LICENSES/pixelarticons.txt`](LICENSES/pixelarticons.txt). Source:
[Pixelarticons](https://github.com/halfmage/pixelarticons).

## CC BY 4.0 art and text

The light and dark bitmap theme atlases, derived UI parts and cursor artwork
retain the [theme attribution](LICENSES/aseprite-theme.txt). The bitmap font,
WOFF2 conversion, and generated regular/mini glyph atlases retain the
[font attribution](LICENSES/aseprite-font.txt). Both are licensed CC BY 4.0;
their browser conversions, crops, and measurements are modifications.

English interface strings retained from `data/strings/en.ini` are licensed
CC BY 4.0 by Igara Studio S.A. and David Capello. The distributed string
data and changes are listed in [the string notice](LICENSES/aseprite-ui-strings.txt);
see also the upstream
[source license header](https://github.com/aseprite/aseprite/blob/main/data/strings/en.ini).
Use of these materials does not imply endorsement by Aseprite or its authors.

## Fusion Pixel Font

The Simplified Chinese pixel fallback font is Fusion Pixel Font, 10px monospaced
`zh_hans`, release 2026.09.01. The font is licensed under SIL Open Font License
1.1. The release's upstream font notices are retained in
`LICENSES/fusion-pixel-font/`. See the [upstream project](https://github.com/TakWolf/fusion-pixel-font).

## ICC regression profile

`packages/editor-core/src/color/icc/fixtures/sRGB_v4_ICC_preference.icc`
is an unmodified, test-only profile from the International Color Consortium.
Its embedded copyright notice is retained. The upstream terms permit use,
copying and distribution without fee while preserving the original file;
use of the ICC name in distribution advertising requires prior written permission.
See the [profile and terms](https://registry.color.org/rgb-registry/srgbprofiles#v4pref)
and the adjacent `provenance.json` for its source and checksum.
