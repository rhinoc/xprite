# Generated-art tells

Machine-made pixel art is a picture *of* pixel art, not pixels on a grid. Image models work in a continuous space with no notion of a hard edge, a fixed palette or a grid, so their output has soft blocks of uneven size, hundreds of near-identical colours, speckle used as texture, shading that follows the outline, and the same density everywhere. Naive downscaling of a large drawing produces a second family: mush, lost features, extra colours. An agent that draws natively at 1× cannot make mixels, but every route by which foreign or filtered pixels enter its canvas can reintroduce a tell. This file is the catalogue, how to detect each with `render`, `validate`, `palette` and `readPixels`, and how to fix it.

## Rules

1. **Audit before "done" and before handing over anything derived from an image.** Order: `getContext` (size, mode), `validate` with `checks` naming all of `palette`, `strays`, `outline`, `banding`, `antialiasing`, `animation` (the bundled extension does not run `antialiasing` by default) and `strict: true`, `palette` op `analyze`, `render`, then the by-eye items in Review. `validate` alone is never the verdict (see "What validate cannot see").
2. **Know your own entry points.** Drawing at 1× with `applyBatch` cannot create mixels. Tells reach your canvas through: (a) imported references, (b) lossy transforms (`resizeSprite` `bilinear`, or `nearest` at a non-integer factor), (c) a widened palette (`palette` op `extract` without a cap), (d) `applyBatch` ops `gradient` with many steps or `dither` pattern `noise`, (e) hand AA that overshoots, (f) orphans from coordinate slips, (g) soft alpha from layer opacity, (h) skipped decisions on light and hierarchy. Treat each as a controlled operation.
3. **Triage an incoming image with the run test.** Read one row with `readPixels` (`rect` height 1) and list the same-colour run lengths. All runs multiples of one k>1 = a clean pre-scaled file: recoverable (rule 5). Runs spread across, say, 8–14 with no common divisor = mixels: not recoverable by snapping; redraw (rule 4).
4. **Generated or messy input is a concept, not an asset.** Import it with `importImage`, draw over it at the target size, and use `readPixels` `mode:"diff"` to name the few biggest mismatches. Upscalers, blurs, "pixelate" filters and smoothing only enlarge the problem. Resolved conflict: one source automates unscaling (find the grid, vote a colour per cell); another tested it on real generated images and found none that could be trusted, with detectors disagreeing by 2× on the same file. Decision: auto-unscale only after the run test passes; otherwise redraw.
5. **Exact recovery of a pre-scaled file.** `resizeSprite` `nearest` by W/k × H/k recovers a clean pre-scaled file in one op. If the source lives on a reference layer instead, `importImage` `pixelate` `targetWidth`/`targetHeight` onto a new document, then `applyBatch` `blit` `src` into the art. Re-quantise afterwards: averaging and resampling create colours that were never in the art.
6. **One tell proves nothing.** Beginners make mixels, strays and bloated palettes; some artists use them on purpose. Three independent tells together mean machine-made or auto-resized. Report findings neutrally ("this has 9 isolated pixels and 214 colours") and offer fixes; do not accuse, and ask for layers or a time-lapse when provenance matters.
7. **Fix in this order:** pitch and scale → palette → silhouette and light → clusters and banding → edges → details. Fixing edges before the palette repeats work.
8. **Fix at native scale.** Never smooth, blur, upscale or filter to hide a tell. `resizeSprite` `nearest` is the only legal resize. `palette` op `snap` the art and refuse `bilinear`/`rotsprite` unless the user asks.
9. **Re-run the detector after each fix** and quote before/after counts in the report.
10. **Thresholds** (sprite ≤32 px unless noted; colour caps derived from sources that expect 8–32 colours for sprites): used colours ≤16 (≤32 at 64 px); off-palette 0; near-duplicate pairs (ΔE<3) 0; semi-transparent pixels 0; isolated pixels 0, at most one justified highlight or eye per object; no banding note; outline either ≥60% one colour with every gap justified, or deliberately none.
11. **Hi-bit is no excuse.** A large canvas or unlimited palette still gets hard-edged clusters and no bilinear anything (`craft/90-style/90-platform-styles.md`).

## Catalogue

Detect = what to run. Fix = the smallest repair. Row ids are used in Review.

**Grid and geometry**

| Id | Tell | Detect | Fix |
|----|------|--------|-----|
| G1 | Mixels: blocks of unequal size, edges that drift by ±20% | `readPixels` one row, list run lengths: spread with no common divisor | Redraw at 1× over a `importImage` `pixelate` (rule 4) |
| G2 | Pre-scaled file: every run a multiple of k>1, canvas 512 / 1024 / 2048 | Same row test; `getContext` size | Unscale (rule 5), then clean by hand |
| G3 | Bilinear or fractional scaling: unequal stair runs, intermediate colours on every edge, dozens of extra colours | `palette` op `analyze` near-duplicates; `readPixels` `format:"grid"` on an edge shows 3+ steps | Return to source; integer nearest-neighbour only |
| G4 | Rotated pixels: lumps, diamonds, smears on edges that were straight | `readPixels` `format:"grid"`: irregular runs where the edge was a clean slope | Rotate only by 90° multiples (`rotate90`), else redraw per angle |
| G5 | Mixed pitch in one scene: a sprite at 2× beside background at 1× | Row test in two regions; preview shows chunky vs fine pixels | Redraw the odd element at the world pitch |
| G6 | Jaggies and wobbly lines: runs like 2,3,1,2 | `readPixels` `format:"grid"` run lengths | Uniform or monotone runs (`craft/10-technique/10-lines-and-curves.md`) |
| G7 | Boxy fake pixelation: shapes built only from rectangles, no 2:1 slopes or rounded 2 px corners; reads as a 3D render at low res | Preview: silhouette is rectangles | Redraw with diagonals and corner rounding |
| G8 | Odd canvas: not a multiple of 8, or 512 / 1024 | `getContext` | Work at 16 / 24 / 32 / 48 / 64 |

**Colour**

| Id | Tell | Detect | Fix |
|----|------|--------|-----|
| C1 | Colour bloat: hundreds to tens of thousands of colours; a "16 colour" prompt gave 528 | `palette` op `get` usage; `validate` palette (off-palette count, note above 64 entries) | `palette` op `extract` with `maxColors` 12–16 (RGB only), `palette` op `snap`, rebuild ramps |
| C2 | Near-duplicate shades (ΔE<3 = the same colour to a viewer) | `palette` op `analyze` | Merge with `replaceColor` |
| C3 | Brightness-only ramps: shadow = same hue, darker | `palette` op `analyze` ramp structure; ramp steps share one hue | `palette` op `ramp` (shadows toward blue/violet, highlights toward orange), `adjustHsl` |
| C4 | Colour noise inside flat regions (JPEG-like) | `readPixels` on a 4×4 flat patch: more than one colour | `applyBatch` `fill` with `tolerance` 20–40, contiguous, then `palette` op `snap` |
| C5 | Confetti: single pixels of unrelated hue near the subject | `validate` strays only finds specks floating in transparency; specks inside a fill need `readPixels` `format:"grid"` (a glyph with no same-glyph 4-neighbour) | Repaint with the surrounding colour (`applyBatch` `pixels`); keep one specular dot or eye |
| C6 | Conflicting light: highlights on both sides | Preview; `readPixels` `format:"grid"`: lightest glyph clusters on opposite sides | One direction (`craft/00-core/02-shading-and-light.md`), reshade |
| C7 | Pillow shading: value falls off from the centre in rings, uniform dark rim | `readPixels` `format:"grid"` of one form shows concentric rings | Offset highlight toward the light, crescent shadow on the far side (template) |
| C8 | Local colour only: every material one hue, one saturation, no accent | Preview; `effect` `hue-saturation` on a copy shows no focal value | `craft/20-color/20-color-for-pixel-art.md`: temperature and one accent |

**Clusters and texture**

| Id | Tell | Detect | Fix |
|----|------|--------|-----|
| X1 | Speckle as texture: random 1–2 px clusters | `readPixels` `format:"grid"`: many clusters under 3 px | Clusters of ≥3 px that follow the form; fewer |
| X2 | Dither as a field or noise | `applyBatch` `dither` pattern `noise` anywhere; dither over about half an object | Add a colour; `checker` / `bayer` only in a 1–3 px transition |
| X3 | Banding and hugging: parallel bands with aligned ends | `validate` banding (horizontal run ≥ max(8, width/3), reported as a note); vertical, diagonal and hugging need `readPixels` `format:"grid"` | Stagger the ends, let boundaries wander, dither one short section (template) |
| X4 | Equal detail everywhere: no resting area | The `render` fails the 1× test; `readPixels` regions show similar colour counts everywhere | Delete detail until 1× passes; quiet zones (`craft/90-style/91-composition-and-scenes.md`) |
| X5 | Smooth gradients on rock, pipe, cloth | `applyBatch` `gradient` with many `steps` | 3–5 steps; wander the edges; dither only large skies |
| X6 | Software circles: even but lumpy runs | `readPixels` `format:"grid"` run lengths | Hand-edit to monotone runs |
| X7 | Repeating tile grid | Blit the tile 3×3 with `applyBatch` `blit`, `render` | Variants; break the lattice |

**Edges, alpha and outline**

| Id | Tell | Detect | Fix |
|----|------|--------|-----|
| E1 | Semi-transparent pixels and halos | `validate` antialiasing (RGB sprites) | Repaint those pixels opaque with `applyBatch` `pixels` |
| E2 | Soft AA: opaque in-between tones, two or more steps from outline to background | `readPixels` `format:"grid"` on an edge; `palette` op `analyze` near-duplicates | Hard 1 px edge; selective AA at most half the step length (`craft/10-technique/12-anti-aliasing.md`) |
| E3 | Colour fringe from an old background | Add a temporary flat contrasting layer below, `render` | Recolour the fringe to the outline colour (`outline`, `side: "inside"`) |
| E4 | Broken or doubled outline | `validate` outline: 60–99% one colour = gaps; doubles need `readPixels` `format:"grid"` | Regenerate with `outline` |
| E5 | Dark outline on every internal boundary | Preview, `readPixels` `format:"grid"` | Selective outline (`craft/00-core/04-outlines-and-edges.md`) |

**Process and animation**

| Id | Tell | Detect | Fix |
|----|------|--------|-----|
| S1 | Frame drift: size, palette, outline change between frames | `render` `filmstrip`; `readPixels` `mode:"diff"` on frame pairs | Build every frame from one master (`craft/00-core/06-layers-and-rigging.md`) |
| S2 | Uniform timing, no holds | `validate` animation note | `craft/40-animation/40-timing-and-spacing.md` |
| S3 | Anatomy and object logic: extra digits, unequal eyes, impossible joins | Count limbs in preview | Rebuild from construction (`craft/30-characters/31-anatomy-and-pose.md`) |
| S4 | Perfect mirror symmetry | Copy to a scratch sprite, flip with `flip`, `readPixels` `mode:"diff"`: near-empty diff = mirror | Break symmetry (`craft/00-core/03-silhouette-and-form.md`) |
| S5 | Photo-conversion look: uniform error-diffusion speckle over a photographic layout, no designed silhouette | Preview; fails the silhouette test | Redraw from a silhouette |

**Downscale damage**

| Id | Tell | Detect | Fix |
|----|------|--------|-----|
| D1 | Mosaic mush: eyes, fingers, mouth reduced to blotches | Preview at 1×; an eye in `readPixels` `format:"grid"` is three mid tones | Use the shrunk image as a base and redraw the features by hand (template) |
| D2 | One line weight everywhere, one tone | `readPixels` `format:"grid"`: interior lines as heavy as the outline | Vary weight, selective outline |
| D3 | Limbs fused: 1 px gaps lost | Silhouette test: `replaceColor` to one colour on a copy | 1 px gap or a clear overlap |
| D4 | Thin diagonals dashed by resampling | `readPixels` `format:"grid"`: line pixels joined only at corners with gaps | Redraw as a continuous staircase |

## What validate cannot see

`validate` finds off-palette colours, floating isolated pixels, partial alpha (RGB), outline gaps, long horizontal bands, untagged frames and uniform timing. It is blind to: mixed pitch, confetti inside fills, near-duplicate colours, brightness-only ramps, pillow shading, light direction, symmetry, equal detail, doubled outlines, soft opaque AA, tile repetition, and anatomy. Do not rely on it for cross-frame volume drift either; read `render` `filmstrip`.

## By size

| | 8 px | 16 px | 32 px | 64 px |
|---|------|-------|-------|-------|
| Used colours | ≤4 (derived) | ≤8 | ≤16 | ≤32 (derived) |
| Isolated pixels | 0, the eye excepted | ≤1 | ≤1 per object | ≤2 per object |
| Tells that show first | bloat, no silhouette | confetti, mushy features, banding | pillow shading, uniform outline, symmetry | equal density, light conflict, mixed cluster scale, frame drift |
| Mixels | cannot drift | rarely visible | visible when scaled from generated art | obvious |

## Templates

Each pair is the same subject: the tell, then the fix. Use them as a diagnosis reference with `readPixels` `format:"grid"`; transcribe the "fixed" block as a starting point.

Mixed pitch: a mushroom at 1× beside the same mushroom drawn at 2×. One image, two pixel sizes.

```grid tells-pitch-mixed
O = outline #1d2b53
R = cap     #ff004d
W = spots   #fff1e8
---
............OOOOOOOO....
............OOOOOOOO....
..........OORRWWRRRROO..
..........OORRWWRRRROO..
........OORRRRRRRRWWRROO
........OORRRRRRRRWWRROO
........OORRWWRRRRRRRROO
........OORRWWRRRRRRRROO
..OOOO....OOOOOOOOOOOO..
.ORWRRO...OOOOOOOOOOOO..
ORRRRWRO....OOWWWWOO....
ORWRRRRO....OOWWWWOO....
.OOOOOO.....OOWWWWOO....
..OWWO......OOWWWWOO....
..OWWO......OOOOOOOO....
..OOOO......OOOOOOOO....
```

Fix: both drawn at the world pitch (the larger one redrawn at 8×8, or both redrawn together at a new, larger native size).

```grid tells-pitch-uniform
O = outline #1d2b53
R = cap     #ff004d
W = spots   #fff1e8
---
..OOOO.....OOOO..
.ORWRRO...ORWRRO.
ORRRRWRO.ORRRRWRO
ORWRRRRO.ORWRRRRO
.OOOOOO...OOOOOO.
..OWWO.....OWWO..
..OWWO.....OWWO..
..OOOO.....OOOO..
```

Pillow shading: highest value at the centre, symmetric rings, uniform dark rim. It reads as a button, not a lit ball.

```grid tells-sphere-pillow
1 = shadow    #4a2060
2 = shade     #9c2f5a
3 = light     #dd5a45
4 = highlight #ffb070
---
...1111...
..122221..
.12333321.
1233443321
1234444321
1234444321
1233443321
.12333321.
..122221..
...1111...
```

Fix: light from the upper left. Highlight offset toward it, a shadow crescent on the far side, mid-tone body between.

```grid tells-sphere-lit
1 = shadow    #4a2060
2 = shade     #9c2f5a
3 = light     #dd5a45
4 = highlight #ffb070
---
...3333...
..334432..
.33444322.
3334443222
3333332222
3333332221
3333322211
.33322211.
..222211..
...1111...
```

Confetti: off-ramp single pixels and a lone squiggle scattered over a flat fill. `validate` strays does not see them (they have neighbours); `readPixels` `format:"grid"` does.

```grid tells-confetti-before
M = mid       #6b6f86
D = shadow    #3b3a4e
L = light     #a3a8bd
H = highlight #e4e7f2
---
...MMMMMMMM...
.MMMMLMMMHMMM.
.DMMMMMMDMMMM.
MMMDMMLMMMMLMM
MMMMHMMLMMMMMM
MMLMMMMMMMDMMM
MMMMMMMMLMMMDM
.MMMMDMMMMMMM.
..MMMMMMMMMM..
```

Fix: the same silhouette with the light and dark gathered into two clusters following one light direction, and one specular pixel kept on purpose.

```grid tells-confetti-after
M = mid       #6b6f86
D = shadow    #3b3a4e
L = light     #a3a8bd
H = highlight #e4e7f2
---
...LLLLMMMM...
.LLLLLLLMMMMM.
.LLHLLLMMMMMM.
LLLLLMMMMMMMMM
LLLMMMMMMMMMDD
MMMMMMMMMMDDDD
MMMMMMMMDDDDDD
.MMMMMDDDDDDD.
..MMDDDDDDDD..
```

Ramps: the top strip is brightness-only (one hue and saturation; shadows go muddy, highlights chalky). The bottom strip is the fix: shadows slide toward crimson, lights toward yellow, saturation peaks in the middle. Build it with `palette` op `ramp`.

```grid tells-ramps-flat-vs-shifted
1 = flat-1    #4a2811
2 = flat-2    #84471f
3 = flat-3    #be672d
4 = flat-4    #d88c5a
5 = flat-5    #e6b494
a = shifted-1 #4a1c28
b = shifted-2 #862727
c = shifted-3 #ce4e27
d = shifted-4 #ea9e53
e = shifted-5 #f6de8d
---
1122334455
1122334455
..........
aabbccddee
aabbccddee
```

Mushy features after a downscale: each eye is a muddy smudge with no dark pupil and no highlight, the mouth a mud-coloured smear. The face has no expression.

```grid tells-eye-mushy
S = skin     #f0b48a
m = mud      #b08868
b = dark-mud #7a5a4c
---
SSSSSSSSSSSSSS
SSSSSSSSSSSSSS
SSmmmSSSSmmmSS
SSmbmSSSSmbmSS
SSSSSSSSSSSSSS
SSSSSSSSSSSSSS
SSSSSmmmmSSSSS
```

Fix: redrawn by hand. A dark lid row, one sclera pixel and two pupil pixels per eye, a smile with raised corners. The pupil position now decides where the character looks.

```grid tells-eye-placed
S = skin   #f0b48a
D = dark   #2a1a2e
W = sclera #fdf6e8
---
SSSSSSSSSSSSSS
SSSSSSSSSSSSSS
SSDDDSSSSDDDSS
SSWDDSSSSWDDSS
SSSSSSSSSSSSSS
SSSSDSSSSDSSSS
SSSSSDDDDSSSSS
```

Banding: four flat bands, each boundary running the full 16 px. `validate` banding reports it.

```grid tells-band-stripes
1 = shadow    #2f3a5a
2 = shade     #5b6f9a
3 = light     #92a8cf
4 = highlight #d6e2f5
---
4444444444444444
3333333333333333
3333333333333333
2222222222222222
2222222222222222
1111111111111111
```

Fix: boundaries step every few pixels, one transition crossed by a checker, the highlight a short dash. No boundary stays straight for 8 px.

```grid tells-band-broken
1 = shadow    #2f3a5a
2 = shade     #5b6f9a
3 = light     #92a8cf
4 = highlight #d6e2f5
---
3334444444333333
3333444333333332
3333333333222222
2323232322222222
2222222222111111
2222111111111111
```

## Procedure

**Audit (native work)**

1. `getContext`: size, colour mode, palette count, frames. Odd canvas (G8) is fixed first.
2. `validate` with the `checks` and `strict: true` from rule 1. Record counts per check.
3. `palette` op `analyze`: near-duplicates (C2), ramp hue structure (C3), colours outside the palette (C1).
4. `render`: the 1× read. Then the zoomed read via `exportDocument` `scale` or a duplicate at `resizeSprite` 2×: silhouette, light direction (C6), pillow shading (C7), symmetry (S4), density (X4).
5. `readPixels` `format:"grid"` on the busiest region and on one outline stretch: runs (G6), confetti (C5), soft edges (E2), doubled outline (E4).
6. Animation: `render` `filmstrip`, then `readPixels` `mode:"diff"` on suspicious pairs (S1).
7. Fix by the order in rule 7; re-run the detector after each fix; stop when the Review list is clean.

**Intake of an external image**

1. `palette` op `analyze` to see how many distinct colours it wants; `getContext` for its size.
2. Run test (rule 3): `readPixels` of a 1-row region at a busy y, and one more at another y.
3. Clean multiples: `resizeSprite` `nearest` (rule 5), `palette` op `extract` (`maxColors` 16) then `palette` op `snap`, clean by hand. Drifting runs: skip to 4.
4. Redraw at the target size: `importImage` `pixelate` `method:"nearest"` onto a low-`opacity` layer, `applyBatch` `grid` for the silhouette, `readPixels` `mode:"diff"` to name the largest mismatches. Fix only those.
5. Finish with the audit above.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `validate` clean yet it reads as AI | Brightness-only ramps, pillow shading, equal density: all outside `validate` | Run the by-eye Review items |
| Sprite looks sharper after upscaling and blurring | Hiding blur instead of removing it | Redraw at 1×; never filter |
| Automatic grid snap gave a broken sprite | Drifting blocks have no single lattice | Run test first; redraw instead |
| Isolated pixels removed, face went dead | The eye highlight was deleted with the noise | Keep one deliberate pixel per feature |
| Banding "fixed" by dithering the whole object | Dither as a field | Wander the boundary; dither one short section |
| Traced a generated image pixel for pixel | Inherited its mush and drift | Use as proportion guide only; decide each cluster |
| Re-shaded with `replaceColor` and gained new colours | Re-shading left the palette | Stay on the palette; add ramp entries with `palette` op `ramp` |

## Review

- Row test passes: uniform pitch across the whole image (G1, G2, G5).
- Used colours within the By-size cap; `palette` op `analyze` shows no near-duplicates; ramps change hue (C1–C3).
- `validate`: 0 off-palette, 0 partial alpha, no banding note, outline gaps explained (E1, E4, X3).
- Isolated pixels: none except deliberate highlights and eyes; no confetti inside fills (C5).
- One light direction; no pillow shading (C6, C7).
- Dither only in short transitions; no noise pattern, no smooth gradients (X2, X5).
- Detail is not equal everywhere; the 1× read passes (X4).
- Edges are hard: no feathered AA, no fringe (E2, E3); outline style consistent (E5).
- Features are placed on purpose, silhouette survives a flat fill (D1, D3).
- Animation frames share size, palette and outline; timing varies (S1, S2).
- Not mirror-symmetric unless intended (S4).

## Sources

- Eugeniy Smirnov, "How to tame your AI pixel art" (dev.to, 2025); Pixelmade, "Fix blurry pixel art" (2026); Nerulio, "Fix AI pixel art" (2026): mixel grids, colour counts, drift, detector disagreement, recovery results.
- Pixel Joint: "The Pixel Art Tutorial" (cure) for the AA / banding / dither / pillow / noise / sel-out taxonomy, and the gallery rules v2 thread (2018). Derek Yu, "Pixel Art Common Mistakes" (2020). Saint11, "Consistency" (2023) and "Anti-Alias and Banding" (2021).
- Slynyrd Pixelblog 62 (2026); Lospec articles on AI submissions and unscaling (2023); reyh thread on mixels (2024).
- Pixel Logic ch. 7 "Clean-up" (shrink without blur, redraw on the shrunken base, lazy lines); Silber, *Pixel Art for Game Developers* (anti-patterns, 3×3 tile test); Tsugumo (auto-downscale adds colours); Mateu-Mestre, *Framed Ink* (authored emphasis versus equal weight).
