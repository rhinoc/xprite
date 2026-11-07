# Top-down animation

Top-down sprites fail in predictable ways: the back view has a face, the sprite
bobs when the player turns, the diagonal is a rotated side view, every walk
doubles the frame count, and a flipped sprite holds its sword in the wrong
hand. The cure is a direction budget decided up front, one shared canvas and
foot row, and a short list of per-frame offsets. This file covers 3/4 top-down
(RPG, action-adventure) walk, run and idle in 4 and 8 directions. Direction
theory and proportions are `craft/37-views-and-directions.md` and
`craft/30-proportions-by-size.md`; side-view walks are `craft/42-walk-and-run.md`;
attacks are `craft/44-attacks-and-impacts.md` (a top-down sword strike is
`topdown-e-attack` below).

## Rules

1. **Fix the direction budget first.**

   | Design | Drawings per frame | Flips | Typical |
   |--------|--------------------|-------|---------|
   | 4 facings, symmetric | 3: S, N, E | W = flip of E | JRPG, Pokémon, Stardew |
   | 8 facings, symmetric | 5: S, N, E, SE, NE | W, SW, NW = flips | action RPG |
   | 4 facings, asymmetric gear | 4: S, N, E, W | none | sword always in the right hand |
   | 8 facings, asymmetric gear | 8 | none | full set; 36 run frames at 6 per view |
   | 4 facings, 8-way movement | 3 | W | Zelda: A Link to the Past walks diagonals, faces 4 ways |

   A hybrid that turns the side sprites slightly toward the camera serves E, W,
   SE and SW with 4 versions. Eight-way *movement* with 4 facings is valid and
   far cheaper than 8 facings; diagonals only pay off on large, detailed sprites.
2. **Projection: camera ~45°, light from above.** The head and hair take a large
   share of the sprite, the torso overlaps the legs, shoulders sit under the head.
   The back view (N) is almost all hair and shoulders.
3. **One canvas, one foot row, one height for every direction.** Same pixel
   height and centre of mass in S, N, E and diagonals, or the character appears
   to bob when the player turns. Cells follow the tile unit: 16×16, 16×32, 32×32;
   leave headroom for a weapon swing, no more.
4. **Layer order:** feet behind legs behind torso behind head; far limbs one
   shade darker. Cast shadow on its own layer under every direction so
   equipment swaps do not redraw it.
5. **The N view has no face.** No eyes, no nose; at most a pixel of cheek in NE.
   Face features by direction: S both eyes symmetric; SE both shifted toward the
   facing side, the far eye at the edge; E one eye hugging the front edge;
   NE a sliver of cheek only; N nothing.
6. **Walk = 4 steps from 3 drawings:** step A, stand, step B, stand. In S and N,
   step B is the flip of step A (unless gear is asymmetric); in E and W, A and B
   are two drawings. Timing 100–200 ms per frame (Pokémon 133, Stardew 200).
   Smoother: 6 frames (3 per leg, mirrored), 8, or 12 at 100 ms.
7. **Per-frame offsets (16×24 figure).** Stand = pass pose, highest. Step frame:
   head and torso 1 px lower (the legs shorten), the leading leg planted, the
   trailing foot lifted 1 px, the hand opposite the leading leg 1 px lower
   (forward), the hand on its side 1 px higher (back). Side view: feet ±3 px from
   the hip, hands ±3 px, hip 1 px lower on step frames. See the table below.
8. **Walking away (N) moves the torso and head less** than walking toward the
   camera, with the same step logic (Saint11). Walking sideways follows the
   platformer cycle with strongly contrasting hands and feet.
9. **Run: 6 frames at 100 ms (600 ms cycle)**, or 4 frames minimal. Head bob
   inside a stride is −1, −1, +2 px per frame (down, down, fast up), the fast
   rise at the pass frame where the legs meet under the torso; bounce, not sine.
   Reduce arm swing when a sword and shield are held to imply weight; exaggerate
   arms otherwise. Saint11 builds run from 3 "jump" frames and 2 "recover" frames.
10. **Match the animation to the speed.** Pokémon: 1 px/tick, 16 ticks per tile
    walk (one step–stand pair per tile), run 2 px/tick, 8 frames per tile. Use the
    foot-travel rule in `craft/42-walk-and-run.md` rule 7; do not retime the loop
    to hide a speed mismatch. One cycle at several speeds is cheaper than new art.
11. **Mirror honestly.** A flip also flips a parting, a scar, a shoulder pad and
    the weapon hand, and moves the light. Keep the weapon in the same hand in
    every orientation or budget the extra drawings. If the sprite is symmetric
    except for the weapon, draw the weapon on its own layer.
12. **Idle holds extremes longer:** 6 frames at 200, 200, 400, 200, 200, 400 ms
    (Slynyrd PB55). 2-frame idle (breathing 1 px) suffices at 16 px.
13. **Animate the base first, then overlay.** Body and armour, then cape, then
    gear (sword, shield). Hair shifts only on a couple of idle frames; keep its
    highlight moving by tiny, steady steps.
14. **Design for the animated sprite.** Limbs get their own value, not the torso's:
    hands and forearms differ from the tunic by at least two ramp steps in every
    frame (skin against sleeve in the templates), and the darkest and lightest
    values sit on the head and weapon, not in the middle of the torso. Limit the
    hair highlight to one 2 px cluster so it does not outshine the blade.
15. **Depth sort by feet.** y-sort at `y + offset` with the offset at the bottom
    of the collision box; floating or tall pieces sort by where they would touch
    the ground. Say this in the hand-off; it is not a pixel matter.

## By size

| Cell | Stored facings | Walk | Bob | Arm | Notes |
|------|----------------|------|-----|-----|-------|
| 16×16 | S, N, E (W flip) | A, stand, B, stand | 1 px | 2 px | 1 px legs, 1 px arms; head 40–50 % of height |
| 16×24 / 16×32 | S, N, E (+ SE, NE) | 4-step, or 6 frames | 1 px | 2–3 px | templates below; run adds 1 airborne frame |
| 32×32 | 5 drawings for 8 facings | 6–8 frames | 1–2 px | 3–4 px | legs and arms 2–3 px wide, hands contrast |
| 48+ | 8 unique if asymmetric | 8–12 frames | 2–3 px | 5 px | hair and cloth secondary (`craft/45-secondary-motion.md`) |

Head share: 1/3 to 1/2 of total height at small sizes; realistic proportions at
16×32 turn into a stick figure.

### Frame table, 16×24 figure (templates below)

Rows = pixel rows from the ground row (y = 1 is the boot's lowest row); hands in
the same coordinates.

| Frame | Head / torso | Leading leg | Trailing leg | Hand, leading side | Hand, trailing side |
|-------|--------------|-------------|--------------|--------------------|---------------------|
| stand | y 13–22 / 7–12 | boot y 1–2, pants 3–6 | same | y 7–8 | y 7–8 |
| step A | −1 (pants show 3–5) | unchanged, boot y 1–2 | boot y 2–3, pants 4–5 (+1) | y 8–9 (+1, back) | y 6–7 (−1, forward) |
| step B | −1 | mirror of A | mirror of A | mirror | mirror |

Side view: feet at hip ± 3, the lifted foot 1 px up; near hand and far hand
±3 px opposite the feet.

### Sheet layout and timing

| Item | Value |
|------|-------|
| Row order, 4-way | down, left, right, up (RPG Maker); or S, N, E |
| Row order, 8-way wheel | S, SE, E, NE, N, NW, W, SW |
| Columns | one row per direction in playback order, same cell size, no gaps |
| Walk | 100–200 ms per frame; 6/12 frames at 100 ms |
| Run | 6 frames × 100 ms (Slynyrd), Stardew side 6 frames 90–140 ms |
| Idle | 200, 200, 400, 200, 200, 400 ms |

## Templates

Each strip is equal-width frames, 16 columns each, ground row last. Eyes are
outline-coloured.

`topdown-sn-walk` — four frames: S stand, S step A, N stand, N step A. Step B of
each = flip of step A. Front: shorter lifted leg, head 1 px lower, opposite hands.
Back: no face, seam down the tunic, nape of the neck in skin.

```grid topdown-sn-walk
O = outline        #2b1d2e
S = skin-light     #f2b48a
H = hair           #7a4a2a
h = hair-light     #a8683a
C = tunic-light    #d9604a
c = tunic-shadow   #9c3a3c
P = pants-light    #4a5b8c
B = boot-light     #9a6a3f
---
.....OOOOOO..........................OOOOOO.....................
....OHHHHHHO.........OOOOOO.........OHHHHHHO.........OOOOOO.....
...OHHHHHHHHO.......OHHHHHHO.......OHHHHHHHHO.......OHHHHHHO....
..OHHHhhHHHHHO.....OHHHHHHHHO.....OHHHHhhHHHHO.....OHHHHHHHHO...
..OHHHHHHHHHHO....OHHHhhHHHHHO....OHHHHHHHHHHO....OHHHHhhHHHHO..
..OHHSSSSSSHHO....OHHHHHHHHHHO....OHHHHHHHHHHO....OHHHHHHHHHHO..
..OHSSSSSSSSHO....OHHSSSSSSHHO....OHHHHHHHHHHO....OHHHHHHHHHHO..
..OHSSOSSOSSHO....OHSSSSSSSSHO....OHHHHHHHHHHO....OHHHHHHHHHHO..
..OHSSOSSOSSHO....OHSSOSSOSSHO....OHHHHHHHHHHO....OHHHHHHHHHHO..
...OSSSSSSSSO.....OHSSOSSOSSHO.....OHHHHHHHHO.....OHHHHHHHHHHO..
..OOOSSSSSSOOO.....OSSSSSSSSO.....OOOSSSSSSOOO.....OHHHHHHHHO...
.OcCCCCCCCCCCcO...OOOSSSSSSOOO...OcCCCCccCCCCcO...OOOSSSSSSOOO..
.OcCCCCCCCCCCcO..OcCCCCCCCCCCcO..OcCCCCccCCCCcO..OcCCCCccCCCCcO.
.OcCCCCCCCCCCcO..OcCCCCCCCCCCcO..OcCCCCccCCCCcO..OcCCCCccCCCCcO.
.OcCCCCCCCCCCcO..OcCCCCCCCCCCcO..OcCCCCccCCCCcO..OcCCCCccCCCCcO.
.OSSCCCCCCCCSSO..OSSCCCCCCCCCcO..OSSCCCccCCCSSO..OSSCCCccCCCCcO.
.OSSccccccccSSO..OSSCCCCCCCCCcO..OSSccccccccSSO..OSSCCCccCCCCcO.
..OOPPPOOPPPOO....OOccccccccSSO...OOPPPOOPPPOO....OOccccccccSSO.
...OPPPOOPPPO......OPPPOOPPPSSO....OPPPOOPPPO......OPPPOOPPPSSO.
...OPPPOOPPPO......OPPPOOPPPOO.....OPPPOOPPPO......OPPPOOPPPOO..
...OPPPOOPPPO......OPPPOOBBBO......OPPPOOPPPO......OPPPOOBBBO...
...OBBBBOBBBO......OBBBBOBBBO......OBBBBOBBBO......OBBBBOBBBO...
...OBBBBOBBBO......OBBBBOOOO.......OBBBBOBBBO......OBBBBOOOO....
....OOOO.OOO........OOOO............OOOO.OOO........OOOO........
```

`topdown-e-walk` — side: stand, step A (near leg forward, near hand back), step B
(swapped). W = flip of E; flip the whole strip.

```grid topdown-e-walk
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
H = hair           #7a4a2a
h = hair-light     #a8683a
C = tunic-light    #d9604a
c = tunic-shadow   #9c3a3c
A = sleeve-light   #e8806a
a = sleeve-shadow  #b24c47
P = pants-light    #4a5b8c
p = pants-shadow   #34405f
B = boot-light     #9a6a3f
b = boot-shadow    #6a4529
---
......OOOOO.....................................
.....OHHHHHO..........OOOOO...........OOOOO.....
....OHHHHHHHO........OHHHHHO.........OHHHHHO....
...OHHhhHHHHHO......OHHHHHHHO.......OHHHHHHHO...
...OHHHHHHHHHO.....OHHhhHHHHHO.....OHHhhHHHHHO..
..OHHHHHHSSSSO.....OHHHHHHHHHO.....OHHHHHHHHHO..
..OHHHHHSSSSSO....OHHHHHHSSSSO....OHHHHHHSSSSO..
..OHHHHHSSOSSO....OHHHHHSSSSSO....OHHHHHSSSSSO..
..OHHHHHSSOSSO....OHHHHHSSOSSO....OHHHHHSSOSSO..
...OHHHSSSSSO.....OHHHHHSSOSSO....OHHHHHSSOSSO..
....OHSSSSSO.......OHHHSSSSSO......OHHHSSSSSO...
.....OCCAAcO........OHSSSSSO........OHSSSSSO....
.....OCCAAcO.........OCCAAcO.........OCCAAcO....
.....OCCAAcO.........OCAACcO.........OCCCAAO....
.....OCCSScO.........OAACCcaO........OCCCCAAO...
.....OCCSScO........OSSACCcssO......OsCCCCASSO..
.....OCCCCcO........OSSCCCcssO......OsCCCCcSSO..
......OPPPO..........OCCCCcOO........OCCCCcOO...
......OPPPO..........OppPPPO.........OPPPppO....
......OPPPO..........OppPPPO.........OPPPppO....
......OPPPO.........ObbbbPPPO.......OBBBBpppO...
......OBBBBO........ObbbbBBBBO......OBBBBbbbbO..
......OBBBBO.........OOOOBBBBO.......OOOObbbbO..
.......OOOO..............OOOO............OOOO...
```

`topdown-diag-walk` — diagonals, 3/4: SE stand, SE step A, NE stand, NE step A. The
torso turns toward +x, the far (left) arm is half hidden, the eyes shift; NE keeps
only a sliver of cheek. SW and NW = flips.

```grid topdown-diag-walk
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
H = hair           #7a4a2a
h = hair-light     #a8683a
C = tunic-light    #d9604a
c = tunic-shadow   #9c3a3c
A = sleeve-light   #e8806a
a = sleeve-shadow  #b24c47
P = pants-light    #4a5b8c
p = pants-shadow   #34405f
B = boot-light     #9a6a3f
b = boot-shadow    #6a4529
---
.....OOOOOO..........................OOOOOO.....................
....OHHHHHHO.........OOOOOO.........OHHHHHHO.........OOOOOO.....
...OHHHHHHHHO.......OHHHHHHO.......OHHHHHHHHO.......OHHHHHHO....
..OHHHhhHHHHHO.....OHHHHHHHHO.....OHHHHhhHHHHO.....OHHHHHHHHO...
..OHHHHHHHHHHO....OHHHhhHHHHHO....OHHHHHHHHHHO....OHHHHhhHHHHO..
..OHHHSSSSSHHO....OHHHHHHHHHHO....OHHHHHHHHHHO....OHHHHHHHHHHO..
..OHHSSSSSSSHO....OHHHSSSSSHHO....OHHHHHHHHSHO....OHHHHHHHHHHO..
..OHHSSSOSSOHO....OHHSSSSSSSHO....OHHHHHHHSSHO....OHHHHHHHHSHO..
..OHHSSSOSSOHO....OHHSSSOSSOHO....OHHHHHHHSSHO....OHHHHHHHSSHO..
...OHSSSSSSSO.....OHHSSSOSSOHO.....OHHHHHHSSO.....OHHHHHHHSSHO..
....OSSSSSSOOO.....OHSSSSSSSO.......OSSSSSSOOO.....OHHHHHHSSO...
...OacCCCCCCAaO.....OSSSSSSOOO.....OacCCcCCCAaO.....OSSSSSSOOO..
...OacCCCCCCAaO....OacCCCCCCAaO....OacCCcCCCAaO....OacCCcCCCAaO.
...OacCCCCCCAaO....OacCCCCCCAaO....OacCCcCCCAaO....OacCCcCCCAaO.
...OacCCCCCCAaO....OacCCCCCCAaO....OacCCcCCCAaO....OacCCcCCCAaO.
...OscCCCCCCSSO....OscCCCCCCAaO....OscCCcCCCSSO....OscCCcCCCAaO.
...OscCCCCCCSSO....OscCCCCCCAaO....OscCCCCCCSSO....OscCCcCCCAaO.
....OpppOPPPOO......OcCCCCCCSSO.....OpppOPPPOO......OcCCCCCCSSO.
....OpppOPPPO.......OpppOPPPSSO.....OpppOPPPO.......OpppOPPPSSO.
....OpppOPPPO.......OpppOPPPOO......OpppOPPPO.......OpppOPPPOO..
....OpppOPPPO.......OpppOBBBBO......OpppOPPPO.......OpppOBBBBO..
....ObbbbBBBBO......ObbbbBBBBO......ObbbbBBBBO......ObbbbBBBBO..
....ObbbbBBBBO......ObbbbOOOO.......ObbbbBBBBO......ObbbbOOOO...
.....OOOOOOOO........OOOO............OOOOOOOO........OOOO.......
```

`topdown-e-attack` — side (E) sword attack, three frames of 26×30: wind-up
(sword raised behind the head, body 1 px lower and leaned back), strike (torso
and head 4 px forward, front leg planted ahead, arm and blade straight along the
row), follow-through (body 1 px lower again, blade dropping forward-down). The
canvas is 6 rows taller than the 24-row walk cells because of the sword's
headroom; the feet stay on the last row in every frame, and the head, hair,
tunic and boots are the `topdown-e-walk` drawings. The west attack is a flip of E, so the blade
hand flips with it (rule 11): keep the sword on its own layer. N and S attacks
reuse the walk body: S strikes toward the camera (blade foreshortened to 2–3 px,
smear in front), N strikes away (blade hidden behind the head).
Hold anticipation 120–160 ms, strike 60–80 ms, follow-through 100–140 ms
(`craft/44-attacks-and-impacts.md`).

```grid topdown-e-attack
O = outline        #2b1d2e
S = skin-light     #f2b48a
C = tunic-light    #d9604a
c = tunic-shadow   #9c3a3c
A = sleeve-light   #e8806a
P = pants-light    #4a5b8c
p = pants-shadow   #34405f
B = boot-light     #9a6a3f
b = boot-shadow    #6a4529
H = hair           #7a4a2a
h = hair-light     #a8683a
W = blade-light    #dfe8f5
G = guard          #d9a441
---
..............................................................................
..............................................................................
..............................................................................
..............................................................................
..............................................................................
...O..........................................................................
..OWO.........................................................................
...OWO.......OOOOO........................OOOOO...............................
...OWO......OHHHHHO......................OHHHHHO....................OOOOO.....
....OWO....OHHHHHHHO....................OHHHHHHHO..................OHHHHHO....
.....OWO..OHHhhHHHHHO..................OHHhhHHHHHO................OHHHHHHHO...
.....OWO..OHHHHHHHHHO..................OHHHHHHHHHO...............OHHhhHHHHHO..
......OWOOHHHHHHSSSSO.................OHHHHHHSSSSO...............OHHHHHHHHHO..
.......OWOHHHHHSSSSSO.................OHHHHHSSSSSO..............OHHHHHHSSSSO..
........OGHHHHHSSOSSO.................OHHHHHSSOSSO..............OHHHHHSSSSSO..
........OOHHHHHSSOSSO.................OHHHHHSSOSSO..............OHHHHHSSOSSO..
.........OSHHHSSSSSO...................OHHHSSSSSO...............OHHHHHSSOSSO..
..........SOHSSSSSO.....................OHSSSSSO.................OHHHSSSSSO...
..........SSOCCCCcO.....................OCCCCcOOOOOO..............OHSSSSSO....
...........SACCCCcO.....................AAAASSOGWWWW..............OCCCCcO.....
...........SAAACCcO.....................AAAASSOOOOOO..............AACCCcO.....
............OAACCcO.....................OCCCCcO...................AAAAScO.....
............OCCCCcO................OOOOOOCCCCcO...................OCAASSO.....
............OCCCCcO...............OppppppppPPPO................OOOOCCCCSOOO...
............OpppPPPO..............OppppppppPPPO...............OppppppPPPOGWO..
............OpppPPPO.............ObbbbppppppPPPO..............OppppppPPPOOOWO.
...........ObbbbpPPPO............ObbbbOOOOOOBBBBO............ObbbbppppPPPO.OWO
...........ObbbbOBBBBO............OOOO.....OBBBBO............ObbbbOOOOBBBBO.OW
............OOOOOBBBBO......................OOOO..............OOOO...OBBBBO..O
.................OOOO.................................................OOOO....
```

## Procedure

1. Write the budget: facings (4 or 8), drawings per animation, canvas (e.g.
   16×24), symmetric or not, frames per walk and run.
2. Build a colour-coded dummy (head, torso, arms, legs in four hues) in the
   order **S, N, E, then diagonals**; rough all directions in one scene.
3. Put the directions on one timeline as a *rotation* and play it with
   `render` `filmstrip`: heights, limb thickness and centre of mass must match;
   inconsistencies pop out. For animations, compare corresponding frames of all
   directions side by side (a wheel).
4. Idle first, then step frames from the table; foot row never changes.
5. Skin the dummy: base body, then cape, then gear on separate layers
   (`craft/06-layers-and-rigging.md`).
6. Mirrored facings: `flip` on a copy of the layer; then fix
   asymmetric details by hand or note why not.
7. `setFrameDuration` `durations` per animation and `addTag` per direction
   (`walk-s`, `walk-e` …). Shadow on its own layer.
8. `validate`; `render` `filmstrip` for each direction and the full wheel.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Back view has a face | S head reused | N is hair only, skin only at the nape |
| Sprite bobs when turning | heights or foot rows differ per direction | same height, same foot row |
| Diagonal looks like a rotated side view | rotated pixels | redraw: turn torso, shift eyes, keep legs |
| Walk looks like marching in place | step frames identical heights | head 1 px lower, one foot lifted 1 px |
| Legs equal length on step frames | no leading/trailing difference | shorten the trailing leg by 1 px |
| Sword hand changes on flip | mirrored asymmetric gear | gear on its own layer, same hand |
| Hands vanish against the body | same value as tunic | sleeve and skin contrast |
| Light flips on the west view | mirroring | re-shade, or accept and state it |
| Animation outpaces movement | speed mismatch | planted-foot rule from 42 |
| Frame count explodes at 8-way | all frames unique | flips for S/E/N; unique only for asymmetric gear |

## Review

- Every direction has the same canvas, height, centre of mass and foot row.
- N shows no face; diagonals show a shifted, partial face.
- Step frames lower the head 1 px and lift one foot; hands oppose the legs.
- Flips are acceptable (symmetry checked) or the extra drawings exist.
- Diagonal frames are redrawn, not rotated.
- Idle holds the extremes longer; durations are uneven.
- Walk, run and idle tagged per direction; shadow separate.
- Silhouette passes the flat-fill test in every direction at 1×.

## Sources

- Slynyrd, Pixelblog 22 (Top Down Character Sprites), 55 (Top Down Character
  Animation), 56 (Top-Down Attack Animation), 58 (Top Down Character Animation
  Pt 3) — slynyrd.com.
- Pedro Medeiros (Saint11), TopDownWalkCycle, TopDownRun, TopDownAttack,
  TopDownTricks tutorials — saint11.art.
- pokeemerald overworld animation tables (Pokémon Gen III), Stardew Valley farmer
  sprite wiki, RPG Maker "Charsets: structure and avoiding traps".
- Sunnyside World devlog, "4, 6, 8-way character movement"; MortMort 8-direction
  top-down workflow (video); Pixnote walk-cycle notes.
- Preston Blair, *Advanced Animation* (rotating head and body guides) and
  Muybridge, *The Human Figure in Motion*, turning series 41, 58, 62–65, for the
  feature-shift and turn rules.
