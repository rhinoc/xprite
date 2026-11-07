# Vehicles and machines

Vehicles fail on proportion before they fail on rendering: wheels too small, a body as
tall as it is long, a jet that is a triangle with a dot. Shading cannot fix a wrong
ratio. Decide the type, place wheels (or the main masses) first, then wrap the body,
then spend your few remaining pixels on three to five details. Forms: `craft/72-3d-forms.md`;
rotation sets: `craft/75-rotation-and-turnarounds.md`.

## Rules

1. **Silhouette first, in three views.** Sketch side, front and top thumbnails before
   rendering; the readable big shape sells the design more than detail. Give every
   machine one strong silhouette element (tank treads, a flat head, a long nose).
2. **Collect 3–4 reference silhouettes** and compare ratios before pixel work; invention
   comes after you know real proportions. Relative sizes between units follow their real
   specs.
3. **Wheels (or the main masses) go down first.** Package order: footprint → wheels → body
   box → wrap the skin → details. A wheel is a circle from `craft/72-3d-forms.md`, not a drawn
   ring.
4. **Car proportions in wheel diameters D** (measured from sketches, approximate): wheelbase
   3.5–4 D; body height 1.8–2.5 D; overall length 6–7 D for a sports car, ≈ 7 D for a
   pickup; ground clearance ¼–⅓ D; off-road buggy 4–5 D long with oversized wheels. At 32 px
   wide: two wheels of D 5–7, wheelbase about 20 px.
5. **Wheels cut into the body.** Draw the body, then a ring one pixel larger than the tyre in
   the outline colour, then the tyre: that ring is the wheel arch. Near wheel full size; far
   wheel 1–2 px narrower, slightly offset along the receding direction, its lower arc hidden
   by the body. Long lens: far/near ≥ 0.75; wide lens ≈ 0.5.
6. **Hub detail:** tyre ring, rim ring, hub pixel; D=5 gets a hub pixel only, D=7 a plus-shaped
   rim, D=9 a round 5 px rim. Several wheels in a row: widest at the margins, flattest near
   view centre.
7. **Side-view car in three blocks** (32×16): lower body about ⅔ of the height, cabin a
   shorter trapezoid at ⅓ (offset to the rear for sedans, centred for vans), two wheels that
   bite into the lower body. Greenhouse narrower than the body by 1–2 px per side, A-pillar
   at 1:1.
8. **Only 3–5 details survive at 16–32 px:** wheels, windows, head/tail light, one trim or
   grille line, one roof feature. Choose by vehicle type.
9. **Sheen and value:** one 1 px highlight line along the shoulder and a short one on the hood;
   one dark band below the shoulder ("reflection split"); windows darker than the body with
   a 1 px lighter diagonal; headlights pale yellow, indicators amber, brake lights red.
10. **Iso car** (63×45): length ≈ 2× width and wider than two characters; build from body
    block, cabin trapezoid (A-pillar 1:1, windscreen taper 1:2, roof 2:1), spoiler slab,
    wheels each on a layer; tyre about 7 px with one extra ring of rubber; bevel edges with
    1 px bands, add rhythmic dots on angled edges; stripes and glass sheen last
    (`craft/71-isometric.md`).
11. **Top-down units:** nose up for vertical shmups; the sprite sets the resolution for the
    game (jets up to 25×36, helicopter ≈ 29×31 with blades, tanks smaller). Draw the half
    hull and mirror around its centre line for symmetric craft. Do not flip a 3/4 top-down
    craft vertically for "enemy facing down": redraw (`craft/70-perspective.md`).
12. **Planes:** fuselage = long tapering cylinder; wings are flat planes with taper ≈ 0.5,
    dihedral 3–7° (1 px per 8–12 px of span), tailplane span 0.4–0.5 of the wing. Top-down
    32 px wingspan: fuselage 3–4 px wide, 22 long, wing chord 6 px at the root and 3 at the
    tip, sweep 1 px per 3–4 px of span. Side-view plane: the wing is a short slanted
    parallelogram ⅓–½ of the fuselage length.
13. **Side-scrolling aircraft move by roll, not pitch:** rotating pixel clusters distorts them.
    Five orientations (level, two roll-up, two roll-down); tap shows the first roll level
    briefly, hold shows full bank. Spend extra frames only on units that move a lot; ground
    units get tread or wheel shimmer and a 1 px bob.
14. **Propellers and rotors:** 4 frames at 50 ms with steps of 22.5° (template in
    `craft/75-rotation-and-turnarounds.md`); squash vertically for a 3/4 view; reuse the
    animation for palette-swapped enemies. Thrust: 2 frames at 50 ms; rocket trail: bright
    frame, stretched flame, wider/shorter/darker, smaller.
15. **Turrets are their own layer** with ≥ 8 directions; a destroyed turret leaves a husk.
16. **Mech or walker:** build from separate parts on layers (head, torso, arms, legs, weapons)
    and keep an exploded-view sheet. At 32 px: torso like a tank front, shoulders higher than
    the head, head low with 1–2 bright pixels, upper legs mostly unseen, leg+foot one unit
    (skis, talons), 2-px hands. Legs of 2 equal segments (8+8), leg span ≥ 1.5× body height
    for walkers, middle joint pointing outward or up, feet 4–5 px, 3 values only. A tiny human
    next to it gives scale.
17. **Function drives form** for spaceships and machines (no aerodynamics in space, but each
    universe has rules); evolve the silhouette alongside the detail pass. Submarine: hull oval
    in 3 bands → conning tower → rudders → propeller → rivets.
18. **Panel detail is rhythm:** secure silhouette and structure first, then repeat panels,
    screws, stripes like a tune; random greebles become noise.
19. **Paint last:** stripes that wrap around forms enhance depth; one neutral base, 1–2 accent
    colours; 5–7 colours per sprite.
20. **Shadow and ground:** drop shadow = flat dark copy offset down-right; wheeled units
    sit on a contact shadow ellipse (`craft/70-perspective.md`).

## By size

| Size | Car (side) | Aircraft (top) | Mech |
|------|-----------|-----------------|------|
| 8 | 8×4 block, 2 px wheels, 1 window px | 7×8 arrow with 1 px canopy | 8×8 blob, 1 eye px |
| 16 | 16×8, wheels D=3–5, window band, light px | 13×16, symmetric half | 16×16, torso + leg unit |
| 32 | 28–32×16, D=7 wheels, 3–5 details | 17×20 jet below, 3 shades | 32×32, exploded parts |
| 64 | 63×45 iso car, lights, reflection split | 25×36 jets, canopy highlight, shadow copy | + weapons, accent stripes |

The 8 and 16 px cells are derived from rule 4 and rule 8; 32 and 64 px follow the measured
sprites cited below.

## Templates

**veh-car-side-32** — side-view car: lowered hood and trunk, glass with glints, door line,
head/tail light, wheel arches cut by an outline ring, body shade band. Recolour roles for
vans or trucks by raising the cabin.

```grid veh-car-side-32
K = outline        #1c1824
B = body-mid       #c8392f
L = body-light     #e8645a
D = body-shade     #8f2540
M = handle         #f5d0c8
G = glass          #6f9fc4
W = glass-glint    #d7ecf7
Y = headlight      #ffe58a
R = taillight      #ff4a3d
T = tyre           #3b3947
r = rim            #aab4c8
H = hub            #e6ebf5
---
................................
...........KKKKKKKKKK...........
..........KGGGGKKGGGGK..........
.........KGGWGGKKGWGGGK.........
........KGGWGGGKKWGGGGGK........
...KKKKKLLLLLLLLLLLLLLLLKKKKK...
..KLLLLLLLLLLLLLLLLLLLLLLLLLLK..
.KBBBKKKKKBBBMBKBBBBBBKKKKKBBBK.
.YBBKKTTTKKBBBBKBBBBBKKTTTKKBBR.
.YBKKTTTTTKKBBBKBBBBKKTTTTTKKBR.
.KBKTTTrTTTKBBBKBBBBKTTTrTTTKBK.
.KDKTTrHrTTKDDDDDDDDKTTrHrTTKDK.
..KKTTTrTTTKKKKKKKKKKTTTrTTTKK..
...KKTTTTTKK........KKTTTTTKK...
....KKTTTKK..........KKTTTKK....
.....KKKKK............KKKKK.....
```

**veh-car-top-10x13** — top-down car: hood, windscreen, roof, rear window, trunk, side
tyres, light pairs. Symmetric except for glints.

```grid veh-car-top-10x13
K = outline        #1c1824
B = body           #2f7fc4
L = body-light     #6fb4ea
D = body-shade     #1f5388
G = glass          #27466a
W = glass-glint    #8fc4dd
T = tyre           #3b3947
Y = headlight      #ffe58a
R = taillight      #ff4a3d
---
...KKKK...
..KYLLYK..
.KLLBBLLK.
TKBBBBBBKT
TKGGGGGGKT
TKGWGGGGKT
.KLLLLLLK.
.KLLLLLLK.
.KGGGGGGK.
TKBBBBBBKT
TKBBBBBBKT
TKRDDDDRKT
..KKKKKK..
```

**veh-jet-top-17x20** — top-down fighter: nose, canopy, swept wings, tail fins, engine notch;
light from the left on the hull.

```grid veh-jet-top-17x20
K = outline        #1c1824
B = hull           #9aa7bd
L = hull-light     #d4dcea
D = hull-shade     #5f6b86
G = canopy         #4fb4d8
---
........K........
........K........
.......KLK.......
.......KLK.......
......KLBBK......
......KGBGK......
......KGBGK......
......KLBDK......
.....KLBBBDK.....
....KLBBBBBDK....
...KLBBBBBBBDK...
..KLBBBBBBBBBDK..
.KLBBBBBBBBBBBDK.
KLBBBBBBBBBBBBBDK
KKKBBBBBBBBBBBKKK
...KKBBBBBBBKK...
.....KBBBBBK.....
....KBBBBBBBK....
...KBBBKKKBBBK...
...KKKK...KKKK...
```

**veh-wheels-5-7-9** — tyre/rim/hub wheels at D = 5, 7, 9 (K ring is the arch outline when
overlapping a body).

```grid veh-wheels-5-7-9
K = outline        #1c1824
T = tyre           #3b3947
R = rim            #aab4c8
H = hub            #e6ebf5
---
................KKKKK..
........KKK....KTTTTTK.
.KKK...KTTTK..KTTRRRTTK
KTTTK.KTTRTTK.KTRRRRRTK
KTHTK.KTRHRTK.KTRRHRRTK
KTTTK.KTTRTTK.KTRRRRRTK
.KKK...KTTTK..KTTRRRTTK
........KKK....KTTTTTK.
................KKKKK..
```

## Procedure

1. Choose the type, projection and size; note the wheel diameter D and compute the proportions
   from rule 4.
2. `applyBatch` `grid` the wheel stamps at their centres; box the body above them with `fillRect`.
3. Cut the silhouette (hood, cabin, nose) with row spans; check `render` for the
   three-block read.
4. Add arches by painting the one-pixel-larger ring, then the tyre.
5. Fill value roles (body light/mid/shade, glass, lights) from one ramp; add the shoulder line.
6. Details from the 3–5 list; outline last; `readPixels` `format:"grid"` for orphans; `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Car looks like a brick | Body ≥ 3 D tall or wheels < 4 px | Wheel diameter first, body ≈ 2 D tall |
| Wheels glued to the body edge | No arch | Outline ring around the tyre |
| Plane is a plain triangle | One mass, no wing/tail | Fuselage + wing taper + tailplane |
| Mirrored enemy looks wrong | 3/4 sprite flipped vertically | Redraw the other facing |
| Detail noise | Greebles before silhouette | Delete; keep 3–5 named details |
| Mech reads as a blob | One value, humanoid feet | 3 values, skis/talons, torso like a tank |
| Flat vehicle | No shoulder line or shade band | 1 px highlight + one dark band |

## Review

- Silhouette alone says "car", "jet", "tank" or "mech".
- Wheel diameter and wheelbase match the proportion ratios; arches present.
- Far wheel or wing narrower than near; no identical stamped copies.
- 3–5 details; highlights follow the longest surface sweep.
- One light, one shadow, 5–7 colours; thrust/rotor/turret layers separable.

## Sources

- Robertson & Bertling, *How to Draw* (vehicle packaging, wheels and ellipses, aircraft).
- Slynyrd, Pixelblog 12, 18, 19, 27, 31, 32, 34, 46, 48, 54, 59, 61, 63 (ships, aircraft, mechs, shmups, cars).
- Tuts+ isometric vehicle tutorial; Megavoxels pixel-car guide.
- Saint11, Spaceships, Tech, RocketTrail tutorials; Pixelblog 61 (isometric mecha).
