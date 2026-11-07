# Monster design

A generated monster is usually a pile of scary parts: four animals' worth of horns, claws,
eyes and teeth on a body with no shape. It reads as noise at 1×, and no two of them look
different in silhouette. This file gives a way to decide what the creature is, shape language
that makes it read in one glance, a build order (silhouette → colour blocks → finish),
slime, undead and dragon rules, size by game role, and templates for each. General character
silhouette is `craft/30-characters/36-character-design.md`; animal anatomy is `craft/50-creatures/50-quadrupeds.md`; small
animals are `craft/50-creatures/53-small-creatures.md`.

## Rules

1. **Answer five questions in one line before drawing.** Animal, vegetable or mineral? Its goal?
   Its strength and its weakness? Proud or shy? Beast of burden or conqueror? (Bancroft). The
   weakness becomes a visible target (an exposed eye, a soft belly, a slow wind-up).
2. **Pick one dominant shape and let the silhouette say it.** Circle: friendly, safe, soft. Square:
   strong, stable, a brute. Triangle and spike: aggressive, dynamic, dangerous. Irregular organic:
   unpredictable. Put it in the whole outline first, then echo it in the eyes, mouth and limbs
   (Solarski, Saint11). A round creature in a spiky world reads as vulnerable; a spiky creature in
   a round world reads as the aggressor (`craft/90-style/91-composition-and-scenes.md`).
3. **Danger vocabulary lives at the extremities.** People instinctively dislike snake-like and
   spider-like shapes, long thin limbs, spikes and complicated sharp shapes (Saint11). Put them in
   horns, claws and tail, not in the core: a spiky core plus spiky limbs is a hedgehog of noise.
4. **Give it one identifying element.** A flat head, tank treads, a single huge eye, one broken
   horn. The element survives the silhouette test and every recolour (Saint11, Dawe: "charm points").
5. **Shake and bake, but only 2–3 sources.** Assign each source animal or object a body region: head
   from one, limbs from another, tail from a third (cow ears, snake body, chicken feet, lizard tail
   → dragon). More than three look like noise; keep the head and body balanced so the head is not
   stuck on (Bancroft).
6. **Heavy brute formula.** Small head sunk between the shoulders, huge jaw, barrel chest, tiny
   hips, short legs, long heavy arms with big fists: the weight sits high, which reads as menace
   (Blair). Invert it for speed: narrow shoulders, long legs, small fists (derived).
7. **Build in three passes, each readable alone.** (a) Silhouette in one flat colour: can you name
   it and its pose? (b) Colour-coded blocks per part (head, torso, arms, legs, wings, tail), so parts can
   be moved independently. (c) Final palette with light and shadow; detail "just far enough until the
   mind fills in the rest" (Slynyrd). Imaginative monsters skip the anatomy dummy; blob the design in
   three flat colours, then recolour and refine.
8. **Size is a role.** Minion 12–16 px (about half the hero), hero 24–32, boss 64–128 (2–4× the hero),
   final boss 128–256. A size ratio is part of the silhouette; heuristics, not standards.
9. **Eyes first.** Cute: big, low in the head, wide-set, round. Menace: slit or angled, close-set,
   heavy brow. One huge eye or many small ones = alien. At 16 px an eye is 2×2 or 1×2 px. A fang or tusk is
   one white pixel against a dark mouth.
10. **One signature hue per creature.** Keep it out of the rest of the cast's dominant colours. Villains
    lean dark, cool or heavy (purple, deep red, cold grey) against a warm hero; red reads as energy and
    menace. Pull the creature's colours from 3–4 hue families of its environment so it sits in the scene;
    one complementary accent (eyes, horns). A ramp is 5–8 swatches (`craft/20-color/20-color-for-pixel-art.md`).
11. **Slime and goo.** A squash and stretch toy: neutral, squash (about 1.3× wide, 0.8× high), stretch
    (0.7× wide, 1.45× high), with the pixel area roughly constant (derived: 138–144 px). Silber's
    example goes to 2× wide and ½ high for a cartoon extreme. Four tones (Saint11): hard small specular, base,
    reflection, shadow; at 20 px drop the reflection and keep specular, base, shadow. Avoid sharp corners; the body is a dome with a
    flat base and a 1 px wet edge. A drip starts wide and asymmetric and gets taller and thinner every
    frame; thick goo hangs longer, bubbles are heavy and slow, thick slime forms bridges and holes
    (Saint11 *Goo*). Breathing is sub-pixel (`craft/40-animation/46-subpixel-animation.md`).
12. **Dragons: three families.** Western: heavy four-legged, bat wings, long spade tail, red with
    gold. Eastern: serpentine body, four short legs, no wings, green. Wyvern: two hind legs, the wings are
    the forelimbs with claws, a tail stinger, blue or purple. Each gets a 4–6 swatch palette (Slynyrd).
    A wing is an arm: draw the bone structure first, then the membrane (`craft/50-creatures/52-birds-and-flight.md`).
13. **Undead.** Skulls: eye sockets and nose carry the read (2×2 sockets, 1–2 px nose); ribs are
    alternating bone and gap rows; joints are delayed in motion. Bone piles are noisy, irregular shapes
    with the brighter, more detailed skulls on the border. Ghosts without alpha: one cold monochrome
    ramp, detail only in eyes, mouth and outline, a wavy hem, a sine bob on y (Saint11 *Holograms*).
14. **Tail as counterweight.** A big tail or arm swings opposite the torso so the creature balances
    (Blair, crocodile); a heavy creature gets a slow wind-up (`craft/40-animation/44-attacks-and-impacts.md`).
15. **Ground it.** A small dithered elliptical shadow under the creature seats it on the ground;
    flyers get the shadow offset below them (derived).
16. **Bestiary sets must differ in silhouette.** Give each creature in a set a different dominant
    shape (circle, wedge, bar, triangle) and mass distribution (low and wide vs chest-heavy vs top-heavy)
    (Hultgren). Contrast fat vs thin and tall vs short so each reads against the others.

## By size

| Canvas | What survives | Palette and detail |
|---|---|---|
| 8 | One shape and an eye pixel; spikes as single pixels | 3 colours + outline |
| 16 | Minion: silhouette with one identifying element, 2×2 eyes, 1 px fangs, one accent | 3–4 tones, no inner outlines |
| 32 | Two shape echoes (limbs, head), horns and claws, brow, mouth, shading in 3 tones | 5 tones, small highlight clusters |
| 64 | Boss: armour/scale clusters, facial planes, secondary elements (cables, drips, bones) | 7–9 swatches, one dithered ground shadow |

## Templates

Shape language: the same 28–35 px canvas, three dominant shapes.

`monster-round-28`: a circle. Big low wide-set eyes, tiny feet, soft ears, a smile. Friendly or cowardly.

```grid monster-round-28
O = outline        #2a1838
L = body-light     #b890e8
S = body-shadow    #5a3a98
B = body           #8a5ac8
E = eye-white      #fff4c8
N = pupil          #1a1216
---
....OOOO............OOOO....
...OLLLSO..........OLLLSO...
..OLBBBBSO..OOOO..OLBBBBSO..
..OLBBBBSOOOLLLSOOOLBBBBSO..
..OSBBBBBLLLBBBBLLLBBBBBSO..
...OSBBBBBBBBBBBBBBBBBBSO...
....OLBBBBBBBBBBBBBBBBSO....
....OLBBBBBBBBBBBBBBBBSO....
....OLBBBEEEEBBBBEEEEBSO....
..OOLBBBBEENEBBBBEENEBBSOO..
.OLLBBBBBENNEBBBBENNEBBBLSO.
OLBBBBBBBENNEBBBBENNEBBBBBSO
OLBBBBBBBBBBBBBBBBBBBBBBBBSO
OLBBBBBBBBBBBLLBBBBBBBBBBBSO
OSBBSBBBBBBLLLLLLBBBBBBSBBSO
.OSSOLBBBBLLNLLLNLBBBBSOSSO.
..OOOSBBBBLLLNNNLLBBBBSOOO..
.....OSBBBBLLLLLLBBBBSO.....
......OSSBBBBLLBBBBSSO......
......OOOLBBBBBBBBSOOO......
.....OLLLBBBSSSSBBBLLSO.....
.....OLBBBBSOOOOLBBBBSO.....
.....OSSSSSSO..OSSSSSSO.....
......OOOOOO....OOOOOO......
```

`monster-square-34`: a square. Head sunk between the shoulders, huge arms ending in fists, short legs, heavy brow, underbite. A brute.

```grid monster-square-34
O = outline        #2a1838
A = accent         #f0a830
L = body-light     #b890e8
S = body-shadow    #5a3a98
E = eye-white      #fff4c8
B = body           #8a5ac8
N = pupil          #1a1216
W = tooth-claw     #f4efe0
P = inner-mouth    #c83a5a
---
...........OO........OO...........
..........OAAOOOOOOOOAAO..........
..........OAALLLLLLLLAAO..........
...........OLSSSSSSSSSO...........
...........OLEEEBBEEESO...........
...........OLENEBBENESO...........
.OOOOOO....OLLWBBBBWSSO....OOOOOO.
OLLLLSSOOOOOLLPPPPPPSSOOOOOLLLLSSO
OLLLLSSOLLLLBBBBBBBBBBLLSSOLLLLSSO
OLLBBSSOLLLLBBBBBBBBBBLLSSOLLBBSSO
OLLBBSSOLLBBBBBBBBBBBBBBSSOLLBBSSO
OLLBBSSOLLBBBBBBBBBBBBBBSSOLLBBSSO
OLLBBSSOLLBSSSSSSSSSSSSBSSOLLBBSSO
OLLBBSSOLLBBBBBBBBBBBBBBSSOLLBBSSO
OLLBBSSOLLBBBBBBBBBBBBBBSSOLLBBSSO
OLLBBSSOLLBBBBBBBBBBBBBBSSOLLBBSSO
OLLBBSSOLLBBBBBBBBBBBBBBSSOLLBBSSO
OLLBBSSOLLBBBBBBBBBBBBBBSSOLLBBSSO
OLLBBSSOSLBBBBBSSSSBBBBBSSOLLBBSSO
OLLBBSSOSLBBBBBSSSSBBBBBSSOLLBBSSO
LLBBBBSSOLLBBSSOOOOLLBBSSOLLBBBBSS
LLBBBBSSOLLBBSSO..OLLBBSSOLLBBBBSS
LLBBBBSSOLLBBSSO..OLLBBSSOLLBBBBSS
LLBBBBSSOLLBBSSO..OLLBBSSOLLBBBBSS
SSSSSSSSOSSSSSSO..OSSSSSSOSSSSSSSS
SSSSSSSSOSSSSSSO..OSSSSSSOSSSSSSSS
OOOOOOOO.OOOOOO....OOOOOO.OOOOOOOO
```

`monster-spike-35`: a triangle. Inverted-triangle torso, a wedge head, horns, shoulder spikes, claws, slit eyes. An aggressor.

```grid monster-spike-35
O = outline        #2a1838
S = body-shadow    #5a3a98
L = body-light     #b890e8
B = body           #8a5ac8
A = accent         #f0a830
W = tooth-claw     #f4efe0
P = inner-mouth    #c83a5a
---
.......O..................O........
......OSO................OSO.......
.......OSO..............OSO........
.......OLSO............OLSO........
.......OSBSO..........OLBSO........
........OLBSOOOOOOOOOOLBSO.........
........OSBBLLLLLLLLLLBBSO.........
.........OSBBBBBBBBBBBBSO..........
..........OLABBBBBBBBBAO...........
O.........OSBAABBBBBAASO.........O.
SO.........OSBBBBBBBBSO.........OSO
OSO.........OLBBBBBBSO.........OSO.
OSSOO.......OSBBBBBBSO.......OOLSO.
.OLLSO.......OSWPPPWO.......OLLSO..
.OSBBSO.......OLBBSO.......OLBBSO..
..OSBBSOOOOOOOOLBBSOOOOOOOOLBBSO...
...OSBBLLLLLLLLBBBBLLLLLLLLBBSO....
....OSBBBBBBBBBBBBBBBBBBBBBBSO.....
...OWOSBBBBBBBBBBBBBBBBBBBBSOWO....
..OWWWOLBBBBBBBBBBBBBBBBBBSOWWWO...
..OWWWWSBBBBBBBBBBBBBBBBBBSWWWWO...
..OWWWOOSBBBBBBBBSBBBBBBBSOOWWWO...
.OWWWO..OLBBBBBBBSBBBBBBSO..OWWWO..
.OWWO...OSBBBBBBBSBBBBBBSO...OWWO..
.OWO.....OSBBBBBBBBBBBBSO.....OWO..
OWO.......OSBBBBBBBBBBSO.......OWO.
.O.........OLBBBBBBBBSO.........O..
...........OSBBBBBBBBSO............
............OSBBBBBBSO.............
.............OLBBBBSO..............
.............OSBBBBSO..............
..............OSBBSO...............
...............OSSO................
................OO.................
```

Build in three passes: `monster-build-1-silhouette` (is the pose and the species readable as one shape?), `monster-build-2-blocking` (colour-coded parts so each can move), `monster-build-3-finished` (merged palette, light from the upper left, belly, wing bones, eyes). A bat-winged imp: three sources (bat wings, goat horns, human stance), wings pulled below the head so the head clears the silhouette.

```grid monster-build-1-silhouette
O = outline        #1a1a24
B = silhouette     #6a5a8a
---
.........O...........O..........
........OBO.........OBO.........
.........OBO.......OBO..........
.........OBBOOOOOOOBBO..........
..........OBBBBBBBBBO...........
..........OBBBBBBBBBO...........
.OOO......OBBBBBBBBBO......OOO..
OBBBOOO.O.OBBBBBBBBBO.O.OOOBBBO.
BBBBBBBOBOOBBBBBBBBBOOBOBBBBBBBO
BBBBBBBBOBBBBBBBBBBBBBOBBBBBBBBO
BBBBBBBBBOBBBBBBBBBBBOBBBBBBBBBO
BBBBBBBBBBOOBBBBBBBOOBBBBBBBBBBO
OBBBBBBBBBBOOBBBBBOOBBBBBBBBBBO.
OBBBBBBBBBBOBBBBBBBOBBBBBBBBBBO.
OBBBBBBBBBBBBBBBBBBBBBBBBBBBBBO.
OBBBBBBBBBBBBBBBBBBBBBBBBBBBBBO.
OBBBBBBBBBBBBBBBBBBBBBBBBBBBBBO.
.OBBBBBBBBBBBBBBBBBBBBBBBBBBBO..
..OOBBBBBBBBBBBBBBBBBBBBBBBOO...
...OBBBBBBBBBBBBBBBBBBBBBBBO....
...OBBBBBBBBBBBBBBBBBBBBBBBO....
....OBBBOBBBBBBBBBBBBBOBBBO.....
....OBBO.OBBBBBBBBBBBO.OBBO.....
...OBBBO.OBBBBBBBBBBBO.OBBBOO...
...OBBBO.OBBBBBBBBBBBO..OOBBBO..
...OBBBO.OBBBBBBBBBBBO...OBBBO..
....OOO..OBBBOOBBBBBBO....OOBO..
........OBBBBO.OBBBBBBO..OOBBBO.
........OBBBBO..OBBBBBOOOBBOOO..
........OBBBO....OBBBBBBBBO.....
........OBBBO.....OBBBBBBO......
........OBBBO.....OBBBOOO.......
........OBBBBO.....OBBBBO.......
........OBBBBO.....OBBBBO.......
.........OOOO.......OOOO........
```

```grid monster-build-2-blocking
O = outline        #1a1a24
A = head-block     #e8883a
U = wing-block     #4a7ac8
B = torso-block    #8a5ac8
G = arms-block     #58b068
P = legs-block     #d87a9a
Y = tail-block     #d8b040
---
.........O...........O..........
........OAO.........OAO.........
.........OAO.......OAO..........
.........OAAOOOOOOOAAO..........
..........OAAAAAAAAAO...........
..........OAAAAAAAAAO...........
.OOO......OAAAAAAAAAO......OOO..
OUUUOOO.O.OAAAAAAAAAO.O.OOOUUUO.
UUUUUUUOAOOAAAAAAAAAOOAOUUUUUUUO
UUUUUUUUOAAAAAAAAAAAAAOUUUUUUUUO
UUUUUUUUUOAAAAAAAAAAAOUUUUUUUUUO
UUUUUUUUUUOOAAAAAAAOOUUUUUUUUUUO
OUUUUUUUUUUOOBBBBBOOUUUUUUUUUUO.
OUUUUUUUUGUOBBBBBBBOUGUUUUUUUUO.
OUUUUUUUGGGBBBBBBBBBGGGUUUUUUUO.
OUUUUUUUGGGBBBBBBBBBGGGUUUUUUUO.
OUUUUUUGGGGBBBBBBBBBGGGGUUUUUUO.
.OUUUUGGGGBBBBBBBBBBBGGGGUUUUO..
..OOUUGGGUBBBBBBBBBBBUGGGUUOO...
...OUGGGUUBBBBBBBBBBBUUGGGUO....
...OUGGGUUBBBBBBBBBBBUUGGGUO....
....OGGGOUBBBBBBBBBBBUOGGGO.....
....OGGO.OUBBBBBBBBBUO.OGGO.....
...OGGGO.OPBBBBBBBBBPO.OGGGOO...
...OGGGO.OPPBBBBBBBPPO..OOGGGO..
...OGGGO.OPPPBBBBBPPPO...OGGGO..
....OOO..OPPPOOYYYPPPO....OOYO..
........OPPPPO.OYYPPPPO..OOYYYO.
........OPPPPO..OYPPPPOOOYYOOO..
........OPPPO....OYPPPYYYYO.....
........OPPPO.....OPPPYYYO......
........OPPPO.....OPPPOOO.......
........OPPPPO.....OPPPPO.......
........OPPPPO.....OPPPPO.......
.........OOOO.......OOOO........
```

```grid monster-build-3-finished
O = outline        #1a1a24
S = body-shadow    #5a3a98
L = body-light     #b890e8
B = body           #8a5ac8
U = wing           #4a6ab8
D = wing-bone      #2c3f7a
A = eyes           #ffd23a
E = fang           #f4efe0
W = belly          #e8d0f0
---
.........O...........O..........
........OSO.........OSO.........
.........OSO.......OSO..........
.........OSSOOOOOOOLSO..........
..........OLLLLLLLLSO...........
..........OLBBBBBBBSO...........
.OOO......OLBBBBBBBSO......OOO..
OUUUOOO.O.OLBBBBBBBSO.O.OOOUUUO.
UUUUUDUOSOOLBAABBBAAOOSOUUDUUUUO
UUUUUUDDOSLBBAABBBAALSOUDDUUUUUO
UUUUUUUUDOSSBBBBBBBSSOUDUUUUUUUO
UUUUUUUUUDOOSBEBBESOOUDUUUUUUUUO
OUUUUUUUUUDOOLBBBSOODDUUUUUUUUO.
ODDDDDDDDBDOLBBBBBSODBDDDDDDDDO.
OUUUUUUUBBBLBBBBBBBLBBBUUUUUUUO.
OUUUUUUUBBBBBBBBBBBBBBBUUUUUUUO.
OUUUUUUBBBBBBBWWWBBBBBBBUUUUUUO.
.OUUUUBBBBBBBWWWWWBBBBBBBDUUUO..
..OOUDBBBUBBBWWWWWBBBUBBBUDOO...
...ODBBBUUBBBWWWWWBBBUUBBBUO....
...OUBBBUUBBBWWWWWBBBUUBBBUO....
....OLBSOUBBBWWWWWBBBUOSBSO.....
....OLSO.OUBBWWWWWBBUO.OLSO.....
...OLBSO.OLBBBWWWBBBSO.OSSSOO...
...OLBSO.OLBBBBBBBBBSO..OOLLSO..
...OSSSO.OLBBSSBBBBBSO...OSSSO..
....OOO..OLBSOOSBBBBSO....OOSO..
........OLBBSO.OSBBBBSO..OOSSSO.
........OLBBSO..OSBBBSOOOLSOOO..
........OLBSO....OSBBBLLLSO.....
........OLBSO.....OLBBSSSO......
........OLBSO.....OSBSOOO.......
........OLBBSO.....OLBLSO.......
........OSSSSO.....OSSSSO.......
.........OOOO.......OOOO........
```

Slime toy: neutral, squash for landing and anticipation, stretch for the jump. Same canvas width, bottoms aligned, so cycle them without drift.

```grid slime-neutral-20
O = outline        #1d5a3a
B = body           #5fcf6a
L = body-light     #a8f0a0
W = specular       #ffffff
N = eye            #1a2a22
S = body-shadow    #3a9a4f
---
....................
....................
....................
....................
....................
.......OOOOOO.......
.....OOBBBBBBOO.....
....OBBBLLBBBBBO....
...OBBWWBBBBBBBBO...
..OBBBWBBBBBBBBBBO..
..OBBBBBBBBBBBBBBO..
..OBBNBBBBBBBBNBBO..
..OBBNBBBBBBBBNBBO..
..OBBBBBBBBBBBBBBO..
..OSBBBBBNNBBBBBSO..
..OSSSSSSSSSSSSSSO..
...OSSSSSSSSSSSSO...
....OOOOOOOOOOOO....
```

```grid slime-squash-20
O = outline        #1d5a3a
B = body           #5fcf6a
L = body-light     #a8f0a0
W = specular       #ffffff
N = eye            #1a2a22
S = body-shadow    #3a9a4f
---
....................
....................
....................
....................
....................
....................
....................
.......OOOOOO.......
....OOOBBBBBBOOO....
..OOBBLLBBBBBBBBOO..
.OBBWWBBBBBBBBBBBBO.
OBBBWBBBBBBBBBBBBBBO
OBBBNBBBBBBBBBBNBBBO
OBBBNBBBBBBBBBBNBBBO
OSBBBBBBBBBBBBBBBBSO
OSSSSSSSSNNSSSSSSSSO
.OSSSSSSSSSSSSSSSSO.
..OOOOOOOOOOOOOOOO..
```

```grid slime-stretch-20
O = outline        #1d5a3a
B = body           #5fcf6a
L = body-light     #a8f0a0
W = specular       #ffffff
N = eye            #1a2a22
S = body-shadow    #3a9a4f
---
........OOOO........
.......OBBBBO.......
......OBBBLLBO......
.....OBBWWBBBBO.....
....OBBBWBBBBBBO....
....OBBBBBBBBBBO....
....OBBBBBBBBBBO....
....OBNBBBBBBNBO....
....OBNBBBBBBNBO....
....OBBBBBBBBBBO....
....OBBBBBBBBBBO....
....OBBBBBBBBBBO....
....OBBBBBBBBBBO....
....OSBBBBBBBBSO....
....OSBBBBBBBBSO....
.....OSSSSSSSSO.....
.....OSSSSSSSSO.....
......OOOOOOOO......
```

Undead: `undead-skeleton-37` (sockets, teeth, alternating rib rows, joint knobs) and `undead-ghost-20` (cold monochrome, hollow eyes, wavy hem, no alpha).

```grid undead-skeleton-37
O = outline        #2a2430
B = bone           #ece4cc
S = bone-shade     #b8a888
N = socket-gap     #2a2430
R = eye-glow       #ff4a3a
---
.......OOOOOO.......
......OBBBBBSO......
.....OBBBBBBBSO.....
.....OBBBBBBBSO.....
....OBBNNBBBNNSO....
....OBBNRBBBNRSO....
....OSBBBBBBBBSO....
.....OSBBBNNBSO.....
......OBBBBBSO......
......OBBBBBBSO.....
..OOO.OSNBNSNSOOOO..
.OBBSOOOOBSOOOOBBSO.
.OSSSBSSSBBSSSOBSSO.
..OOOSOOOBSOOOOSOO..
...OBSSSSBBSSSSOSO..
...OSOOOOBSOOOOOSO..
..OOSSSSSBBSSSSOSO..
.OBSOOOOOBSOOOOOBSO.
.OSSOOSSSBBSSSOOSSO.
..OSO.OOOBSOOO..OSO.
..OSO...OBSO....OSO.
..OSO...OBSO....OSO.
.OSO.OOOOBSOOOO..OSO
.OSOOBBBBBBBBBSO.OSO
OBSOOSBBBBBBBBSOOBSO
OSSO.OBBBSSSBSO.OSSO
.OO..OSBSOOOSBSO.OO.
......OBSO..OBSO....
......OBSO..OSSO....
.....OBSO...OOBSO...
....OBBSO..OBBBSO...
....OSBSO..OSSBSO...
.....OSO....OOSO....
.....OSO.....OSO....
.....OSO.....OSO....
....OOSO.....OSOO...
...OSSSSO...OSSSSO..
```

```grid undead-ghost-20
O = outline        #2a3a5a
L = body-light     #ffffff
S = body-shadow    #a8b8d8
B = body           #dfe8f8
N = hollow-eye     #1f2a44
---
.......OOOOOO.......
.....OOLLLLLSOO.....
....OLLBBBBBBLSO....
...OLBBBBBBBBBBSO...
..OLBBBBBBBBBBBBSO..
..OLBBBBBBBBBBBBSO..
..OLBBNNBBBBNNBBSOO.
.OOLBBNNBBBBNNBBBLSO
OLLBBBNNBBBBNNBBBSSO
OSSBBBBBBBBBBBBBSOO.
.OOLBBBBBNNBBBBBSO..
..OLBBBBBNNBBBBBSO..
..OLBBBSBBBBBBBBSO..
..OLBBBBBBBBBBBBSO..
..OLBBBOBBBBOBBBSO..
..OLBBSOSBBSOSBBSO..
...OOOO.OOOO.OOOO...
```

`monster-dragon-51`: western dragon, side view; horned head with an open mouth, S-curved neck, one raised wing built as arm bone (shoulder to wrist) plus three finger bones fanning to the tips with a scalloped membrane between them, hind leg stifle → hock bump → forward-slanting cannon with the far hind leg a step darker, belly scales light, curled tail.

```grid monster-dragon-51
O = outline        #2a1418
D = wing-bone-horn #5a2a28
M = wing-membrane  #e0883a
S = scales-shadow  #8a2a2a
L = scales-light   #ee7a52
B = scales         #c8402e
E = eye            #ffe85a
W = fang-claw      #f4efe0
Y = belly          #f2d08a
---
.............OOO..............OWO..................
............ODDDOO.............OWO........OOOOOOO..
..........OODDDDDDO............OWOOOOOOOOODDDDDDDO.
......OO.ODDDDOOOO.............ODWDDDDDDMMMMMMMOO..
....OOLLOODDOO................ODDDDDDDMMMMMMMMO....
..OOLLBBLLDO.................ODDDMMDDMMDDDMMOO.....
.OLEEBBBBBBO................ODDDMMMMDDMMMMDDDMOOO..
OLBBBBBBBBBO................ODDMMMMMMMDMMMMMMMDDDOO
OBBWBBWBBBBLO..............ODDMMMMMMMMMDMMMMMMMMMDD
OYYYYYYBBBBBO.............ODDMMMMMMMMMMMDDMMMMMMOOO
.OOOOOOYBBBBLO...........ODDMMMMMMMMMMMMMDDMMMOO...
.......OBBBBBLO.........ODDDMMMMMMMMMMMMMMMDMO.....
.......OYBBBBBO........ODDDMMMMMMMMMMMMMMMMMDO.....
........OBBBBBLOO.....ODDDMMMMMMMMMMMMMOOOOOO....O.
........OYBBBBBLLOOOO.ODDOOOOOOOOOOOOOO.........OLO
.........OYBBBBBBLLLBOOOOOOOOOOOOOO............OLBL
..........OBBBBBBBBBBBBBBBBBBBBBOO...........OOLBBB
..........OYBBBBBBBBBBBBBBBBBBBBLO..........OLLBBBY
...........OYBBBBBBBBBBBBBBBBBBBBLO.........OBYBBYO
............OYBBBBBBBBBBBBBBBBBBBBLOO......OLYOYYO.
.............OYBBBBBBBBBBBBBBBBBBBBLLOOOOOOLBO.OO..
..............OBBBBBBBBBBBBBBBBBBBBBBLLLLLLBYO.....
..............OYBBBBBBBBBBBBBBBBBBBBBBBBBBYYO......
...............OBBBBBBBBBBBBBBBBBBYYBBYYYYOO.......
...............OBBBBBYBBBBYBBBBBBSOOYYOOOO.........
...............OBBBBSOYYYYOBBBBBBSO.OO.............
...............OBBBBSOOOOOOYYBBBBSO................
...............OBBBBBSOSSSOOOYBBBBSO...............
..............OBBBBSOO.OSSSO.OYBBBBSO..............
..............OBBBSO....OSSSO.OBBBBBSO.............
..............OBBBSO....OSSO...OBBBBBSO............
..............OBBSO....OSSO....OBBBSOO.............
.............OOBBSO....OSSO...OBBBSO...............
............OBBBBSO...OSSO...OOBBBSO...............
...........OWBWBBSO..OWSSSO.OWBBBBSO...............
...........OOOOOOOO..OOOOOO.OOOOOOOO...............
```

## Procedure

1. Write the five-question line (rule 1), the dominant shape (rule 2), the size from the role (rule 8) and
   the palette plan: signature hue, 2–3 supporting hues from the environment, one accent.
2. `addLayer` ops in one `applyBatch` for the build stages: `sketch`, `tail`, `wing-far`, `leg-far`, `torso`, `head`,
   `arm-near`, `wing-near` (`craft/00-core/06-layers-and-rigging.md`).
3. Pass 1: `applyBatch` the whole creature in one flat colour; `render` and `readPixels` `format:"grid"` at 1×. Reject until the
   silhouette names the creature and its pose; change the shape, never the shading.
4. Pass 2: recolour each part to its own flat colour with `replaceColor`; check that no part merges with a neighbour.
   Fix tangents (touching limbs and horns) by 1 px.
5. Pass 3: merge to the final palette (`palette` op `ramp` for the body), light from the upper left, shade by
   plane, add eyes, fangs, bones, spikes after the outline pass. Place the dithered ground shadow on its own layer.
6. Animate: idle = 2–4 frames of breathing or squash and stretch; attack = slow anticipation, fast strike
   (`craft/40-animation/44-attacks-and-impacts.md`). `render` `filmstrip`, `setFrameDuration` with uneven holds, `addTag`.
7. `validate`; then lay the creature next to the rest of the bestiary at 1× and check rule 16.

## Mistakes

- **Pile of parts** → five animals in one body → at most three sources, one region each.
- **Mushy silhouette** → wings or arms merge with the head → separate by a pixel gap or move them below the head.
- **Everything spiky** → danger shapes everywhere → keep spikes at the extremities and the core simple.
- **Cute and menacing at once** → big round eyes on a spiky body → pick eyes to match the shape.
- **Pillow-shaded blob** → light rim all round a round body → one light, upper-left highlight cluster; shade one side.
- **Slime with corners** → sharp spikes on a goo creature → keep curves and a hard small specular.
- **Squash drift** → slime gains or loses height → keep the area near-constant between poses.
- **Same silhouette in the set** → all circles, all brutes → assign each a different dominant shape.
- **Skeleton with a solid torso** → ribs as a filled block → alternate bone and gap rows.
- **Detail noise at 16 px** → fine scales, many spikes → one accent, 2×2 eyes.

## Review

- Fill the sprite with one colour: do you name the creature and its pose?
- Dominant shape consistent in silhouette, eyes, mouth and limbs; danger shapes only on the extremities.
- Two or three source animals at most, one identifying element, head and body balanced.
- Size matches the role; the creature is distinct from others in the set (shape and mass distribution).
- Signature hue not shared with the cast; eyes carry the read; light from the upper left.
- Slime area near-constant across poses; skeleton and ghost read without alpha.
- Ground shadow present, dithered, offset for flyers.

## Sources

- Tom Bancroft, *Creating Characters with Personality*, pp. 110–121 (creature questions, shake and bake, design exploration), pp. 143–153 (colour for villains).
- Chris Solarski, *Drawing Basics and Video Game Art*, shapes chapter (circle, square, triangle; character and environment shapes).
- Preston Blair, *Advanced Animation*, pp. 9, 14, 37–38 (heavy formula, bulldog, dancing crocodile tail).
- Ken Hultgren, *The Art of Animal Drawing*, pp. 93, 102, 119 (contrast types, points of exaggeration).
- Slynyrd, Pixelblog 16 (dragons), 19 (mecha as parts), 57 (monsters, build stages) and 62 (monster build with ground shadow).
- Pedro Medeiros (Saint11), *Goo*, *Silhouette*, *Skull*, *Holograms and Ghosts*, *Wings* tutorials.
- Daniel Silber, *Pixel Art for Game Developers*, pp. 95–100 (squash and stretch of a blob).
- Jennifer Dawe and Matthew Humphries, *Make Your Own Pixel Art*, pp. 112–116 (charm points, animatability).
- FreeGameSprites heuristics for hero, minion and boss sizes (rule of thumb, not a standard).
