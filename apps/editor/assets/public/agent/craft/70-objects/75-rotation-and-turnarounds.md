# Rotation, turnarounds and pseudo-3D

Rotating pixel art with an algorithm shreds it: diamonds, skewed squares, smeared
outlines, new colours. Turning a character or object means redrawing it at each angle
with the same volume, height and palette, or building it from 3D on purpose. This file
covers direction sets, objects that spin, and the pseudo-3D tricks (stacking, 3D
render) that avoid hand redrawing. Walk/run sets in `craft/40-animation/42-walk-and-run.md` and
`craft/40-animation/47-top-down-animation.md`; character views in `craft/30-characters/37-views-and-directions.md`.

## Rules

1. **Never rotate pixel art by algorithm.** 90° steps and flips are safe. `rotate90` is
   the only rotation op, and `resizeSprite` `nearest` is the only non-destructive scale. Redraw
   each needed angle. For a spinning saw or blade at speed, smear it (motion blur) instead
   of rotating.
2. **If you must rotate,** use a pixel-art algorithm (RotSprite: enlarge ×8 with a
   similarity-tolerant Scale2×, rotate by nearest neighbour while shrinking back; or the
   fast ×3 variant), never add colours, and hand-clean afterwards with the list under
   Procedure. Treat the result as a draft.
3. **Clean angles for hand redraws:** 0°, 26.6° (1:2), 45° (1:1), 63.4° (2:1), 90°. A
   16-direction set is eight of these plus their mirrors; anything between is a different
   drawing, not a turned one.
4. **Lock the turnaround first.** Approve the four cardinal views, comparing height,
   shoulder width, head size, feet row and palette, before drawing diagonals. Write down
   handedness, which side carries straps or patches, and whether L/R mirroring is allowed.
5. **8 directions = draw 5 (S, SE, E, NE, N), mirror 3 (SW, W, NW).** Mirroring swaps every
   asymmetric detail (sword hand, scar), so draw all 8 if handedness matters. Diagonals are
   real three-quarter turns of the whole body, not a front pose with the eyes moved.
6. **Same cell size, same feet row, same palette and animation rhythm in every direction.**
   Keep one fixed row order for every sheet (idle, walk, attack) and one centre of mass, or
   the character bobs when the player turns. Pick the direction by 45° slices of the movement
   angle; update it only while moving. In iso games the four diagonals get most of the screen
   time (`craft/70-objects/71-isometric.md`).
7. **Front/back volume** (backpack, cape, tail) must shape the side silhouette consistently
   across views.
8. **Sheet maths:** 8 directions × 6 walk frames = 48 cells (a 384×512 sheet of 64×64 cells);
   with mirrored SW/W/NW only 30 are drawn. Layout (clockwise on screen):

   | Row | Direction | Source |
   |-----|-----------|--------|
   | 1 | E | drawn |
   | 2 | SE | drawn |
   | 3 | S | drawn |
   | 4 | SW | mirror of SE (check handedness) |
   | 5 | W | mirror of E |
   | 6 | NW | mirror of NE |
   | 7 | N | drawn |
   | 8 | NE | drawn |

9. **A spinning object is colour first, shape second.** Prepare a 12–16 swatch ramp dark →
   light. Key frames: turned 45° (two faces equal) and face-on (one face). Face widths are
   `S·cosφ` and `S·sinφ`; between keys each face changes in near-even 1 px steps while the
   visible corner sweeps with ease: slow at the sides, fast through the middle of the mass
   (the template steps φ by 15°, 6 frames per quarter turn; 12 frames at 100 ms is the
   smooth version). A face's colour moves along the ramp as it turns toward or away from
   the light.
10. **Fez-style faux 3D:** every receding line stays horizontal, only widths and colours
    change. Cheap, readable down to 12 px, works for lamps and crates.
11. **Coins and discs:** widths fall in larger steps as the disc nears edge-on, then rise
    mirrored (a 6-frame loop f1 f2 f3 f4 f3 f2, derived); the edge-on frame shows the rim
    colour; a shine travels along the edge, not across the face.
12. **Rotors and propellers:** 4 blades repeat every 90°, so 4 frames at 22.5° steps loop
    (50 ms each). Draw the base ring as a perfect circle (`craft/72-3d-forms.md`) and the
    blades on clean slopes (0, 1:2, 1:1, 2:1; the 4th frame is frame 2 flipped). Squash
    vertically for 3/4 views. Two blades repeat every 180° and need 8 frames at the same step.
13. **Aircraft roll, they do not pitch** (rotating clusters distorts them): 5 orientations,
    level plus two roll-up and two roll-down levels.
14. **Wheels while a vehicle turns:** the minor axis stays the axle; the ellipse degree
    changes; fix the axis first, then the degree. For an 8-direction vehicle rotate the
    construction, not the pixels: 0°, 45° and 90° each get their own box; in-between angles
    mix the long and short face widths (a 75/15 view shows the long side ≈ 85% of its length
    and the short face ≈ 25%).
15. **Sprite stacking:** each image is one horizontal slice of the object, drawn bottom to
    top; each slice is drawn 1 px higher on screen than the one below and rotated to the
    object's angle, so the pile reads as a rotating model. Practical to about 20×20×20; keep
    X and Y odd so there is a true centre; shadow is its own bottom slice; upper slices shrink
    (pyramid) or change colour (feet, body, head); side faces read darker than tops by
    darkening each slice's rim. Repeat each slice k times for a taller look; each animation
    frame is a new slice set, which is the cost.
16. **3D-to-pixel pipelines** pay off when there are many animations, retakes or reused
    parts. Render tiny, no anti-aliasing, cel-shaded, orthographic camera fixed (moving it
    breaks pixel alignment), integer nearest-neighbour scaling only. A 2:1 ground ratio
    needs camera tilt ≈ 60°, rotation 45° (true isometric 54.74° does not sit on the 2:1
    grid). 8-direction sheets rotate the model 45° per frame. Dead Cells-style: key poses
    only, interpolation frames before or after keys, never between; characters ≈ 50 px.
    Prefer hand-drawn roll or turn frames for small objects and few directions.
17. **Flicker is the known weakness:** pixels pop between frames. Keep palette indices
    stable, compare frames with onion skin, and accept a lower detail level for motion.
18. **Wind and tornado:** stacked spinning discs, all turning the same way.

## By size

| Size | Directions | Spinning object | Method |
|------|-----------|-----------------|--------|
| 8 | 4 (E mirrored to W) | 3–4 frames, widths only | hand, widths + colour |
| 16 | 4–8, mirror carefully | cube 6 frames (S=8–10), coin 4 widths, rotor 4 | hand, clean slopes |
| 32 | 8 drawn | 12 frames, face colours on a ramp | hand or small 3D render + cleanup |
| 64 | 8 (5 drawn + 3 mirrored if symmetric) | stacking or 3D render | 3D pipeline, hand repair of faces and hands |

## Templates

**rot-cube-turn-6** — cube, S=10, seen from above, φ = 0°, 15°, 30° / 45°, 60°, 75° (two rows
of three, 15 px cells). Top face (7) is a parallelogram whose edges run c:es and s:ec with
c=10,10,9,7,5,3 and s=0,3,5,7,9,10; the left face shrinks while the right grows; tones follow
the cosine to the light (left 6,6,5,5,4,3; right 2,2,3,4,5,5).
Loop by returning to frame 1 (φ=90° equals φ=0°). Replace the five glyph colours with
ramp entries.

```grid rot-cube-turn-6
2 = ramp-2         #3b3a78
3 = ramp-3         #4c5aa5
4 = ramp-4-mid     #5f78c7
5 = ramp-5         #7a98e0
6 = ramp-6         #9db8ef
7 = ramp-7-lightest #c4d8f8
---
...............................................
..7777777777........77777...........777........
..7777777777.......77777777777.....777777777...
..7777777777......777777777772....777777777773.
..7777777777......777777777722...7777777777733.
..7777777777.....7777777777722..55777777777333.
..6666666666.....6666677777222..55555557773333.
..6666666666.....6666666666222..55555555533333.
..6666666666.....6666666666222..55555555533333.
..6666666666.....6666666666222..55555555533333.
..6666666666.....6666666666222..55555555533333.
..6666666666.....6666666666222..55555555533333.
..6666666666.....6666666666222..55555555533333.
..6666666666.....666666666622...5555555553333..
..6666666666.....66666666662....555555555333...
..6666666666.....66666666662......555555533....
......................66666............553.....
...............................................
...............................................
...............................................
......77...............777............77777....
...7777777........777777777......77777777777...
.777777777777...477777777777.....37777777777...
57777777777774..4477777777777....377777777777..
55577777774444..44477777777755...3377777777777.
55555577444444..44447775555555...3337777755555.
55555554444444..44444555555555...3335555555555.
55555554444444..44444555555555...3335555555555.
55555554444444..44444555555555...3335555555555.
55555554444444..44444555555555...3335555555555.
55555554444444..44444555555555...3335555555555.
55555554444444..44444555555555...3335555555555.
55555554444444...4444555555555....335555555555.
.555555444444.....444555555555....335555555555.
...5555444.........445555555.......35555555555.
......54............455.............55555......
...............................................
```

**rot-coin-turn** — 12 px coin: widths 12, 10, 6 and the edge-on bar. Play f1 f2 f3 f4 f3 f2
(mirror the narrow frames horizontally).

```grid rot-coin-turn
K = outline        #2b1d2e
G = face           #f2c14e
g = face-shade     #c48a2d
W = glint          #fff4c2
E = edge-light     #d9a13a
e = edge-shade     #9a6a28
---
....KKKK.........KKKK..........KK...........KK.....
..KKGGGGKK......KGGGGK........KGGK.........KEeK....
.KGGWGGGGGK....KGWGGGGK.......KGGK.........KEeK....
.KGWGGGGGgK...KGWGGGGGgK.....KGGGGK........KEeK....
KGGGGGGGGGgK..KGGGGGGGgK.....KGGGgK........KEeK....
KGGGGGGGGGgK..KGGGGGGGgK.....KGGGgK........KEeK....
KGGGGGGGGGgK..KGGGGGGGgK.....KGGGgK........KEeK....
KGGGGGGGGGgK..KGGGGGGGgK.....KGGGgK........KEeK....
.KGGGGGGGgK...KGGGGGGGgK.....KGGGgK........KEeK....
.KGgGGGGggK....KGGGGGgK.......KggK.........KEeK....
..KKggggKK......KggggK........KggK.........KEeK....
....KKKK.........KKKK..........KK...........KK.....
```

**rot-rotor-4** — four-blade rotor at 0°, 26.6°, 45° and 63.4° (frame 4 = frame 2 flipped):
1 px blades on clean slopes (1:1, 1:2, 2:1 runs), light blade colour, 2 darker tip pixels, plus-shaped hub. Widen a blade to 2 px at the hub only when the sprite is larger than 16 px.

```grid rot-rotor-4
B = blade          #cfd6e4
b = blade-tip      #7d8aa6
H = hub            #3a3d4f
---
.......b..................b.....b.............b.....b..........
.......b..................b......b...........b......b..........
.......B.................B........B.........B........B.........
.......B.................B.........B.......B.........B.........
.......B........bb......B...........B.....B...........B......bb
.......B..........BB....B............B...B............B....BB..
.......H............BB.H..............BHB..............H.BB....
bbBBBBHHHBBBBbb.......HHH.............HHH.............HHH......
.......H...............H.BB...........BHB...........BB.H.......
.......B..............B....BB........B...B........BB....B......
.......B..............B......bb.....B.....B.....bb......B......
.......B.............B.............B.......B.............B.....
.......B.............B............B.........B............B.....
.......b............b............b...........b............b....
.......b............b...........b.............b...........b....
```

**rot-arrow-8dir** — a projectile in its eight clean directions, 9×9 each (E, SE, S, SW /
W, NW, N, NE). Diagonals use an L-shaped head, cardinals a V; the whole set is one E (and one
SE) mirrored and transposed, so every direction has the same length and weight.

```grid rot-arrow-8dir
A = arrow          #e8e0c8
F = fletching      #c8372d
---
............F..........FFF..........F..
...........F............A............F.
......A...F.A...........A...........A.F
F......A.....A..........A..........A...
FAAAAAAAA.....A.........A.........A....
F......A.......A........A........A.....
......A.........A.A...A.A.A...A.A......
.................AA....AAA....AA.......
................AAA.....A.....AAA......
.......................................
..........AAA...........A...........AAA
..........AA...........AAA...........AA
..A.......A.A.........A.A.A.........A.A
.A......F....A..........A..........A...
AAAAAAAAF.....A.........A.........A....
.A......F......A........A........A.....
..A.............A.F.....A.....F.A......
.................F......A......F.......
................F......FFF......F......
```

**rot-stack-slices-7** — four slices of a 7×7 pyramid for sprite stacking; draw slice i at
(x, y−i) and rotate each as one cel per layer. Rim darker than interior.

```grid rot-stack-slices-7
D = slice-rim-low  #3b2f4f
d = dark           #5d4a78
m = mid            #8a6fa8
l = light          #b99bd0
h = top            #e8d6f2
---
DDDDDDD........................
DdddddD..ddddd.................
DdddddD..dmmmd....mmm..........
DdddddD..dmmmd....mlm......h...
DdddddD..dmmmd....mmm..........
DdddddD..ddddd.................
DDDDDDD........................
```

## Procedure

1. Decide directions (4 / 8), frame counts and the cell size; write down handedness and
   mirror rules.
2. Draw the cardinal views on one layer each (`addLayer`), same cell, same feet row.
   `render` them side by side; fix height and shoulder width now.
3. Add diagonals as true three-quarter turns; if mirroring, `copyCel` then `flip`
   `horizontal`, then repaint the swapped details by hand.
4. For a spinning object: draw the two key frames, then in-betweens by the width table in
   rule 9; assign face colours from the ramp per frame.
5. `addFrame`/`duplicate`, `setFrameDuration` `durations` (cube 100 ms, rotor 50 ms, coin
   80–100 ms derived); `addTag` per direction or loop.
6. Review with `render` `filmstrip` and `render` `onionSkin` (pass `layerId` for the moving part);
   cleanup after any render or rotation: render without AA, quantise to the project palette,
   replace 2-3-2 runs with 2-2-2 or 1-1-1, delete orphans, close 1 px outline gaps, rebuild
   outline, redraw faces/hands/weapon tips, keep palette indices stable; `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Smeared, diamond-edged sprite | Algorithmic rotation or non-integer scale | Redraw the angle; `rotate` only at 90° |
| Sword switches hands when turning | Mirrored a handed sprite | Draw all 8 directions |
| Character bobs on turning | Different height or feet row per direction | One baseline and one centre of mass |
| Spinning cube looks like a sliding box | Shape changes, colour does not | Move each face along the ramp |
| Rotation feels linear | Equal corner steps | Ease: small steps at the sides, large in the middle |
| Diagonal view is a front pose with moved eyes | Not a real turn | Redraw the whole body in 3/4 |
| Pixels crawl between 3D frames | Unstable palette or camera | Fixed camera, fixed palette indices |

## Review

- Cardinals share height, shoulder width, head size, feet row and palette.
- Mirrored directions checked for swapped handedness.
- Spin frames: corner position eased; face colours step along the ramp; edge-on frame present.
- Rotor/blade frames use clean slopes; loop closes; speed reads from the filmstrip.
- No interpolated rotation artefacts; no mixels; palette unchanged.

## Sources

- Slynyrd, Pixelblog 40 (3D pixel art animation: rotating cube, corridor), Pixelblog 24 (items), 48 and 63 (rotors, roll).
- Saint11, Resizing, Hazards, Wind tutorials; Aseprite rotate docs (Fast / RotSprite).
- Spritefy eight-direction character sprite guide; Dead Cells 3D-to-2D production write-ups (Gamasutra, 80.lv).
- Sprite-stacking guides (sdelaughter, chequered.ink, Stack3D); Blender isometric sprite tutorials (Abbott, Blender Studio).
- Robertson & Bertling, *How to Draw* (rotating boxes and wheels).
