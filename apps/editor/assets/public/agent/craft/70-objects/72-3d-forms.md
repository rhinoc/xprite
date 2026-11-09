# 3D forms: circles, spheres, cylinders, cubes

A square is a shape, a cube is a form: the difference is light. Without a decided light and a decided way each form turns, agents produce pillow shading, gradients on flat faces, and circles that are "about round". This file gives the exact circles and ellipses, and how each primitive is lit. Isometric placement is in `71-isometric`; materials in `22-materials-hard`.

## Rules

1. **Everything is box, sphere, cylinder, cone.** Reduce an object to these first, shade second. Combine by pushing one into another; the join line follows the surface it lies on and never contradicts it.
2. **State the light once** (upper left unless told) and keep it in every frame (`02-shading-and-light`). One main light; a second one is fainter and differently coloured.
3. **Flat faces are one flat colour.** A cube lit from one side has exactly three (top, side A, side B). A gradient on a plane is "soft face"; darkening around the outline with no source is pillow shading. Both are errors.
4. **Curved faces use a ramp along the curve only.** Colour changes in the direction of the turn: sphere radially from the light point, cylinder by column, cone along its slope. Value shifts equal surface changes: box = abrupt, cylinder = quicker, sphere = slow.
5. **Keep the terminator hard.** Pixel art wants 3–5 crisp bands, no smooth blends and no dither inside a 16 px form. Equal-width concentric rings read as a target: let band width vary.
6. **Light vocabulary, cut to size:** highlight (lit mass), specular (one bright dot, glossy things only), light, mid, terminator, core shadow (inside the shadow, not on the contour), reflected light (a 1 px band on the shadow rim, the lightest entry of the shadow side, hue of the ground), cast shadow (hard, darkest at contact). Below 16 px keep highlight + 2–3 bands; reflected light only from D ≥ 12.
7. **Sphere recipe:** circle mask from the table below, then bands by distance from the light-facing point: highlight cluster, light, mid, shade, core, optional reflected rim. Highlight is a compact teardrop, never a single orphan pixel. Glossy sphere: add a specular crescent; matte: no specular.
8. **Cylinder recipe:** each pixel column has a normal angle; colour is a function of that. Light from the left, bands left to right: edge-light, highlight stripe 1–3 px slightly inside the lit edge, light, mid, shade, core. Rings are wrong. Column strings (derived; 3 light, H highlight, 2 mid, 1 shade, 0 core): W=8 `3HH33210`, W=12 `3HHH33322110`, W=16 `3HHHHH3332221100`. Grips, bottle necks, pillars, and barrels are cylinders.
9. **Cone and pyramid:** each plane is flat with its own value; a cone is a lit band plus a shadow band over an elliptical base.
10. **Cube and box:** top 1 (lightest), lit side 2, far side 3. Optional rim on the top edge. Oblique cube: front flat, top slanted 1:1, side slanted 1:1 (template). Iso version: `71-isometric`.
11. **Small circle parity.** Odd diameter: one centre pixel, one widest row. Even: a 2×2 core, two widest rows. Edge runs shorten at a steady rate to the 45° point, then the pattern turns; no run of 1 beside a run of 3, no doubled corner. The table below is that rule, symmetric, corners empty.
12. **`applyBatch` `fillEllipse` draws exactly this table** for D=4–16 and the 2:1 ellipses below, so a plain circle or floor ellipse can be one op. D=3 comes out a 3×3 square: stamp the plus from the template instead. Shaded forms still go through the grid templates, which carry the bands. Above these sizes, check the result with `render` `readPixels` `format:"grid"` against the parity rule before trusting it.
13. **Ellipse = circle seen at an angle.** Minor/major = sin(angle between sight line and the circle's plane): 15° → 0.26, 20° → 0.34, 30° → 0.5 (the iso 2:1 case), 50° → 0.77, 90° → circle. The minor axis is the axle: perpendicular to the surface the circle sits on (a wheel's axle, a cylinder's centre line). Match parity: even width with even height, odd with odd.
14. **Several rings on one axis** (tyre, hub, bolt, stacked disks): same axle, same centre, only the degree changes (rounder toward the viewer). Rows of wheels, barrels or pillars: the one nearest the view centre is the flattest, each toward the margin 1 px rounder; never identical widths.
15. **Below ~6 px wide an ellipse is a 3–6 px line with offset ends.** Do not draw a ring.
16. **Cast shadow follows the form:** sphere → ellipse, cylinder → stretched ellipse, cube → parallelogram from projecting its edges. Short, one direction, one dark colour.
17. **Materials change the rules, not the form:** metal = hard stacked light/shadow stripes, lights cooler and less saturated, darks warmer; glass = border and a few curved highlights; matte = low contrast (`22-materials-hard`).

## By size

| Size | Sphere / cylinder | Cube | Circle & ellipse |
|------|------------------|------|-------------------|
| 8 | 3 tones + highlight pixel; cylinder 2 bands | 3 flat values, no rim | D=3–8, boxy |
| 16 | 4 tones + highlight cluster; reflected light from D=12 | + 1 px top rim | D=9–16, any 2:1 up to 16×8 |
| 32 | 5 tones + specular if glossy + bounce; no dither | + cast shadow | 2:1 up to 32×16 |
| 64 | + texture bands, cast shadow with contact darkening | + inner detail | 2:1 up to 64×32 |

Band counts per size are derived from rules 5–8; the circle data below is exact.

Top-half row widths (top → equator, mirror for the rest; odd D lists the middle row too):

| D | widths | D | widths |
|---|--------|---|--------|
| 3 | 1,3 | 10 | 4,8,8,10,10 |
| 4 | 2,4 | 11 | 5,7,9,11,11,11 |
| 5 | 3,5,5 | 12 | 4,8,10,10,12,12 |
| 6 | 4,6,6 | 13 | 5,9,11,11,13,13,13 |
| 7 | 3,5,7,7 | 14 | 6,8,10,12,14,14,14 |
| 8 | 4,6,8,8 | 15 | 5,9,11,13,13,15,15,15 |
| 9 | 5,7,9,9,9 | 16 | 6,10,12,14,14,16,16,16 |

Alternates when a rounder look is wanted (orbs, not coins or wheels): D=6 `2,4,6,6,4,2`, D=9 `3,7,7,9,9,9,7,7,3`. Hollow ring: subtract the circle of D−2t centred in the same box. 2:1 ellipses (top → equator, then mirrored; the last width repeats on the equator rows): 8×4 `6,8`; 12×6 `6,10,12`; 16×8 `8,12,14,16`; 20×10 `8,14,18,20,20`; 24×12 `10,16,20,22,24,24`; 32×16 `12,18,24,26,28,30,32,32`; 48×24 `14,24,30,34,38,40,42,44,46,46,48,48`; 64×32 `16,28,34,40,44,48,52,54,56,58,60,62,62,64,64,64` (generated from the parity rule, matching the rendered templates).

## Templates

**forms-circles-3-8**, **-9-12**, **-13-16** — filled circles D = 3…16. One transparent column between neighbours; take circle D from the column whose width is D. Use boxy forms for coins and wheels that must fill their cell.

```grid forms-circles-3-8
C = shape          #8c7bb0
---
.C...CC...CCC...CCCC....CCC.....CCCC..
CCC.CCCC.CCCCC.CCCCCC..CCCCC...CCCCCC.
.C..CCCC.CCCCC.CCCCCC.CCCCCCC.CCCCCCCC
.....CC..CCCCC.CCCCCC.CCCCCCC.CCCCCCCC
..........CCC..CCCCCC.CCCCCCC.CCCCCCCC
................CCCC...CCCCC..CCCCCCCC
........................CCC....CCCCCC.
................................CCCC..
```

```grid forms-circles-9-12
C = shape          #8c7bb0
---
..CCCCC......CCCC.......CCCCC........CCCC....
.CCCCCCC...CCCCCCCC....CCCCCCC.....CCCCCCCC..
CCCCCCCCC..CCCCCCCC...CCCCCCCCC...CCCCCCCCCC.
CCCCCCCCC.CCCCCCCCCC.CCCCCCCCCCC..CCCCCCCCCC.
CCCCCCCCC.CCCCCCCCCC.CCCCCCCCCCC.CCCCCCCCCCCC
CCCCCCCCC.CCCCCCCCCC.CCCCCCCCCCC.CCCCCCCCCCCC
CCCCCCCCC.CCCCCCCCCC.CCCCCCCCCCC.CCCCCCCCCCCC
.CCCCCCC...CCCCCCCC..CCCCCCCCCCC.CCCCCCCCCCCC
..CCCCC....CCCCCCCC...CCCCCCCCC...CCCCCCCCCC.
.............CCCC......CCCCCCC....CCCCCCCCCC.
........................CCCCC......CCCCCCCC..
.....................................CCCC....
```

```grid forms-circles-13-16
C = shape          #8c7bb0
---
....CCCCC.........CCCCCC..........CCCCC...........CCCCCC.....
..CCCCCCCCC......CCCCCCCC.......CCCCCCCCC.......CCCCCCCCCC...
.CCCCCCCCCCC....CCCCCCCCCC.....CCCCCCCCCCC.....CCCCCCCCCCCC..
.CCCCCCCCCCC...CCCCCCCCCCCC...CCCCCCCCCCCCC...CCCCCCCCCCCCCC.
CCCCCCCCCCCCC.CCCCCCCCCCCCCC..CCCCCCCCCCCCC...CCCCCCCCCCCCCC.
CCCCCCCCCCCCC.CCCCCCCCCCCCCC.CCCCCCCCCCCCCCC.CCCCCCCCCCCCCCCC
CCCCCCCCCCCCC.CCCCCCCCCCCCCC.CCCCCCCCCCCCCCC.CCCCCCCCCCCCCCCC
CCCCCCCCCCCCC.CCCCCCCCCCCCCC.CCCCCCCCCCCCCCC.CCCCCCCCCCCCCCCC
CCCCCCCCCCCCC.CCCCCCCCCCCCCC.CCCCCCCCCCCCCCC.CCCCCCCCCCCCCCCC
.CCCCCCCCCCC..CCCCCCCCCCCCCC.CCCCCCCCCCCCCCC.CCCCCCCCCCCCCCCC
.CCCCCCCCCCC...CCCCCCCCCCCC...CCCCCCCCCCCCC..CCCCCCCCCCCCCCCC
..CCCCCCCCC.....CCCCCCCCCC....CCCCCCCCCCCCC...CCCCCCCCCCCCCC.
....CCCCC........CCCCCCCC......CCCCCCCCCCC....CCCCCCCCCCCCCC.
..................CCCCCC........CCCCCCCCC......CCCCCCCCCCCC..
..................................CCCCC.........CCCCCCCCCC...
..................................................CCCCCC.....
```

**forms-ellipses-2to1** — iso floor circles 8×4, 12×6, 16×8, 24×12: shadows, tops of cylinders, pond rims, magic circles.

```grid forms-ellipses-2to1
C = shape          #8c7bb0
---
.CCCCCC.....CCCCCC........CCCCCCCC............CCCCCCCCCC.......
CCCCCCCC..CCCCCCCCCC....CCCCCCCCCCCC.......CCCCCCCCCCCCCCCC....
CCCCCCCC.CCCCCCCCCCCC..CCCCCCCCCCCCCC....CCCCCCCCCCCCCCCCCCCC..
.CCCCCC..CCCCCCCCCCCC.CCCCCCCCCCCCCCCC..CCCCCCCCCCCCCCCCCCCCCC.
..........CCCCCCCCCC..CCCCCCCCCCCCCCCC.CCCCCCCCCCCCCCCCCCCCCCCC
............CCCCCC.....CCCCCCCCCCCCCC..CCCCCCCCCCCCCCCCCCCCCCCC
........................CCCCCCCCCCCC...CCCCCCCCCCCCCCCCCCCCCCCC
..........................CCCCCCCC.....CCCCCCCCCCCCCCCCCCCCCCCC
........................................CCCCCCCCCCCCCCCCCCCCCC.
.........................................CCCCCCCCCCCCCCCCCCCC..
...........................................CCCCCCCCCCCCCCCC....
..............................................CCCCCCCCCC.......
```

**forms-spheres-8-12-16** — shaded spheres, light upper left (x 0–7, 9–20, 22–37). Map `H, 3, 2, 1, 0, b` onto a 5–6 step ramp from `palette` op `ramp`. `b` is reflected light, present from D=12.

```grid forms-spheres-8-12-16
0 = core-shade     #5f4361
1 = shade          #8d5b63
2 = mid            #bb7d5e
3 = light          #e0a96d
H = highlight      #fbe7b8
b = bounce         #8a6a78
---
..3332.......3333..........333322.....
.HH3322....HHH33322......3HH3333222...
3H333210..3HHH333221....3HHH33332221..
33332210..3HH3332221...3HHHH333322211.
23322110.33333332211b..3HHH3333322211.
22221100.33333322211b.333333333222211b
.111100..23332222110b.333333332222110b
..0000...22222221100b.333333322222110b
..........222211100b..233333222221110b
..........111111000b..222222222211100b
...........111000bb...222222222111000b
.............bbbb......2222221111000b.
.......................1111111110000b.
........................11111100000b..
.........................00000000bb...
...........................bbbbbb.....
```

**forms-cylinder-side-12** — side-on pillar, grip, bottle neck; the bands are columns.

```grid forms-cylinder-side-12
0 = core-shade     #685a6e
1 = shade          #8c7480
2 = mid            #b29679
3 = light          #d4bb93
H = highlight      #f3e7c4
---
.HHH3332211.
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
3HHH33322110
.HHH3332211.
..HH333221..
```

**forms-cube-oblique-10** — three-value box in oblique projection: lightest top, mid front, dark side. Crates, tables, blocks in 3/4 top-down art.

```grid forms-cube-oblique-10
T = top-lightest   #e6d6ac
F = front-mid      #b79a7d
S = side-dark      #7e6574
---
.....TTTTTTTTTT
....TTTTTTTTTTS
...TTTTTTTTTTSS
..TTTTTTTTTTSSS
.TTTTTTTTTTSSSS
FFFFFFFFFFSSSSS
FFFFFFFFFFSSSSS
FFFFFFFFFFSSSSS
FFFFFFFFFFSSSSS
FFFFFFFFFFSSSSS
FFFFFFFFFFSSSS.
FFFFFFFFFFSSS..
FFFFFFFFFFSS...
FFFFFFFFFFS....
FFFFFFFFFF.....
```

## Procedure

1. Pick the form and its diameter/size; stamp the circle/ellipse template (`applyBatch` `grid`) or paint the row widths from the table; `applyBatch` `fillEllipse` gives the same outline.
2. Build the ramp first: `palette` op `ramp` from the base colour, 4–6 steps, hue-shifted.
3. Fill by band: map template glyphs to ramp colours in the grid legend; for a new size scale the template band by band, keeping the terminator hard.
4. Add the cast shadow on a separate layer, one dark colour.
5. `render` at 1×, then `readPixels` `format:"grid"` to check no orphan highlight pixels and no ring-shaped bands.
6. `validate`; outline last if the style has one.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Ball looks like a target | Equal-width concentric bands | Vary band width; move rings off-centre toward the light |
| Edges look dirty, form flat | Pillow shading | Shade from a light direction, not from the outline inward |
| Circle looks square or lumpy | `ellipse` op or eyeballed runs | Use the table; no 1 beside 3 |
| Cylinder looks banded like a coil | Horizontal rings | Bands are columns |
| Cube faces fade smoothly | Gradient on a plane | One flat colour per face |
| Wheel row looks stamped | Identical ellipses | Flattest at view centre, rounder outward |
| Twisted cylinder | Ellipse not square to its axis | Redraw both ends from one axis line |

## Review

- Each form has exactly the bands its type allows; flat faces are flat.
- Terminator is crisp; no dither or gradient inside forms below 32 px.
- Highlight is a cluster of ≥ 2 px; no lone bright pixels.
- Circles/ellipses match the table or look the same when flipped on both axes.
- Light comes from the same side on every form; shadow falls the other way.
- Reflected light is lighter than core shadow but darker than the lit side.

## Sources

- Pixel Logic (Ch. 6, shapes into objects, circles); Dawe, *Make Your Own Pixel Art* (shading primitives).
- Saint11, Shading (faces, terminator, bounce); Perbal cylinder-gradient notes.
- Robertson & Bertling, *How to Draw* (ellipse anatomy, degrees, offset ellipses).
- Hampton, *Figure Drawing: Design and Invention* (form timing); Loomis (block forms).
- Gurney, *Color and Light* (sphere light zones); Slynyrd, Pixelblog 6 (light and shadow).
