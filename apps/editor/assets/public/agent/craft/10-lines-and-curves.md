# Lines and curves

A pixel line is a staircase, and the eye reads its rhythm before the shape. One run shorter or longer than its
neighbours shows at 1× as a bump (a "jaggy"); a 2×2 lump on a 1 px line shows as a blob. Every colour boundary is a
line too, so this covers outlines, shading edges and outline-free art. Outline *style* is
`craft/04-outlines-and-edges.md`; this file is about the pixels.

## Rules

A **run** is consecutive pixels in one row (shallow part of a line) or one column (steep part). `N:1` means N pixels
across per 1 up; `1:N` means 1 across per N up.

1. **One weight, 1 px.** Keep one line weight per sprite. A 2 px outline eats ~12% of a 16 px canvas; it is a
   style choice for large sprites, never a way to hide bad lines.
2. **No elbows.** Each pixel touches the next at a corner or at the end of a run. A pixel with line neighbours both
   across and up/down is an elbow (an L); it thickens the line at that spot. Test: if deleting a pixel leaves the
   line still connected corner to corner, delete it. The opposite "square-line" style (add an elbow at every join)
   is allowed only as a deliberate, sprite-wide choice.
3. **Straight lines use a clean ratio**, and a clean ratio has exactly one run length:

   | Ratio | Angle (derived) | Run | Notes |
   |-------|-----------------|-----|-------|
   | 1:1 | 45° | 1 | Sharpest diagonal. Needs no AA. |
   | 2:1 | 26.6° | 2 | The isometric line (`craft/71-isometric.md`). |
   | 3:1, 4:1 | 18.4°, 14.0° | 3, 4 | Shallow rails, horizons, roof edges. |
   | 1:2, 1:3, 1:4 | 63.4°, 71.6°, 76.0° | 2, 3, 4 (vertical) | Steep sides, blades, trunks. |

4. **Never edit one step.** A 1-run inside a line of 2-runs is a jaggy. Redraw the whole segment at its ratio;
   endpoints may move 1 px. Patching a single step only moves the wobble.
5. **Off-ratio angles alternate exactly two adjacent run lengths in a fixed period**: 2,1 (3:2) · 3,2 (5:2) ·
   2,2,1 (5:3) · 3,2,2 (7:3). Never three different lengths, never a random mix (2,1,3,1,2). At 8–16 px, snap to
   the nearest clean ratio instead.
6. **Curves: run lengths change monotonically.** From the tangent end they shrink to the 45° point, then grow
   mirrored: `6,2,1,2,6`. Any up–down–up (2,1,2 or 3,5,3) is a jaggy. Write the run list from a `readPixels` `format:"grid"`
   read; fix by moving **one** end pixel of a run to its neighbour — the pixel count stays the same.
7. **No lone wolves.** A pixel that sticks out of the imagined smooth curve, or falls short of it, is the error.
   The cure is usually deleting 1–2 pixels, not re-stroking the curve. A re-stroke brings new jaggies.
8. **Circles and ellipses.** `applyBatch` `ellipse` draws the canonical row widths for
   D=4–16 (`craft/72-3d-forms.md` has the table; D=3 comes out a square, so stamp it).
   For a hand-drawn curve, draw one quadrant and mirror it with `applyBatch` `flip`/`blit`
   (`flip` `direction: "horizontal"` / `"vertical"`) — symmetry is then exact. Odd diameters share one
   centre row and column between the halves; copy the half, not a second centre.
9. **Colour edges are lines.** The boundary between two fills obeys rules 3–7 exactly. Cel-shading edges are where
   most jaggies hide, because nobody outlines them.
10. **Corners are a decision.** One missing corner pixel = soft; a 45° cut = bevel; a curve = round. One style per sprite.
11. **Points.** A tip whose sides are `1:N` has an angle of 2·atan(1/N): 90°, 53°, 37°, 28° for N = 1…4. Use the
    single 45° pixel as the tip of blades, thorns, flame tips and wings; keep both sides on the same ratio.
12. **Line family sets mood.** Long 1:1 / 2:1 diagonals and zigzags read dynamic; long horizontals, verticals and
    arcs read calm. Pick one dominant family per asset. Front and back contours of a body step in opposite
    directions (chest out, back straight; knee forward, calf back); a 1 px straight column head to feet is a failure.
    For converging lines, fix the vanishing point so the main edges land on clean ratios; round run lengths, never endpoints.
13. **Use the line op, then check the ends.** `applyBatch` `line` is even for clean ratios; for other angles verify
    the period, and trim or lengthen a half-length first or last run by 1 px. Hand-placed `pixels` is where runs go wrong.

### Circle row widths (derived: one choice per diameter that keeps the edge runs monotone)

Row widths from the top row to the middle; the lower half mirrors. *Edge runs* = top run, steps to 45°, side run.

| Ø | Row widths | Edge runs | Ø | Row widths | Edge runs |
|---|-----------|-----------|---|-----------|-----------|
| 3 | 1,3 | plus | 11 | 5,7,9,11,11,11 | 5,1,1,5 |
| 4 | 2,4 | — | 12 | 4,8,10,10,12,12 | 4,2,2,4 |
| 5 | 3,5,5 | — | 13 | 5,9,11,11,13,13,13 | 5,2,2,5 |
| 6 | 2,4,6 | — | 14 | 4,8,10,12,12,14,14 | 4,2,1,2,4 |
| 7 | 3,5,7,7 | 3,1,3 | 15 | 5,9,11,13,13,15,15,15 | 5,2,1,2,5 |
| 8 | 4,6,8,8 | 4,1,4 | 16 | 6,10,12,14,14,16,16,16 | 6,2,1,2,6 |
| 9 | 3,7,7,9,9 | 3,2,2,3 | 20 | 6,10,14,16,16,18,18,20,20,20 | 6,2,2,2,2,6 |
| 10 | 4,8,8,10,10 | 4,2,2,4 | 24 | 6,10,14,16,18,20,20,22,22,24,24,24 | 6,2,2,1,1,2,2,6 |

## By size

| Size | What a line may do |
|------|--------------------|
| 8 | Only 1:1 and 2:1. Circles Ø3–8 as filled discs. A curve is ≤ 4 runs. No AA. |
| 16 | Clean ratios only; off-ratio angles snap to one. Circles to Ø16; an arc has ≤ 6 runs (`6,2,1,2,6`). |
| 32 | Periodic two-length lines (2,1 / 3,2) are fine. Curves of 6–8 runs. AA only on steps ≥ 3 (`craft/12-anti-aliasing.md`). |
| 64 | Long arcs (Ø20, Ø24 in the table). A 2 px outline is possible. Hunt jaggies at 1× *and* 2×. |

## Templates

**`lines-slopes-shallow`** — the clean shallow ladder, left to right 1:1, 2:1, 3:1, 4:1, six steps each. Copy a
line's run length, not its pixels.
```grid lines-slopes-shallow
O = line       #2b1d2e
---
.....O............OO.................OOO......................OOOO
....O...........OO................OOO.....................OOOO....
...O..........OO...............OOO....................OOOO........
..O.........OO..............OOO...................OOOO............
.O........OO.............OOO..................OOOO................
O.......OO............OOO.................OOOO....................
```
**`lines-slopes-steep`** — steep ladder 1:2, 1:3, 1:4 (four steps each): the same rule turned on its side.
```grid lines-slopes-steep
O = line       #2b1d2e
---
...............O
...............O
...............O
...............O
.........O....O.
.........O....O.
.........O....O.
........O.....O.
...O....O....O..
...O....O....O..
..O....O.....O..
..O....O.....O..
.O.....O....O...
.O....O.....O...
O.....O.....O...
O.....O.....O...
```
**`lines-slopes-periodic`** — the only acceptable off-ratio lines: 3:2 (2,1), 5:2 (3,2), 5:3 (2,2,1), 7:3 (3,2,2).
```grid lines-slopes-periodic
O = line       #2b1d2e
---
..........................................O.....................OO
........................................OO....................OO..
......................................OO...................OOO....
........O...............OO...........O...................OO.......
......OO.............OOO...........OO..................OO.........
.....O.............OO............OO.................OOO...........
...OO...........OOO.............O.................OO..............
..O...........OO..............OO................OO................
OO.........OOO..............OO...............OOO..................
```
**`lines-slope-broken` → `lines-slope-fixed`** — a 2:1 line with one 1-run (red) and the same line redrawn at one
ratio. The fix costs one pixel of length.
```grid lines-slope-broken
O = line       #2b1d2e
X = flaw       #e8365a
---
.........OO..
.......OO....
.....OO......
....X........
..OO.........
OO...........
```
```grid lines-slope-fixed
O = line       #2b1d2e
---
..........OO.
........OO...
......OO.....
....OO.......
..OO.........
OO...........
```
**`lines-arc-bad` → `lines-arc-good`** — jaggy and fix on the same 10×10 quarter arc. Bad runs `4,1,2,1,3,3`
(red runs break the shrink-then-grow order); good runs `4,2,1,1,2,4`. Same box, same pixel count.
```grid lines-arc-bad
O = line       #2b1d2e
X = flaw       #e8365a
---
.......OOO
....XXX...
...O......
..X.......
..X.......
.O........
O.........
O.........
O.........
O.........
```
```grid lines-arc-good
O = line       #2b1d2e
---
......OOOO
....OO....
...O......
..O.......
.O........
.O........
O.........
O.........
O.........
O.........
```
**`lines-circles-small`** — filled discs Ø3–8 for icons, eyes, gems, particles.
```grid lines-circles-small
O = line       #2b1d2e
---
.....................................OOOO..
............................OOO.....OOOOOO.
....................OO.....OOOOO...OOOOOOOO
............OOO....OOOO...OOOOOOO..OOOOOOOO
......OO...OOOOO..OOOOOO..OOOOOOO..OOOOOOOO
.O...OOOO..OOOOO..OOOOOO..OOOOOOO..OOOOOOOO
OOO..OOOO..OOOOO...OOOO....OOOOO....OOOOOO.
.O....OO....OOO.....OO......OOO......OOOO..
```
**`lines-circles-large`** — 1 px rings Ø9–12 (outline of a disc).
```grid lines-circles-large
O = line       #2b1d2e
---
........................................OOOO....
..........................OOOOO.......OO....OO..
..............OOOO.......O.....O.....O........O.
...OOO......OO....OO....O.......O....O........O.
.OO...OO....O......O...O.........O..O..........O
.O.....O...O........O..O.........O..O..........O
O.......O..O........O..O.........O..O..........O
O.......O..O........O..O.........O..O..........O
O.......O..O........O..O.........O...O........O.
.O.....O....O......O....O.......O....O........O.
.OO...OO....OO....OO.....O.....O......OO....OO..
...OOO........OOOO........OOOOO.........OOOO....
```
**`lines-circles-xlarge`** — 1 px rings Ø13–16: wheels, shields, orbs, helmets.
```grid lines-circles-xlarge
O = line       #2b1d2e
---
.....................................................OOOOOO.....
....................................OOOOO..........OO......OO...
....................OOOO..........OO.....OO.......O..........O..
....OOOOO.........OO....OO.......O.........O.....O............O.
..OO.....OO......O........O.....O...........O....O............O.
.O.........O....O..........O....O...........O...O..............O
.O.........O....O..........O...O.............O..O..............O
O...........O..O............O..O.............O..O..............O
O...........O..O............O..O.............O..O..............O
O...........O..O............O..O.............O..O..............O
O...........O..O............O..O.............O..O..............O
O...........O...O..........O....O...........O....O............O.
.O.........O....O..........O....O...........O....O............O.
.O.........O.....O........O......O.........O......O..........O..
..OO.....OO.......OO....OO........OO.....OO........OO......OO...
....OOOOO...........OOOO............OOOOO............OOOOOO.....
```
**`lines-diamond-elbows` → `lines-diamond-clean`** — the double fix: red elbows thicken every 1:1 step; delete
them and the diamond is four single-pixel diagonals.
```grid lines-diamond-elbows
O = line       #2b1d2e
X = flaw       #e8365a
---
...XOX...
..XO.OX..
.XO...OX.
XO.....OX
O.......O
XO.....OX
.XO...OX.
..XO.OX..
...XOX...
```
```grid lines-diamond-clean
O = line       #2b1d2e
---
....O....
...O.O...
..O...O..
.O.....O.
O.......O
.O.....O.
..O...O..
...O.O...
....O....
```
**`lines-corners`** — corner vocabulary, left to right: sharp, one-pixel soft, 3 px 45° bevel, rounded (the clean `4,2,1,1,2,4` arc).
```grid lines-corners
O = line       #2b1d2e
---
OOOOOOOOOO...OOOOOOOOO.....OOOOOOO........OOOO
O...........O.............O.............OO....
O...........O............O.............O......
O...........O...........O.............O.......
O...........O...........O............O........
O...........O...........O............O........
O...........O...........O...........O.........
O...........O...........O...........O.........
O...........O...........O...........O.........
O...........O...........O...........O.........
```
**`lines-spikes`** — tip angle by side ratio (1:1, 1:2, 1:3, 1:4): blade tips, thorns, horns, flame tips.
```grid lines-spikes
F = metal-mid  #8fa3b8
---
.......F.............F........F......F..
......FFF...........FFF.......F......F..
.....FFFFF..........FFF......FFF....FFF.
....FFFFFFF........FFFFF.....FFF....FFF.
...FFFFFFFFF.......FFFFF.....FFF....FFF.
..FFFFFFFFFFF.....FFFFFFF...FFFFF...FFF.
.FFFFFFFFFFFFF....FFFFFFF...FFFFF..FFFFF
FFFFFFFFFFFFFFF..FFFFFFFFF..FFFFF..FFFFF
```

## Procedure

1. Decide the dominant line family and the clean ratios you will use before the first pixel.
2. Block the shape with `applyBatch` ops `line` / `ellipse` / `stroke` as a draft, or transcribe a template with op `grid`.
3. `readPixels` `format:"grid"` with a `rect` crop; write the run list of every curve and slope.
4. Fix in this order: elbows (rule 2), then jaggies (rule 6), then lone wolves (7). Removing elbows creates new
   jaggies, so this is two passes. Delete one pixel with `applyBatch` `clear` on a 1×1 `rect`; move one with
   `pixels`; re-lay a whole straight segment with `line`.
5. Mirror symmetric shapes with `applyBatch` `flip`/`blit` instead of drawing both halves.
6. `render` the sprite and again after `exportDocument` `scale` enlargement (or a scratch `resizeSprite` 2×) — flaws visible at one size are invisible at the other.
7. `validate`: it has no jaggy or elbow check. `strays` only reports pixels with no opaque 4-neighbour, `outline`
   only gaps in the edge colour. Run lengths are by-eye work.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Lumpy circle | Tool ellipse used as final, or runs `3,5,3` | Rebuild from the table; mirror one quadrant |
| Line "wobbles" | One run differs, or three run lengths in one line | Redraw the segment at one ratio / a 2-length period |
| Fat spots on a diagonal | Elbow pixels from click-by-click or a soft brush | Delete the corner pixels |
| Curve kinks near the 45° point | Run list reverses: `…2,1,2…` | Move one end pixel to the neighbouring run |
| Stiff, lifeless figure | Parallel straight contours, one family of angles | Opposed contours (rule 12) |
| New jaggies after cleanup | Fixed one pixel at a time without re-counting | Re-run `readPixels` `format:"grid"`, recount runs |

## Review

- Every straight line has one run length, or one two-length period.
- Every curve's run list shrinks then grows; no reversal.
- No elbow pixels; no 2×2 lump on a 1 px line; no lone pixel off a contour.
- One line weight; one corner style.
- Circles match the table's row widths; mirrored halves are identical.
- Colour-to-colour edges pass the same checks as outlines.
- Still clean in the `render`.

## Sources

- *Pixel Logic*, Ch. 1 "Line art" (equal staircases, run-list jaggy test, outline types) and Ch. 2 (lines as colour edges).
- Silber, *Pixel Art for Game Developers*, Ch. 5 (equal steps, progressive curve lengths, copy–flip curves).
- Saint11 tutorials "Fundamentals 2", "Jaggies" (elbows, adjacent-number patterns, monotone curves).
- Derek Yu / Keddy / Janes classic pixel tutorials (clean slopes, monotone circle runs).
- Robertson, *How to Draw* (slope families, converging lines); Solarski, *Drawing Basics and Video Game Art* (line character, opposed contours).
