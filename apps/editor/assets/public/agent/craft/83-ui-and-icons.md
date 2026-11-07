# UI and icons

UI art fails differently from sprites: it is looked at constantly, at tiny sizes, next to
text, and it must stay quiet while the character carries the feedback. Typical failures
are stretched panels with smeared corners, health bars in the wrong colour language, an
icon that is a miniature painting, and a set where every piece has a different light
direction. This file covers frames, bars, buttons and icon design; the text inside them is
in `craft/84-bitmap-fonts.md`, items as props in `craft/73-props-and-items.md`, bust portraits
in `craft/38-portraits.md`.

## Rules

1. **One kit, one language.** Panel, button, bar and icon share outline weight, corner
   shape, light direction (top-left, as in the world) and a small palette: 3–4 neutral
   values for frames plus one accent. Frames stay neutral so hearts, gems and text carry
   the colour (`craft/01-palette-and-color.md`).
2. **9-slice for every box.** Corners are never stretched; edges tile along their axis;
   the middle is flat fill or a tile. Smallest useful panel is a 12×12 with 3×3 corners;
   use 4×4 corners from 16×16 up. Keep edges and middle low-detail — ornaments go in the
   corners. Edges must tile to themselves and to the corners, so test by repeating the edge
   tile twice. Stretching works only for perfectly flat edges. Bars and dividers are
   3-slices (two caps, one tiling middle).
3. **Bevel recipe (derived):** 1 px dark outline, 1 px light bevel top and left, 1 px shadow
   bottom and right, flat fill. Round a corner by deleting its outer pixel. The light
   comes from the same side as in the world art.
4. **Button states (derived, not sourced):** normal; hover = face +1 value step; pressed =
   bevel inverted and face and label 1 px down-right; disabled = desaturated, no highlight.
   The four share one silhouette so the layout never shifts.
5. **Choose the health style by gameplay.** Hearts: charming, imprecise, large (full / half
   / empty = three sprites). Pips or segments: countable. Solid bar: continuous. Numbers:
   exact but unreadable mid-action. Health is the most important gauge: always readable,
   never animated enough to distract.
6. **Bar anatomy.** Outline 1 px, fill 3 rows (highlight / base / shade), trough lighter
   top row then dark, total 5 px tall; round the outer corners. Dynamic colour (green →
   yellow → red as it drains) and a flash or pulse on change are the UI's "juice". A
   delayed pale trail behind a draining bar shows damage taken.
7. **Don't mix gauge directions or styles** inside one resource family (all health
   horizontal bars, all ammo as pips) unless a mechanic is unique.
8. **UI animation never competes with the controlled sprite.** Function first; strong
   feedback (flash, spark, shake) belongs on the world, not the HUD. A shine sweep on a
   bar or coin is the only decoration worth 4 frames.
9. **Icons are authored at native size** and scaled by integers only. Shipped sizes:
   status pip 16–24 px, tooltip 24–32, quickbar 32–48. Art area = canvas minus an 8–10 %
   margin: 1 px at 16 px, 2 px at 24–32. No text in icons.
10. **Icon design test:** fill the shape with one flat colour — does it still read? One focal
    feature only. Rotate long objects 30–45° so they fill the square. Value range wide:
    dark outline, mid body, one bright highlight. At 8 px keep only the one most
    recognisable feature.
11. **Sets are audited as a grid.** Same outline weight, same light direction, same palette,
    same margin. Rarity is shown by frame or background colour, never by changing the art's
    style. Per family: items volumetric, skills with a glow, status effects flat and one colour.
12. **Item sheets:** 16×16, side view, ≤ 6 colours each, one projection for the whole sheet.
    Currency shines, power-ups bob, floating items bob and grounded items bounce; don't
    rotate complex items.
13. **Coin and gem motion.** Coin spin narrows in larger steps as it nears edge-on
    (8 → 6 → 3 wide), then back. A sparkle slides along the *edge* of a flat coin, not
    across the face. Gem: three value bands, one white point, one dark facet opposite it;
    shine lights each facet whole, the middle frames cover the biggest area.
14. **Pick-up feedback:** currency plays in place (a 4-point sparkle); effect items play on
    the character (rising arrow, hearts); the HUD gets a flash. Reuse one radial flash across
    all pick-ups for style unity.
15. **Text on UI** gets a 1 px dark outline or a 1–2 px drop shadow, and ≥ 3 value steps
    of contrast with its panel. Dialogue boxes: reserve the bottom ~25 % of the screen and
    give each speaker a distinct border colour or portrait frame.
16. **1-bit icons:** pick the single most recognisable feature, rely on lines and regular
    angles, outline black or white, use double lines for contrast.

## By size

| Icon canvas | Art area | Colours | Highlight | Notes |
|-------------|----------|---------|-----------|-------|
| 8 px | 6×6 | outline + 2 | none or 1 px | one feature only; gem = 2 bands + 1 point |
| 16 px | 14×14 | outline + 3–4 | 1 px | 6 colours max; heart 7×7, gem 10×8, coin 8×8 |
| 24–32 px | 20–28 | outline + 4–5 | 1–2 px | add secondary shadow; 24×24 potion uses ~2 px margin |
| 48–64 px | 40–56 | outline + 5–7 | 2–3 px | texture and a rim light allowed |

Panels: 12×12 (3 px corners) to 16×16 (4 px corners); bars 5 px tall at 16 px games, 7–9 at
32 px. Hearts: 7×7 at 16 px games; 5×5 is the floor.

## Templates

**9-slice panel (12×12).** Slice at columns 3 and 9, rows 3 and 9: nine regions, corners
3×3. Use `applyBatch` `blit` to build any size: corners once, edge strips repeated, middle
filled.

```grid ui-9slice-panel
k = ui-outline  #181425
w = ui-light    #8b9bb4
f = ui-face     #5a6988
d = ui-shadow   #3a4466
---
.kkkkkkkkkk.
kwwwwwwwwwdk
kwffffffffdk
kwffffffffdk
kwffffffffdk
kwffffffffdk
kwffffffffdk
kwffffffffdk
kwffffffffdk
kwffffffffdk
kddddddddddk
.kkkkkkkkkk.
```

**Button up / down (14×8).** Same silhouette; pressed inverts the bevel. Shift the label 1 px
down-right in the pressed state.

```grid ui-button-up
k = ui-outline  #181425
w = ui-light    #8b9bb4
b = ui-face     #5a6988
d = ui-shadow   #3a4466
---
.kkkkkkkkkkkk.
kwwwwwwwwwwwdk
kwbbbbbbbbbbdk
kwbbbbbbbbbbdk
kwbbbbbbbbbbdk
kwbbbbbbbbbbdk
kddddddddddddk
.kkkkkkkkkkkk.
```

```grid ui-button-down
k = ui-outline  #181425
w = ui-light    #8b9bb4
b = ui-face     #5a6988
d = ui-shadow   #3a4466
---
.kkkkkkkkkkkk.
kdddddddddddwk
kdbbbbbbbbbbwk
kdbbbbbbbbbbwk
kdbbbbbbbbbbwk
kdbbbbbbbbbbwk
kwwwwwwwwwwwwk
.kkkkkkkkkkkk.
```

**Health bar (21×5), about 60 % full.** Fill = 12 px of 19; to change the value, repaint
the fill/trough boundary column. 3-slice: left cap 2 px, tiling middle, right cap 2 px.

```grid ui-bar-hp
k = ui-outline   #181425
L = hp-light     #ff596a
R = hp-base      #e43b44
D = hp-shade     #9e284b
e = trough-light #3a4466
d = trough-dark  #262b44
---
.kkkkkkkkkkkkkkkkkkk.
kLLLLLLLLLLLLeeeeeeek
kRRRRRRRRRRRRdddddddk
kDDDDDDDDDDDDdddddddk
.kkkkkkkkkkkkkkkkkkk.
```

**Heart: full / half / empty (7×7).** Half = left half filled. At 5×5 drop the highlight.

```grid ui-heart-full
k = ui-outline  #181425
R = heart-base  #e43b44
P = heart-light #ff97b1
---
.kk.kk.
kRRkRRk
kRPRRRk
kRRRRRk
.kRRRk.
..kRk..
...k...
```

```grid ui-heart-half
k = ui-outline  #181425
R = heart-base  #e43b44
P = heart-light #ff97b1
d = heart-empty #3a4466
---
.kk.kk.
kRRkddk
kRPRddk
kRRRddk
.kRRdk.
..kRk..
...k...
```

```grid ui-heart-empty
k = ui-outline  #181425
d = heart-empty #3a4466
---
.kk.kk.
kddkddk
kdddddk
kdddddk
.kdddk.
..kdk..
...k...
```

**Coin spin (8×8), frames face → three-quarter → edge.** Play face, 3/4, edge, 3/4 mirrored,
face at 80–100 ms, easing the widths; add a 1 px sparkle along the edge frame.

```grid ui-coin-face
k = coin-outline #5a3322
L = coin-light   #ffeb57
M = coin-base    #ffc825
D = coin-shade   #c9812a
---
..kkkk..
.kLLMMk.
kLMMMMDk
kLMDDMDk
kMMDDMDk
kMMMMDDk
.kMDDDk.
..kkkk..
```

```grid ui-coin-turn
k = coin-outline #5a3322
L = coin-light   #ffeb57
M = coin-base    #ffc825
D = coin-shade   #c9812a
---
...kk...
..kLMk..
.kLMMDk.
.kLMMDk.
.kMMMDk.
.kMMDDk.
..kMDk..
...kk...
```

```grid ui-coin-edge
k = coin-outline #5a3322
L = coin-light   #ffeb57
M = coin-base    #ffc825
D = coin-shade   #c9812a
---
...kk...
..kLMk..
..kMDk..
..kLMk..
..kMDk..
..kLMk..
..kMDk..
...kk...
```

**Gem (10×8 and 6×5).** 10 px: crown, girdle line, pavilion; 6 px: one kite of 4 facets; white point top-left, dark facet
bottom-right. Recolour the L/M/D ramp for each gem type; keep the construction.

```grid ui-gem-10
k = gem-outline #3f2832
W = gem-point   #ffffff
L = gem-light   #ff97b1
M = gem-base    #e43b44
D = gem-shade   #9e284b
---
..kkkkkk..
.kWLLMMMk.
kLLLMMMMDk
kkkkkkkkkk
.kLLMMDDk.
..kLMMDk..
...kMDk...
....kk....
```

```grid ui-gem-6
k = gem-outline #3f2832
W = gem-point   #ffffff
L = gem-light   #ff97b1
M = gem-base    #e43b44
D = gem-shade   #9e284b
---
.kkkk.
kWLMMk
kLMMDk
.kMDk.
..kk..
```

## Procedure

1. Fix the kit first: outline colour, 3–4 frame values, one accent, light direction. Put them
   in the palette (`palette` op `set`) before drawing any element.
2. Draw the 9-slice panel at its smallest size with `applyBatch` `grid`; check by assembling
   a 40×24 test panel with `blit`; judge with `render`.
3. Build bar, button and slot from the same corner and edge pieces (3-slice for bars).
4. Draw icons on a canvas with the margin from rule 9; fill flat first and apply the
   silhouette test (`replaceColor` on a copy, then `render`).
5. Make every icon of a set on its own frame or sheet cell; check them together as a grid
   (`render` at 1× and at the smallest shipped size).
6. Animations (coin, gem shine): `render` `filmstrip`; set durations (`setFrameDuration`), `addTag` the loop.
7. Run `validate`; fix off-palette and stray pixels. A deliberate 1 px highlight is not a stray.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Panel corners smear when resized | Stretched all nine slices | Corners fixed; tile only the edge strips |
| Bar looks flat or pasted | One fill colour | Three fill rows plus a lighter trough top row |
| Icon reads as blob | No silhouette, detail too small | One feature, rotate 30–45°, outline + 1 highlight |
| Set looks mismatched | Different light/outline per icon | Audit as a grid; redraw the outlier |
| Buttons shift when pressed | Pressed silhouette differs | Same outline; move only face and label by 1 px |
| HUD steals attention | Animated or saturated | Neutral frame, one accent, flash only on change |

## Review

- [ ] Panel corners are untouched in every size; edges tile cleanly.
- [ ] Light direction and outline weight are identical across panel, bar, button, icons.
- [ ] The icon passes the silhouette test and has a 1 px margin at 16 px.
- [ ] Health display style matches the game; empty/half/full states are distinguishable at 1×.
- [ ] Pressed and normal buttons share a silhouette.
- [ ] Text on the UI has an outline or shadow and ≥ 3 value steps of contrast.
- [ ] No more than one accent colour per screen region.

## Sources

- Saint11 tutorials: UI-9-Slice, 1-bit icons, Shine; Slynyrd Pixelblog 24 (items) and 26 (UX/UI basics, health styles).
- Silber, *Pixel Art for Game Developers*, 9-slice versus 3-tile tilesets.
- Icon-design guidance for margins and test sizes (generic, secondary); Mestre, *Framed Ink* (dialogue placement).
- Gem and coin motion from Saint11 gem tutorial and GDA sparkle notes; bevel recipe and button states are ours (derived).
