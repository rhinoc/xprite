# Fusion Pixel

Fusion Pixel proportional Simplified Chinese, release 2026.09.25 by TakWolf.
The three sized files are the official WOFF2 artifacts. Their bytes are unchanged.

- Source: https://github.com/TakWolf/fusion-pixel-font
- Release: https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.09.25
- License: [SIL Open Font License 1.1](../../../LICENSES/fusion-pixel-font/OFL.txt)

Local names are short. Each file is the upstream `fusion-pixel-{size}px-proportional-zh_hans.otf.woff2` artifact.

| File | CSS family | Request size | SHA-256 |
| --- | --- | --- | --- |
| `fusion-12.woff2` | `FusionPixel12` | 12px | `0ebd99e6f1e9b650a793a3f759c1c3dfa99f0c5b6502e78569b48ddb43767e40` |
| `fusion-10.woff2` | `FusionPixel10` | 10px | `30cff04a27ec139dc1eb948f6f3d3b48d6c25cc59ba5ed011d229ed6ffc3c2c9` |
| `fusion-8.woff2` | `FusionPixel8` | 8px | `c68edc7ba14e595bd34d7bb9295c8364315dd275d561a61efe520c51b599da8a` |

The native grid is the size in the table. The Aseprite skin draws primary Chinese with `FusionPixel10Aseprite` at 14px and compact Chinese with `FusionPixel10` at 10px to match the mini bitmap font's 10px rendered glyph height. A different CSS size scales the pixel grid.

`fusion-10-aseprite.woff2` (`FusionPixel10Aseprite`) is derived from `fusion-10.woff2` by `pnpm assets:aseprite-cjk-font` (`scripts/fixtures/assets/build-aseprite-cjk-font.py`). It moves every outline down 71 units (1px at 14px) and sets the vertical metrics to 714/285 (lineGap 0), so at 14px Han glyphs share the Aseprite font's baseline and 14px line box. It is renamed as an OFL modified version and is only used for the 14px primary role; 10px uses keep the unshifted grid.
