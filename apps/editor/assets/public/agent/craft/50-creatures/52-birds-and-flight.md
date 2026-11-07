# Birds and flight

A bird drawn as a mammal with a beak has a knee in the wrong place and a wing that
is a flat paddle. A flap cycle built by tilting one rigid blade up and down looks like
a windmill. This file gives the body plan, the one visible leg joint that people draw
backwards, wing structure for birds and bats, the four-frame flap with body bob and
timing, and the small cases (hover, glide, perch). Quadruped anatomy is
`craft/50-creatures/50-quadrupeds.md`; follow-through in general is `craft/40-animation/45-secondary-motion.md`;
sub-pixel hover is `craft/40-animation/46-subpixel-animation.md`.

## Rules

1. **Build a bird from an egg, a ball and a cone.** Body = egg with the breast (keel)
   forward and down and the tail up and back; head = ball; beak = cone or wedge; legs
   = thin lines; the S-shaped neck is long but tucks into the shoulders at rest, so
   draw 2–3 px of it. Owls are fat pears with a big ball head; ducks and geese carry the
   S neck upright (Hultgren, Goldfinger).
2. **The visible leg joint is the ankle, and it bends backward.** The knee is hidden in
   the body feathers. Draw one kink: body → short feathered thigh → ankle (kink pointing
   **back**) → straight tarsus down → toes. Toes: 3 forward and 1 back for chicken, hawk,
   crow and songbirds; 2 forward and 2 back for parrots and woodpeckers; 2 for the ostrich.
   Anatomy gives a visible tarsus of 0.10–0.12 of standing height (chicken: head + neck
   0.35–0.40, body 0.30–0.35, tibia 0.25, tarsus 0.20 of which 0.10–0.12 shows, toes 0.08);
   stylised sprites stretch the visible leg to 0.2–0.3 so the kink reads (derived).
3. **A wing is an arm.** Short humerus against the body, two long parallel bones, a fused
   hand with the long primaries; the thumb carries a small tuft (alula). Elbow and wrist are
   coupled: they bend together or straighten together. Folded, the wing is a Z: upper arm
   back, forearm forward, hand back, tip lying along the tail root. Open, it is nearly a
   straight line from shoulder to tip, leading edge straight, trailing edge scalloped.
4. **Wing bands, three of them.** Leading edge: small coverts, 2–3 px, lightest or patterned.
   Middle: large coverts, 2 px, darker. Trailing: flight feathers as 1–2 px stripes with a
   1 px darker gap; primaries fan out like fingers at the tip, secondaries make a smooth
   rounded edge. At ≤ 16 px collapse to two tones: a light covert patch and a dark tip.
5. **Flap: four key poses, body bob opposite the wing.** Wings up (body lowest, +1) → wings
   mid on the way down (0) → wings fully down (body highest, −2) → wings mid on the way up
   (−1). The body rises fast on the downstroke and sinks 1 px as the wings recover
   (Saint11: up 3 px fast, then 1 px while the wings descend). The wing is two segments (7 + 8 px
   in the templates) so the tip can trail.
6. **Tips trail.** On the downstroke the tip bends up behind the arm; on the upstroke it bends
   down (Blair). In the templates the outer segment turns 20–35° against the inner one.
7. **Which stroke is fast.** Sources disagree: Saint11 makes the upstroke much faster than the
   downstroke; Blair's cartoon chart spends more drawings on the rising wing and a single wide
   drawing on the downstroke. Decision: use Saint11's, because it is measured from a shipped 56-frame
   loop at 80 ms and matches how birds fly (the downstroke is the power stroke, the upstroke is a
   quick folded recovery). Use Blair's snap for a slow, cartoon, heavy bird.
8. **Frame count and speed follow size.** Small birds beat fast, large birds beat slowly (see
   Timing). A convincing flap often needs fewer than 8 frames; at ≤ 16 px use 2 (up, down).
9. **Soaring is a held pose.** Wings flat, the "M" or flat-gull silhouette with finger notches
   at the tips; move 1 px of bob, a tail tilt and a slight wing flex every few frames, not a flap.
10. **Hover and fast wings.** A hovering bird bobs by sub-pixel moves; very fast wings (hummingbird,
    insects) use fewer frames or two wing copies as a light smear, not eight drawings. Falling:
    1 px per frame with the wings rising against the fall.
11. **Bat wings are hands.** Wrist peak, 3–4 finger struts radiating from it, thin membrane
    between them with scalloped trailing edge, a thumb claw at the wrist, body and head tiny.
    A bat at rest hangs head-down with the wings wrapped round the body.
12. **Beak and eye are the lone allowed orphan pixels.** Each is 1 px (2×1 beak at 16–20 px).
    Beak length 0.5–1 × the cranium; upper and lower jaw 1 px each when open. Do not use the beak
    colour anywhere else on the bird (an orange nose reads as a beak) (Cure for the lone-pixel exception,
    Pixel Logic for the misread).
13. **A walking bird is a biped with a reversed knee.** The same contact, down, pass, up structure
    as the human walk, the visible joint pointing back; the head thrusts forward on each step (derived).
    Williams makes the point with ostrich, man and horse (`craft/40-animation/42-walk-and-run.md`).
14. **Colour on the underside.** Light breast, darker back; the flight feathers darker than the
    coverts. Put dark on all extremities (tail end, wingtips) of a light bird (Hultgren).

## By size

| Canvas | What survives | Flap |
|---|---|---|
| 8 | A "v" or 3×2 body with two 1 px wing strokes; eye or beak pixel only | 2 frames: wings up, wings down |
| 16 | Egg body 8×6, ball head 4, beak 1–2 px, tail 3, leg 2 px with a 1 px ankle kink, two-tone wing | 2–4 frames |
| 32 | Three wing bands, primaries as fingers, 3+1 toes, ankle kink, breast patch | 4–6 frames |
| 64 | Individual primaries, three covert rows, eye with highlight, feathered thigh | 6–8 frames |

## Timing

| Bird | ms per frame (4-frame loop) | Cycle |
|---|---|---|
| Sparrow / swallow | 40–50 | 160–200 ms |
| Crow / pigeon | 60–80 | 240–320 ms |
| Gull / hawk | 100–140 | 400–560 ms |

Hold the wings-up frame about 1.5× the others (Blair: two ticks at the top), the mid-up frame
shortest. Source ranges: small birds 50–60 ms per frame, large 100–140 ms; Saint11's loop runs at 80 ms.

## Templates

Facing left. Roles map onto your palette; the flap frames share one canvas so the body bob is visible.

`bird-perch-20`: songbird at rest, folded Z wing, 3+1 toes, light breast.

```grid bird-perch-20
O = outline        #2b1d2e
B = feather        #4f7cb8
E = eye            #ffffff
N = eye-dark       #1a1216
Y = beak           #f0a830
S = feather-shade  #33568a
L = feather-light  #86b0e0
W = breast         #eee6d4
---
....OO..............
...OBBO.............
..OBBBBO............
.OBENBBBOO..........
OYYBBBBBOSOO........
OYBBBBBBSSSBO.......
.OOBBBBBSSSSBO......
...OBBBSSLLSSBO.....
..OBBBBBSSLLSSBOO...
..OBBBBBBBSSSSSSSO..
...OWWWWWWBBSSSSSSO.
....OWWWWWBBBSSSSSO.
.....OWWWWBBOOOSSSSO
......OOYOOYO..OOSSO
.......OYOOYO....OO.
......OYYOYYO.......
.......OO.OO........
```

`bird-hen-27`: the leg kink. The tibia runs back to the ankle, the tarsus runs down and forward, three toes forward and one back. The legs are 1 px with no outline.

```grid bird-hen-27
O = outline        #2b1d2e
R = comb           #c9302c
B = feather        #e8dcc4
E = eye            #1a1216
Y = beak-leg       #e8a730
D = tail-dark      #6b4a3a
P = wattle         #e05a4a
S = feather-shade  #b9a98a
G = far-leg        #b57f1c
L = feather-light  #fbf4e4
---
...ORRRO...................
...ORRRO...................
..OBBBBBO..................
.OOBBEBBO..............OOO.
OYYBBBBBBO............ODDDO
.OYOBBBBBO...........ODDDO.
..OPBBBBBOOOOOOO....ODDDDO.
..OPBBBBBBBBBBBBOOOODSDDO..
...OOBBBBBSBBBBBBBDSSSDDO..
....OBBBBSSSSSBBBBBSSSOO...
....OBBBBSLLSSSBBBBSSO.....
...OBBBBSSSLSSSSSBBBO......
...OBBBBBSSSSSSSSBBBO......
....OBBBBBBBSSSSSBBO.......
....OBBBBBBBBBBBBBBO.......
.....OBBBBBBBBBBBBO........
......OOBBBBBBBBOO.........
........OGOOOYOO...........
..........G...Y............
.........G...Y.............
.........G...Y.............
.......GGGGYYYY............
```

`bird-owl-22`: fat pear, ear tufts, face disc, big eyes, wings folded as dark side panels.

```grid bird-owl-22
O = outline        #2b1d2e
B = feather        #9a7350
L = face-disc      #d9bf98
E = eye-white      #fff3c4
N = pupil          #1a1216
Y = beak-feet      #f0a830
S = feather-shade  #6b4a38
W = belly          #ecdcbc
---
..O..........O..
.OBOO..OO..OOBO.
.OBBBOOBBOOBBBO.
.OBBBBBBBBBBBBO.
.OBBBLBBBBLBBBO.
.OBLLLLLLLLLLBO.
.OBLEEELLLEEEBO.
.OBLENELLLENEBO.
.OBLEEELLLEEEBO.
..OBLLLYYLLLBO..
.OOBBBBBYBBBBOO.
OSSSBBBWWBBBSSSO
OSSSBBWWWWBBSSSO
OSSSBWWBBBWBSSSO
OSSSBWWWWWWBSSSO
OSSSBWWWBWWBSSSO
OSSSSWBBWBBSSSSO
.OSSSWWWWWWSSSO.
.OSSSBWWBWBSSSO.
..OSSBBWWBBSSO..
...OOOOBBOOOO...
....YY.OOYY.....
```

Flap cycle: `bird-flap-1` wings up, body lowest; `bird-flap-2` wings mid on the way down; `bird-flap-3` wings fully down, body highest; `bird-flap-4` wings mid on the way up with tips trailing. Durations 90 / 60 / 60 / 40 ms for a crow-size bird.

```grid bird-flap-1
O = outline        #2b1d2e
D = flight-feather #233d66
B = feather        #4f7cb8
L = feather-light  #86b0e0
S = feather-shade  #33568a
N = eye-dark       #1a1216
Y = beak           #f0a830
W = breast         #eee6d4
---
............OO..............
...........ODDO.............
..........ODDDO.............
..........ODDDO.............
..........ODDO..............
.........ODDDO..............
.........ODDDO..............
........ODDDDO..............
........OBBBBO..............
........OBBBBO..............
........OBLLLSO.............
...OOOO.OLLLLSO.............
..OBBBBOOOLLLLSO............
.OBBNBBOLLLLLLLLOO........O.
OYYBBBBLLLLLLLLLLBO..OOOOOSO
OYBBBBBLLLLLLLLLLBBOOSSSSSSO
.OOOBBBLLLLLLLLLLBBSSSSSSSSO
....OBBLLLLLLLLLLBBSSSSOOOO.
.....OWWWWWWWWWWWWOOOOO.....
......OOWWWWWWWWOO..........
........OOOYYOOO............
...........OO...............
............................
```

```grid bird-flap-2
O = outline        #2b1d2e
D = flight-feather #233d66
S = feather-shade  #33568a
B = feather        #4f7cb8
L = feather-light  #86b0e0
N = eye-dark       #1a1216
Y = beak           #f0a830
W = breast         #eee6d4
---
............................
............................
............................
.......................O....
....................OOODO...
..................OODDDDO...
................OODDDDDDO...
...............OSDDDDDDDO...
..............OBBDDDDDOO....
.............OBBBDDDOO......
...OOOO.....OLLLBBDO........
..OBBBBOOOOOLLLLBSO.........
.OBBNBBOLLLLLLLLSO........O.
OYYBBBBLLLLLLLLLLBO..OOOOOSO
OYBBBBBLLLLLLLLLLBBOOSSSSSSO
.OOOBBBLLLLLLLLLLBBSSSSSSSSO
....OBBLLLLLLLLLLBBSSSSOOOO.
.....OWWWWWWWWWWWWOOOOO.....
......OOWWWWWWWWOO..........
........OOOYYOOO............
...........OO...............
............................
............................
```

```grid bird-flap-3
O = outline        #2b1d2e
B = feather        #4f7cb8
N = eye-dark       #1a1216
L = feather-light  #86b0e0
Y = beak           #f0a830
S = feather-shade  #33568a
W = breast         #eee6d4
D = flight-feather #233d66
---
............................
............................
............................
............................
............................
............................
............................
............................
...OOOO.....................
..OBBBBOOOOOOOOO............
.OBBNBBOLLLLLLLLOO........O.
OYYBBBBLLLLLLLLLLBO..OOOOOSO
OYBBBBBLLLLLLLLLLBBOOSSSSSSO
.OOOBBBLLLLLLLLLLBBSSSSSSSSO
....OBBLLLLLLLLLLBBSSSSOOOO.
.....OWWWWWWLLLLBWSOOOO.....
......OOWWWWWLLBBSSDDOO.....
........OOOYYBBBBDDDDDDOO...
...........OOOBBDDDDDDDDDO..
..............ODDDDDDDDDDDO.
...............OOODDDDOOOO..
..................OODDDO....
....................OOO.....
```

```grid bird-flap-4
O = outline        #2b1d2e
D = flight-feather #233d66
B = feather        #4f7cb8
L = feather-light  #86b0e0
S = feather-shade  #33568a
N = eye-dark       #1a1216
Y = beak           #f0a830
W = breast         #eee6d4
---
....................OO......
..................OODDO.....
.................ODDDDO.....
...............OODDDDDO.....
..............ODDDDDDO......
.............ODDDDDDO.......
............OBBDDDOO........
............OBBBDO..........
...........OLLBBSO..........
...OOOO....OLLLLO...........
..OBBBBOOOOLLLLSO...........
.OBBNBBOLLLLLLLLOO........O.
OYYBBBBLLLLLLLLLLBO..OOOOOSO
OYBBBBBLLLLLLLLLLBBOOSSSSSSO
.OOOBBBLLLLLLLLLLBBSSSSSSSSO
....OBBLLLLLLLLLLBBSSSSOOOO.
.....OWWWWWWWWWWWWOOOOO.....
......OOWWWWWWWWOO..........
........OOOYYOOO............
...........OO...............
............................
............................
............................
```

`bird-soar-28`: gliding, front view; leading-edge covert band, primaries notched like fingers.

```grid bird-soar-28
O = outline        #2b1d2e
B = feather        #7a5a3e
L = covert-light   #b08a62
E = eye            #ffffff
D = primary-dark   #2e2018
Y = beak-talon     #f0a830
S = feather-shade  #4d3626
---
............OOOO............
...........OBBBBO...........
.....OOO..OBBBBBBO..OOO.....
....OLLLOOOBBBBBBOOOLLLO....
..OOLLLLLLOBEBBBEOLLLLLLOO..
.OBBBBBBLLLOBBBBOLLLBBBBBBO.
ODDDDDBBBBLLBBYBLLBBBBDDDDDO
ODDDDDBBBBBBBBBBBBBBBBDDDDDO
.OODDOBBBBBBBBBBBBBBBBODDOO.
...OOOBBOBBBBBBBBBBOBBOOO...
......OO.OOBBBBBBOO.OO......
...........OSSSSO...........
..........OSSSSSSO..........
..........OSSSSSSO..........
...........OOOOOO...........
```

Bat, front view: `bat-wings-up` and `bat-wings-down` are the two extremes; wrist peak, three fingers to the scalloped edge, light membrane panels near the body.

```grid bat-wings-up
O = outline        #1f1a2e
D = wing-bone      #3b2a52
B = membrane       #6d4a8a
F = fur            #4a3a66
E = eye            #ff5a5a
L = membrane-light #9570b4
W = fang           #f4efe0
S = fur-shade      #3b2a52
---
...OOOOO..............OOOOOO...
..ODDDBBO....O..O....OBBBDDDO..
..OBBBDDDO..OFOOFO..OBDDDBBO...
.OBBBBDDDDO.OFFFFO.OBDDDDBBBO..
.OBBBDBDDBDOOFFFFOOBDBDDBDBBO..
..OODBBDBDBDEFFFEOBDBDBDBBDO...
...OBBBDBDBBDFFFFBDBBDBDBBO....
..OBBBDBBDLLLWFWFDLLBDBBDBBO...
...OOODBBDLLLFFFFLLLBDBBDOO....
.....OBBBBDLLFFFFLLLDBBBO......
......OOOODLLFFFFLLLDOOO.......
..........OOOFFFFOOOO..........
.............OFFO..............
.............OSSO..............
..............OO...............
...............................
...............................
```

```grid bat-wings-down
O = outline        #1f1a2e
F = fur            #4a3a66
E = eye            #ff5a5a
B = membrane       #6d4a8a
D = wing-bone      #3b2a52
W = fang           #f4efe0
L = membrane-light #9570b4
S = fur-shade      #3b2a52
---
...............................
.............O..O..............
............OFOOFO.............
............OFFFFO.............
............OFFFFO.............
......OOOO..EFFFEO..OOOO.......
.....OBDDDOOOFFFFOOOBDDDOO.....
...OODDDBBDDDWFWFDDDDBBDDDO....
..OBDBDDDBBBLFFFFLBBBBDDDBDOO..
.ODDBBDDDBLLLFFFFLLLBBDDBDBDDO.
ODBBBDBDBDLLLFFFFLLLBBDDBBDBBDO
OBBBBDBDBDLLLFFFFLLLBDBBDBDBBO.
.OOODBBDBBDBOOFFOOBBBDBBDBODO..
...OBBBDBBDO.OSSO.OBDBBBDBOO...
....OOODBOODO.OO...ODBBODO.....
......OBO..O........OOBOO......
.......O..............O........
```

## Procedure

1. Pick the bird, canvas and facing. Palette: back, breast, flight feather (3 tones), beak, eye;
   `palette` op `ramp` for the back.
2. Rig with `addLayer`: `wing-far`, `tail`, `body`, `head`, `wing-near`, `legs` (omit legs in flight).
   Keep the wing on its own layer so it can move as one piece (`craft/00-core/06-layers-and-rigging.md`).
3. Draw the body egg and head ball, then the beak and eye pixel. Check the silhouette with `render`.
4. Wing: draw it open as two segments, then bands (coverts, flight feathers, primaries). Fold it with the Z rule
   for the perched pose.
5. Flap: `addFrame` to four frames. Draw wings up, wings down first, then the two mids. Move the body per
   frame with `translate` using the +1, 0, −2, −1 offsets; add tip trail on the mids.
6. `render` `filmstrip`, then `render` `onionSkin`: the wing should sweep an arc and the tip should lag. `setFrameDuration`
   from the Timing table; `addTag` the loop `fly`. `validate` for orphan pixels (beak and eye are fine).

## Mistakes

- **Bird with a knee** (leg bends forward) → knee drawn instead of the ankle → rule 2, kink points back.
- **Windmill flap** → one rigid blade rotated → two-segment wing with a trailing tip and body bob.
- **Mushy wing** → one flat colour → three bands and darker primaries.
- **Four toes forward** → toe count wrong → 3 forward, 1 back (2 + 2 for parrots).
- **Everything flaps in sync** → body does not move → bob opposite the wing, tail one frame late.
- **Eagle with a pigeon's wing** → no finger notches → notch the trailing edge at the primaries.
- **Fused beak and face** → beak the same colour as the head → give the beak its own tone.
- **Tiny bird with an 8-frame flap at 100 ms** → too slow → 4 frames at 40–50 ms.
- **Bat as a bird with membrane** → wing drawn from the shoulder outward → draw the wrist peak and fingers first.

## Review

- Is there exactly one leg kink and does it point back, with 3 + 1 toes (or the species' count)?
- Wing in three bands with darker primaries, or two tones at ≤ 16 px; folded wing is a Z.
- Flap: body lowest on wings-up, highest on wings-down, tip trailing, not a rigid blade.
- Durations vary and match the bird's size; the wing-up frame is held longest.
- Beak and eye are single pixels; no other orphan pixels; beak colour not reused.
- The loop closes, the cycle is tagged, and `render` `filmstrip` shows four different silhouettes.

## Sources

- Eliot Goldfinger, *Animal Anatomy for Artists*, pp. 218–223 (chicken skeleton, pigeon feathers).
- Ken Hultgren, *The Art of Animal Drawing*, pp. 8–9, 18 (bird construction, owl wings as hands).
- Preston Blair, *Advanced Animation*, p. 18 (eight-drawing flight cycle).
- Pedro Medeiros (Saint11), *Wings* tutorial (56 frames at 80 ms); Slynyrd, Pixelblog 25 (flight cycle, front view).
- Richard Williams, *The Animator's Survival Kit*, p. 329 (ostrich, man, horse walk).
- Michael Azzi, *Pixel Logic*, pp. 79, 104 (feature colours that misread as a beak); Cure (Logan Tanner), *The Pixel Art Tutorial* (2010), lone pixels that carry an eye or a beak.
