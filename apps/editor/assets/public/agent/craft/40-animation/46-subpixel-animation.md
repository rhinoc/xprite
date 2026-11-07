# Sub-pixel animation

Pixels do not move by halves, so slow motion either jumps a full pixel (a stutter) or sits still. Sub-pixel animation
moves *tone* instead: the neighbour that gains value and the neighbour that loses it make the eye read a shift smaller
than one pixel. It is the only way to ease a 1 px move, keep an idle alive, or wobble something without changing its
silhouette. Done everywhere, it melts the sprite. Stills use the same trick: `craft/10-technique/12-anti-aliasing.md`.

## Rules

1. **Use it for motion under 1 px:** easing in-betweens, breathing and idle (`craft/40-animation/41-idle-and-breathing.md`), vibration
   (shiver, flinch, laugh, stun, wobble, flicker), wind on cloth, and keeping a static part alive on a canvas ≤ 32 px.
   Large moves stay on whole pixels; big sprites use full-pixel in-betweens and sub-pixels only on subtle motion.
2. **The test:** hide the colour and keep the line art. If the motion disappears, it was sub-pixel motion. The silhouette
   may not move at all, and the outline MAY stay frozen while tones swim inside.
3. **It needs shades to trade.** At least 3 per material at 16 px (move the *shade boundary* by a pixel, not the
   outline), 4–5 at 64 px. At 8 px or with ≤ 5 colours per sprite there is no room: use a 1 px bob instead.
4. **Mid-tones come from the sprite's own ramp.** A half-step is the colour roughly between the two it sits between,
   not necessarily 50 %. `applyBatch` works in working-space colours: read the ramp with `palette`, reuse a neighbour, and ask before
   widening the palette (`craft/20-color/20-color-for-pixel-art.md`). 1–2 shades are enough; more blurs.
5. **Split the pixel.** A 1 px line shifted by half becomes two pixels at half tone; a 2 px block becomes half, full,
   half. Line weight is the same thing: widths 1, 2, 3, 4 px at full tone ≙ 0.5, 1, 1.5, 2 px (half-tone ÷ 2).
6. **Direction follows the shape's angle, not the heading.** A horizontal edge shifts tone vertically, a vertical edge
   horizontally, a diagonal both. A cape curved horizontally swims sideways while the body moves up and down. A thin
   diagonal moving down looks like it slides sideways; that is the illusion working, not a bug.
7. **Not every pixel moves.** Shift one part first, then another; whole-shape shifting bands and melts. Move the interior
   before or after the outline, never everything on the same frame. Move light areas, avoid moving shapes.
8. **A row that pops needs 2–3 px.** When a new row of an edge appears, give it a run of at least 2–3 pixels; a single
   pixel reads as noise. Extend an existing run rather than adding a lone pixel.
9. **The background decides the tone.** On light grounds lighter = thinner; on dark grounds lighter = thicker. A
   selective outline's half-tones must change with what is behind them, so on varied backgrounds use a solid outline (derived).
10. **Keep the face on whole pixels.** Shift a face by a full pixel on key poses and let blurry in-betweens pass (they
    show 1–2 ticks). Chest and shoulders may move half a pixel while the head holds.
11. **In-betweens favour the keys.** The half-step sits near A or B in time and in look. Show it 50–83 ms; the keys hold.
    Fast in-betweens that look odd must not linger (`craft/40-animation/40-timing-and-spacing.md`).
12. **No pixel flash.** A pixel that appears or vanishes instead of travelling reads as a flash. Move an existing pixel
    one step; keep silhouette transitions smooth; do not dither or texture a sub-pixel area.
13. **Few, small steps.** One half-step per pixel of travel (A, ½, B); two at most (A, ¼, ¾, B) for a hero ease. Many
    tiny steps make the object look bent.
14. **Work straight ahead.** Duplicate the frame, nudge the boundary, flip between them; sub-pixel is easier that way than
    pose to pose. Onion skin shows nothing useful through fills; `readPixels` `mode:"diff"` does.
15. **Do not generate it.** The recipe "resize 200 %, move 1 px, resize 50 % with blur" is unreliable and off-palette;
    no tool here does it. Edit the border pixels by hand.
16. **Circular wobble** (head bob, orbiting light) fits in a 3×2 px area over about 6 frames; a hover is a sub-pixel
    shift paired with a 1 px vertical move.

## By size

| Px | What to use | What not to |
|----|-------------|-------------|
| 8 | nothing; hold lengths and 1 px moves | tones, ramps |
| 16 | shade-boundary shifts on 3 tones, split pixels on 1 px lines, 1 AA shade | outline movement, faces |
| 32 | 2 AA shades, breathing and wind, chest 0.5 px, half-tone hem | whole-body half-steps |
| 64 | 3–4 shades, circular wobble, subtle limb easing, cloth ripple | AA ghosts behind moving edges |

Source examples: Owlboy's idle is two keys 1 px apart plus in-betweens that favour the keys (a nose changes shape);
Metal Slug and Castlevania cloaks move far less in silhouette than they seem; Shovel Knight keeps ≤ 5 colours and so
animates with 1 px bobs; Saint11's sub-pixel sheet is 17 frames at 100 ms (breathing slime, rippling liquid, a tank
barrel's recoil).

## Templates

Panels read left to right; every panel is one frame. Light grounds are drawn so the half-tone is visible.

**Split pixel.** Panels A · M · C: a 1 px line moves 1 px; the half-step is two pixels at about 50 % tone. Hold A and C long, M for 1–2 ticks.

```grid subpx-line-shift
b = background   #e8e0d0
# = line         #2b1d2e
m = half-tone    #8a8190
---
bb#bbbb.bbmmbbb.bbb#bbb
bb#bbbb.bbmmbbb.bbb#bbb
bb#bbbb.bbmmbbb.bbb#bbb
bb#bbbb.bbmmbbb.bbb#bbb
bb#bbbb.bbmmbbb.bbb#bbb
bb#bbbb.bbmmbbb.bbb#bbb
```

**2 px block, same trick.** A · M · C: the block's coverage becomes half, full, half (`m # m`), then lands one pixel on.

```grid subpx-block-shift
b = background   #e8e0d0
# = block        #2b1d2e
m = half-tone    #8a8190
---
bbbbbb.bbbbbb.bbbbbb
b##bbb.bm#mbb.bb##bb
b##bbb.bm#mbb.bb##bb
bbbbbb.bbbbbb.bbbbbb
```

**Swimming pixels.** A · M · C: outline never moves, the highlight travels 1 px through light–mid–body tones. The silhouette is frozen; all motion is inside.

```grid subpx-blob-swim
O = outline      #2b1d2e
L = light        #bdf2a8
M = light-mid    #8fdc84
F = body-mid     #5fbf6a
D = body-shade   #2f8f5a
---
..OOOOOO.....OOOOOO.....OOOOOO..
.OLLFFFFO...OMLMFFFO...OFLLFFFO.
OLLFFFFFFO.OMLMFFFFFO.OFLLFFFFFO
OFFFFFFFFO.OFFFFFFFFO.OFFFFFFFFO
OFFFFFFFFO.OFFFFFFFFO.OFFFFFFFFO
.ODDDDDDO...ODDDDDDO...ODDDDDDO.
..OOOOOO.....OOOOOO.....OOOOOO..
```

**Easing in-between (idle).** A · M · B: the top edge rises 1 px; M adds a faint 4 px run above A instead of a full row. 4 px, not 1: a lone pixel would pop.

```grid subpx-head-ease
O = outline      #2b1d2e
m = outline-mid  #6b4f5c
H = light        #f2b48a
F = mid          #c47a5a
---
...........mmmm.....OOOO..
..OOOO.....OOOO....OHHFFO.
.OHHFFO...OHHFFO..OHHFFFFO
OHHFFFFO.OHHFFFFO.OHFFFFFO
OHFFFFFO.OHFFFFFO.OFFFFFFO
OFFFFFFO.OFFFFFFO.OFFFFFFO
OFFFFFFO.OFFFFFFO.OFFFFFFO
```

**Line weight is tone.** Widths 0.5 · 1 · 1.5 · 2 px on a light background (lighter = thinner). On a dark background the same line reads thicker as it lightens.

```grid subpx-line-weight
b = background   #e8e0d0
# = line         #2b1d2e
m = half-tone    #8a8190
---
bbmbbbb#bbbb#mbbb##bb
bbmbbbb#bbbb#mbbb##bb
bbmbbbb#bbbb#mbbb##bb
bbmbbbb#bbbb#mbbb##bb
bbmbbbb#bbbb#mbbb##bb
bbmbbbb#bbbb#mbbb##bb
```

**Lean without moving the outline.** Same shape three times; lighter outline pixels at opposite corners push the tube to lean one way or the other. Use for wobble and wind.

```grid subpx-tube-lean
O = outline      #2b1d2e
m = outline-mid  #7d6a8a
F = fill         #5a8fd0
---
.OOm...OOO...mOO.
OFFFm.OFFFO.mFFFO
OFFFO.OFFFO.OFFFO
OFFFO.OFFFO.OFFFO
OFFFO.OFFFO.OFFFO
OFFFO.OFFFO.OFFFO
mFFFO.OFFFO.OFFFm
.mOO...OOO...OOm.
```

## Procedure

1. Name the boundary that moves and its direction (rule 6). Draw keys A and B a full pixel apart with `applyBatch` `grid`.
2. `copyFrame` A to make the half-step M. `readPixels` `format:"grid"` on the region, then edit only the boundary
   pixels: A's trailing pixel → the ramp neighbour, B's leading pixel → its neighbour. Runs ≥ 2–3 px.
3. `readPixels` `mode:"diff"` A → M and M → B: only boundary pixels may differ; a large diff means you moved a shape.
4. Colours: `palette` op to read the ramp; use existing neighbours only.
5. `setFrameDuration`: keys long, M 50–83 ms. For breathing, keys 200–400 ms.
6. Review at viewing size: `render` `filmstrip`, then `readPixels` on only the outline `layerId`: if the motion
   survives there it is not sub-pixel.
7. `validate` with `checks: ["antialiasing","animation"]`: deliberate half-tones will be reported; every one must be a ramp
   neighbour on a moving edge in at least two frames. Anything else is a stray.

## Mistakes

- **Melting jelly** → every boundary moves every frame. Freeze the outline; move one area.
- **Banding** → a whole region shifted tone together. Shift a cluster, leave neighbours.
- **Shimmer** → a new in-between colour on every frame. Reuse the same two half-tones.
- **Ghost trail** → light half-tones left behind a moving outline. Clean them; outlines do not keep AA.
- **Popping noise** → a new row of 1 px. Make the run 2–3 px.
- **Wobbling face** → eyes and mouth half-shifted. Whole pixels or nothing.
- **Illegible at 8 px** → no shades to trade. Use a 1 px bob.
- **Lingering in-between** → ≥ 3 ticks on screen shows the blur. 50–83 ms.

## Review

- The motion survives the colour-hidden test only if it is meant to be sub-pixel; otherwise it is a normal move.
- Every half-tone is a ramp neighbour; no new colours per frame; ≤ 2 AA shades.
- New rows have runs ≥ 2–3 px; no lone pixels; the outline is frozen or moves a full pixel.
- Faces are on whole pixels; in-betweens are held ≤ 83 ms.

## Sources

- Pixel Logic (Michael Azzi), ch. 8 Sub-pixeling pp. 187–212 (cups of water, split pixels, line weight, direction rule,
  parabola pop, Owlboy idle, quick-and-cheap method) and ch. 9 (ease, delayed and stretchy pixels).
- Silber, *Pixel Art for Game Developers*, ch. 8 (pixel flash); Saint11, *Subpixel* tutorial and *Character Idle*;
  2D Will Never Die, "Give your sprites depth with sub-pixel animation" (Metal Slug, Castlevania); Shovel Knight sprite blog.
