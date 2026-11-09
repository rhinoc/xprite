# Ground, rocks and grass

Ground is most of the screen, so it is where generated scenes fail first: grass with a blade on every pixel, "dirt" in nine near-identical browns, a lone rock that becomes a visible grid the moment the tile repeats, rocks shaded like pillows. This file builds ground that stays quiet behind the characters and still reads as grass, dirt or stone. Seams, edges and autotile sets live in `66-tiles-and-autotiling`; walls and floors made of bricks in `67-architecture-and-interiors`.

## Rules

1. **Ground is background.** Same hues as the sprites, lower contrast and lower saturation, so characters pop. Readability beats texture: if the ground wins the squint test, cut contrast before cutting detail.
2. **Three colours per natural surface, one of them dominant.** Grass = dark/mid/light, dirt = dark/mid/light (a 4th only for sand or cracked earth). Mid covers most of the tile: 75 % in `ground-grass-16`, 87 % in `ground-dirt-16` (derived). A 4th green adds noise, not richness.
3. **Texture is made of clusters, not specks.** A cluster is 2+ same-colour pixels that read as one thing: a blade pair, a dark patch, a pebble, a crack dash. No isolated single pixels. Define 3–5 key clusters per material and repeat them with small variation.
4. **Key clusters never touch.** Leave at least 1 px of base colour between two clusters. Corner-to-corner contact is allowed. Touching clusters clump into blobs that read as stains.
5. **Dark means roots, valleys and shadow; light means blade tips and lit surfaces.** Short dark vertical strokes imply blades without drawing any. Never draw every blade: grass is bunches. Light from upper-left, as everywhere (`02-shading-and-light`).
6. **Spread detail, keep negative space.** Detail in islands with calm base between them; a crowded half beside an empty half looks wrong. Never centre the detail. Clusters cross the tile edge and continue on the opposite edge.
7. **Every ground gets a busy tile and a quiet tile.** Busy ≈ 13 clusters per 16×16, quiet 4–6 (derived). Fill wide plains with quiet, mix busy in at roughly 1 : 3. A colour-swapped copy of one texture does not count as a variant: scrolling by tile shows only the colour change.
8. **Unique features never live in the repeating tile.** A lone rock, puddle or flower in a tile is stamped everywhere. Put it on an overlay layer, transparent background, placed sparsely by hand.
9. **Flowers** = 3×3 plus (4 petals, 1 centre) in one petal colour, on the quiet tile, ≤ 3 per 16×16. A second petal colour is a free variant. Add a 1 px shadow only when the flower is an overlay.
10. **Dirt**: pebble = light pair upper-left + dark pair lower-right (5 px), crack dash = 2–3 dark px, fleck = light pair. Darkest brown sits only next to other darks. Its hue must be related to nearby rock and sand hues; a grey rock on orange dirt looks pasted.
11. **Stone floor**: lay the mortar first so the tile wraps, then stones, 1 px mortar, 2 stone tones, highlight on top and left edge only. Flagstone and brick share one method: `67-architecture-and-interiors`.
12. **Sand**: long S-shaped strokes with a hard edge, hard shadow on the lee side, warm light and cool shadow. Colour is grey-green-yellow, not cartoon yellow; wet sand is darker. Too many joined wiggles read as noodles.
13. **Pick a rock family per area.** Sedimentary = layered, tan/orange, big soft highlights. Metamorphic = blue-grey, large clean planes, hard highlights. Igneous = near-black purple, rounded, pitted, soft highlights. Grey stone in a red canyon is wrong.
14. **Build a rock from three planes**: top (lit, rim highlight upper-left), front (mid), right/underside (shade, one dark edge). Plane boundaries are hard and straight, slopes from the 2:1 family. Concentric bands from a lit centre are pillow shading and are wrong here.
15. **Silhouette first, angular and asymmetric.** From 7 px up, give it one flat run of 3+ pixels and a side that is not a mirror of the other. No outline at ≤ 7 px; at ≥ 10 px add one 3–4 px diagonal crack in the darkest tone.
16. **Rocks in odd groups** (1, 3, 5) of different sizes, never evenly spaced; a rock may straddle two tiles. Size ladder at 8 px tiles: 1 px → 2×2 → 3×3 → 5×5; at 16 px see the table.
17. **Ground contact.** A rock ≥ 7 px wide gets a 1 px flat shadow row in a dark ground colour, short (never longer than a tile) and cast the same way everywhere. Keep shadows on their own layer when one rock sits on several surfaces.
18. **Side-view strip** = four bands: highlight, base, shadow, dirt, with the grass lip overhanging the dirt. The overhang is visual; collision starts below it (`66-tiles-and-autotiling`).
19. **Lead the eye.** Stones and flowers laid in a line become a path; a faint second path of the other grass tile hides a secret. Do it with overlays, not by editing the base tile.

## By size

| Tile | Colours | Clusters (busy / quiet) | Rocks that fit |
|------|---------|--------------------------|----------------|
| 8 px | 3 | 3–4 / 1–2 (derived) | 1 px, 2×2, 3×3, 5×5 as flat 2–3 tone blobs, no crack |
| 16 px | 3 (+1 sand/dirt) | 13 / 4–6 | 4×3, 7×5 (2–3 planes), 10×7 (3 planes + shadow row) |
| 32 px | 4 | ~50 / 15–20 (derived, ×4 area) or four 16 px variants in a 2×2 | 14×10 – 20×14 with crack and contact shadow |
| 64 px | 4–5 | not a tile size: build from 16/32 modules | 32+ px boulders: outline approach, facets first |

## Templates

- `ground-grass-16` — busy tile. Blade pairs light-over-dark, two dark patches, two light patches; clusters cross every edge.
- `ground-grass-flowers-16` — quiet tile plus three flowers (white petals, gold centre). Recolour petals for variants.
- `ground-dirt-16` — pebbles, crack dashes, flecks.
- `ground-stone-16` — flagstone courses, wraps on both axes.
- `ground-rock-4x3`, `ground-rock-7x5`, `ground-rock-10x7`, `ground-rock-20x14` — the size ladder; `c` is the contact shadow, drop it on a shadow layer when the ground varies.

```grid ground-grass-16
d = grass-dark   #2d6a45
m = grass-mid    #46984a
l = grass-light  #86c653
---
mmmmmmmmmmmmmmml
mmlmlmmmmdddmmml
mmlmlmmmmmdddmmd
mmdmdmmmmmmmmmmm
mmmmmmmmmmmmmmml
mmmmmllmmmmmmlml
mmmmmmllmmmmmdmd
mmlmmmmmmlmlmmmm
mmlmmmmmmlmlmmmm
mmdmmmmmmdmdmddd
dmmmmlmlmmmmmmdd
mmmmmlmlmmmmmmmm
mllmmdmdmmmmlmlm
mmllmmmmmmlmlmlm
mmmmmdddmmdmdmdm
mmmmmmdddmmmmmmm
```

```grid ground-grass-flowers-16
d = grass-dark   #2d6a45
m = grass-mid    #46984a
l = grass-light  #86c653
w = petal         #f7f3e8
y = flower-centre #f0b63c
---
mmmmmmmmmmmmmmwm
mmmmmmmmmmmmmwyw
mmmlmlmmmmmmmmwm
mmmlmlmmmmdddmmm
mmmdmdmmmmmdddmm
mwmmmmmmmmmmmmmm
wywmmmmmmmmmmmmm
mwmmmmmmmmmmmmmm
mmmmmmmmmmmmmmmm
mmmmmmllmmmmmmmm
mmmmmmmllmmmmlmm
mmmmmmmmmmmmmlmm
mmmlmmmmwmmmmdmm
mlmlmmmwywddmmmm
mdmdmmmmwmdddmmm
mmmmmmmmmmmmmmmm
```

```grid ground-dirt-16
d = dirt-dark  #5b3a31
m = dirt-mid   #8c5d3e
l = dirt-light #b98a58
---
mmmmmmmmmmmmmmmm
mmmmmmmmmdddmmmm
mmllmmmmmmmmmmmm
mmlddmmmmmmmmmmm
mmmmmmmmmmmmmdmm
mllmmmmmmmmmmmdd
mmmmmmmmmmmmmmmm
mmmmmllmmmmmmmmm
mmmmmmmmmllmmmmm
mmmmmmmmmlddmmmm
mdddmmmmmmmmmmmm
mmmmmmmmmmmmmdmm
mmmmmllmmmmmmmdd
mmmmmlddmmmmmmmm
mmmmmmmmmmllmmmm
mmmmmmmmmmmmmmmm
```

```grid ground-stone-16
m = mortar      #3c3a4a
h = stone-light #a9abb8
s = stone-mid   #858899
t = stone-alt   #7a7d92
---
mhhhhhhmhhhhhhhh
mhsssssmhttttttt
mhsssssmhttttttt
mhsssssmhttttttt
mmmmmmmmmmmmmmmm
hhhhmhhhhhmhhhhh
ttttmhssssmhtttt
ttttmhssssmhtttt
ttttmhssssmhtttt
ttttmhssssmhtttt
mmmmmmmmmmmmmmmm
hhmhhhhhmhhhmhhh
ssmhssssmhttmhss
ssmhssssmhttmhss
ssmhssssmhttmhss
mmmmmmmmmmmmmmmm
```

```grid ground-rock-4x3
h = rock-highlight #d9d7e4
l = rock-light     #aaa8be
m = rock-mid       #82809a
s = rock-shade     #5f5d78
---
.hl.
hmms
.ss.
```

```grid ground-rock-7x5
h = rock-highlight #d9d7e4
l = rock-light     #aaa8be
m = rock-mid       #82809a
s = rock-shade     #5f5d78
k = rock-dark      #3f3d56
---
..hhl..
.hlllms
hlmmmss
lmmmsss
.ssskk.
```

```grid ground-rock-10x7
h = rock-highlight #d9d7e4
l = rock-light     #aaa8be
m = rock-mid       #82809a
s = rock-shade     #5f5d78
k = rock-dark      #3f3d56
c = contact-shadow #2a3d33
---
...hhhl...
..hhllllm.
.hlllllmms
lmmkmmmsss
.mmmkmmssk
..mmkmssk.
...skkkk..
..cccccc..
```

```grid ground-rock-20x14
h = rock-highlight #d9d7e4
l = rock-light     #aaa8be
m = rock-mid       #82809a
s = rock-shade     #5f5d78
k = rock-dark      #3f3d56
c = contact-shadow #2a3d33
---
......hhhhhhlll.....
...hhhllllllllll....
..hllllllllllllll...
..hlllllllllllllll..
.hllllllllllmssssss.
mmmmmmmmmmmmmsssssk.
mmmmmmmmmmmmmmssssk.
mmmmmmmkmmmmmmssssk.
mmmmmmmmkmmmmmmsssk.
mmmmmmmmkmmmmmmsssk.
.mmmmmmmmkmmmmmsssk.
..mmmmmmmmmmmmmmssk.
...kkkkkkkkkkkkkkk..
....kkkkkkkkkkkkkk..
..cccccccccccccccc..
```

## Procedure

1. Fix tile size and palette first. `palette` op `ramp` once per material, 3 steps, small `spread`; darks lean toward blue-teal, lights toward yellow (`20-color-for-pixel-art`).
2. Layers: `ground` (base tile), `overlay` (tufts, flowers, rocks), `shadow` (contact and cast shadows).
3. Transcribe the nearest template with `applyBatch` kind `grid`, mapping each legend role to your palette. Re-place clusters by editing the rows, not by redrawing: `readPixels` `format:"grid"` with `rulers=false`, edit, resend at the same x/y.
4. Wrap check: `applyBatch` `blit` the tile into its eight neighbours on a scratch 48×48 layer (`src` on the scratch layer, `dest` offsets ±16), then `render`. Hunt for rows or columns of aligned pixels, a cluster that touches only one side, a repeated bright pixel.
5. Move the seam: blit the four quadrants swapped (`translate` does not wrap), fix what sits in the middle now, swap back. Repeat the wrap check.
6. Make the quiet tile from a copy: delete two thirds of the clusters, keep one of each kind.
7. Rocks on `overlay`: silhouette → three planes → crack → contact row on `shadow`. `render` at 1× next to a character.
8. `validate` checks `palette` and `strays`; flower centres are not strays, any other lone pixel is.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Reads as a metal plate with dots | Few 1 px specks on flat green | 2–3 px strokes, dark under light, `11-clusters-and-noise` |
| Grid visible when tiled | Detail centred, one big or high-contrast cluster | Offset the tile, spread clusters, cut contrast |
| Gaps repeat across the map | Random spray with no balance | Place by hand into islands with calm base between |
| Rock looks like a potato | Concentric shading from a lit centre | Three flat planes, hard boundaries |
| Rock floats | No contact shadow, or shadow longer than the rock | 1 px dark row, same direction everywhere |
| Rocks form a pattern | Even counts, even spacing, same size | Odd groups, three different sizes |
| Ground fights the player | As busy and contrasty as sprites | Ground ramp spans fewer steps than the character ramp |
| Dirt and rock disagree | Unrelated hues | Pull rock mid from the dirt hue, shift value and saturation |

## Review

- Squint at 1×: the character separates from the ground in value, not only in hue.
- Ground tile uses 3 colours (4 for sand); mid dominates.
- No cluster touches another; no isolated pixel except inside a flower.
- 3×3 test shows no visible grid, no line running into the seam.
- A busy and a quiet tile exist; unique features are on overlays.
- Every rock has a lit top plane, a shade side and a dark underside; none has concentric bands.
- Rock groups are odd, mixed in size, irregularly spaced, and sit on a shadow.
- Rock and dirt hues are related; light direction is the same on every object.

## Sources

- Silber, *Pixel Art for Game Developers*, ch. 9: seamless-texture pitfalls, flowers, odd-numbered groups, rock transitions.
- Slynyrd, *Pixelblog* 2 (texture), 20 (top-down tiles), 21 (top-down objects), 43 (tiles pt 2), 47 (tiny pixels) — slynyrd.com/pixelblog-catalogue.
- Saint11 tutorials *Rock*, *Sand*, *Vegetation*, *Tiles* — saint11.art/blog/pixel-tutorials.
- Tsugumo, *So You Want To Be A Pixel Artist?* ch. 1, 5 (grass, dirt and sand studies).
- Arne, *Pixel tutorial* (islands of detail, two grass tiles); FinalBossBlues grass tile article.
- Dawe, *Make Your Own Pixel Art*, pp. 110–111 (seamless pattern exercise).
