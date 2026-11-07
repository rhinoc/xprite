# Anti-aliasing

Manual anti-aliasing (AA) puts a pixel of in-between colour where a step turns, so a curve looks smoother at 1×.
Too little leaves a curve jagged; too much turns it into a blur, a halo on the wrong background, or a second thick
line. This file decides *whether*, *where* and *how much*. Filters, resampling and soft brushes are not AA.

## Rules

1. **The mental model.** The sprite is a low-res rendering of an intended line. For each pixel the line barely
   touches you may fill it, leave it, or fill it with a halftone that stands for half a pixel.
2. **Decide first: AA or not.**

   | Do not AA | AA |
   |-----------|----|
   | Sprites ≤ 12 px, 1-bit and 4-colour palettes | Soft, round styles at ≥ 24 px |
   | Crisp graphic / crayon styles | Faces, eyes, many small curves |
   | Straight 1:1 diagonals | Junctions of two high-contrast colours |
   | Low-contrast edges (little to soften) | Hi-res art redrawn at low res; subpixel animation |

3. **Only on steps that need it.** AA a step of 3+ px at 16 px; 2 px steps only from ~32 px; **never on a 1:1
   diagonal or a straight line**. Fix the jaggies first (`craft/10-lines-and-curves.md`): AA on a lumpy curve
   makes a smooth-looking lump.
4. **How long.** One shade covers about **1/3** of the step; two shades (dark half at the corner, light half
   beyond) cover up to **2/3**; never ≥ 3/4, which reads as a second line (banding). When in doubt round down.
   Derived: step 2 → 1 px; 3 → 1; 4 → 1, or 1+1 in two shades; 6 → 2, or 2+2; 9 → 3, or 3+3.
5. **Where.** In the inner corner of each step, then extended along the longer of the two runs that corner touches.
   The shade next to the outline is the darker one. AA that runs parallel along its own whole line is banding, not AA.
6. **Colour.** Choose the in-between by value *and* hue, between the two neighbours. If the halftone is darker than
   both on a light background (or lighter than both on a dark one) it reads as glow or shadow, not AA.
7. **Shades per size.** 0–1 at 16 px; 1–2 at 32 px; up to 3 at 64 px+ if the palette has spare colours. Reuse colours
   the sprite already has.
8. **Unknown background → inside only.** Do not AA the outer side of an outline: those pixels bake in one background
   and show as a halo on any other. Internal AA (between outline and fill) is safe anywhere; "selective AA" moves
   internal AA into the outline without any exterior pixels. Outside AA only on art that sits on a baked backdrop.
9. **AA between two fills** follows the same lengths (shading edges are lines). The jagged-edge trick: imagine the
   ideal straight line, fill the biggest gaps with a light tone, then optionally the smaller gaps with a lighter one;
   stop early. It works inside a sprite and looks worse on an outline.
10. **Line weight by colour.** A 1 px line drawn dark reads thicker, drawn light reads thinner (reversed on a dark
    background). Light pixels at a tip taper it like a brush; 1–2 shades are enough. Do not mistake line weight
    for shading.
11. **No filter AA.** Bilinear/bicubic resize, rotation by non-90° angles and soft brushes add dozens of near-colours
    and mush. `resizeSprite` `nearest` is the only upscale; `exportDocument` `scale` previews it without touching the sprite.
12. **Large 45° curves (≥ 48 px, optional).** On a curved 45° section of a soft-shaded outline a convex bulge takes a
    lighter centre pixel with darker ends, a concave hollow a darker centre with lighter ends. Do not do this on
    sprites ≤ 32 px or on straight diagonals.
13. **Depth is not blur.** Push things back with lower contrast and less detail (`craft/60-skies-and-atmosphere.md`),
    not with soft edges. Keep foreground edges crisp.
14. **What `validate` checks.** `antialiasing` counts *semi-transparent* pixels (partial alpha, from brushes or resizes).
    Manual colour AA is opaque and passes, by design; so does a bad one. Judge it by eye.

## By size

| Size | AA budget |
|------|-----------|
| 8 | None. A pixel is already half the feature. |
| 16 | 0–1 shade, one pixel at the corner of each run ≥ 3, internal only. Skip if the sprite is 4–8 colours. |
| 32 | 1–2 shades; steps ≥ 2 on the main contour and around the eyes; strips of 1/3 → 2/3 of the step. |
| 64 | Up to 3 shades; optional 45° convex/concave tone play; line-weight tricks on mouths, brows, cracks. |

## Templates

**`aa-step-ladder`** — five stacked versions of the same 9 px step, top to bottom: aliased · 1 shade, 3 px (1/3)
· 2 shades, 3+3 px (2/3) · too long, 7 px (reads as a second line) · too short, 1 px (only blunts the corner).
```grid aa-step-ladder
O = line       #2b1d2e
F = fill       #d98d5f
a = aa-dark    #8a5448
b = aa-light   #b9714f
---
...........................
..................OOOOOOOOO
.........OOOOOOOOOFFFFFFFFF
OOOOOOOOOFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
...........................
...........................
..................OOOOOOOOO
.........OOOOOOOOOaaaFFFFFF
OOOOOOOOOaaaFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
...........................
...........................
..................OOOOOOOOO
.........OOOOOOOOOaaabbbFFF
OOOOOOOOOaaabbbFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
...........................
...........................
..................OOOOOOOOO
.........OOOOOOOOOaaaaaaaFF
OOOOOOOOOaaaaaaaFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
...........................
...........................
..................OOOOOOOOO
.........OOOOOOOOOaFFFFFFFF
OOOOOOOOOaFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
```
**`aa-step-lengths`** — AA by step length, top to bottom: step 2 (1 px) · 3 (1 px) · 4 (1+1, two shades) · 6 (2+2) · 9 (3+3). Copy the strip length, not the pixels.
```grid aa-step-lengths
O = line       #2b1d2e
F = fill       #d98d5f
a = aa-dark    #8a5448
b = aa-light   #b9714f
---
...........................
....OO.....................
..OOaF.....................
OOaFFF.....................
FFFFFF.....................
FFFFFF.....................
...........................
...........................
......OOO..................
...OOOaFF..................
OOOaFFFFF..................
FFFFFFFFF..................
FFFFFFFFF..................
...........................
...........................
........OOOO...............
....OOOOabFF...............
OOOOabFFFFFF...............
FFFFFFFFFFFF...............
FFFFFFFFFFFF...............
...........................
...........................
............OOOOOO.........
......OOOOOOaabbFF.........
OOOOOOaabbFFFFFFFF.........
FFFFFFFFFFFFFFFFFF.........
FFFFFFFFFFFFFFFFFF.........
...........................
...........................
..................OOOOOOOOO
.........OOOOOOOOOaaabbbFFF
OOOOOOOOOaaabbbFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFFFFFFFFFFFFF
```
**`aa-circle-modes`** — one Ø16 disc four ways, left to right: aliased · internal AA on the long runs only (use this)
· outside "halo" (bakes in a background) · banded (AA ring hugs the whole outline).
```grid aa-circle-modes
O = line       #2b1d2e
F = fill       #d98d5f
a = aa-dark    #8a5448
h = aa-halo    #a8857a
---
........................................................................
......OOOOOO............OOOOOO...........hOOOOOOh...........OOOOOO......
....OOFFFFFFOO........OOaaFFaaOO.......hOOFFFFFFOOh.......OOaaaaaaOO....
...OFFFFFFFFFFO......OFFFFFFFFFFO.....hOFFFFFFFFFFOh.....OaaFFFFFFaaO...
..OFFFFFFFFFFFFO....OFFFFFFFFFFFFO....OFFFFFFFFFFFFO....OaFFFFFFFFFFaO..
..OFFFFFFFFFFFFO....OFFFFFFFFFFFFO...hOFFFFFFFFFFFFOh...OaFFFFFFFFFFaO..
.OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO..OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO.
.OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO..OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO.
.OFFFFFFFFFFFFFFO..OFFFFFFFFFFFFFFO..OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO.
.OFFFFFFFFFFFFFFO..OFFFFFFFFFFFFFFO..OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO.
.OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO..OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO.
.OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO..OFFFFFFFFFFFFFFO..OaFFFFFFFFFFFFaO.
..OFFFFFFFFFFFFO....OFFFFFFFFFFFFO...hOFFFFFFFFFFFFOh...OaFFFFFFFFFFaO..
..OFFFFFFFFFFFFO....OFFFFFFFFFFFFO....OFFFFFFFFFFFFO....OaFFFFFFFFFFaO..
...OFFFFFFFFFFO......OFFFFFFFFFFO.....hOFFFFFFFFFFOh.....OaaFFFFFFaaO...
....OOFFFFFFOO........OOaaFFaaOO.......hOOFFFFFFOOh.......OOaaaaaaOO....
......OOOOOO............OOOOOO...........hOOOOOOh...........OOOOOO......
........................................................................
```
**`aa-line-weight`** — one 1 px smile, top to bottom: dark (heavy) · tips lightened (tapered) · whole line light (thin).
```grid aa-line-weight
F = skin       #e8b48f
O = line       #2b1d2e
a = aa-dark    #8a5448
b = aa-light   #c79170
---
FFFFFFFFFFF
FOFFFFFFFOF
FFOFFFFFOFF
FFFOOOOOFFF
FFFFFFFFFFF
FFFFFFFFFFF
FFFFFFFFFFF
FbFFFFFFFbF
FFaFFFFFaFF
FFFOOOOOFFF
FFFFFFFFFFF
FFFFFFFFFFF
FFFFFFFFFFF
FbFFFFFFFbF
FFbFFFFFbFF
FFFbbbbbFFF
FFFFFFFFFFF
```
**`aa-jag-fill`** — the jagged-edge trick between two fills: raw · light AA on the biggest gaps (2 px) · a lighter
second shade on the smaller gaps (2+2 px). Stop at the middle panel unless the edge still looks stepped.
```grid aa-jag-fill
D = fill-shadow #a65a4e
L = fill-light #f2c28b
a = aa-mid     #cc8a6d
b = aa-light   #e0a87a
---
LLLLLLLLLLLLLLLLLL..LLLLLLLLLLLLLLLLLL..LLLLLLLLLLLLLLLLLL
LLLLLLLLLLLLLLLLLL..LLLLLLLLLLLLLLLLLL..LLLLLLLLLLLLLLLLLL
LLLLLLLLLLLLDDDDDD..LLLLLLLLLLaaDDDDDD..LLLLLLLLbbaaDDDDDD
LLLLLLDDDDDDDDDDDD..LLLLaaDDDDDDDDDDDD..LLbbaaDDDDDDDDDDDD
DDDDDDDDDDDDDDDDDD..DDDDDDDDDDDDDDDDDD..DDDDDDDDDDDDDDDDDD
DDDDDDDDDDDDDDDDDD..DDDDDDDDDDDDDDDDDD..DDDDDDDDDDDDDDDDDD
```

## Procedure

1. Draw and clean the line **aliased**; fix every jaggy first.
2. `readPixels` `format:"grid"`; list every step of 3+ px on the long contours. Leave 1:1 diagonals alone.
3. For each, place the strip in the inner corner with `applyBatch` `pixels`: darker shade at the corner, lighter beyond.
   Strip length by rule 4. Pick shades with `palette` op `ramp` or reuse existing colours (stay on-palette).
4. `render` the sprite, then `exportDocument` `scale: 2` (or `resizeSprite` 2× on a duplicate) for the zoomed read. Blur your eyes: the curve should look rounder, the line not thicker.
5. If it looks softer but not rounder, delete the strips and keep the aliased version.
6. Check the sprite on a dark, a light and a mid-grey background (a temporary layer under it); remove any pixel that
   only works on one.
7. `validate` (`antialiasing`, `strays`, `outline`): stray AA pixels must not be isolated; the outline colour must
   still own the silhouette edge.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Curve looks blurry | Too many shades or strips ≥ 3/4 of the step | Shorten to 1/3; one shade |
| Thick, doubled outline | AA ring parallel to the line (banding) | Keep strips to inner corners only |
| Light halo on a dark scene | AA on the outside of the outline | Delete exterior pixels; AA inside |
| 45° edge looks smudged | AA on 1:1 steps | Remove it |
| Wobbly curve, still jagged | AA put on an un-fixed curve | Fix runs first, then AA |
| Bright fringe | Halftone value outside the two neighbours | Pick a value between them |
| Mush after a resize | Resampled instead of redrawn | Redraw at the target size |

## Review

- Every AA pixel sits in the inner corner of a step of ≥ 3 px (or ≥ 2 px at 32+).
- Strip length is ≤ 2/3 of its step; shade values lie between their neighbours.
- No AA on 1:1 lines, straight lines or the outside of the outline.
- No parallel hugging row of AA along a whole contour.
- Silhouette stays crisp in the `render`; no resampled or semi-transparent pixels (`validate`).

## Sources

- *Pixel Logic*, Ch. 2 "Anti-aliasing" (step/strip ratios 1/3–2/3, banding, jagged-edge trick, line weight) and Ch. 8 (AA as subpixel technique).
- Saint11, "Anti-aliasing" tutorial (halftone value rule, step-length scaling, failure modes).
- Silber, *Pixel Art for Game Developers*, Ch. 5 and 10 ("a little goes a long way").
- Classic pixel tutorials: Cure (internal vs selective AA), Purloux (AA at most half a run), Tsugumo (auto-resize adds colours).
