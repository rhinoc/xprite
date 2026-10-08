# Source and asset attribution

The editor application is licensed under GPL version 2; see [LICENSE](LICENSE).
The separately packaged React primitives retain their own MIT license in
`packages/ui/LICENSE`. Bundled third-party material keeps its own
license and is not relicensed by the application's GPL notice.

## Macintosh typography

Marketing pages and independent tools use **ChiKareGo2** and **FindersKeepers**
by Giles Booth, the fonts named by the Classic Macintosh UI Kit. Their original
author pages identify a Creative Commons Attribution license without a version:
[ChiKareGo2](https://www.pentacom.jp/pentacom/bitfontmaker2/gallery/?id=3780) and
[FindersKeepers](https://www.pentacom.jp/pentacom/bitfontmaker2/gallery/?id=3809).
Original sources and browser-metric adjustments are recorded in
[the shared font provenance](packages/ui/assets/fonts/macintosh/README.md).
Fusion Pixel remains the CJK fallback under its existing SIL Open Font License.

The Macintosh menu's Command symbol and ellipsis artwork match the menu export
from Brian Levy's [Classic Macintosh UI Kit](https://www.figma.com/design/vtQqsdZXxS62lGC06GeFll/Classic-Macintosh-UI-Kit--Community-).
Their theme descriptions are in
`packages/ui/src/base/theme/themes/macintosh/shortcut-artwork.ts`.

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

The editor and viewer import the bundled editable example from the asset-only
`@xprite/site-assets` workspace at
`apps/growth/public/showcase/ipad/hello/hello.aseprite`. The Hello lettering is
original artwork generated from `scripts/showcase/ipad/hello-path.json` using
native Aseprite. The editor preview imports the unchanged native first-frame
export, `hello-frame-01.png`, from the same workspace. See the
[artwork source notes](scripts/showcase/ipad/hello-assets.md) for provenance.

The retained `apps/editor/assets/examples/xprite/xprite.ase` project was created
by rhinoc and is the source artwork for Xprite's brand icon and favicons. It is
included without modification as the brand artwork source.
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

The editor uses core-js 3.50.0 for structured cloning compatibility. Its upstream
MIT license is retained in [`LICENSES/core-js-MIT.txt`](LICENSES/core-js-MIT.txt)
and distributed with the application. Source: [core-js](https://github.com/zloirock/core-js).

Pixel rasterization, blending, palette operations, playback, viewport rendering,
UI skin geometry, and some font layout use separately MIT-licensed Aseprite document/render/UI/LAF
library files. Their original notices are retained in `LICENSES/aseprite-doc.txt`,
`LICENSES/aseprite-render.txt`, `LICENSES/aseprite-ui.txt`, and `LICENSES/laf.txt`. These libraries have
distinct licenses from Aseprite's application layer.

Six selected Pixelarticons 2.4.1 SVGs by Gerrit Halfmann are included
in `apps/editor/assets/icons/pixelarticons/`. They retain the upstream MIT license in
[`LICENSES/pixelarticons.txt`](LICENSES/pixelarticons.txt). Source:
[Pixelarticons](https://github.com/halfmage/pixelarticons).

The iPad showcase uses Three.js 0.186.1 by the three.js authors. Its upstream
MIT license is retained in [`LICENSES/three-MIT.txt`](LICENSES/three-MIT.txt)
and distributed with the application. Source: [Three.js](https://threejs.org/).

The showcase's compressed models use Meshoptimizer by Arseny Kapoulkine. Its
Meshopt decoder is bundled through Three.js, and gltfpack 1.3.0 prepares the runtime
assets. The upstream MIT notice is retained in
[`LICENSES/meshoptimizer-MIT.txt`](LICENSES/meshoptimizer-MIT.txt). Source:
[Meshoptimizer](https://github.com/zeux/meshoptimizer).

## GSAP

The public showcase's title and button animations use GSAP 3.15.0 by GreenSock under the
[Standard "No Charge" GSAP License](https://gsap.com/standard-license).
The upstream copyright and license link are retained in
[`LICENSES/gsap-notice.txt`](LICENSES/gsap-notice.txt). GSAP retains its own
license separately from the application code.

## CC BY 4.0 art and text

The light and dark bitmap theme atlases, derived UI parts and cursor artwork
retain the [theme attribution](LICENSES/aseprite-theme.txt). The bitmap font,
WOFF2 conversion, and generated regular/mini glyph atlases retain the
[font attribution](LICENSES/aseprite-font.txt). Both are licensed CC BY 4.0;
their browser conversions, crops, measurements, and startup font subsetting are modifications.

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

## Showcase icons

The music and language controls use the `volume-3`, `volume-x`, and `globe`
SVGs from [Pixelarticons](https://github.com/halfmage/pixelarticons), copyright
© 2019 Gerrit Halfmann, under the MIT license. The complete notice is retained in
`LICENSES/pixelarticons-MIT.txt` and alongside the public SVGs. Their pinned source
commit and SHA-256 hashes are recorded in
`apps/growth/public/showcase/icons/sources.json`.

## Showcase device models

- MacBook Pro M3 16-inch 2024 by [jackbaeten](https://sketchfab.com/jackbaeten), [source](https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4), CC BY 4.0.
- iPhone 15 Pro Max by [MajdyModels / MpPower™](https://sketchfab.com/MG990), [source](https://sketchfab.com/3d-models/iphone-15-pro-max-5b7b35513a154ac69619dc2b2fe15686), CC BY 4.0.

Changes: orientation and size normalization, display UV mapping and replacement with Xprite content, laptop viewing pitch, and GLB export. Original geometry and body materials are preserved. Download provenance, source files, license, and editable Blender files are documented in `scripts/showcase/devices/README.md`; public credits and the full CC BY 4.0 license are in `apps/growth/public/showcase/ipad/`. These model assets retain CC BY 4.0 separately from the application code. No endorsement by Apple or the model authors is implied.

## Animal Crossing design QR export

The normal ACNL pattern layout, palette codes and RGB color data reference
[Thulinma/ACNLPatternTool](https://github.com/Thulinma/ACNLPatternTool), commit
`3d5d18bbc69210d9626e8c5a9f71304479290ae6`. Only the palette data is reproduced in
`packages/editor-core/src/import-export/animal-crossing/palette.ts`; the conversion
and serialization are implemented in Xprite. The reference's WTFPL version 2
license is retained in [LICENSES/ACNLPatternTool.txt](LICENSES/ACNLPatternTool.txt).

Binary QR encoding uses [node-qrcode](https://github.com/soldair/node-qrcode)
version 1.5.4 under MIT; see [LICENSES/qrcode.txt](LICENSES/qrcode.txt).

Animal Crossing QR image decoding uses [paulmillr/qr](https://github.com/paulmillr/qr)
version 0.7.2. Xprite selects its MIT license from the offered MIT OR Apache-2.0
license; see [LICENSES/qr-decoder.txt](LICENSES/qr-decoder.txt). Raw QR BYTE segments
are captured before text decoding to preserve the original game payload.

## Zstandard sharing compression

Pure frontend project sharing uses `@bokuweb/zstd-wasm` 0.0.27 for optional
Zstandard compression. Its TypeScript glue is MIT licensed and its bundled
Zstandard implementation is BSD 3-Clause licensed. The notices are included in
[LICENSES/zstd-wasm.txt](LICENSES/zstd-wasm.txt). Source:
[zstd-wasm](https://github.com/bokuweb/zstd-wasm) and
[Zstandard](https://github.com/facebook/zstd).

## Kenney Tiny Town example artwork

The retained village fixture uses original **Tiny Town 1.1** tiles
by [Kenney](https://kenney.nl/assets/tiny-town), licensed under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The original
notice is retained in [LICENSES/kenney-tiny-town.txt](LICENSES/kenney-tiny-town.txt).
The artwork retains CC0 and is not relicensed by the application's GPL notice.

`apps/growth/public/tools/animal-crossing/kenney-tiny-town/tileset.png` is an
unchanged copy of the pack's `Tilemap/tilemap_packed.png`. The 192×160
`kenney-village.png` is a new village arrangement assembled from its original
16×16 tiles without recoloring or rescaling. The tile IDs, layers, source URL,
modification note and original SHA-256 are recorded in `kenney-tiny-town/map.json`.
Reproduce with `scripts/fixtures/animal-crossing/generate-example.mjs`.

## ACNH path example and ground preview

The Animal Crossing tool's default example reconstructs nine pieces of **Winding
Cobblestone Path**, an Animal Crossing: New Horizons design by
[Amy / A Forest Life](https://aforestlife.com/2021/11/11/winding-cobblestone-path-from-bywater-shire-themed-island/),
creator **MA-0515-5045-1390**. The author's [credit policy](https://aforestlife.com/designs/)
requires credit when reposting. This is not a Creative Commons license; the artwork
is not relicensed under GPL. The policy and reconstruction limitations are retained
in [LICENSES/aforestlife-acnh.txt](LICENSES/aforestlife-acnh.txt).

The 96×96 image samples published scaled previews to 32×32 pieces, restores pink
transparency indicators to alpha, reduces screenshot colors to a shared 15-color
RGB palette, and arranges nine pieces into a 3×3 path. It is a reconstruction, not
the original game data. Its source hash, coordinates and sampled color error are
recorded in `apps/growth/public/tools/animal-crossing/acnh/provenance.json`.
Reproduce with `scripts/fixtures/animal-crossing/generate-acnh-example.mjs` and the
source PNG identified in that file. The seasonal grass presets are independently
generated approximations, not Nintendo texture rips. Three.js powers the tools'
ground preview under its [MIT license](LICENSES/three-MIT.txt).
