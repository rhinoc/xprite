# Particles and weather

Particles are tiny, so every one that is wrong is wrong in public: a row of rain drops on
a grid, snow that falls straight down at one speed, a pixel-noise "dust" cloud, leaves
that are green squares. This file gives the layer model, the loop arithmetic that makes
weather tile, and the drop/flake/leaf/dust frames. Big effects are in
`craft/80-vfx-fire-smoke-magic.md`, water in `craft/64-water.md`, wind-moved foliage in
`craft/63-trees-and-foliage.md` and `craft/45-secondary-motion.md`.

## Rules

1. **Animate one particle at a time**, then the next. Each keeps its shape until it
   dies; lone pixels are allowed only on a particle's last frame — except 1 px rain and
   snow, which *are* the unit.
2. **Motion law:** start fast, slow down, shrink, darken or fade. Gravity acts before the
   fade. Add hue variation between particles of one burst (`craft/20-color-for-pixel-art.md`).
3. **Depth by three layers: far, mid, near.** Size ×2, speed ×2, value contrast +2 steps from
   far to near (derived). Far leaves are the near frame sampled at every other row and column
   (nearest neighbour); far snow moves at half the near amplitude and twice its period.
4. **Loops are arithmetic.** On a tile `H` px tall with `F` frames, a layer shifts
   `k·H/F` px per frame, `k` an integer, with wrap. Then every layer returns to its start
   on frame `F`. Pick `F` that divides `H`. Rain: `H`=16, `F`=4 → far 4 px, near 8 px per
   frame. Snow: `H`=16, `F`=8 → far 1 px, near 2 px per frame (derived).
5. **No grids.** Two particles of one layer never share a column within 4 px, and offsets
   never repeat in a pattern. Place by hand; check with `readPixels` `format:"grid"`.
6. **Rain = a short vertical streak, head brighter than tail.** Near 3 px, far 2 px at 16 px
   canvases. Copy the streak down the lane over 4–5 frames; when it lands, play a 3–4
   frame splash at the impact point. Wind: slant by 1 px of x per 2–3 px of y and shift the
   loop along that diagonal. Pale blue-grey, not white, on light backgrounds.
7. **Snow = 1 px far, 1 px bright mid, 2×2 near,** falling on a gentle S-curve. Near
   flake x-offset per 2 px fallen: `0 +1 +1 0 −1 −1 0 +1` (16 px period). Far: `0 0 +1 +1
   0 0 −1 −1` per 4 px (derived). Let ~1 flake in 10 drift upward. Snow sits only on
   upward-facing surfaces. Breath puffs on a character are optional.
8. **Leaves tumble in 4 frames at 125 ms:** long diagonal → broad oval → edge-on → opposite
   diagonal. Fall 1 px/frame on a sine path; a 2×2 leaf flutters by dropping its top half
   every other frame. Near leaf ≈ 6×5, far ≈ 3×3. More wind = more leaves, faster travel
   and tumble; calm = none; all drift one direction per scene and flip together.
9. **Wind is invisible: draw what it moves.** Dust, leaves, cloth, hair, grass. Flag or hair
   waves: flow points 12 px apart moving 2 px/frame = a 6-frame loop. Tornado: stacked
   spinning discs, always the same rotation, 2 colours for depth, dust fading from the base.
10. **Dust is born on the ground and takes the ground's colour.** It accelerates fast, slows,
    becomes a swirl, then breaks into smaller bits. Landing dust only when fall speed is
    above ~50 % of terminal speed (Celeste).
11. **Sparks, embers, ash:** 1–3 px, three sizes, a sine drift, shrink then drop to a darker
    background tone, never pure white on dark. At most ~8 live particles per 32×32 area
    (derived) — "too many" is noise.
12. **Weather must not eat the sprites.** Overlay particles stay within 3 value steps of the
    background; keep the nearest layer lightest. If the sprites sink after assembly, drop
    the background layers by S −20, C −15, B +15 rather than brightening the rain.
13. **Twinkle, don't flash.** Stars: 1 px, plus, or 2×2 in 2–3 colours; a few change at a
    time, out of sync; a few bright points add rhythm. Pickup sparkle: 3–4 frames, a plus
    growing into a 4-point star and back; several variants, randomised.
14. **Palette cycling does not exist here.** The classic rain/snow-by-cycling trick needs
    engine support and a custom palette per background; draw frames instead.

## By size

| | 8 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|
| Rain streak | 1–2 px | 2–3 px | 3–4 px | 4–6 px |
| Snow flake | 1 px | 1 px, few 2×2 | 1–2 px, plus 3×3 near | 2×2 – 3×3 |
| Leaf (near) | 2×2 | 3×3 | 6×5 | 8×7 (derived) |
| Dust puff | 4×2 | 8×4 | 10×5 | 16×8 (derived) |
| Splash | 3×1 | 5×2 | 5×3 | 9×4 (derived) |
| Twinkle | 3×3 plus | 5×5 | 5×5 / 7×7 | 7×7 |

Timing: rain 50–60 ms per frame, snow 100–120 ms, leaves 125 ms, dust 60–80 ms (derived),
sparkle 60–80 ms.

## Templates

**Rain tile, frame 0 (16×16, seamless on both axes).** Five near drops (3 px) and seven far
(2 px). For `F`=4: frame n is this tile with far rows shifted `4n`, near rows `8n`, wrapped.

```grid particles-rain-tile
D = rain-near-tail  #8b9bb4
M = rain-near-mid   #a9b8d0
L = rain-near-head  #dbe4f2
d = rain-far-tail   #4f5f80
m = rain-far-head   #6f82a6
---
............d...
.D..........m...
.M..............
.L........D.....
..........M.....
........d.L....d
...d....m......m
...m............
................
d.....D.........
m.....M.........
......L.......D.
..............M.
....D...d..d..L.
....M...m..m....
....L...........
```

**Splash, 3 frames (5×3).** Put on the ground line at the end of the streak; frame 4 is empty.

```grid particles-splash-1
L = rain-light  #c0cbdc
---
.....
..L..
.LLL.
```

```grid particles-splash-2
L = rain-light  #c0cbdc
---
.L.L.
L...L
.....
```

```grid particles-splash-3
M = rain-mid  #8b9bb4
---
.....
.M.M.
.....
```

**Snow tile, frame 0 (16×16, seamless).** Three near 2×2 flakes, six mid, eight far. Apply the
S-curve offsets per layer on top of the vertical shift.

```grid particles-snow-tile
N = snow-near   #ffffff
n = snow-shade  #c0cbdc
P = snow-mid    #e4ecf7
F = snow-far    #8b9bb4
---
....F...........
..NN........F...
..Nn....P.......
..............P.
................
.....P..........
...........NN...
........F..Nn...
.P.............F
.........P......
...F............
.............P..
......NN........
......Nn........
F.........F.....
..............F.
```

**Leaf tumble, 4 frames (6×5).** Play 1 → 2 → 3 → 4 at 125 ms, drifting along the wind.
Recolour for autumn (`craft/20-color-for-pixel-art.md`): same shapes, orange/brown ramp.

```grid particles-leaf-1
L = leaf-light  #99e550
M = leaf-mid    #6abe30
D = leaf-dark   #37946e
S = leaf-stem   #8f563b
---
....LL
..LLMM
.LMMMD
SMMDD.
......
```

```grid particles-leaf-2
L = leaf-light  #99e550
M = leaf-mid    #6abe30
D = leaf-dark   #37946e
S = leaf-stem   #8f563b
---
......
.LLLL.
SMMMMM
.DDDD.
......
```

```grid particles-leaf-3
L = leaf-light  #99e550
M = leaf-mid    #6abe30
D = leaf-dark   #37946e
---
......
..LM..
...D..
......
......
```

```grid particles-leaf-4
L = leaf-light  #99e550
M = leaf-mid    #6abe30
D = leaf-dark   #37946e
S = leaf-stem   #8f563b
---
LL....
MMLL..
DMMML.
.DDMMS
......
```

**Landing dust, 3 frames (10×5).** Bottom row is the ground line. Recolour from the ground tile.

```grid particles-dust-1
L = dust-light  #d9a066
M = dust-mid    #b07a4e
---
..........
..........
...LL.LL..
.LLMMLMML.
.MMMMMMMM.
```

```grid particles-dust-2
L = dust-light  #d9a066
M = dust-mid    #b07a4e
---
..........
.LL....LL.
LMML..LMML
.MM....MM.
..........
```

```grid particles-dust-3
L = dust-light  #d9a066
M = dust-mid    #b07a4e
---
.L......L.
..........
.M..M..M..
..........
..........
```

**Twinkle (5×5).** Sequence: single centre pixel → plus → star → plus → pixel, 60–80 ms each.

```grid particles-twinkle-1
W = spark-core  #ffffff
L = spark-arm   #c0cbdc
---
.....
..L..
.LWL.
..L..
.....
```

```grid particles-twinkle-2
W = spark-core  #ffffff
L = spark-arm   #c0cbdc
---
..W..
..L..
WLWLW
..L..
..W..
```

## Procedure

1. Decide the layers (far/mid/near) and the tile `H` × `F`; write the shift per layer from
   rule 4 before drawing a single drop.
2. New sprite or layer at tile size (`createDocument`); draw frame 0 with `applyBatch`
   `grid` from a template, hand-moving offsets so no lanes align.
3. `copyFrame` to `F` frames. For each frame and layer, move the layer's pixels
   with `translate` (`dy` = shift). Pixels that leave the bottom must
   re-enter at the top: `applyBatch` `blit` the bottom strip to the top before translating.
4. Add splashes: `applyBatch` `grid` at each streak's landing point, 3 frames.
5. `render` `filmstrip`, then check the loop: frame `F` must lead into frame 1, and frame
   0 shifted by `H` must equal frame 0.
6. `setFrameDuration` `durations` (rain 50–60 ms), `addTag` the loop.
7. Composite over the background for the readability check (rule 12), then run
   `validate`; expect orphan-pixel flags on rain and snow — they are the material.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Rain looks like a grid | Lanes at regular spacing | Irregular columns; ≥ 4 px between neighbours |
| Loop pops at the seam | Shift not `k·H/F` or no wrap | Re-derive the shift; copy the bottom strip to the top |
| Snow falls like rain | Constant vertical drop | Add the S-curve offsets, slower far layer |
| Leaves look like green squares | One shape, no stem or tilt | Four tumble frames, midrib and stem |
| Weather hides the player | Bright, dense near layer | Drop value, thin the near layer, darken the background |
| Dust is grey on sand | Fixed grey puff | Take the colour from the ground tile |

## Review

- [ ] Three layers differ in size, speed and value; no two lanes align.
- [ ] Filmstrip loops with no jump at the seam.
- [ ] Rain has head brighter than tail and a splash where it lands.
- [ ] Snow and leaves follow a curved path, not a straight line.
- [ ] Particles shrink or darken before vanishing; lone pixels only on last frames.
- [ ] Overlay does not reduce the contrast of sprites against the background.

## Sources

- Saint11 tutorials: SmokeSheet, Blood, Wind, Ice, Vegetation, Stars, Fabric.
- SqdPxl "Easy Pixel Rain" and "Simple Pixel Snow"; Slynyrd Pixelblog 33 (wind effects) and 63 (readability tweak).
- Sprite Fusion "Bowch!" particle spec (leaf sizes and tumble); Celeste landing-dust threshold.
- Ferrari, palette-cycling talk (why not to cycle here).
- Gurney, *Color and Light* (snow colour); loop arithmetic and layer ratios are ours (derived).
