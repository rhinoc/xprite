# Animal Crossing example artwork

The default `acnh/winding-cobblestone.png` reconstructs nine pieces of the
Switch **Animal Crossing: New Horizons** Winding Cobblestone Path by
[Amy / A Forest Life](https://aforestlife.com/2021/11/11/winding-cobblestone-path-from-bywater-shire-themed-island/),
creator `MA-0515-5045-1390`. The author's credit policy and limitations are retained
in `LICENSES/aforestlife-acnh.txt`. This is not a CC-licensed asset or original
game data. `acnh/provenance.json` records the source image hash, coordinates,
layout, palette, transparent pixel count and sampled color error.

Reproduce it with `node scripts/fixtures/animal-crossing/generate-acnh-example.mjs
<source-slots.png>`, using the source URL in the provenance file. The generator
also creates the three independently drawn grass approximations; they are not
Nintendo texture rips. No 3DS grass textures are bundled in the preview.

## Retained Kenney fixture

Original tile artwork: **Kenney — Tiny Town 1.1**.
Source: https://kenney.nl/assets/tiny-town
License: **CC0 1.0 Universal**, https://creativecommons.org/publicdomain/zero/1.0/
The original downloaded license notice is retained at `LICENSES/kenney-tiny-town.txt`
in the repository root. This material keeps CC0; it is not Xprite brand artwork.

`kenney-tiny-town/tileset.png` is a byte-for-byte copy of the pack's original
`Tilemap/tilemap_packed.png`. `kenney-village.png` is a new 192 × 160 village map
assembled from those unmodified 16 × 16 tiles, including grass, stone paths,
trees, two houses, flowers and a fenced garden. No tiles are recolored or scaled.
The map becomes six columns by five rows of 32 × 32 Animal Crossing designs.

`kenney-tiny-town/map.json` records the source URL, original SHA-256, tile IDs,
layer layout, dimensions and modification description. Reproduce the map from
the repository root with `node scripts/fixtures/animal-crossing/generate-example.mjs`.
