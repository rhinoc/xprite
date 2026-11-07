# Hair and clothing

Hair is the identity of a 16 px character and the largest shape on a 32 px head;
cloth is the part most likely to turn into noise. Without mass rules, hair becomes
scattered strand pixels or a plain helmet; without fold rules, cloth becomes wrinkles
on a tube, or a flat colour with no weight; capes become rectangles. This file gives
the mass shapes, the fold types, the cloth-versus-armour split and the cape shapes,
with templates. How they move is `craft/45-secondary-motion.md`; materials and colour
are `craft/23-materials-soft.md`, `craft/22-materials-hard.md` and `craft/20-color-for-pixel-art.md`.

## Rules

**Hair**

1. **Hair is 3–5 masses, never strands.** Short hair = bangs + left + right (+ a
   back); long hair adds a back fall. Separate masses by a 1 px darker line, an
   outline notch, or just a lightness step (art-pia). Strands drawn as scattered
   single pixels are noise.
2. **Hair is a silhouette decision.** Push the shape 1–3 px past the skull outline
   (twin tails, bob curve, horns, a ribbon) and run the flat-fill test
   (`craft/03-silhouette-and-form.md`). A hairstyle that exists only inside the
   face outline will not read at 16 px.
3. **Build order** (Dawe, Slynyrd PB29): overall shape and length → sections that
   follow the head's curve, with flow lines starting at a crown or a part →
   base colour → shadow clusters → one highlight band.
4. **One highlight band**, curved with the skull, offset toward the light and sitting
   on the top of the head, not at the hairline: 3–6 px × 1–2 px at 32 px, 2 px at
   16 px (Gurney, art-pia). Several scattered highlights read as noise.
5. **Tones:** 3 at ≤ 32 px (light, base, shadow), 4–5 at 48 px. The line between
   clumps is one step darker than the clump beside it, not black (st0ven).
6. **Hairline: colour, not outline.** Do not run a black line across the forehead;
   use black only where hair leaves the head. One shadow row under bangs. A missing
   outline pixel makes a parting, a filled one a cowlick (Tsu).
7. **Every hair mass is at least 2 px wide** where it meets skin or a headband. If
   the palette has no dark brown, take the darkest skin tone and move a face pixel to
   open the gap (Pixel Logic, p. 108).
8. **Locks taper in run lengths** such as 4-3-2-1, drawn as one continuous curve;
   spikes are 2–4 px wide, stepped 3-2-1, separated by a 1 px notch in a darker
   hue of the hair, and only the tips break the silhouette (Kandi Runner, BJG).
   See `hair-lock-taper`.
9. **Hair against the background and against the face needs a value step** of at least
   one ramp step each way. Dark hair needs a lighter background; a bright hair mass
   pulls the eye from the face, so share its hue with the weapon and hat colours and
   keep its highlight band the only light hair pixel group on the head (Slynyrd PB55).
10. **Keep the cluster structure the same in every frame** (Saint11); hair on its own
    layer, motion per `craft/45-secondary-motion.md`.

**Clothing**

11. **Cloth reads by silhouette first.** Hems fan out from the hip and knee; 1 shadow
    tone + the outline is enough at ≤ 32 px; add a second shadow only in deep folds.
    No highlights on cloth, except one edge pixel on satin or leather (Saint11).
12. **Folds start at a support point** (shoulder, elbow, waist, knee, belt) and run
    to the hem; they never begin in the middle of nothing (Loomis, Hampton). Budget:
    16 px = 1 fold + a hem arc; 32 px ≤ 2 per garment region; 48 px 3–4; 64 px 4–6.
13. **Four fold shapes** (Hampton's seven, reduced to what survives in pixels):
    **pipe** (parallel tubes hanging from tension points: robe, tunic, curtain),
    **zigzag** (chevrons where cloth is compressed: bunched sleeve, trouser), **spiral**
    (an S twisting across a limb and ending behind it), **drop** (a U of cloth hung
    between two supports: sash, swag, tabard; a cape fold is a drop plus wind). At a
    bent joint use a **pinch**: a short diagonal from the inner corner. Folds run
    parallel where tension is high and radiate from where cloth is compressed
    (Saint11); a fold throws a soft shadow on its own cloth.
14. **Tight clothing has no folds** except 1–2 px of bunching at joints. Loose cloth
    hangs from the high points of the body and falls away; fitted cloth wraps around
    them (Loomis). Show the form underneath: draw the body first, then the garment.
15. **Separate garments by colour, not outline** (Tsu): sleeve from arm, boot from
    trouser, cape from tunic. Keep black where the body segments (waist, jaw). A tint
    of the garment colour in the outline softens it (FF3).
16. **One signature accessory per character** (Bancroft): scarf, hat, buckle, at most
    one per body zone. An accessory that does not change the silhouette is at most 2 px
    of detail at 32 px; anything drawn hundreds of times must be cheap. Class reads
    through clothing (warrior wide + plate, mage trapezoid robe, archer slim); see
    `craft/36-character-design.md`.
17. **Layer order does the tucking** (Dawe): shirt under trousers = tucked in, over =
    untucked. Put equipment on separate layers (`craft/06-layers-and-rigging.md`).

**Armour versus cloth**

18. **Armour is large planes**, 2–3 chunks of colour per piece with a highlight line
    near the middle of each convex piece beside a dark line along the seam; cloth is
    one tone plus a shadow. Armour does not fold: it overlaps, and joints are sectioned
    like robot parts (Kandi Runner). Metal is in `craft/22-materials-hard.md`.
19. **Design armour as floating pieces** (helmet, pauldrons, cuirass, tassets, greaves,
    gauntlets) then assemble them on the figure (Slynyrd PB57); shade in chunks, add
    detail only until the eye can finish it. Remove noise first: an armour skirt and two
    similar browns together read as mud.

**Capes**

20. **A cape is one ribbon:** 2–3 value bands and one fold line from the clasp at 16 px;
    a second fold family at 32 px (`craft/45-secondary-motion.md`, rule 7).
21. **Shape follows state.** Still: an A-line hang behind the back, 4–5 px wide at 32 px,
    pipe folds, scalloped hem. Run: near-horizontal, a sine wave along the wind
    direction. Jump or fall: it rises above the shoulders. Back view: it covers the
    body, a trapezoid from 12 px at the shoulders to 18 px at the hem at 32 px, three
    pipe folds that widen downward, a scalloped hem; front view: two panels 3–4 px wide at
    the sides, the clasp between, the body in front. A cape changes the side silhouette,
    so it must be present, consistent, in every direction (Spritefy). Templates:
    `cape-16-side`, `cape-32-side`, `cape-32-views`.
22. **The cape never merges with the legs or the back arm.** Dark cape against a bright
    tunic, or a 1 px gap; test with the flat-fill silhouette.
23. **Big secondary shapes are redrawn per frame, not reused** (Owlboy). Keep the
    root pixels at the clasp identical.

## By size

| Figure | Hair | Cloth | Cape |
|--------|------|-------|------|
| 8 px | a 1–2 px colour cap and 1 px side | colour blocks, no folds | a 1–2 px column behind the back |
| 16 px | 3 masses merged, 1 highlight band 2 px, 2–3 tones | 2–3 value bands, 1 fold line, hem arc | 2 bands + 1 fold, 2–3 px wide |
| 32 px | 3–5 masses, band 3–6 × 1–2, 3 tones, 1 px cluster lines | ≤ 2 folds per region, hem scallops, belt | pipe or wave folds, 4–5 px wide at rest |
| 48 px | cluster lines from a crown or part, 4 tones, tapering locks | 3–4 folds, trim, layered garments | two fold families, scalloped hem |
| 64 px | strands only at the tips, 4–5 tones | 4–6 folds, seams, patterns displaced by folds | full ribbon with wave and hem detail |

## Templates

Heads are drawn with a plain face block; the eyes are single outline-coloured pixels.
Cells are separated by one blank column; copy columns `[i × stride, i × stride + width)`
for one cell. Light is from the upper left.

**Hair, 16 px, front.** Three 10 × 9 cells (stride 11): short, spiky, long.

```grid hair-16-front
O = outline     #2b1d2e
L = skin-light  #f2b48a
R = hair-mid    #8a4a2a
r = hair-shadow #5a2e1a
Q = hair-light  #c98a4a
---
..OOOOOO.....O..OO.O....OOOOOO..
.ORQQRRRO...ORO.ORRO...ORQQRRRO.
ORQQRRRRRO.ORRRORRRRO.ORQQRRRRRO
ORRRRRRRRO.ORQRRRRRRO.ORRRRRRRRO
ORRLLLLRRO.ORRLLLLRRO.ORRLLLLRRO
.OLOLLOLO...OLOLLOLO..ORROLLOLRO
.OLLLLLLO...OLLLLLLO..ORRLLLLLRO
..OLLLLO.....OLLLLO...ORRRLLLRRO
...OOOO.......OOOO.....OrRR.RRrO
```

**Hair, 16 px, side.** Two 8 × 9 cells (stride 9): short, long.

```grid hair-16-side
O = outline     #2b1d2e
L = skin-light  #f2b48a
R = hair-mid    #8a4a2a
r = hair-shadow #5a2e1a
Q = hair-light  #c98a4a
---
..OOOOO....OOOOO.
.ORQQRRO..ORQQRRO
ORQRRRRO.ORQRRRRO
ORRRRLLO.ORRRRLLO
ORRRLLOL.ORRRLLOL
.ORRLLLO.ORRRLLLO
..OLLLO..ORRRRLLO
...OOO....ORRRRO.
...........OrrRO.
```

**Hair, 32 px, front.** Two 15 × 18 cells (stride 16): bob and long. Bangs are three
tufts, a short cluster line at the crown, one highlight band, shadow where the hair
turns inward.

```grid hair-32-front
O = outline     #2b1d2e
L = skin-light  #f2b48a
R = hair-mid    #8a4a2a
r = hair-shadow #5a2e1a
Q = hair-light  #c98a4a
---
....OOOOOOOO........OOOOOOOO...
...OQQQQRRRRO......OQQQQRRRRO..
..OQQQQRRRRRRO....OQQQQRRRRRRO.
.OQQQRRRRRRRRRO..OQQQRRRRRRRRRO
.OQQRRrRRRRRRRO..OQQRRrRRRRRRRO
.ORRRRRrRRRRRRO..ORRRRRrRRRRRRO
.ORRRRLRRLRRRRO..ORRRRLRRLRRRRO
.ORRRLLRRLLRRRO..ORRRLLRRLLRRRO
.ORRLLLRRLLLRRO..ORRLLLRRLLLRRO
.ORRLOLLLLOLRRO..ORRLOLLLLOLRRO
.ORRLLLLLLLLRRO..ORRLLLLLLLLRRO
.ORRLLLLLLLLRRO..ORRLLLLLLLLRRO
.OrRLLLLLLLLRrO..ORRRLLLLLLRRRO
.OrrRLLLLLLRrrO..ORRRLLLLLLRRRO
..OrRRLLLLRRrO...OrRRRLLLLRRRrO
...OOrrLLrrOO....OrrRRRLLRRRrrO
.....OOOOOO......OrrRRRRRRRRrrO
..................OOrRROORRrOO.
```

**Hair, 32 px, side.** Two 21 × 15 cells (stride 22): plain, and with a ponytail
joining the skull at the back.

```grid hair-32-side
O = outline     #2b1d2e
L = skin-light  #f2b48a
R = hair-mid    #8a4a2a
r = hair-shadow #5a2e1a
Q = hair-light  #c98a4a
---
....OOOOOOO.....................OOOOOOO....
..OOQQQRRRRO..................OOQQQRRRRO...
.OQQQQRRRRRRO................OQQQQRRRRRRO..
OQQQRRRRRRRRRO..............OQQQRRRRRRRRRO.
ORQRRRrRRRRRRO..............ORQRRRrRRRRRRO.
ORRRRrRRRRRRRO............OOORRRRrRRRRRRRO.
ORRRRRrRRRRLLO...........OQRRRRRRRrRRRRLLO.
ORRRRRRrRRLLLO..........OQRRRRRRRRRrRRLLLO.
ORRRRRRRRLLOLO..........ORRRRRRRRRRRRLLOLO.
ORRRRRRRRLLLLLO........OQRRRRRRRRRRRRLLLLLO
.ORRRRRRRLLLLLO........ORRrR.ORRRRRRRLLLLLO
.ORRRRRRRLLLLO.........OrRRO.ORRRRRRRLLLLO.
..OrRRRLLLLLO...........OrRO..OrRRRLLLLLO..
...ORRLLLLO.............OrO....ORRLLLLO....
.....OOOO................O.......OOOO......
```

**Hair, 48 px, front.** One cell: centre part, V of cluster lines from the crown, band,
shadow at the locks' ends.

```grid hair-48-front
O = outline     #2b1d2e
L = skin-light  #f2b48a
R = hair-mid    #8a4a2a
r = hair-shadow #5a2e1a
Q = hair-light  #c98a4a
---
.....OOOOOOOOOO....
....OQQQQQRRRRRO...
...OQQQQQRRRRRRRO..
..OQQQQRRRRRRRRRRO.
.OQQQRrRRRRRRrRRRRO
.OQQRRRrRRRRrRRRRRO
.ORRRRRRrRRrRRRRRRO
.ORRRRRRRLLRRRRRRRO
.ORRRRRRLLLLRRRRRRO
.ORRRRRLLLLLLRRRRRO
.ORRRRLLLLLLLLRRRRO
.ORRRLLLLLLLLLLRRRO
.ORRRLOOLLLLOOLRRRO
.ORRRLLLLLLLLLLRRRO
.ORRRLLLLLLLLLLRRRO
.OrRRLLLLLLLLLLRRrO
.OrRRRLLLLLLLLRRRrO
.OrrRRRLLLLLLRRRrrO
..OrrRRRLLLLRRRrrO.
...OrrRRRLLRRRrrO..
....OOOrrO.........
```

**Lock taper.** One tapered lock: light edge, base, shadow edge, run lengths shrinking.

```grid hair-lock-taper
O = outline     #2b1d2e
R = hair-mid    #8a4a2a
r = hair-shadow #5a2e1a
Q = hair-light  #c98a4a
---
..OOOOO...
.OQQRRrO..
.OQRRRrO..
.OQRRrO...
..OQRrO...
..OQRrO...
...OQrO...
....OrO...
.....OrO..
.....OrO..
......OO..
```

**Folds, 16 px.** Two 12 × 7 cells (stride 13): tunic hem under a belt with one fold and a
scalloped hem; a bent sleeve with a single pinch fold.

```grid folds-16-minimal
O = outline       #2b1d2e
C = sleeve-mid    #4f77b0
c = sleeve-shadow #36568a
E = cloth-mid     #a8353a
e = cloth-shadow  #6e2230
F = cloth-light   #d4605a
N = leather-mid   #7a4e2e
g = gold-trim     #e2b94c
---
.OOOOOOOO.....OCCO.......
.ONNggNNO.....OCCO.......
.OEFEEEeO.....OCCOOOOOO..
.OEEEeEEO.....OCeCCCCCCO.
OEEEEeEEEO....OeCCCCcCCO.
OEEeEEEEeO....OOOOOOOOOO.
.OOEOOEOO................
```

**Folds, 32 px.** Four 16-px cells (stride 17): pipe (three tubes, scalloped hem),
zigzag (chevrons on a bunched sleeve), spiral (a ridge, light above, shadow below,
ending behind the tube), drop (cloth hung between two clasps).

```grid folds-32-types
O = outline      #2b1d2e
E = cloth-mid    #a8353a
e = cloth-shadow #6e2230
F = cloth-light  #d4605a
N = leather-mid  #7a4e2e
g = gold-trim    #e2b94c
---
.OOOOOOOOOOOOOO...OOOOOOOOOOOOOO...OOOOOOOOOOOOO....OgO........OgO.
.ONNNNggNNNNNNO...OeFFFeFFFeFFFO...OEEEEEEEEEEEO....OEOOOOOOOOOOEO.
.OOOOOOOOOOOOOO...OEeEEEeEEEeEEO...OEEEEEEEEEEEO....OFEEEEEEEEEEEO.
.OFEeFEeFEeFEeO...OEEeEEEeEEEeEO...OEEFFFEEEEEEO....OEeEEEEEEEEeEO.
.OFEeFEeFEeFEeO...OEeEEEeEEEeEEO...OEEeeeFFEEEEO....OEEeEEEEEEeEEO.
.OFEeFEeFEeFEeO...OeeeeeeeeeeeeO...OEEEEEeeFFEEO....OEEEeeeeeeEEEO.
.OFEeFEeFEeFEeO...OOOOOOOOOOOOOO...OEEEEEEEeeFEO....OFFEEFFFFEEEEO.
.OFEeFEeFEeFEeO....................OEEEEEEEEEeEO....OFEEEFFFFEEEeO.
.OFEOFEOFEOFEOO....................OEEEEEEEEEEEO....OEEEEEFFEEEEeO.
..OO.OO.OO.OO......................OEEEEEEEEEEEO....OEEEEEEEEEEEeO.
...................................OEEFFFEEEEEEO....OEEEEEEEEEEEeO.
...................................OEEeeeFFEEEEO....OEOEEEOEEEOEeO.
...................................OEEEEEeeFFEEO.....O.OOO.OOO.OO..
...................................OEEEEEEEeeFEO...................
...................................OEEEEEEEEEeEO...................
...................................OOOOOOOOOOOOO...................
```

**Cloth versus armour, 32 px.** Two 14 × 15 cells (stride 15): a belted tunic (one tone,
one shadow, diagonal fold lines, scalloped hem) and a plate cuirass with tassets (three
tones, a centre ridge, hard seams, gold belt).

```grid cloth-vs-armour-32
O = outline      #2b1d2e
K = metal-mid    #9aa5b5
k = metal-shade  #5f6b80
Z = metal-light  #dfe6ee
E = cloth-mid    #a8353a
e = cloth-shadow #6e2230
F = cloth-light  #d4605a
N = leather-mid  #7a4e2e
g = gold-trim    #e2b94c
---
....OOOOOO.........OOOOOO....
..OOEFFEEEOO.....OOKZZKKKOO..
.OEFEEEEEEEeO...OKKZZKKKKKkO.
OEFEEEEEEEEEeO.OKZZKKKKKKKKkO
OEEEEEEeEEEEeO.OZZKKKZKKKKkkO
OEEEEEeEEEEEeO.OZKKKKZKKKKkkO
OEEEEeEEEEEEeO.OKKKKKZKKKKkkO
.OEEEEEEEEEeO...OKKKKKKKKkkO.
.ONNNNggNNNNO...OggggggggggO.
OEEEeEEEEEeEEO.OKZZKKKKKKkkkO
OEEeEEEEEEEeEO.OOOOOOOOOOOOOO
OFEEEEeEEEEeEO.OKZKKKKKKKkkkO
OEEEEEEEEEEEeO..OOOOOOOOOOOO.
.OEOEEEOEEOEO................
..O.OOO.OO.O.................
```

**Cape, 16 px, side.** Two 15 × 15 cells (stride 16): still (A-line), run (streaming).

```grid cape-16-side
O = outline        #2b1d2e
L = skin-light     #f2b48a
C = sleeve-mid     #4f77b0
c = sleeve-shadow  #36568a
B = boot-mid       #8a5a3a
P = trouser-mid    #5a6a8a
p = trouser-shadow #3e4b68
R = hair-mid       #8a4a2a
E = cloth-mid      #a8353a
e = cloth-shadow   #6e2230
F = cloth-light    #d4605a
N = leather-mid    #7a4e2e
---
........OOOO............OOOO...
.......ORRRRO..........ORRRRO..
.......ORRLLO..........ORRLLO..
.......ORLLLO..........ORLLLO..
.....OO.OLLLO.........O.OLLLO..
....OFFOCCCCO...OOOOOOFOCCCCO..
....OEEOCCCcO...FFFFFFEOCCCcO..
...OFEEOCCCcO...EEEEEEEOCCCcO..
...OEEEONNNNO...EEEEEEeONNNNO..
...OEEEOPPPPO...EEEEEeOOPPPPO..
...OEEEOPPPpO...EEeeeO.OPPPpO..
...OEEeOPPPpO...eeOOO..OPPPpO..
...OeeOOBBBBO...OO.....OBBBBO..
....OO.OOOOOO..........OOOOOO..
...............................
```

**Cape, 32 px, side.** Three 22 × 32 cells (stride 23): still, run, jump. The mannequin has
no arms so the cape's shape stays visible; the cape is a separate layer behind it.

```grid cape-32-side
O = outline        #2b1d2e
L = skin-light     #f2b48a
C = sleeve-mid     #4f77b0
c = sleeve-shadow  #36568a
B = boot-mid       #8a5a3a
P = trouser-mid    #5a6a8a
p = trouser-shadow #3e4b68
R = hair-mid       #8a4a2a
E = cloth-mid      #a8353a
e = cloth-shadow   #6e2230
F = cloth-light    #d4605a
N = leather-mid    #7a4e2e
---
..........OOOOOO.................OOOOOO.................OOOOOO......
.........ORRRRRRO...............ORRRRRRO...............ORRRRRRO.....
........ORRRRRRRRO.............ORRRRRRRRO.....OOO.....ORRRRRRRRO....
........ORRRRRRLLLO............ORRRRRRLLLO....OFEOO...ORRRRRRLLLO...
........ORRRRRLLOLO............ORRRRRLLOLO....OFEEEOO.ORRRRRLLOLO...
........ORRRRRLLLLLO...........ORRRRRLLLLLO...OFEEEEEOORRRRRLLLLLO..
.........ORRRRLLLLO.............ORRRRLLLLO....OEFEEEEEeORRRRLLLLO...
..........OLLLLLO................OLLLLLO......OeEEFEEEeeOLLLLLO.....
...........OLLLO..................OLLLO.......OeEEEFEEeeeOLLLO......
.........OCCCCCCCCO............OOCCCCCCCCO....OEeEEEEEeOCCCCCCCCO...
......OOOOCCCCCCCCO......OOOOOOFOCCCCCCCCO....OOeEEEEEeOCCCCCCCCO...
.....OFFFOCCCCCCCcO.....OFFFFFFEOCCCCCCCcO.....OOeeEEeeOCCCCCCCcO...
....OFEEEOCCCCCCCcO....OFEEEEEEEOCCCCCCCcO......OOeeeeeOCCCCCCCcO...
...OFEEEEOCCCCCCCcO....FEEEEEEEEOCCCCCCCcO........OOOOOOCCCCCCCcO...
...OEEEEEOCCCCCCCcO....EEEEEEEEEOCCCCCCCcO.............OCCCCCCCcO...
...OEEEEEOCCCCCCCcO....EEEEEEEEEOCCCCCCCcO.............OCCCCCCCcO...
...OEEEEEONNNNNNNNO....EEEEEEEEeONNNNNNNNO.............ONNNNNNNNO...
...OEEEEEOCCCCCCCcO....EEEEEEEeeOCCCCCCCcO.............OCCCCCCCcO...
...OEEEEEOccccccccO....EEEEEeeeOOccccccccO.............OccccccccO...
...OEEEEEOOPPPPPPO.....EEeeeeeO..OPPPPPPO...............OPPPPPPO....
...OEEEEEOOPPPPPpO.....EEeeeOO...OPPPPPpO...............OPPPPPpO....
...OEEEEEOOPPPPPpO.....EeOOO.....OPPPPPpO...............OPPPPPpO....
...OEEEEEOOPPPPPpO.....eeO.......OPPPPPpO...............OPPPPPpO....
...OeEeEeOOPPPPPpO.....eO........OPPPPPpO...............OPPPPPpO....
...OeeeeeOOPPPPPpO.....O.........OPPPPPpO...............OPPPPPpO....
....OeOeO.OPPPPPpO...............OPPPPPpO...............OPPPPPpO....
.....O.O..OPPPPPpO...............OPPPPPpO...............OPPPPPpO....
..........OBBBBBBBBBO............OBBBBBBBBBO............OBBBBBBBBBO.
..........OOOOOOOOOO.............OOOOOOOOOO.............OOOOOOOOOO..
....................................................................
....................................................................
....................................................................
```

**Cape, 32 px, back and front.** Two 22 × 32 cells (stride 23): back view (long hair, a
trapezoid cape from shoulders to hem, three pipe folds that widen toward a scalloped hem,
boot heels below) and front view (two side panels behind the body, gold clasp at the neck,
tunic, belt, trousers). Same mannequin and light as `cape-32-side`.

```grid cape-32-views
O = outline        #2b1d2e
L = skin-light     #f2b48a
C = sleeve-mid     #4f77b0
c = sleeve-shadow  #36568a
B = boot-mid       #8a5a3a
P = trouser-mid    #5a6a8a
p = trouser-shadow #3e4b68
R = hair-mid       #8a4a2a
Q = hair-light     #c98a4a
r = hair-shadow    #5a2e1a
E = cloth-mid      #a8353a
e = cloth-shadow   #6e2230
F = cloth-light    #d4605a
N = leather-mid    #7a4e2e
g = gold-trim      #e2b94c
---
........OOOOOO.................OOOOOO........
.......ORRRRRRO...............ORQQRRRO.......
......ORQQRRRRRO.............ORQQRRRRRO......
......ORQRRRRRRO.............ORRRRRRRRO......
......ORRRRRRRRO.............ORRLLLLRRO......
......ORRRRRRrRO.............ORLOLLOLRO......
......ORRRRRRrRO.............ORLLLLLLRO......
.......ORRRRRRO...............OLLLLLLO.......
........OrRRrO.................OLLLLO........
.....OOOOOOOOOOOO........OOOOOOOOggOOOOOOOO..
....OFEEeFEEeFEEeO......OFEeOCCCCCCCCCcOeEEO.
....OFEEeFEEeFEEeO......OFEeOCCCCCCCCCcOeEEO.
....OFEEeFEEeFEEeO......OFEeOCCCCCCCCCcOeEEO.
....OFEEeFEEeFEEeO......OFEeOCCCCCCCCCcOeEEO.
....OFEEeFEEeFEEeO......OFEeOCCCCCCCCCcOeEEO.
...OFEEeFEEEEeFEEeO.....OFEeOCCCCCCCCCcOeEEO.
...OFEEeFEEEEeFEEeO.....OFEeONNNNggNNNNOeEEO.
...OFEEeFEEEEeFEEeO.....OFEeONNNNNNNNNNOeEEO.
...OFEEeFEEEEeFEEeO....OFEEeOCCCCCCCCCcOeEEEO
...OFEEeFEEEEeFEEeO....OFEEeOCCCCCCCCCcOeEEEO
..OFEEEeFEEEEeFEEEeO...OFEEeOPPPpOOPPPpOeEEEO
..OFEEEeFEEEEeFEEEeO...OFEEeOPPPpOOPPPpOeEEEO
..OFEEEeFEEEEeFEEEeO...OFEEeOPPPpOOPPPpOeEEEO
..OFEEEeFEEEEeFEEEeO...OFEEeOPPPpOOPPPpOeEEEO
..OFEEEeFEEEEeFEEEeO...OFEEeOPPPpOOPPPpOeEEEO
.OEEEEEeEEEEEeEEEEEeO..OFEEeOPPPpOOPPPpOeEEEO
.OEEEEEeEEEEEeEEEEEeO..OFEEeOPPPpOOPPPpOeEEEO
.OEEEEEeEEEEEeEEEEEeO..OFEEeOPPPpOOPPPpOeEEEO
.OEEEEEOEEEEEOEEEEEOO..OFEOeOPPPpOOPPPpOeOEEO
..OOOOO.OOOOO.OOOOO.....OO.OOBBBBOOBBBBOO.OO.
.....OBBBBOOBBBBO...........OBBBBOOBBBBO.....
.....OOOOOOOOOOOO...........OOOOOOOOOOOO.....
```

## Procedure

1. `getContext`; choose the size row. Decide the hairstyle's silhouette first and test
   it: copy the layer, `replaceColor` every colour with one, `render`.
2. Draw the body, then a base-colour mass for each garment; then the hair as one mass in
   its base colour. Shape bangs, hairline and the outer contour before shading.
3. Hair: `palette` op `ramp` from the base colour for 3–4 tones (hue-shifted). Place the
   highlight band first, then the shadow under bangs and at the ends, then 1 px cluster
   lines. Stamp a template with `applyBatch` `grid`, `transparent: "skip"`.
4. Cloth: mark support points, draw the folds from them, count against the budget.
   Armour: draw each piece on its own layer, shade in chunks, assemble.
5. Cape: its own layer under the body. Draw the still shape first; draw run and jump as
   separate drawings, not transforms.
6. `render` at 1× and at zoom, `readPixels` `format:"grid"` on the hairline and hem,
   `render` `filmstrip` for animated parts; `validate` for strays and anti-aliasing.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hair is a speckled halo | strands drawn pixel by pixel | rule 1: masses, 1 px lines between |
| Hair is a plain cap | no bangs, no outer contour change | rules 2, 6: bangs, push the silhouette |
| Face seems to float on the hair | black line along the hairline | rule 6: colour step, shadow row |
| Hair vanishes into the headband | mass 1 px wide | rule 7 |
| Highlights like sequins | several small highlights | rule 4: one band |
| Cloth looks wrinkled like paper | folds from nowhere, too many | rules 12, 13: support points, budget |
| Tunic reads as a tube | no hem, no belt, one flat colour | rule 11: hem fan, belt, shadow |
| Armour looks like shiny cloth | soft gradients, folds | rule 18: planes, hard seams, highlight chunk |
| Cape is a red rectangle | straight edges, no fold | rule 21: folds, scalloped hem, shape by state |
| Cape merges with the legs | same value, no gap | rule 22 |

## Review

- The flat-fill silhouette shows the hairstyle and the cape; hair extends past the skull.
- Hair is 3–5 masses with at most one highlight band and 3–4 tones; no lone strand pixels.
- No black hairline across the forehead; every hair mass is ≥ 2 px wide.
- Fold count is within the budget; each fold starts at a joint, belt or shoulder.
- Cloth carries a shadow tone and no highlights; armour carries planes, a highlight line and seams.
- Garments are separated by colour; one signature accessory.
- The cape does not merge with the legs or back arm; its shape matches the pose.
- The hem is a continuous curve with smooth step lengths.

## Sources

- Hampton, *Figure Drawing: Design and Invention*, drapery and its seven folds (pp. 219–230).
- Loomis, *Figure Drawing for All It's Worth*, clothing over the figure (pp. 189–196) and hair.
- Gurney, *Color and Light*, hair (pp. 158–159) and occlusion shadows (p. 146).
- Dawe, *Make Your Own Pixel Art*, hair build and clothing layers (pp. 17, 21, 123).
- Bancroft, *Creating Characters with Personality*, hair and clothing as design (pp. 38, 60–63).
- Pixel Logic (Andrew Moore), hair and silhouette (pp. 104–108, 167, 226).
- Silber, *Pixel Art for Game Developers*, sleeves, shirt, hair (pp. 39, 84–87).
- Solarski, *Drawing Basics and Video Game Art*, hair and shape language.
- Saint11 (Fabric, Cuteness, Pipeline); Slynyrd Pixelblog PB29, PB33, PB52, PB55, PB57; Tsu pixel
  tutorials 7–9; art-pia, st0ven and Kandi Runner (Tuts+) character guides; Pixnote; Owlboy and
  Spritefy notes (see `docs/kb-notes`).
