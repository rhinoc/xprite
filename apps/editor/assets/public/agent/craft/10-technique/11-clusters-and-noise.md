# Clusters and noise

A sprite is read as shapes of colour, not as pixels. Speckle, orphan pixels, fat 2×2 clumps and parallel bands all add information nobody asked for, and at 1× the viewer reads them as dirt or as a ruler laid along the outline. Without this file an agent shades by "darker near the edge" and sprinkles detail dots; both are generated-art tells.

## Rules

A **cluster** is touching pixels of one colour. Orthogonal contact joins pixels; diagonal contact is weak.

1. **Design with clusters, not pixels.** Aim for few, large, clean clusters. A region held together only diagonally, or shaped like a ragged puddle, should be merged, simplified or deleted. Squint: a few big masses of light and dark must survive. Clean shapes in 5 colours beat a noisy texture in 5 colours.
2. **Orphans.** An orphan touches no same-colour pixel and is not AA or part of a curve. Ask of each: does it need to be alone? Delete it, merge it into a neighbour, or grow it into a 2–3 px shape (bar, L, 2×2).
3. **Allowed orphans:** a specular highlight, the eye of a tiny sprite, a star or spark, an AA/buffer pixel hugging a longer cluster, the last frame of a particle. Budget at 16–32 px: at most one per object. Never random speckle, never near the face.
4. **`validate` only sees the worst orphans.** `strays` flags opaque pixels with *no* opaque 4-neighbour (error above 3). A dark speck inside a fill has neighbours and passes; hunt those by eye.
5. **Noise = detail that serves nothing:** random or filter dither, leftover sketch pixels, texture with no repeat, outline inlines. Remove before adding. Fewer colours with cleaner shapes first, then re-add form.
6. **Banding** is boundaries that run the same length and end on the same row or column, so the grid shows. Types: *hugging* (outline and first shade run the same length), *fat pixels* (2×2 blobs, 2 px lines), *skip-one* (two bands with a gap still read as bands), *45° stacks* (parallel 1 px diagonals), and the **super pixel** (every stripe ends exactly where the staircase steps, so a diagonal has the resolution of one fat pixel).
7. **Cure banding in this order:** (a) stagger the breaks so ends do not line up (shift 1 px); (b) compress the bands so the step is crossed in 1–2 px at a place the eye expects a terminator; (c) dither or texture the join (`13-dithering-and-texture`); (d) split a long gradient into small clumps per detail. `validate` `banding` reports a straight same-pair boundary of at least max(8, width/3) px, as a note only.
8. **Pillow shading** (rings of shade that follow the outline inward) ignores the light. Pick a light direction (`02-shading-and-light`), model the form, and END the shade abruptly at a terminator instead of blending back. Frontal light is allowed but still has to describe volume.
9. **Plane grouping.** One value cluster per plane-facing direction; straight-edged clusters for flat planes, curved-edged clusters for round forms. Do not cut a sphere with a straight terminator or a box with a curved one.
10. **Big shapes first.** Define the large light and shadow planes, only then the second-largest shadow shapes. Spotty isolated patches inside a lit plane are the beginner error.
11. **Unintentional squares.** Where two regions of one colour touch, pixels clump into 2×2 blocks. Stagger colour changes brick-like; look for "imaginary squares" on every pass.
12. **Scatter** (grass, pebbles, stars): quasi-random at uniform density, no two accents in one row or column, none touching, none clustered in one corner. Tile it 3×3 and look again for lattices.
13. **Texture = repeat + rest.** Simplify to a few glyphs, re-stamp them, balance dense against empty (empty reads as implied texture), keep cluster size consistent within one object.
14. **Animation.** Keep the cluster structure stable from frame to frame; a cape or hair that re-forms its clusters every frame flickers. Do not add orphans that exist on one frame only (see `05-animation`).

## By size

| Size | Cluster budget |
|------|----------------|
| 8 | Every pixel is a cluster. 2–3 colours. No shade clusters: one value step plus an accent pixel. |
| 16 | 3 tones per material; every cluster ≥ 2 px except one highlight or eye. ≤ 1 orphan per object. |
| 32 | 3 tones + outline + a highlight; 2–3 shade clusters per major part. Texture only as a repeated 2–3 px stamp. |
| 64 | Large clusters stay large; add texture as repeats on top of clean planes. Distant parts drop to 1–2 px clusters. |

## Templates

**`clusters-orphans-bad` → `clusters-orphans-fixed`** — 1 px chips and glints scattered over a fill, versus the same chips merged into 2–3 px blobs and one highlight cluster. The bad one passes `validate strays`.
```grid clusters-orphans-bad
O = outline    #2b1d2e
F = fill-mid   #d98d5f
L = fill-light #f2c28b
D = fill-shadow #a65a4e
---
...OOOOOOOO...
..OFFFFFFFFO..
.OFLFFFFFDFFO.
OFFFDFFFFFFFFO
OFFFFFFFLFFFFO
OFFFFFFDFFFLFO
OFFDFLFFFFFFFO
.OFFFFFFFFDFO.
..OFFFDFFFFO..
...OOOOOOOO...
```
```grid clusters-orphans-fixed
O = outline    #2b1d2e
F = fill-mid   #d98d5f
L = fill-light #f2c28b
D = fill-shadow #a65a4e
---
...OOOOOOOO...
..OFFFFFFFFO..
.OFLLFFFFDDFO.
OFLLDDFFFFDFFO
OFFFDFFFFFFFFO
OFFFFFFFFFFFFO
OFFFFFFDDFFFFO
.OFFFFFFDFFFO.
..OFFFFFFFFO..
...OOOOOOOO...
```
**`clusters-bands-aligned` → `clusters-bands-staggered`** — three tones under a steep 1:2 edge. Aligned: the light/mid and mid/shadow breaks step on the same rows as the outline, so all three boundaries stack into one ruled staircase (super pixel). Staggered: the light/mid break steps one row later than the outline, so the light band alternates 2 px / 1 px and the grid stops showing.
```grid clusters-bands-aligned
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.............OLLFFFF
.............OLLFFFF
............OLLFFFFD
............OLLFFFFD
...........OLLFFFFDD
...........OLLFFFFDD
..........OLLFFFFDDD
..........OLLFFFFDDD
.........OLLFFFFDDDD
.........OLLFFFFDDDD
........OLLFFFFDDDDD
........OLLFFFFDDDDD
```
```grid clusters-bands-staggered
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.............OLLFFFF
.............OLFFFFF
............OLLFFFFD
............OLFFFFFD
...........OLLFFFFDD
...........OLFFFFFDD
..........OLLFFFFDDD
..........OLFFFFFDDD
.........OLLFFFFDDDD
.........OLFFFFFDDDD
........OLLFFFFDDDDD
........OLFFFFFDDDDD
```
**`clusters-sphere-pillow` → `clusters-sphere-lit`** — concentric rings versus one light from the upper left: a highlight cluster, a mid, and a shadow that ends abruptly. Both use 3 tones and an outline.
```grid clusters-sphere-pillow
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.....OOOO.....
...OODDDDOO...
..ODDDFFDDDO..
.ODDFFFFFFDDO.
.ODFFFLLFFFDO.
ODDFFLLLLFFDDO
ODFFLLLLLLFFDO
ODFFLLLLLLFFDO
ODDFFLLLLFFDDO
.ODFFFLLFFFDO.
.ODDFFFFFFDDO.
..ODDDFFDDDO..
...OODDDDOO...
.....OOOO.....
```
```grid clusters-sphere-lit
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.....OOOO.....
...OOLLFFOO...
..OLLLLFFFFO..
.OLLLLFFFFFFO.
.OLLLFFFFFFFO.
OLLLFFFFFFFFDO
OLLFFFFFFFFFDO
OFFFFFFFFFFFDO
OFFFFFFFFFFDDO
.OFFFFFFFFDDO.
.OFFFFFFFDDDO.
..OFFFDDDDDO..
...OODDDDOO...
.....OOOO.....
```
**`clusters-scatter-aligned` → `clusters-scatter-staggered`** — 2 px accents on a 12×12 tile. Aligned accents form a lattice; staggered ones share no row, column or edge. Check any scatter tile tiled 3×3.
```grid clusters-scatter-aligned
G = grass-mid  #4f9a4c
T = grass-dark #2e6a45
---
GGGGGGGGGGGG
GGGGGGGGGGGG
TTGGTTGGTTGG
GGGGGGGGGGGG
GGGGGGGGGGGG
GGGGGGGGGGGG
GGGGGGGGGGGG
GGGGGGGGGGGG
TTGGTTGGTTGG
GGGGGGGGGGGG
GGGGGGGGGGGG
GGGGGGGGGGGG
```
```grid clusters-scatter-staggered
G = grass-mid  #4f9a4c
T = grass-dark #2e6a45
---
GGGGGGGGTTGG
GGGGGGGGGGGG
GGTTGGGGGGGG
GGGGGGGGGGGG
GGGGGGGGGGGG
GGGGGGTTGGGG
GGGGGGGGGGGG
TTGGGGGGGGGG
GGGGGGGGGGGG
GGGGGGGGGGTT
GGGGTTGGGGGG
GGGGGGGGGGGG
```
**`clusters-rock-noisy` → `clusters-rock-clean`** — the same 4 tones in the same proportions: shuffled (noise) and arranged as planes (a lit cluster upper left, a shadow cluster lower right).
```grid clusters-rock-noisy
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.....OOOOOOOO.....
....OFFFDFFFFO....
..OOFFFFLLFLFDOO..
.OLFFFFFDLFLLDLDO.
ODDLLFFLLFLLDDLFLO
OFFFDFFFFFFFLFLDDO
OFFFFDDFLFFFLFFFLO
OFLFFFFDFDFFDLFFFO
ODFDFLFDFDFDFFFFLO
.ODDFFFLFFFLFDFDO.
..OFLLLLDFFFFFFO..
...OOFLFFFFFFOO...
.....OOOOOOOO.....
```
```grid clusters-rock-clean
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.....OOOOOOOO.....
....OLLLLFFFFO....
..OOLLLLLLFFFFOO..
.OLLLLLLLFFFFFFFO.
OLLLLLLLFFFFFFFFFO
OFLLLLLFFFFFFFFFFO
OFFLLLFFFFFFFFFFFO
OFFFFFFFFFFFFFDDDO
OFFFFFFFFFFFDDDDDO
.OFFFFFFFFFDDDDDO.
..OFFFFFFDDDDDDO..
...OODDDDDDDDOO...
.....OOOOOOOO.....
```

## Procedure

1. Flat-fill each material with its base colour; judge the silhouette first (`03-silhouette-and-form`).
2. Add the shadow as **one** cluster on the side away from the light, then the light as one cluster. Stop and `render`.
3. `readPixels` `format:"grid"` over the shaded area: count the clusters of each tone. More than ~3 per tone per part at 32 px means noise; merge.
4. Hunt orphans: any glyph with no same-glyph orthogonal neighbour. Keep only the allowed kinds (rule 3).
5. Hunt bands: scan for two edges that share a start and end column or row; shift one by 1 px (`applyBatch` ops `pixels` + `clear` on a 1×1 `rect`).
6. `render` the sprite; squint. Run `validate` (`strays`, `banding`).
7. For animation, `render` `filmstrip`: cluster layout of cloth and hair must not re-form between frames.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sprite looks gritty | Many 1 px accents, random dither | Merge into 2–3 px shapes; delete the rest |
| Shape looks like an onion | Shade rings follow the outline (pillow) | One light direction; terminator, not rings |
| Diagonal looks chunky | Stripes end where the stair steps (super pixel) | Shift each band's break 1 px |
| Flat plastic ball | Gradient from even concentric rings | Lit cluster + abrupt shadow cluster |
| Texture feels like wallpaper | Lattice of accents, one density everywhere | Stagger; add empty areas; vary stamp |
| Hair or cape flickers in motion | Clusters re-form each frame | Keep the cluster layout; move it whole |
| Square blocks in a slope | Colour breaks aligned in columns | Stagger breaks like bricks |

## Review

- Each material has ≤ 3 tones and each tone forms a few connected clusters.
- No orphan except highlight, eye, spark or AA pixel; at most one per object.
- No two edges run the same length on the same row or column; no 2×2 on a 1 px line.
- Shade follows a stated light direction; no rings hugging the outline.
- Scatter has no lattice and no accent touching another.
- Same cluster layout across animation frames.

## Sources

- Saint11, "Fundamentals", glossary entries "cluster" and "orphan pixel", banding figures.
- *Pixel Logic*, Ch. 1 and Ch. 7 (shapes as mosaic tiles, noisy vs clean rock) and Ch. 2 (banding).
- Silber, *Pixel Art for Game Developers*, Ch. 10 (banding, super pixel, pillow shading, scatter tiles).
- Classic pixel tutorials: "Cure" banding types and Arne's banding cures.
- Slynyrd, Pixelblog 2 "Texture" and 5 "Back to Basics"; Solarski, *Drawing Basics and Video Game Art* (hatch direction, grouping).
