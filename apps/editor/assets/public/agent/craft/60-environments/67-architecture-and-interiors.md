# Architecture and interiors

Everybody knows what a wall, a door and a window look like, so errors show at once: bricks like plastic sheets, windows that are holes, a door the size of a shutter, a roof with no overhang or eave shadow, rooms with no wall at all. This file is how to build facades, brickwork, openings, roofs and rooms on a tile grid. Seams and edges: `craft/60-environments/66-tiles-and-autotiling.md`; ground: `craft/60-environments/65-ground-rocks-grass.md`; true perspective and iso: `craft/70-objects/70-perspective.md`, `craft/70-objects/71-isometric.md`.

## Rules

**Structure**

1. **Volumes first, texture last.** Box → roof slightly larger than the body → doors and windows (with depth) → base light and shadow → textures. In flat colour the building must already read; shade after.
2. **One view, one roof pitch.** In 3/4 front view draw the facade straight on, cut the wall height to about half, put a roof band on top at 1:1 or 2:1. Consistency beats realism: use the same pitch on every building. In top-down houses bend a few lines for a hint of perspective, then straighten the silhouette with a stone base course.
3. **Respect the grid.** Building sizes are multiples of 16 × 16 cells. The foundation stays inside its cells; only the top may exceed them by a few px. Never break the bottom or the sides: that is where layer order breaks.
4. **Give it a base and a life.** A tall building needs a plinth, steps or flared foot; add two or three functional props (chimney smoke, sign, vent, laundry) so it looks inhabited. Slight asymmetry and sag read as age and weight.

**Brick and stone**

5. **Brick sizes must divide the tile.** With 1 px mortar the pitch (brick + mortar) must divide 16: bricks 7, 3 or 1 px, pitch 8, 4, 2. Default at 16 px: 7 × 3 bricks, pitch 8 × 4, alternate courses shifted by half a pitch (4 px). Other sizes leave a half-brick at the wrap.
6. **Mortar first, then bricks, then light, then damage.** Mortar lines make the tile wrap; bricks that leave one edge must continue on the opposite edge. Dark mortar vs light mortar changes the whole feel.
7. **Imply, do not outline every brick.** Top row of each brick lit, face mid, mortar dark; alternate two face tones; make 2–4 bricks chipped, protruding (keep highlight) or sunk (lose it). A perfectly regular grid looks plastic.
8. **Top faces are brighter than side faces**, and on a vertical face the visible brick is shorter than on a top face. Use columns or pillars as universal corner pieces instead of four custom corners.
9. **Every heavily used wall tile gets a crack or stain variant** that changes only its centre (`craft/60-environments/66-tiles-and-autotiling.md`). Cracks are short and branch, not exaggerated; mossy and window-with-figure variants break the repetition cheaply.

**Openings**

10. **Door**: stone frame, lit lintel, shadow row under the lintel, planks 2 px wide with a 1 px dark gap, iron straps, brass handle, a step. The opening is at least ¾ of the tallest character's height (derived: 24 px opening beside a 32 px sprite in `arch-door-16x32`). Doors carry weight: a path leads to one.
11. **Window**: 1 px frame, panes, mullion 2 px at 16 px (1 px at 32, none at 8), sill 1 px wider than the frame on each side, shadow row under the sill. Glass is the darkest value on the wall by day; a 2-px diagonal glint on two of four panes sells it. Never draw a window as a black hole.
12. **Lit windows** (night): warm saturated glass, one L-shaped light patch per pane (not concentric squares), a dark silhouette in one pane. Lit window edges stay crisp, everything else loses contrast.
13. **Placement**: a front is window | door | window, door centred, 3 tiles wide (48 × 16). Vary length, door position and window type to get many buildings from few tiles.

**Roofs**

14. **A roof is a mostly flat plane with a two-colour texture, not a gradient.** Shingles: courses offset by half a shingle, light top row, shade bottom row, dark rounded corners, a few worn shingles in a second tone. Overhang 1 px per side and a 2-row eave shadow on the wall below it.
15. **Roof colour is the accent**: saturated against desaturated stone; a dot for a chimney, smoke above it.

**Interiors and distance**

16. **Room anatomy**: floor tile, wall tile, baseboard strip between them, no empty pixels so it tiles. Wall height is the same in every room (2–3 tiles, furniture height included); furniture stands in front of the wall, not on it; one wall style per building.
17. **Interior values**: walls low in saturation and temperature, foreground furniture saturated and contrasty, posters and paintings low contrast and 2–3 colours, hue variation on walls without a large jump. Dither only for fabric and keyboards.
18. **Plausible rooms**: footprint roughly matches the exterior; stairs need clear floor beyond and must not run into an outer wall; a room has a purpose (shop = counter + shelves, not a bed).
19. **Far buildings**: rectangles with window dots and a roofline; variety from height, colour and window pattern; fewer colours the further away (drop the darkest colour on the farthest). Each building on its own layer.
20. **Night**: structure in flat dark blocks → signage → lighting; warm desaturated near the street, cooler toward the top. Only lit windows and roof edges keep crisp contours.

## By size

| Size | Brick | Window | Door | Roof |
|------|-------|--------|------|------|
| 8 px (derived) | 3 × 1 + mortar, pitch 4 × 2 | 2 × 2 glass, 1 px frame, no mullion | 4 wide, 7 tall, 1 plank gap | 2 tones, no shingles |
| 16 px | 7 × 3 + mortar, pitch 8 × 4 | 4 panes 4 × 4, 2 px mullion, sill (12 × 13 with frame) | 10 × 24 opening in a 14 × 32 frame | courses 4 rows high, 8 px scales (two per tile), alternate courses offset 4 px |
| 32 px | 7 × 3 or 15 × 3, 3 tones | 7 × 5 with 5 × 3 glass, 1 px mullion | 6 × 13, planks 2 px | 9-row hip roof, course every 3 rows |
| 64 px | 3 tones plus light/dark mortar, damage | frame, recess shadow, sill, curtain | panels, hinges, lintel stones | per-shingle detail, chimney, ridge |

## Templates

- `arch-brick-16` — running-bond brick, 7 × 3, two tones, chips; wraps on both axes.
- `arch-window-16` — four-pane window on plaster, sill and shadow. For the night variant swap glass for warm yellow and add an L-shaped light patch per pane.
- `arch-door-16x32` — wooden double door in a stone frame with lintel and step; drops into a wall tile pair.
- `arch-roof-shingle-16` — fish-scale shingles, 8 px scales with a dark scallop gap, courses offset 4 px, one worn scale per two courses; wraps on both axes.
- `arch-house-front-32` — roof, wall, windows, door and base assembled at 32 px, with the eave shadow.
- `arch-floor-planks-16` — interior floor; long boards with staggered joints.

```grid arch-brick-16
m = mortar       #3b2f33
h = brick-light  #d98a5f
s = brick-mid    #b5593f
t = brick-alt    #a14a3c
---
hhhhhhhmhhhhhhhm
hssssssmhttttttm
hssssssmhttttttm
mmmmmmmmmmmmmmmm
hhhmhhhhhhhmhhhh
tttmhssssssmhttt
tttmhssssssmhttt
mmmmmmmmmmmmmmmm
hhhhhhhmhhhhhhhm
hssssssmhttttttm
hssssssmhttttttm
mmmmmmmmmmmmmmmm
hhhmhhhhhhhmhhhh
tttmhssssssmhttt
tttmhssssssmhttt
mmmmmmmmmmmmmmmm
```

```grid arch-window-16
w = wall-plaster  #cdb9a0
f = frame-wood    #6b4a3a
g = glass         #2f4a6b
h = glass-glint   #9cc3e0
s = sill-stone    #ebe3d2
d = sill-shadow   #8f7d6b
---
wwwwwwwwwwwwwwww
wwffffffffffffww
wwfhgggffhgggfww
wwfghggffggggfww
wwfggggffggggfww
wwfggggffggggfww
wwffffffffffffww
wwffffffffffffww
wwfhgggffhgggfww
wwfggggffghggfww
wwfggggffggggfww
wwfggggffggggfww
wwffffffffffffww
wssssssssssssssw
wwddddddddddddww
wwwwwwwwwwwwwwww
```

```grid arch-door-16x32
F = stone-light    #cfcdd9
f = stone-mid      #9c9aa8
S = stone-shadow   #615f73
W = plank-light    #b5794a
p = plank-mid      #8a5a3c
q = plank-dark     #4b2f27
i = iron           #2f2d3a
j = rivet          #8c8aa0
y = handle-brass   #e0b64a
---
................
................
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF
SSSSSSSSSSSSSSSS
.Fffqqqqqqqqfff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.Ffijiiijiijiff.
.Ffiiiiiiiiiiff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqyqWpyWpff.
.FfWpqyqWpyWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.Ffijiiijiijiff.
.Ffiiiiiiiiiiff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
.FfWpqWqWpqWpff.
FFFFFFFFFFFFFFFF
ffffffffffffffff
.SSSSSSSSSSSSSS.
```

```grid arch-roof-shingle-16
l = shingle-light #d8785a
m = shingle-mid   #b04e46
s = shingle-shade #8c3b44
d = shingle-gap   #5a2a3a
n = shingle-worn  #a2444a
---
lmmmmmmmlmmmmmmm
lmmmmmmslmmmmmms
dmmmmmsddmmmmmsd
ddssssddddssssdd
nnnnlmmmmmmmlnnn
nnnslmmmmmmslnnn
nnsddmmmmmsddnnn
ssddddssssddddss
lmmmmmmmlmmmmmmm
lmmmmmmslmmmmmms
dmmmmmsddmmmmmsd
ddssssddddssssdd
mmmmlnnnnnnnlmmm
mmmslnnnnnnslmmm
mmsddnnnnnsddmmm
ssddddssssddddss
```

```grid arch-house-front-32
o = roof-outline  #3d2230
l = roof-light    #d8785a
m = roof-mid      #b04e46
d = roof-dark     #7a3544
v = wall-shadow   #a89580
w = wall-plaster  #cdb9a0
t = timber        #6b4a3a
f = frame-wood    #6b4a3a
g = glass          #2f4a6b
h = glass-glint   #9cc3e0
s = sill-stone     #ebe3d2
p = door-plank    #8a5a3c
q = door-dark     #4b2f27
y = handle-brass  #e0b64a
B = base-light    #b8b6c4
b = base-mid      #8a889c
j = base-joint    #5f5d78
---
......ollllllllllllllllllo......
.....ommdmmmdmmmdmmmdmmmdmo.....
....oddddddddddddddddddddddo....
...ollllllllllllllllllllllllo...
..ommmdmmmdmmmdmmmdmmmdmmmdmmo..
.oddddddddddddddddddddddddddddo.
ollllllllllllllllllllllllllllllo
dmmmdmmmdmmmdmmmdmmmdmmmdmmmdmmm
dddddddddddddddddddddddddddddddd
.ttvvvvvvvvvvvvvvvvvvvvvvvvvvtt.
.ttvvvvvvvvvvvvvvvvvvvvvvvvvvtt.
.ttwwwwwwwwwwwwwwwwwwwwwwwwwwtt.
.ttwfffffffwwwwwwwwwwfffffffwtt.
.ttwfhgfhgfwffffffffwfhgfhgfwtt.
.ttwfggfggfwwqpqqpqwwfggfggfwtt.
.ttwfggfggfwwppqqppwwfggfggfwtt.
.ttwfffffffwwppqqppwwfffffffwtt.
.ttssssssssswppqqppwssssssssstt.
.ttwvvvvvvvwwppqqppwwvvvvvvvwtt.
.ttwwwwwwwwwwppqqpywwwwwwwwwwtt.
.ttwwwwwwwwwwppqqppwwwwwwwwwwtt.
.ttwwwwwwwwwwppqqppwwwwwwwwwwtt.
BBBBBBBBBBBBBppqqppBBBBBBBBBBBBB
bbbbjbbbbbbjbppqqppbbbbbbjbbbbbb
jbbbbbbjbbbBBBBBBBBBBjbbbbbbjbbb
bbbbjbbbbbbbbbbbbbbbbbbbbjbbbbbb
```

```grid arch-floor-planks-16
m = plank-gap    #3d2a2a
h = plank-light  #c28a58
s = plank-mid    #a56f46
t = plank-alt    #96623f
g = grain         #7d4f35
---
hhhhhmhhhhhhhhhh
sssssmhsssssssss
sssssmhssggsssss
mmmmmmmmmmmmmmmm
hhhhhhhhhhhhmhhh
ttttttttttttmhtt
tttggtttttttmhtt
mmmmmmmmmmmmmmmm
hmhhhhhhhhhhhhhh
smhsssssssssggss
smhsssssssssssss
mmmmmmmmmmmmmmmm
hhhhhhhhmhhhhhhh
ttttttttmhtttttt
ttttttggmhtttttt
mmmmmmmmmmmmmmmm
```

## Procedure

1. Fix the grid, light direction (upper-left) and a palette of 4–6 swatches per material (`palette` op `ramp` per material; stone cool, wood warm).
2. Block the facade in flat colour with `applyBatch` `fillRect`: roof band, wall, base, openings. `render` at 1× and squint: roof, wall and base must separate by value.
3. Tile materials first: brick or plaster tile via `applyBatch` `grid` from the template, wrap-tested as in `craft/60-environments/66-tiles-and-autotiling.md`.
4. Openings: frame, then glass, then sill and shadow row; door planks before straps before handle.
5. Eave shadow: 2 rows under the roof, then drop shadows under sills and lintels. One light direction.
6. Chip and crack the brick, then add a variant tile; `readPixels` `format:"grid"` to check no crack touches the tile border.
7. Subtle outline last: a slightly darker version of the adjacent colour, not black (`craft/00-core/04-outlines-and-edges.md`).
8. Interiors: floor tile, wall tile, baseboard; then furniture on a separate layer; then `render` at game scale.
9. `validate` (`strays`, `palette`); `render` with the layers hidden one by one to check overlap order.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Brick wraps with a half brick | Pitch does not divide the tile | Pitch 8 × 4 at 16 px; offset 4 |
| Brick looks like plastic | Every brick the same, outlined, evenly shaded | Two face tones, chips, some bricks without highlight |
| Window reads as a hole | Single dark rectangle | Frame + panes + mullion + sill + glint |
| Glowing windows look flat | Concentric squares in the glass | L-shaped light patch, silhouette |
| Roof is one flat colour | No courses, no eave | Staggered shingles, eave shadow row |
| Building floats | No base, shadow, or footprint off the grid | Plinth or step, drop shadow, stay on 16 px cells |
| Door too small for the player | Sized to the wall, not the sprite | Opening ≥ ¾ of character height |
| Rooms feel like boxes | No baseboard, furniture on the wall | Baseboard strip, furniture in front of the wall |
| Far buildings steal focus | Same contrast as the near ones | Fewer colours, lower contrast, window dots |

## Review

- Facade reads in flat colour at 1×: roof, wall and base separate by value.
- One light direction on bricks, sills, lintels and eave shadows; no outline on every brick.
- Brick pitch divides the tile and the tile wraps on both axes.
- Window has frame, panes, sill and shadow; door has frame, lintel, planks, handle and step.
- Roof is two-tone with courses, overhangs the wall and casts an eave shadow.
- Building edges sit on the grid; only the top overshoots.
- Interior wall height is constant, furniture stands in front of the wall, the room has a purpose.
- Far buildings use fewer colours than near ones.

## Sources

- Silber, *Pixel Art for Game Developers*, ch. 9: city layer (brick wall, window, ledge, 10-tile building set).
- Slynyrd, *Pixelblog* 14, 16, 34, 35, 45 (bricks, walls, doors), 51 (city builder), 57 (castles) — slynyrd.com/pixelblog-catalogue.
- Saint11 tutorials *City*, *Top-Down-Houses*, *Indoors*, *Ruins* — saint11.art/blog/pixel-tutorials.
- Videlais, building-tile tutorial (window and shingle numbers); gamedesign.wikidot, *Brick wall I*; RPG Maker MZ interior-mapping guide.
- Robertson, *How to Draw*, pp. 58–65, 104–121 (volumes first); Solarski, *Drawing Basics and Video Game Art* (building anatomy, doorways).
- Tsugumo, *So You Want To Be A Pixel Artist?* ch. 3–5 (brick variants, town analysis).
