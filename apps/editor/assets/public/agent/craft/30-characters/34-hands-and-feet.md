# Hands and feet

At 32 px a hand is a dozen pixels and a boot a dozen more, yet they decide whether a figure grips, points, stands or floats. Without a size ladder an agent draws five-pixel fingers on a 16 px sprite (noise) or a featureless blob that gestures nothing (mush); without a foot rule the sprite hovers, skates or changes shoe size between frames. This file is the ladder: what a hand and a foot are at each size, in each view, with the pose templates to copy. Proportions are `30-proportions-by-size`; the walk itself is `42-walk-and-run`.

## Rules

**Hands**

1. **Size by figure height; never enlarge a hand to "make it read".** Skin bounding box (inside the outline, front view, fist × open hand): 8 px figure → 1×1; 16 px → 3×3 × 4×4; 32 px → 5×4 × 5×6; 48 px → 7×6 × 7×8; 64 px → 9×8 × 11×13 (the open hand's thumb adds 4 px of width). A relaxed hand hanging at the side is one step smaller: 2×2 at 16 px, 4×4 at 32 px. Basis: hand ≈ ¾ of head height (Loomis, derived) and measured sprites (the gallery in Pixel Logic runs 3–9 px). Blair's 3×3 palm "at 16 px" is a close-up cartoon scale. A hand more than 1 px larger than these numbers in either direction is a style choice (heavy, cute), never an accident.
2. **Mitten first, fingers last.** Block a palm mass, add the thumb as a separate bump, then split the finger mass. Below 5 px there are no fingers: a mitten and at most one thumb pixel. Draw the pose, not the anatomy.
3. **Fingers arrive in a fixed order:** one notch splitting the index off at 32 px; three fingers + thumb at 48 px; four fingers at 64 px. Never four equal parallel fingers: middle longest, little shortest, ring ≈ index. Three fingers
   + thumb is a legitimate stylisation at any size.
4. **Separate fingers with value, not black.** Under about 6 px wide, a finger gap is one skin-shadow pixel or a notch in the silhouette. A dark line between 1 px fingers reads as a barcode and eats the hand's only light.
5. **The thumb points a different way from the fingers.** Show it when the hand holds, points or pinches; omit it on a relaxed hand at ≤ 16 px. Its base is a fleshy lump, so give it one pixel of light, not an outline stub.
6. **At 16 px one corner pixel is the gesture.** A rounded fist whose bounding corner is filled turns: none = delicate fist; top-left = points at the face; bottom-left = hand dips or points down; top-right = beckon or uppercut out; bottom-right = reads as an elbow; three corners = heavy "hamfist"; all four = punch straight at the viewer (Tsu). A flat edge facing in, up or down turns a ball into a slap or a tray; a flat face turned outward looks wrong unless it is armour. See `hands-16-corners`.
7. **A cuff separates hand from sleeve.** One lighter or darker band at the wrist (Blair). At ≤ 16 px the sleeve's end is the edge of the hand: sleeves can stand in for hands entirely.
8. **Hands get the highest contrast on the limb in fast motion** (Saint11): skin or glove against a dark sleeve, or the reverse, so the eye can follow them through a swing. Never let hand and sleeve share a value.
9. **A grip is the hand fused to the handle.** Draw the fist; let the handle show 1 px beyond it on each end (guard above, pommel below); one dark line or shade step between skin and wood; the weapon crosses the hand and leaves the silhouette on a different axis than the forearm (BJG's trainer poses). Hold the object's offset from the fist constant while the body is steady (`45-secondary-motion`, rule 10). Object shapes: `73-props-and-items`.
10. **Handedness is a design decision.** `flip` swaps hands: move the thumb to the correct side, re-draw anything asymmetric, and keep the weapon in the same hand in every direction, which makes 8 directions 8 unique drawings, not 5 plus mirrors (Slynyrd PB55). Flip a finished hand for the other arm and then fix it; hands are the most expensive part to draw twice (Tuts+).
11. **An arm in front of the torso keeps its outline** (Saint11). Where hand meets body, leave a 1 px gap or a clear value step; a hand tangent to the torso outline fuses into it (`03-silhouette-and-form`).
12. **Build six hands per character at its sprite size** and reuse them: relaxed, fist, open, point, grip, reach or wave. Every other pose is a rotation or flip of these (Blair). A hand redrawn slightly differently each frame flickers.
13. **Personality lives in the hand; change one parameter, not all.** Weight: hand 1–2 px wider than the ladder, flat-edged (Solarski). Cute: small triangular limbs with stubby 3-finger hands (Saint11). Monsters: one exaggerated feature, a claw or a giant palm, instead of five normal fingers (Bancroft; `54-monster-design`).

**Feet**

14. **Feet plant the figure.** The lowest foot pixel sits on the same row in every frame; both feet share that row unless one is lifted (Pixnote). A foot that is 3 px tall moves in thirds of its height, so lift it a whole pixel or not at all (Silber).
15. **Side-view foot length ≈ head height** (Loomis, cross-checked: Muybridge's 32 px feet are 4–5 px long). Inside the outline: 8 px figure → 1–2 px; 16 px → 3–4 px; 32 px → 5–6 px; 48 px → 8–10 px. Heavy or armoured characters get a flatter, wider wedge; a goofy character a bigger one (Blair).
16. **A boot is shaft + foot + one sole line.** 16 px: 2 px shaft, 3–4 px foot, the bottom outline row is the sole. 32 px: add a toe-cap highlight and a darker heel pixel. 48 px: cuff band, toe cap, heel block and a sole band one step darker than the boot.
17. **Divide boot from trouser by colour, not outline** (Tsu). Keep black where the shapes need separating (the sole, between the legs). The bottom outline row may be dropped when the ground contrasts: the eye bridges the gap and the row goes to detail.
18. **Four foot poses carry a walk** (Muybridge; frame tables in `42-walk-and-run`): heel strike (heel down, toe up: a 2 px wedge at 32 px), flat (sole on the ground line), toe-off (heel up, toes on the ground), swing (foot off the ground, toe low). A run lands on the ball or flat foot under the body, never heel first.
19. **View changes the shape.** Front: feet splay a little outward and the boot is the widest part of the leg. Back: heel and sole line only, no toe cap. Top-down: toes toward the viewer with a lighter cap, legs foreshortened to 2–3 px behind the foot (`47-top-down-animation`). 3/4 is in `37-views-and-directions`.
20. **Toes are not drawn below 48 px.** At 32 px a bare foot gets at most three bumps along the bottom edge; the big toe separates only at 48 px and up (Tsu: toenails and gaps become blobs).
21. **Heels change everything.** A heel adds about 4 px of height and tilts the foot wedge down toward the toe; flat shoes add 1 px (Slynyrd PB52). Say which one the character wears before drawing the leg.
22. Paws, hooves and talons are in `50-quadrupeds` and `54-monster-design`.

## By size

| Figure | Hand (inside outline) | What is drawn | Foot / boot (inside outline) |
|--------|----------------------|---------------|------------------------------|
| 8 px | 1 px | one skin pixel at the sleeve end; a weapon pixel simply overlaps it | 1 px per foot; side view 2 px |
| 16 px | fist 3×3, open 4×4, relaxed 2×2 (1 px if the arm is 1 px wide and unoutlined) | mitten; thumb nub only when holding or pointing; one corner pixel for the gesture | 3–4 px long × 2 tall, shaft 2 px |
| 32 px | fist 5×4, open 5×6, relaxed 4×4 | one finger notch, thumb wedge, shadow on the lower edge; grips read through the handle | 5–6 px × 3 tall, shaft 3 px, toe-cap light |
| 48 px | fist 7×6, open 7×8 | curl line on a fist, open = 3 fingers + thumb, gaps in skin-shadow | 8–10 px × 5 tall, cuff, sole band, heel block |
| 64 px | fist 9×8, open 11×13 | four fingers, thumb apart, finger gaps in skin-shadow, palm shade on the lower and right edges; knuckle wrinkles only if the light needs them (`hands-64-front`) | 12–14 px × 7 tall, laces or buckles allowed |

Detail budget: a hand is at most 2 light-ramp steps below 32 px, 3 at 48 px. A highlight on a hand that is not on the fingertips or the knuckle row is noise (`14-readability-and-scale`).

## Templates

All hand sheets show a hand with a forearm stub in `sleeve` colours. **Front** = the character faces the viewer, or the palm/back of the hand does. **Side** = the character faces right, near hand. Cells are separated by one blank column; to draw one cell, copy its columns `[i × stride, i × stride + width)` into `applyBatch` `grid` and map the roles onto the sprite's own palette. Light is from the upper left.

**8 px.** Four 5-px cells (stride 6): arm hanging, sword grip (blade above, grip pixel below the skin pixel), arm raised, arm pointing. The hand is the only skin pixel.

```grid hands-8-arms
L = skin-light  #f2b48a
C = sleeve-mid  #4f77b0
M = blade-light #d9e1ea
W = grip-mid    #a0663a
---
..C......M....L........
..C......M....C....CCLL
..L....CCL...C.........
.........W...C.........
```

**16 px, front.** Cells 7 × 7 (stride 8): relaxed, open palm, fist, sword grip, point, wave. Use for characters facing the viewer or gestures toward the camera.

```grid hands-16-front
O = outline       #2b1d2e
L = skin-light    #f2b48a
D = skin-shadow   #c47a5a
C = sleeve-mid    #4f77b0
c = sleeve-shadow #36568a
M = blade-light   #d9e1ea
m = blade-shade   #8d9bb0
W = grip-mid      #a0663a
w = grip-shadow   #6c4228
Y = guard-gold    #e2b94c
---
.OCCO.....OOO.....OOO.....OMmO.....O......O.O..
.OCCO....OLLLO...OLLLO....OMmO....OLO....OLOLO.
.OccO....OLLLO...OLLDO...OYYYYO...OLO....OLLLO.
.OLLO...OLLLLO...OLDDO...OLLLLO..OLLLO..OLLLLO.
.OLDO....OOLDO....OCCO...OLDDLO..OLLDO...OOLDO.
..OO......OCCO....OccO....OWwO....OCCO....OCCO.
..........OccO............OOOO....OccO....OccO.
```

**16 px, side.** Cells 9 × 7 (stride 10): relaxed, reaching open hand (thumb up), punching fist, sword grip, point, raised hand. The grip cell is the weapon pose for side-on sprites.

```grid hands-16-side
O = outline       #2b1d2e
L = skin-light    #f2b48a
D = skin-shadow   #c47a5a
C = sleeve-mid    #4f77b0
c = sleeve-shadow #36568a
M = blade-light   #d9e1ea
m = blade-shade   #8d9bb0
W = grip-mid      #a0663a
w = grip-shadow   #6c4228
Y = guard-gold    #e2b94c
---
.OCCO.........OOO....OOOOOO.......Mm.....OOOOOOOO....OO....
.OCCO......OOOOLOO..OCCCCLLO......Mm....OCCCLLLLO...OLLO...
.OccO.....OCCCLLLLO.OccccLDO......Mm....OcccLDOO....OLLLO..
.OLLO.....OcccLDDDO..OOOOOO...OOOYYYY....OOOOO......OLLO...
.OLLLO.....OOOOOOO............CCCCLLO...............OCCO...
..OOO.........................ccccLDO...............OccO...
..............................OOOOWwO...............OCCO...
```

**16 px fist corners.** Six 6 × 6 cells (stride 7): none, top-left, bottom-left, top-right, bottom-right, three corners. Rule 6 says what each one means.

```grid hands-16-corners
O = outline     #2b1d2e
L = skin-light  #f2b48a
D = skin-shadow #c47a5a
---
..OO....OOO.....OO.....OOO....OO....OOOO.
.OLLO..OLLLO...OLLO...OLLLO..OLLO..OLLLLO
OLLLLO.OLLLLO.OLLLLO.OLLLLO.OLLLLO.OLLLLO
OLLLDO.OLLLDO.OLLLDO.OLLLDO.OLLLDO.OLLLDO
.ODDO...ODDO..OLDDO...ODDO...ODDDO.OLDDO.
..OO.....OO....OOO.....OO.....OOO...OOO..
```

**32 px, front.** Cells 13 × 10 (stride 14): relaxed, open (finger notch + thumb), fist, sword grip, point, wave (the open hand sheared; alternate it with its mirror for a 2-frame wave).

```grid hands-32-front
O = outline       #2b1d2e
L = skin-light    #f2b48a
D = skin-shadow   #c47a5a
C = sleeve-mid    #4f77b0
c = sleeve-shadow #36568a
M = blade-light   #d9e1ea
m = blade-shade   #8d9bb0
W = grip-mid      #a0663a
w = grip-shadow   #6c4228
Y = guard-gold    #e2b94c
---
...OCCCO.........O.OO..........OOOO..........OMmO...........O.................O.OO.
...OCCCO........OLOLLO........OLLLLO.........OMmO..........OLO...............OLOLLO
...OcccO........OLDLLO........OLLLDO.........OMmO..........OLO..............OLDLLO.
..OLLLLO........OLLLLO.......OLLLDDO.......OYYYYYYO.......OOLLLO............OLLLLO.
..OLLLDO.......OLLLLLO........OLDDDO........OLLLLO........OLLLDO..........OLLLLLO..
..OLLDDO.......OLLLLDO.........OCCCO........OLLDDO........OLLDDO..........OLLLLDO..
...OLDDO........OOLLDO.........OCCcO........OLDDDO.........OLDDO..........OOLLDO...
....OOO..........OCCCO.........OcccO.........OWwO..........OCCCO..........OCCCO....
.................OCCcO.......................OWwO..........OCCcO..........OCCcO....
.................OcccO.......................OOOO..........OcccO..........OcccO....
```

**32 px, side.** Cells 14 × 12 (stride 15): relaxed, open reach, punching fist, sword grip (guard, blade, pommel), point, raised hand.

```grid hands-32-side
O = outline       #2b1d2e
L = skin-light    #f2b48a
D = skin-shadow   #c47a5a
C = sleeve-mid    #4f77b0
c = sleeve-shadow #36568a
M = blade-light   #d9e1ea
m = blade-shade   #8d9bb0
W = grip-mid      #a0663a
w = grip-shadow   #6c4228
Y = guard-gold    #e2b94c
---
..OCCCO........OOOOOO.OO......OOOOOOOOOO..............OO....OOOOOOOOOOOOOO....OO.........
..OCCCO........CCCCCCOLLOOO...CCCCCCLLLLO............OMmO...CCCCCCLLLLLLLO...OLLO........
..OcccO........CCCCCCLLLLLLO..CCCCCCLLLDO............OMmO...CCCCCCLLLDOOO....OLLLO.......
..OLLLO........ccccccLDDDDDO..ccccccLLDDO............OMmO...ccccccLDDDO......OLLLLO......
..OLLLLO.......OOOOOOOOOOOOO..OOOOOOOOOOO............OMmO...OOOOOOOOOOO......OLLLO.......
..OLLDDO..........................................OYYYYYYO...................OLLDO.......
...ODDO......................................OOOOOOLLLLLO....................OCCCO.......
....OO.......................................CCCCCCLLLDO.....................OCCcO.......
.............................................ccccccLDDDO.....................OcccO.......
.............................................OOOOOOOWwOO.................................
...................................................OWwO..................................
...................................................OOOO..................................
```

**48 px, front.** Cells 16 × 13 (stride 17): relaxed, open (three fingers + thumb, gaps in shadow), fist (knuckle highlight, curl shadow), sword grip, point, wave.

```grid hands-48-front
O = outline        #2b1d2e
L = skin-light     #f2b48a
D = skin-shadow    #c47a5a
H = skin-highlight #fbd6b4
C = sleeve-mid     #4f77b0
c = sleeve-shadow  #36568a
M = blade-light    #d9e1ea
m = blade-shade    #8d9bb0
W = grip-mid       #a0663a
w = grip-shadow    #6c4228
Y = guard-gold     #e2b94c
---
...OCCCCO..............O..............OOOOO............OMmO..............O......................O....
...OCCCCO............OOLOO...........OHHLLLO...........OMmO.............OLO...................OOLOO..
...OCCCcO...........OLDLDLO..........OHLLLLO...........OMmO.............OLO..................OLDLDLO.
...OccccO...........OLDLDLO..........OLLLLDO...........OMmO.............OLO..................OLDLDLO.
..OHLLLLO.........OLOLDLDLO.........OLLDDDDDO........OYYYYYYO..........OOLLO..............OLOLDLDLO..
.OLLLLLDO.........OLLLLLLLO.........OLLLDDDDO........OOOOOOOO.........OHLLLLO.............OLLLLLLLO..
.OLLLLDDO.........OLLLLLLDO..........OODDDDO..........OHLLLLO........OLLLLLLDO...........OLLLLLLDO...
..OLLDDDO..........OOLLLLDO..........OCCCCO..........OLLLLLDO........OLLLLLDDO............OOLLLLDO...
...OLDDDO...........OLLLDO...........OCCCcO..........OLLLDDDO.........OLLDDDDO............OLLLDO.....
....OOOO............OCCCCO...........OccccO...........OLDDDO...........OCCCCO.............OCCCCO.....
....................OCCCcO.............................OWwO............OCCCcO............OCCCcO......
....................OccccO.............................OWwO............OccccO............OccccO......
.......................................................OOOO..........................................
```

**48 px, side.** Cells 17 × 14 (stride 18): relaxed, open reach with thumb band, punching fist, sword grip, point, raised hand.

```grid hands-48-side
O = outline        #2b1d2e
L = skin-light     #f2b48a
D = skin-shadow    #c47a5a
H = skin-highlight #fbd6b4
C = sleeve-mid     #4f77b0
c = sleeve-shadow  #36568a
M = blade-light    #d9e1ea
m = blade-shade    #8d9bb0
W = grip-mid       #a0663a
w = grip-shadow    #6c4228
Y = guard-gold     #e2b94c
---
..OCCCCO..........OOOOOOOO.OOOO.....OOOOOOOOOOOOO...............OO......OOOOOOOOOOOOOOOOO.....OOO..........
..OCCCCO..........CCCCCCCCOLLLLOOO..CCCCCCCCHLLLLO.............OMmO.....CCCCCCCCHLLLLLLLO....OLLLOO........
..OCCCcO..........CCCCCCCCLDDDDLLO..CCCCCCCCLLLLLDO............OMmO.....CCCCCCCCLLLLLLOOO....OLLLLLO.......
..OccccO..........CCCCCCCCLLLLLLLO..CCCCCCCCLLLLDDO............OMmO.....CCCCCCCCLLLLDDO......OLLLLLLO......
..OHLLLO..........ccccccccLLLDDDDO..ccccccccLLDDDDO............OMmO.....ccccccccLLDDDDO......OLLLLLO.......
..OLLLLLO.........OOOOOOOOOOOOOOOO..OOOOOOOOOOOOOO.............OMmO.....OOOOOOOOOOOOOO.......OLLDLLLO......
..OLLLLDDO..................................................OYYYYYYYO........................OLLDDDO.......
..OLLLDDDO............................................OOOOOOOHLLLLLO.........................OOLLDO........
...OLDDDO.............................................CCCCCCCLLLLLDO..........................OCCCCO.......
....OOOO..............................................CCCCCCCLLLDDDO..........................OCCCcO.......
......................................................cccccccLLDDDO...........................OccccO.......
......................................................OOOOOOOOWwOOO........................................
.............................................................OWwO..........................................
.............................................................OOOO..........................................
```

**64 px, front.** Cells 20 × 18 (stride 21): open (four fingers, thumb apart, gaps in skin-shadow), fist (three visible finger curls over a curl line, thumb across), sword grip (guard, fist over the handle, 2 px of handle and a pommel below). Palm shade sits on the lower and right edges; the only highlights are on fingertips and knuckles.

```grid hands-64-front
O = outline        #2b1d2e
L = skin-light     #f2b48a
D = skin-shadow    #c47a5a
H = skin-highlight #fbd6b4
C = sleeve-mid     #4f77b0
c = sleeve-shadow  #36568a
M = blade-light    #d9e1ea
m = blade-shade    #8d9bb0
W = grip-mid       #a0663a
w = grip-shadow    #6c4228
Y = guard-gold     #e2b94c
---
.........OO.......................................OMMmO.......
........OHLOOO....................................OMMmO.......
......OOOLLDHLO...................................OMMmO.......
.....OHLDLLDLLO...................................OMMmO.......
.....OLLDLLDLLOOO...........OOOOOOO..........OOOOOOOOOOOOOOO..
.....OLLDLLDLLDHLO.........OHDLLDLLO.........OYYYYYYYYYYYYYO..
.....OLLDLLDLLDLLO........OHLDLLDLLDO..........OHLDLLDLLDO....
..OOOOLLDLLDLLDLLO........OLLDLLDLLDO..........OLLDLLDLLDO....
.OLLLOLLDLLDLLDLLO........OLLDLLDLLDO..........OLLDLLDLLDO....
.OLLLDLLLLLLLLLLLO........OLLDLLDLLDO..........OLLDLLDLLDO....
.OLLLLLLLLLLLLLLDO........ODDDDDLLLDO..........ODDDDDLLLDO....
..OLLLLLLLLLLLLDDO........OHLLLLLLLDO..........OHLLLLLLLDO....
...OLLLLLLLLLLLDDO........OLLLLLLLDDO..........OLLLLLLLDDO....
....OLLLLLLLLLDDO..........OLLLLLDDO............OLLLLLDDO.....
.....OCCCCCCCCCCO..........OCCCCCCCO.............OOOOOOO......
.....OCCCCCCCCCcO..........OCCCCCCcO..............OWWwO.......
.....OccccccccccO..........OcccccccO..............OWWwO.......
.....OccccccccccO..........OcccccccO..............OOOOO.......
```

**Feet, 8 px.** Four 5-px cells (stride 6): front stand, side stand, contact, pass.

```grid feet-8-poses
B = boot-mid    #8a5a3a
P = trouser-mid #5a6a8a
---
.P.P....P.....P.....P..
.P.P....P....P.P....P..
.B.B....BB..B...B...P..
....................B..
```

**Feet, 16 px, side.** Three 8-px cells (stride 9): stand, heel strike, toe-off.

```grid feet-16-side
O = outline     #2b1d2e
B = boot-mid    #8a5a3a
P = trouser-mid #5a6a8a
---
.OPPO.....OPPO......OPPO..
.OPPO.....OBBO......OBBO..
.OBBO.....OBBBBO.....OBBBO
.OBBBBO...OBBBBBO.....OBBO
.OOOOOO...OOOOOO......OOOO
```

**Feet, 16 px, other views.** Three 12-px cells (stride 13): front pair, back pair, top-down pair.

```grid feet-16-views
O = outline     #2b1d2e
B = boot-mid    #8a5a3a
b = boot-shadow #5c3a26
T = boot-light  #b98458
P = trouser-mid #5a6a8a
---
.OPPO..OPPO...OPPO..OPPO...OOO...OOO..
.OPPO..OPPO...OPPO..OPPO..OTBBO.OTBBO.
.OBBO..OBBO...OBBO..OBBO..OTBBO.OTBBO.
OBBBO..OBBBO..ObbO..ObbO..OBBBO.OBBBO.
OOOOO..OOOOO..OOOO..OOOO...OOO...OOO..
```

**Feet, 32 px, side.** Three 10-px cells (stride 11): stand (flat), heel strike (toe up, 2 px wedge), toe-off (heel up). Trouser in `trouser` colours, boot in `boot`.

```grid feet-32-side
O = outline        #2b1d2e
B = boot-mid       #8a5a3a
b = boot-shadow    #5c3a26
T = boot-light     #b98458
P = trouser-mid    #5a6a8a
p = trouser-shadow #3e4b68
---
.OPPPO......OPPPO.......OPPPO...
.OPPpO......OPPpO.......OPPpO...
.OpppO......OpppO.......OpppO...
.OBBBO......OBBBO.......OBBBO...
.OTBBO......OTBBBBO.....OTBBBO..
.OTBBBBO....OBBBBBBBO....OBBBBO.
.OBBBBBBO...OBBBBBBO.....ObBBBBO
.ObbBBBBO...ObbBBBO.......OBBBBO
.OOOOOOOO...OOOOOO.........OOOO.
```

**Feet, 32 px, other views.** Three 14-px cells (stride 15): front pair (outward toes), back pair (heel + sole shade, no cap), top-down pair (toe caps toward the viewer).

```grid feet-32-views
O = outline        #2b1d2e
B = boot-mid       #8a5a3a
b = boot-shadow    #5c3a26
T = boot-light     #b98458
P = trouser-mid    #5a6a8a
p = trouser-shadow #3e4b68
---
.OPPPO..OPPPO...OPPPO..OPPPO....OOO....OOO..
.OPPpO..OPPpO...OPPpO..OPPpO...OBBBO..OBBBO.
.OpppO..OpppO...OpppO..OpppO...OBBBO..OBBBO.
.OBBBO..OBBBO...OBBBO..OBBBO..OTBBBBO.OTBBBO
.OTBBO..OTBBO...OBBBO..OBBBO..OTTBBBO.OTTBBO
OTBBBO..OTBBBO..OBBBO..OBBBO...OTBBO..OTBBO.
OBBBBO..OBBBBO..ObbbO..ObbbO....OOO....OOO..
OOOOOO..OOOOOO..OOOOO..OOOOO................
```

**Feet, 32 px, bare.** Side cell 14 px wide (arch lifted a pixel off the ground line), then a front pair 15 px wide (three toes each, separated by outline notches); both start at stride 15.

```grid feet-32-bare
O = outline     #2b1d2e
L = skin-light  #f2b48a
D = skin-shadow #c47a5a
---
.OLLLO..........OLLLO...OLLLO.
.OLLLO..........OLLLO...OLLLO.
.OLLDO..........OLLDO...OLLDO.
.OLLLLO........OLLLLDO.OLLLLDO
.OLLLLLLO......OLLLLLO.OLLLLLO
.OLDLLLLLO.....OLOLOLO.OLOLOLO
.OOO.OOOOO......OOOOO...OOOOO.
```

**Boot, 48 px, side.** One cell: cuff band, shaft shade, toe cap, heel block, sole band.

```grid feet-48-side
O = outline        #2b1d2e
B = boot-mid       #8a5a3a
b = boot-shadow    #5c3a26
T = boot-light     #b98458
S = sole           #3a2a2e
P = trouser-mid    #5a6a8a
p = trouser-shadow #3e4b68
---
..OPPPPO......
..OPPPpO......
..OppppO......
.OTTTTTO......
.OTBBBBO......
..OTBBBO......
..OTBBBO......
..OTBBBBO.....
..OTBBBBBBO...
..OBBBBBBBBO..
.OBBBBBBTTBBO.
.ObbBBBBBBBBO.
.ObbSSSSSSSSO.
..OOOOOOOOOO..
```

**Boots, 48 px, front pair.** One cell: cuffs, toe splay, sole band across both boots.

```grid feet-48-front
O = outline        #2b1d2e
B = boot-mid       #8a5a3a
T = boot-light     #b98458
S = sole           #3a2a2e
P = trouser-mid    #5a6a8a
p = trouser-shadow #3e4b68
---
..OPPPPO....OPPPPO..
..OPPPpO....OPPPpO..
..OppppO....OppppO..
.OTTTTTO...OTTTTTO..
.OTBBBBO...OTBBBBO..
.OTBBBBO...OTBBBBO..
OTTBBBBBO.OTTBBBBBO.
OTBBBBBBO.OTBBBBBBO.
OBBBBBBBO.OBBBBBBBO.
OSSSSSSSO.OSSSSSSSO.
OOOOOOOOO.OOOOOOOOO.
```

## Procedure

1. `getContext`. Read the figure height and the head height; look up hand and foot size in the table. Write the size down before drawing anything.
2. Decide the pose from the six-hand library (rule 12) and the view (front, side, top-down). Pick the template whose size row matches; at an in-between height take the smaller one and add a pixel to the thumb or toe cap, not to the palm.
3. Draw the limb first (sleeve, trouser), then stamp the hand or boot with `applyBatch` op `grid` at the limb's end, using `transparent: "skip"` so the limb underneath survives. Map roles onto the sprite's palette with `palette` op `get`; the example hexes only make the template renderable.
4. Hands that grip: draw the object first on its own layer, then the fist on top, so the handle runs behind the fingers and shows at both ends.
5. `render`, then `readPixels` `format:"grid"` on the hand region: count the hand's pixels against the ladder and check that no hand pixel touches the torso's outline.
6. Other hand: copy the cel, `flip` `direction: "horizontal"`, then redraw thumb and cuff. Weapon hand stays fixed across directions (rule 10).
7. Animated: keep arms, hands and feet on stable layers (`06-layers-and-rigging`); run `render` `filmstrip` and `render` `onionSkin` on the hand layer; the lowest foot pixel must stay on one row and the hand's pixel count must not change between frames unless the pose does.
8. `validate`; fix orphan pixels at fingertips by moving them into the cluster, not by deleting the finger (`11-clusters-and-noise`).

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hand is a rake of 1 px stripes | four equal fingers drawn at 16–32 px | rule 2: mitten + thumb; one notch at most |
| Hands vanish into the sleeve | same value for skin and sleeve, no cuff | rule 7 and 8: cuff band, push skin against a dark sleeve |
| Hand bigger than the face | hand scaled to be "readable" | rule 1; shrink and move the information to the silhouette (thumb, handle) |
| Grip looks like a hand beside a stick | handle visible through the fingers, no overlap | rule 9: fist over handle, 1 px of handle at each end |
| Sword in the wrong hand after turning | mirrored cel | rule 10: redraw the grip, thumb on the right side |
| Fist is a perfect square | no corner decision | rule 6: add or cut one corner pixel |
| Feet hover or slide | lowest foot pixel changes row | rule 14; fix with `render` `onionSkin` |
| Boots all identical wedges | one template used for every pose | rule 18: heel strike, flat, toe-off, swing |
| Feet tiny under a big body | foot sized to the hand | rule 15: foot ≈ head height, wider when heavy |
| Black line between boot and leg, figure looks striped | outline used where colour would do | rule 17 |
| Front-view boots look like pillars | no splay, no toe | rule 19: toes out, one highlight pixel on the cap |

## Review

- Hand size is on the ladder for this figure height (±1 px), and every frame uses the same size.
- No individual fingers below 48 px; no four equal parallel fingers at any size.
- Hand and sleeve differ in value; a cuff or colour step marks the wrist.
- A gripped object overlaps the fist and shows at both ends; its axis differs from the forearm's.
- The thumb is on the correct side after any flip.
- The lowest foot pixel is on one row in every frame; the feet are no larger than about one head in length.
- Boot and trouser are separated by colour; black remains only at the sole and between legs.
- The view is respected: no toe caps on a back view, no heel-first run.
- No hand pixel is tangent to the torso outline.

## Sources

- Loomis, *Figure Drawing for All It's Worth*, hands and feet (pp. 184–186).
- Hampton, *Figure Drawing: Design and Invention*, hand and foot chapters (pp. 160–215).
- Blair, *Advanced Animation*, mitten-and-thumb construction (p. 16), feet (pp. 4–15).
- Solarski, *Drawing Basics and Video Game Art*, "Hand" and "Foot".
- Muybridge, *The Human Figure in Motion*, walk and run plates (pp. 17, 35, 63).
- Pixel Logic (Andrew Moore), ch. 4 Readability, hands (pp. 97–98, 168, 182).
- Silber, *Pixel Art for Game Developers*, limbs and idle motion (pp. 36–40, 107).
- Bancroft, *Creating Characters with Personality*, hands and feet by age and style.
- Tsu, pixel tutorials 7, 8, 11 (corner-pixel fist, boots, small hands); Saint11 (Jump, Cuteness,
  Pipeline); Slynyrd Pixelblog PB52, PB55; Pixnote and Tuts+ small-sprite guides; BJG trainer-sprite measurements.
