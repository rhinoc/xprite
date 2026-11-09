# Small creatures

Fish, bugs, frogs and snakes get drawn as miniature mammals: a fish with a head and shoulders, an insect with four legs and a face, a snake as a stiff tube. Each group has a short list of parts that must be present and a movement that is unlike a mammal's. This file gives part counts, proportions and templates for fish, insects and spiders, frogs and snakes, and the cheapest animation that sells each. Blob monsters (slimes) and big creatures are `54-monster-design`; wings are `52-birds-and-flight`; quadrupeds are `50-quadrupeds`.

## Rules

1. **Count the parts before you draw.** Fish: body, tail, dorsal fin, belly fin, pectoral fin, gill arc, eye. Insect: 3 body segments (head, thorax, abdomen), 6 legs (3 pairs on the thorax), 2 antennae, 0 or 2–4 wings on the thorax. Spider: 2 body segments, 8 legs, no antennae. Frog: head with raised eyes, body, 2 big folded hind legs, 2 short arms, no tail. Snake: a tube with a wedge head, no limbs. A sprite missing one of its parts reads as a different animal.
2. **One idea per sprite at 8 px, one accent pixel.** 8 px: silhouette plus an eye or a colour dot. 12–16 px is the minion size (about half the hero's height); keep to 2–3 colours, a main body colour plus a contrasting accent (a green fish with yellow lips and fins), and let colour, not outlines, separate fins from the body (Pixel Logic).
3. **Fish: tail fan = a quarter to a third of body length (derived).** Dorsal fin on the top third, belly fin below the mid-line, eye in the front third, large and high, gill arc one body-height behind the eye. Countershade: dark back, light belly. Stripes and bands follow the body curve; straight vertical stripes look like a sticker.
4. **Swim by waving, not by sliding.** A fish moves as an S wave from head to tail with the tail lagging; the tail's trailing edge wavers 1–2 px, half object colour and half background (Ferrari, fish tails and corals). Four frames: tail up 1 px, tail centre, tail down 1 px, tail centre; body tilts 1 px opposite to the tail; fins flutter on a different period (`45-secondary-motion`).
5. **Water changes colour.** Deeper means bluer and less saturated: red goes first, then orange and yellow (Gurney: red is gone within about 10 ft / 3 m, orange and yellow by about 25 ft / 7.6 m). A deep-water fish keeps its warm accent small or darkens it.
6. **Insects: tripod legs.** Three legs per side, each 2 segments with the knee outward and up; when walking, three legs (front and hind on one side, middle on the other) move together and the other three plant (derived from standard insect gait). Antennae are 2–3 px dark lines, never outlined.
7. **Wings are pale, not transparent.** No alpha: draw wings as a pale blue-white tone with 1–2 vein pixels, drawn behind the thorax. Fast wings (bee, fly) use 2 frames or a second wing copy as blur, not a full flap (`52-birds-and-flight`, Saint11 *Wings*).
8. **Beetle vs bee vs spider silhouettes.** Beetle: one oval shell split down the middle, head a darker cap, 6 legs poking out. Bee or wasp: the three segments visible, striped abdomen, wings up. Spider: small round body, 8 thin legs with raised knees; people instinctively fear the thin, long, angular shapes, so use them for threats (Saint11).
9. **Frog: coil, stretch, land.** Sit: big thigh mass, arms short, eye bumps on top of the head, mouth a single 1 px line across the face. Hop = a bouncing ball: squash on the ground (coiled), full stretch with the hind legs extended in the air, landing squash with the front hands first (Blair). Rabbit-style hops drop all detail in the fast frames: stretched oval, compact ball at the apex, stretched landing (Thomas & Johnston).
10. **Snake: head leads, body follows the path.** Every body segment follows the track of the head, with a constant wave amplitude; the wave travels from head to tail. Each frame shifts the wave by about a quarter of its length (derived). Head wedge wider than the neck; a 1–2 px forked tongue on the flick frames; belly scutes lighter than the back.
11. **Turtle, crab and shells.** Shell is a dome with the head and legs as small separate pieces that can withdraw (Blair); the head retracts by hiding behind the shell outline, not by shrinking. Crab: wide flat body, 2 claws, 6 small legs, eyes on stalks.
12. **Small things move in jerks.** A mouse or beetle runs in starts and stops, not a smooth cycle; use a 2-frame idle, a 4-frame walk and hold lengths (80 / 80 / 120 / 80 ms) instead of more drawings (Thomas & Johnston, Bambi's mouse; Sprite Fusion notes). Squash and stretch ≤ 1 px at 16 px (`05-animation`).

## By size

| Canvas | Fish | Insect / spider | Frog / snake |
|---|---|---|---|
| 8 | Oval + tail triangle + eye pixel | 2×3 body, 2 antenna px, legs implied by 1 px each side | 4×3 blob with two eye bumps; 6 px wavy line |
| 16 | Body 10×6, tail 4, dorsal and belly fin, eye 1 px, belly light tone | Three segments or one shell, 3 leg px per side, antenna 2 px | Sit pose with thigh mass and eye bumps; snake 2 px thick, 2 bends |
| 32 | Fins as separate shapes, gill arc, bands, eye with ring | Legs in 2 segments, wing veins, spots, abdomen stripes | Frog with throat pouch, toe nub; snake with diamond pattern and tongue |
| 64 | Scale clusters (not every scale), fin rays as 1 px lines, shadow on the belly | Compound eye highlights, segmented legs with spines | Skin texture clusters, toe pads, tongue |

## Templates

`fish-19`: side view, tail fan, dorsal and belly fins, eye in the front third, light belly. The base for any minnow or piranha.

```grid fish-19
O = outline        #16324a
F = fin            #e8863a
S = body-shadow    #2f7aa0
B = body           #4aa3c8
E = eye            #ffffff
N = pupil          #1a1216
L = belly          #cfe9f1
---
......OOO..........
.....OFFFO.........
...OOFFFFFO.....OO.
..OSSSSSSSSO...OFFO
.OSBBBBBBBBSOOOFFFO
OBEBSBBBBBBBSFFFFO.
OBNBSBBBBBBBBFFFFO.
OLLLSBBBBBLLLFFFFO.
.OLLLLLBBLLLOOOFFFO
..OOLLLLLLOO...OFFO
....OOOFFO......OO.
.......OO..........
```

`fish-37`: the same plan at 32-class: spiny dorsal fin, pectoral fin on the flank, pelvic fin, gill arc and bands that bend with the form.

```grid fish-37
O = outline        #16324a
F = fin            #e8863a
S = body-shadow    #2f7aa0
B = body           #4aa3c8
G = fin-dark       #b8561f
E = eye            #ffffff
N = pupil          #1a1216
L = belly          #cfe9f1
---
.................O...................
............O...OFO..................
...........OFO.OFFFO..OO.............
..........OFFFOFFFFFOOFFO............
..........OFFFFFFFFFFFFFFO.........O.
.........OFFFFFFFFFFFFFFFO........OFO
......OOOOSSSSSSSSSFFFFFFO.......OFFO
....OOSSSSBBBBSBBBBSSSSOO......OOFFO.
...OSSSSSSBBBBSBBBBSBBBSSO....OFFGFO.
..OSEEEBBSBBBSBBBBSBBBBSSSO..OFGGGFO.
.OSSENEBBSBBBSBBBBSBBBBSBSSOOFGGGFFO.
OSSBENEBBSBFFSBBBBSBBBBSBBSSGGGGGFFO.
OLBBBBBBBSFFFBBBBSBBBBSBBBBLGGGGGFFO.
OLLLBBBBBSFFFFBBBSBBBBSBBLLLOFGGGFFO.
.SSLLLBBBSFFFFBBBBSBBBBLLLLO.OFGGGFO.
..OLLLLLLLBBBSBBBBSLLLLLLLO...OFFGFO.
...OLLLLLLLBBSBBLLLLLLLLLO.....OOFFO.
....OOLLLLLBBBSLLLLLLLLOO........OFFO
......OOOOLLBBLLLLLOOOOOO.........OFO
..........OFFFFFOOOGGGGGGO.........O.
..........OFFFFO...OGGGGO............
...........OFFO.....OGGO.............
...........OFO.......OO..............
............O........................
```

`bug-bee-22`: three segments, striped abdomen, fuzzy thorax, two pale wings drawn behind the body with vein pixels, 1 px legs and antennae that are not outlined.

```grid bug-bee-22
O = outline        #2a1f1a
W = wing           #cfe6f5
V = wing-vein      #8fb3cc
D = leg            #3a2a1a
L = fuzz-light     #ffe27a
B = body-yellow    #f2c230
S = stripe-dark    #3a2a1a
E = eye            #ffffff
N = pupil          #1a1216
---
..........OWWWO.......
.........OWWWWWO......
........OWWWVWOOOO....
........OWWVWWWWWWO...
.......OWWWWWWWWWWO...
..D....OWWWWWWWWVO....
.D.D..OOWWWWWWVOOO....
D.ODOOLLLLWWBSSBBBOO..
.OBBBLLLLLLBBSSBBBSSO.
OBBBBBLLLLLBBSSBBBSSO.
OBENBBLLLLLBBSSBBBSSO.
OBBBBBLLLLBBBSSBBBSSO.
.OBBBOOLLOOOBSSBBBOSBO
..OOO.DOOD..OOOOOO.OO.
......D..D............
.....D....D...........
```

`bug-beetle-23`: top view; shell split down the middle with a highlight, spots, dark head cap, six legs and two antennae.

```grid bug-beetle-23
D = head-legs      #3a2a2e
O = outline        #241a2a
E = eye            #ffffff
B = shell          #3f8f4a
S = shell-shade    #256233
L = shell-light    #8fd070
Y = spot           #f0d040
---
....D.......D.....
.....D.....D......
......DOOOD.......
.....ODDDDDO......
....ODDDDDDDO.....
....ODDEDDEDO.....
.....ODDDDDO......
....OBBDSDBSO.....
...OBLLBSBBBSO....
DDOBLLLLSBBBBSO.DD
..DDLLLLSBBBBSDD..
..OBBLLBSBBBBSO...
..OBBBBBSBBYYSO...
DDDDBBBBSBBYBBDDDD
..OBBBBBSBBBBSO...
..OBBBBBSBBBBSO...
..DDBYYBSBBBBSDD..
.DOSBBBBSBBBBSO.D.
D..OSBBBSBBBSO...D
....OSBBSBBSO.....
.....OSSSSSO......
......OOSOO.......
........O.........
```

`bug-spider-24`: top view, eight legs each with a raised knee (mirrored left and right), eyes, hourglass mark.

```grid bug-spider-24
D = leg            #2a1c38
O = outline        #1a1220
S = abdomen-shade  #3a2552
E = eye            #ff4a4a
B = abdomen        #5a3a7a
L = abdomen-light  #8a62b0
Y = mark           #e6d6a8
---
..........OOOO..........
....DD...OSSSSO...DD....
...D..D.OSSSSSSO.D..D...
..D....DOSESSESOD....D..
.D..DD..OSSSSSSO..DD..D.
D..D..DOBBLSSBBSOD..D..D
..D....OBLLLBBBSO....D..
.D.DD..OBLLLBBBBO..DD.D.
D.D..DOBBLLLBBBBSOD..D.D
.D....OBSBLYYBBSSO....D.
D......OBBBYYBBBO......D
.....DDOBBBYYBBSODD.....
....D..OSSBBBBSSO..D....
...D....OOSSSSOO....D...
..D.......OOOO.......D..
.D....................D.
```

`frog-sit-24`: crouched, thigh mass, eye bumps on top, one mouth line, light belly.

```grid frog-sit-24
O = outline        #1b3a2a
B = skin           #5aa84a
E = eye-white      #fff8c8
L = skin-light     #98d56a
N = pupil          #1a1216
S = skin-shadow    #3a7a3a
P = mouth-line     #2a4a2a
W = belly          #e8f0c0
---
...OOO.OOO..............
..OBBBOBBBO.............
..OBBBBBEBOOOOOOOO......
..OEEEBLBNLLLLLLLLO.....
.OLENNBBBBBBBBBBBBO.....
OLBBBBBBBBBBBBBBBBBO....
OSBBBBBBBBBBBBBBBBBO....
.OSBBBBBBBBBBBBBBBBBO...
OPPPPPPWBBBBBBBBBBBBO...
..OWWWBBWWWBBBBBBBBBO...
..OWWWBBWWWSSSSBBBBBO...
...OOOSSSSSSSSSSSSBBOO..
...OLLSSSOOOOOOSSSSSSSO.
....OOOOO......OOOSSSSSO
..................OOOOO.
```

`frog-leap-32`: the stretched hop pose; hind legs trailing, arms reaching forward, body on a diagonal. Pair it with `frog-sit-24` as the squash frame.

```grid frog-leap-32
O = outline        #1b3a2a
L = skin-light     #98d56a
E = eye-white      #fff8c8
B = skin           #5aa84a
N = pupil          #1a1216
P = mouth-line     #2a4a2a
S = skin-shadow    #3a7a3a
W = belly          #e8f0c0
---
.....OOO.OOO....................
....OLLLOLLEO...................
....OEEELBBBN...................
....OENNBBBBLOOOO...............
....OBBBBBBBBLLLLOOO............
....OBBBBBBBBBBBBLLLO...........
..OPPPPPBBBBBBBBBBBBLOO.........
.....OBBBBBBBBBBBBBBBLLO........
.OOOOOBSSSSSSSBBBBBBBBBBO.......
OLLLLLSSSSSOWWWWWWBBBBBBO.......
OSSSSSSOOOWWWWWWWWWWBBBBBO......
.OOOOOO...OWWWWWWWWSSBSBBBOO....
...........OOOOOOOOSSSSSSSBBO...
...................OOSOSSSSSSOOO
.....................O.OOOSSSSSS
..........................OOOSSS
```

`reptile-snake-37`: head wedge, S curve that narrows to the tail, belly lighter than the back, diamond marks. Shift the wave by a quarter length for each frame.

```grid reptile-snake-37
O = outline        #20301f
S = scales-shade   #3f7a3a
B = scales         #6aa84f
D = pattern        #2f5a2d
L = belly          #d6e6a0
N = pupil          #1a1216
E = eye            #ffe85a
---
.....................OOOOOO..........
....................OSSSSSSOO........
..................OOSBBDLLBSSO.......
.................OSSBBLLOOLLBSO......
...OOOO.........OSBBDLOO..OOLLSO.....
..OBBBBO.......OSBBBLO......OOLSO....
.OBBBBBBOO...OOSBBBLO.........OLSO...
OBBBNEBBBSOOOSSBDBLO...........OLSOO.
.OBBBBBBBBSSSBBBBLO.............OLLSO
.OBBBBBBBBBBBBBLLO...............OOLO
..OOOOLLBDBBBLLOO..................O.
......OOLLLLLOO......................
........OOOOO........................
```

## Procedure

1. Write the part list (rule 1) and the colour plan: main body ramp (3 tones), one accent, one belly tone. `palette` op `ramp` for the body.
2. Block in the main mass with `ellipse` or `stroke` ops on one layer; add the secondary mass (fin, shell, thigh). Check the silhouette: `render` at 1× and in one flat colour.
3. Add parts in order of size: tail or legs, fins or wings, eye, the one accent. Place legs, antennae and 1 px details **after** the outline pass so they stay single-pixel.
4. Shade from the upper left (top lighter, belly or underside darker); keep stripes on the form.
5. For animation: split fins, tail, wings or legs onto layers (`06-layers-and-rigging`), draw the two extremes (tail up / down, squash / stretch, wave phase 0 / ½), then the in-betweens. `render` `filmstrip`, `setFrameDuration` with uneven holds, `addTag` the loop.
6. `validate`: orphan pixels are allowed only for an eye, a vein or a leg tip that is a single deliberate pixel.

## Mistakes

- **Fish with shoulders** (neck, chin, round head) → body not tapering → one smooth oval into the tail.
- **Insect with four legs, or legs from the abdomen** → rule 1 → three pairs from the thorax.
- **Wings drawn in front of the body as flat blobs** → draw behind, pale, with one vein.
- **Frog that looks like a green dog** → no eye bumps, no folded hind leg → add the thigh Z and the raised eyes.
- **Snake as a rigid tube** → no wave or constant thickness → head wedge, curve narrowing to the tail, wave shifted per frame.
- **Outlines on 1 px legs and antennae** → the outline pass thickens them to 3 px → draw them after the outline.
- **Spider legs that look like a fence** → straight, evenly spaced lines → raise the knees and fan the legs unevenly.
- **Squash too big on a tiny sprite** → ≥ 2 px at 16 px → 1 px only, or use hold timing.
- **Muddy small fish** → black inlines between body and fins → drop the inlines, let colour separate them.

## Review

- Are all parts present (rule 1), and does the silhouette read as the right group in one flat colour?
- Fish: tail fan, dorsal fin, eye in the front third, light belly; stripes follow the form.
- Insects and spiders: 6 or 8 legs, legs from the thorax, antennae as unoutlined 1 px lines.
- Frog: raised eyes, folded hind leg, one mouth line. Snake: head wedge, narrowing tail, belly lighter.
- 1 px features are 1 px wide; no thickened legs.
- Animated loops use two extremes and uneven holds; the wave or hop closes cleanly.

## Sources

- Preston Blair, *Advanced Animation*, pp. 20, 23 (turtle, frog hop as a bouncing ball); Ken Hultgren, *The Art of Animal Drawing*, pp. 110–112 (rabbit, bunched and stretched).
- Frank Thomas and Ollie Johnston, *The Illusion of Life*, PDF pp. 354, 357 (rabbit hop, the mouse).
- Michael Azzi, *Pixel Logic*, pp. 79, 93–94, 106 (fish colour, small-sprite readability, dropping inlines).
- Slynyrd, Pixelblog 27 *Under the Sea* (corals, algae, 4–6 swatches per specimen); Pedro Medeiros (Saint11), *Wings* and *Silhouette* tutorials.
- James Gurney, *Color and Light* (colour under water); Ferrari's conference talk on pixel animation tricks (wavering edge for fish tails and corals).
- Daniel Silber, *Pixel Art for Game Developers*, pp. 95–100 (squash and stretch).
