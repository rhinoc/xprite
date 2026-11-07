# Quadrupeds

Four legs bolted under a blob read as a table. A dog, a horse and a cow drawn
from one body plan read as the same animal in three costumes. A hind leg drawn as
a straight pole reads as a toy. This file gives the construction (three masses,
four chains), the per-species proportions and joint heights, and side-view
templates for horse, dog, cat, deer and cow. Movement is `craft/50-creatures/51-animal-gaits.md`;
fur and coat texture is `craft/20-color/23-materials-soft.md`; the silhouette test itself is
`craft/00-core/03-silhouette-and-form.md`.

## Rules

1. **Three masses, four chains.** Every quadruped is forequarters + barrel +
   hindquarters on one spine line, with a front chain under the shoulder and a hind
   chain under the pelvis. Draw the spine as a 1 px guide on a `sketch` layer, hang
   three overlapping ovals from it, then add legs. Never start from the outline
   (Hultgren, Goldfinger).
2. **Fix one unit first: H, the withers height** (ground to the top of the shoulder
   blade). Everything below is a fraction of H. Choose H, derive the rest, round to
   whole pixels, and write the joint rows down before drawing.
3. **Place six anchor pixels before any fill:** point of shoulder, elbow, hip,
   buttock, stifle, hock. Draw each leg as straight segments between its joint
   pixels, then give the segments width. A leg built this way keeps its length in
   every animation frame (±1 px).
4. **The front leg is a near-vertical column; the hind leg is a zig-zag.** Front:
   shoulder → elbow (just behind and below) → straight down. Hind: hip (high) →
   stifle (forward, hidden in the flank) → hock (back, sharp) → foot (down, forward).
   That asymmetry is most of why a sprite looks like an animal.
5. **The backward "knee" on a hind leg is the hock, not a knee.** Dogs, cats, horses,
   deer and cattle all walk on their toes (digitigrade); the visible kink is the
   ankle, 1 px sharp at 16–24 px. The true knee (stifle) stays inside the flank.
   Bears and primates stand on the whole sole (plantigrade): heel on the ground,
   no high hock.
6. **Hip and shoulder behave differently.** The front limb is slung from the ribs by
   muscle, so the shoulder may ride 1 px up or down on the chest as the animal walks.
   The hind limb is bolted to the pelvis, so the hip never slides against the rump.
7. **The belly is the free edge.** Bone sets the chest and the rump; the belly line
   between them is soft. Lower it by 1 px for a gathered or heavy pose, raise it by
   1–2 px and lengthen the torso for a stretched one. A flat belly line plus a straight
   back is a plank.
8. **Topline tells the species.** Horse and cattle: flat, with a small croup bump. Dog:
   high withers sloping to a low rump. Cat: horizontal log with 1+ px of curve that can
   flex 2–3 px; the shoulder blades peak 1–2 px above the spine when it walks low.
   Giraffe, hyena, bison: withers far above the rump.
9. **Head construction.** A cranium egg plus a muzzle tube. Eye, ear base and nostril
   lie within 1 px of one line. Prey animals (horse, deer, cow, rabbit): eye on the side of the
   head, high, in the back third; ears upright at the back-top corner. Predators (dog,
   cat, bear): eye forward and low, both eyes visible in 3/4, ears on top (dog) or
   wide-set (cat). One bright eye pixel (or 2×1) per head at ≤ 32 px.
10. **Feet are one block or a rounded cluster, never five toes.** Horse: one hoof
    block, 1 row darker. Cattle and deer: one block with a 1 px split. Dog: oval paw,
    one dark px per toe tip, claws on the ground. Cat: oval paw with **no claw pixels**
    while walking (they retract); add one claw pixel only for swat or climb frames.
11. **One feature is oversize.** Horse: head length (0.4 H) and thin legs. Cow: body mass
    against short legs. Cat: round head and tail length. Dog: snout. Deer: legs and
    antlers. Change 1–2 ratios and the species flips (long body + short legs = dachshund,
    raised withers = hyena).
12. **Far legs are one ramp step darker and sit on their own layers.** Leave a 1 px gap
    between near and far leg wherever they separate, and between the tail and the hind
    leg. Two limbs whose outlines touch fuse into one blob (`craft/00-core/03-silhouette-and-form.md`).
13. **Light from the upper left.** Highlight the top row of the back and neck; put a
    belly band of shadow (2 rows at ≥ 24 px, 1 row at 16) under the barrel; keep the
    chest front and forehead lit. Shade from the form, not from the outline inward
    (`craft/00-core/02-shading-and-light.md`).
14. **Cute shifts the numbers, not the plan.** Foal, pup, kitten: head ≥ 40 % of height,
    eyes in the lower half of the head, muzzle 1–2 px, legs 0.3 H (Hultgren, Goldfinger).

## Proportions

Measured from the skeleton and silhouette plates of one anatomy text; treat as
starting values with ±10–15 % error, then verify on the canvas. All fractions are of H.

| | Body length ÷ H | Head ÷ H | Belly clearance ÷ H | Elbow | Carpus | Stifle | Hock | Hip |
|---|---|---|---|---|---|---|---|---|
| Horse | 1.05–1.1 (Arabian 1.0) | 0.40 | 0.45–0.5 | 0.56 | 0.32 | 0.55 | 0.46 | 0.80 |
| Cattle | 1.35–1.4 | 0.35 | 0.32–0.38 | 0.38 | 0.17 | 0.50 | 0.33 | 0.85 |
| Dog (shepherd) | 1.2–1.3 | 0.30–0.33 | 0.45–0.5 | 0.46 | 0.16 | 0.44 | 0.22 | 0.68 |
| Cat / lioness | 1.3–1.35 | 0.22 | 0.40–0.45 | 0.40–0.45 | 0.15 | 0.45 | 0.22 | 0.78 |
| Deer | 0.85–0.95 | 0.30–0.35 | 0.5 | 0.52 | 0.28 | 0.55 | 0.35 | 0.85 |
| Pig | 1.6–1.7 | 0.40 | 0.25–0.3 | – | – | – | – | – |
| Bear | 1.3–1.4 | 0.35 | 0.35 | – | – | – | 0.15 | – |
| Elephant | 1.1–1.2 | 0.6 (+ trunk) | 0.4 | straight columns, no visible bend | | | | |

Other numbers worth keeping: dachshund length 1.8–2.0 H with clearance 0.25 H;
greyhound length 1.0 H, belly tucked up to the groin; fox length 1.5 H with a brush
tail 0.7 of the body; lion tail ≈ body length; giraffe neck 0.7–0.9 H above the
withers; rabbit ears ≥ 0.5 of head + body.

**Worked examples (derived).** Rows counted up from the ground, H = 20 horse: elbow 11,
carpus 6, fetlock 2–3, stifle 11, hock 9, hip 16. H = 12 dog: elbow 6, carpus 2, stifle 5,
hock 3, hip 8, belly row 5–6. When two joints land on the same row at small H, merge them
and keep the one that changes the silhouette (hock, then elbow).

**Head ratios.** Muzzle ÷ cranium: cat 0.5, lion 0.7, bear 0.9, dog 1.0, wolf 1.2, ox 1.2,
deer 1.2, pig 1.2, greyhound 1.5, horse 2.0. Eye position from the muzzle tip (0 = tip,
1 = back of skull): cat 0.4, dog 0.55, ox 0.6, deer 0.65, horse 0.7.

## By size

| Canvas | H | What survives | Pixel budget |
|---|---|---|---|
| 8 | 4–5 | One block body, head nub, two leg columns, one signature feature (ears, tail or neck). No hock. | Legs 1 px, 2 colours + outline |
| 16 (about 22 wide) | 9–12 | Head wedge, neck, barrel, 1 px hock kink, hoof/paw as one darker px, tail. No carpus, no elbow. | Head 4–5, neck 3, body 11–13, leg 5–6 (2 px upper, 1 px lower), tail 3–4 |
| 32 (about 30–36 wide) | 18–22 | Hock, carpus, fetlock, hoof 3×2, ear, mane/tail strands, split hoof on cattle and deer. | Head 8, body 22, leg clearance 10, cannon 2 px |
| 64 | 36–44 | Elbow point, stifle bump, 2–3 muscle planes, nostril and eye 2 px, individual antler tines. | Detail budget limited by consistent cluster size, not scarcity |

Keep, in order, as the sprite shrinks: head + neck + body mass, leg count and ground
contact, tail, ears/horns/antlers, hock, toes. Muscles go first.

## Templates

Side view, facing left; flip with `flip` for right. Roles map onto your
palette. Legs of the same species keep the same glyphs (`F` is the far leg).

`quad-horse-35`: the 32-class horse, long wedge head, flat back, mane and tail strip; front leg shows knee and fetlock, hind leg shows stifle, a hock bump behind the buttock line and a cannon that slants forward, far legs a ramp step darker.

```grid quad-horse-35
O = outline        #2b1d2e
B = coat           #a8683c
F = far-leg        #5e3826
M = mane-tail      #3d2a2c
E = eye            #ffffff
L = coat-light     #d89a62
S = coat-shadow    #76432e
H = hoof           #241a1f
---
.......OBOO........................
.......OBBFO.......................
.......OBBBO.......................
......OBBBMMO......................
.....OBBBBMMO......................
....OBBEBBBMMO.....................
...OBBBBBBBMMO.....................
..OBBBBBBBBBMMO..........OOOO......
.OBBBBBBBBBBMMLOOOOOOOOOOLLLLO.....
OBBBBBBBBBBBBMMLLLLLLLLLLBBBBLO..O.
OBBBBBBBBBBBBBBBBBBBBBBBBBBBBBLOOMO
OBSBBBOOBBBBBBBBBBBBBBBBBBBBBBBLOMO
.OOOOO.OBBBBBBBBBBBBBBBBBBBBBBBBOMO
........OBBBBBBBBBBBBBBBBBBBBBBBOMO
.........OBBBBBBBBBBBBBBBSBBBBBBOMM
.........OSBBBBBBBBBBBBBSBBBBBBOMMM
..........OBBBBBBSSSSSSSBBBBBBBOMMM
..........OBBBBBBSSSSSSSSBBBBBBOMMM
..........OBBBBOOOOOOOOOOBBBBBBOMMM
..........OBBSO.OFFFO.OFFFOBBBBSOMM
..........OBBSO.OFFFO..OFFFOBBBBSOM
..........OBBSO.OFFFO..OFFFFOBBSO..
..........OBBSO.OFFFO..OFFO.OBSO...
.........OBBBBO.OFFFO..OFFO.OBSO...
..........OBSO..OFFO..OFFO.OBSO....
..........OBSO..OFFO..OFFO.OBSO....
.........OBBBO.OFFFO.OFFFOBBBBO....
........OHHHHO.OHHHHOHHHHOHHHHO....
........OHHHHO.OHHHHOHHHHOHHHHO....
.........OOOO...OOOO.OOOO.OOOO.....
```

`quad-pony-22`: the 16-class horse; one hoof pixel per leg, no carpus; the hind leg still steps out 1 px at the hock and back in below it.

```grid quad-pony-22
O = outline        #2b1d2e
B = coat           #a8683c
L = coat-light     #d89a62
E = eye            #ffffff
M = mane-tail      #3d2a2c
S = coat-shadow    #76432e
F = far-leg        #5e3826
H = hoof           #241a1f
---
....OOOOO.............
...OBBBLLO............
..OBBBBBO.............
..OBBBEBO.............
.OBBBBBMOOOOOOOOOOO...
OBBBBBBBMLLLLLLLLLLOO.
OBBBBBBBBMBBBBBBBBBOMO
OBOOOBBBBBBBBBBBBBBLMO
.O..OBBBBBBBBBBBBBBBMO
.....OBBBBBBBBBBBBBOMO
......OBBSSSSSSSBBBOMO
.....OBBOFFOOOOOOBBBO.
.....OBBOFFO.OFFFOBBBO
.....OBBOFFO..OFFOBBBO
.....OBBOFFO.OFFOBBO..
.....OHHOHHO.OHOHHHO..
......OO.OO...O.OOO...
```

`quad-dog-29`: sloped topline, long muzzle, pricked ear, hind leg that runs stifle forward → hock back (1 px point behind the rump) → paw forward, sickle tail. `quad-dog-joints-29` is the same sprite with the six anchors in yellow: shoulder, elbow, wrist on the front leg, hip, stifle, hock on the hind; copy it as a construction layer.

```grid quad-dog-29
O = outline        #2b1d2e
B = coat           #b9824f
L = coat-light     #e0b07a
N = nose           #1a1216
E = eye            #ffffff
M = tail-dark      #5a3a2a
S = coat-shadow    #8a5a3a
F = far-leg        #6e4630
---
.....OBO.....................
.....OBBO....................
....OOBBBO...................
...OBBBBBO...................
....OBBBBLO..................
.OOOOBBBBBOOOOOOOOO.......OO.
ONBBBBEBBBLLLLLLLLLOOOOO.OMMO
OBBBBBBBBBBBBBBBBBBLLLLLO.OOM
.OOOOBBBBBBBBBBBBBBBBBBBLO.OM
.....OOBBBBBBBBBBBBBBBBBBLOOM
.......OBBBBBBBBBBBBBBBBBBLOM
.......OSBBBBBBBBBBBBBBBBBBOM
........OBBBBSSSSSSSSSSSBBBO.
........OBBBBSSSSSSBBBBBBBBO.
........OBBBOFFOOOOOBBBBBBO..
........OBBSOFFO.OFFOBBBBBO..
........OBBSOFFO..OFFOBBBBO..
........OBBSOFFO...OFFOBBBBO.
........OBBSOFFO...OFFFOBBBO.
.......OBBBBOFFO..OFFO.OBBO..
.......OSSSSOFFO.OFFFOSSSSSO.
........OOOO.OO...OOO.OOOOO..
```

```grid quad-dog-joints-29
O = outline        #2b1d2e
B = coat           #b9824f
L = coat-light     #e0b07a
N = nose           #1a1216
E = eye            #ffffff
M = tail-dark      #5a3a2a
J = joint-marker   #ffe83a
S = coat-shadow    #8a5a3a
F = far-leg        #6e4630
---
.....OBO.....................
.....OBBO....................
....OOBBBO...................
...OBBBBBO...................
....OBBBBLO..................
.OOOOBBBBBOOOOOOOOO.......OO.
ONBBBBEBBBLLLLLLLLLOOOOO.OMMO
OBBBBBBBBBBBBBBBBBBLLLLLO.OOM
.OOOOBBBBBBBBBBBBBBBBBBBLO.OM
.....OOBBBBBBBBBBBBBBBBBBLOOM
.......OBBBBBBBBBBBBBBBBBBLOM
.......OSBJBBBBBBBBBBBBBBJBOM
........OBBBBSSSSSSSSSSSBBBO.
........OBBBBSSSSSSBBBBBBBBO.
........OBJBOFFOOOOOBBBBBBO..
........OBBSOFFO.OFFOJBBBBO..
........OBBSOFFO..OFFOBBBBO..
........OBBSOFFO...OFFOBBBJO.
........OBJSOFFO...OFFFOBBBO.
.......OBBBBOFFO..OFFO.OBBO..
.......OSSSSOFFO.OFFFOSSSSSO.
........OOOO.OO...OOO.OOOOO..
```

`quad-pup-24`: the 16-class dog; hock kink 1 px, paw as one dark row.

```grid quad-pup-24
O = outline        #2b1d2e
B = coat           #b9824f
N = nose           #1a1216
E = eye            #ffffff
L = coat-light     #e0b07a
M = tail-dark      #5a3a2a
S = coat-shadow    #8a5a3a
F = far-leg        #6e4630
---
.....O..................
....OBO.................
...OOBBO................
..OBBBBO.............OO.
.ONOBEBLOOOOOOOO....OMMO
OBBBBBBBLLLLLLLLOOO..OMO
OBBBBBBBBBBBBBBBLLLO.OMO
.OOOOBBBBBBBBBBBBBBLOMO.
.....OBBBBBBBBBBBBBBOO..
.....OBBBBBBBBBBBBBBO...
.....OBBBBSSSSSBBBBSO...
.....OBBOFFOOOOOBBBBO...
.....OBBOFFO.OFFOBBBBO..
.....OBBOFFO..OFFOBBO...
....OSSSOFFO.OFFOSSSO...
.....OOO.OO...OO.OOO....
```

`quad-cat-28`: horizontal log, round head with two triangle ears, tail up and curled; the hind leg has a long, low hock (metatarsus shown) and a paw pad that points forward.

```grid quad-cat-28
O = outline        #2b1d2e
M = stripe-tail    #5c2f26
B = coat           #c7773f
L = coat-light     #eba267
E = eye            #f2e86b
N = nose           #e08a8a
S = coat-shadow    #8f4b2e
F = far-leg        #74412c
---
.......................O....
......................OMO...
..O....................OMO..
.OBO..O.................OMO.
.OBBOOBO................OMMO
.OBBOOBLO...............OMMO
.OBBBBBOOOOOOOOOOOOO....OMMO
OBBBBBBLLLLLLLLLLLLLOO..OMMO
OBBEBBBBBBBBBBBBBBBBLLOOOMMO
OBBBBBBBBBBBBBBBBBBBBBLMMOO.
.NBBBBBBBBBBBBBBBBBBBBBOO...
..OOOOBBSSBBSSSSSSSBBBBBO...
.....OBBSSBBSSSSSSSSBBSSO...
.....OBBOOFFOOOOOOOBBBBBO...
.....OBBOOFFO...OFFOBBBBO...
.....OBBOOFFO....OFFOBBBBO..
.....OBBOOFFO.....OFFOBBO...
....OSSSOFFFO...OFFFOSSSSO..
....OSSSOFFFO...OFFFOSSSSO..
.....OOO.OOO.....OOO.OOOO...
```

`quad-kitten-21`: the 16-class cat; use for pets and small enemies.

```grid quad-kitten-21
O = outline        #2b1d2e
M = stripe-tail    #5c2f26
B = coat           #c7773f
L = coat-light     #eba267
E = eye            #f2e86b
S = coat-shadow    #8f4b2e
F = far-leg        #74412c
---
..................O..
.................OMO.
.O...O...........OMO.
OBO.OLO...........OMO
OBBOBBO...........OMO
OBEBBOOOOOOOOOOO..OMO
OBBBBLLLLLLLLLLLOOMO.
OBBBBBBBBBBBBBBBLOO..
OBBBBBBBBBBBBBBBBLO..
.OOOOBBBBBBBBBBBBBO..
...OBBBBSSSSSBBBBBO..
...OBBOFFOOOOOBBBBO..
...OBBOFFO.OFFOBBBBO.
...OBBOFFO..OFFOBBO..
..OSSSOFFO.OFFOSSSO..
...OOO.OO...OO.OOO...
```

`quad-deer-37`: stilt legs, long slim neck, broad upright ear, white tail flag and rump patch; hind leg has a visible hock (back edge steps out 2 px, then the cannon slants forward); antlers in two tones so far and near stay apart.

```grid quad-deer-37
O = outline        #2b1d2e
A = antler         #e8d9ae
D = antler-shade   #b79d6a
B = coat           #b8794a
L = coat-light     #dca06e
E = eye            #ffffff
N = nose           #1a1216
W = rump-patch     #f3e3c6
S = coat-shadow    #8b5233
F = far-leg        #6e4630
H = hoof           #241a1f
---
.............O....................
...........OOAO...................
......O..OOAAO....................
....OODOOAOAO.....................
...ODOODOOAAO.O...................
....ODODO.OAOOAO..................
.....OODBOOAOAO...................
......ODBOOAOO....................
...OOOBDBLAO......................
..OBBBBOOAO.......................
..OBEBBO.O........................
.OBBBBBO..........................
OBBBBBBBO.........................
OBBBOBBBO.........................
.NOOOBBBBO........................
....OBBBBOOOOOOOOOOOOOOOOOOO..OO..
....OBBBBLLLLLLLLLLLLLLLLLLLOOWWO.
.....OBBBBBBBBBBBBBBBBBBBBBBLOWWO.
.....OBBBBBBBBBBBBBBBBBBBBBBBLWWO.
......OBBBBBBBBBBBBBBBBBBBBBBWOO..
.......OBBBBBBBBBBBBBBBBBBBBBWWO..
.......OBBBBBBBBBBBBBBBBBBBBBWWO..
........OBBBBBBBBBBBBBBBBBBBBWWO..
........OBBBBSSSSSSSSSSSSSBBBBBO..
........OBBBBSSSSSSSSSSSSSBBBBSO..
........OBBBOOOOOOOOOOOOOOOBBBBO..
........OBBSOFFO....OFFFO.OBBBSO..
........OBBSOFFO.....OFFFO.OBBSO..
.........OBSOFFO......OFFFO.OBBSO.
.........OBSOFFO......OFFFO.OBBBSO
........OBBSOFFO......OFFO..OBSO..
.........OBSOFFO.....OFFO..OBSO...
.........OBSOFFO.....OFFO..OBSO...
.........OBSOFFO.....OFFO..OBSO...
.........OBSOFFO....OFFFO.OBBSO...
........OHHHHOHHO.OHHHHO.OHHHHO...
.........OOOO.OO...OOOO...OOOO....
```

`quad-cow-31`: box body, flat topline, low head, horn nub, dewlap, split hoof, tuft tail; short hind cannon with the hock stepping back 2 px; the patch colour is a role, swap it for any markings.

```grid quad-cow-31
O = outline        #2b1d2e
A = horn           #d8c28a
L = hide-light     #fbf6ec
B = hide-white     #ece4d6
D = patch          #4a3a38
M = tail-tuft      #4a3a38
E = eye            #ffffff
P = muzzle-pink    #e3a3a0
S = hide-shade     #b9aea0
F = far-leg        #a79d90
H = hoof           #241a1f
---
.....OO........................
....OAAO..OOOOOOOOOOOOOO.......
....OAOOOOLLLLLLLLLLLLLLOOO....
..OOBBBLLLBDDDDDBBBBBBBBLLLOO..
.OBBBBBBBBDDDDDDDBBBBDDDDBBOMO.
OBBBBBBBBBDDDDDDDBBBBDDDDBBLMO.
OBBEBBBBBBBDDDDDBBBBBDDDDBBBMO.
OBBBBBBBBBBBDDBBBBBBBBDDDBBBMO.
OPPPBBBBBBBBBBBBBBBBBBDDBBBBMO.
OPPPOOSSBBBBBBBBBBBBBBBBBBSSMO.
.OOO.OSSBBBSSSSSSSSSSBBBBBSOMMO
......OOBBBSSSSSSSSSSBBBBSOOMMO
.......OBBBOOOOOOOOOOOBBBBO.OO.
.......OBBBOFFO.OFFFO.OBBBSO...
.......OBBSOFFO.OFFO..OBBO.....
.......OBBSOFFO.OFFO..OBBO.....
.......OHHHOHHO.OHHO.OHHHO.....
.......OHHHOHHO.OHHO.OHHHO.....
........OOO.OO...OO...OOO......
```

## Procedure

1. Write down the species, H, facing, light (upper left) and palette. `palette` op `ramp`
   for one coat ramp (3 tones), then one dark for mane/tail, one for far legs, one hoof/paw.
2. `addLayer` ops in one `applyBatch`: `sketch`, `tail`, `leg-far-hind`, `leg-far-front`,
   `body`, `head`, `leg-near-hind`, `leg-near-front` (`craft/00-core/06-layers-and-rigging.md`).
3. On `sketch`, `applyBatch` the spine as a 1 px `line` and the three masses as `ellipse` ops.
   Mark the six anchors from the table with `pixels`.
4. Transcribe the nearest template with `applyBatch` `grid` onto `body`, or build the legs as
   `stroke` segments between the anchors. Do the far legs a ramp step darker.
5. Silhouette test: `render`, then squint. Species must read in one flat colour.
   If it does not, change a ratio (oversize feature), not the shading.
6. Head, then eye and nostril pixels. Add mane/tail on their own layers so
   `craft/40-animation/45-secondary-motion.md` can move them later.
7. Shade: top row light, belly band dark, far legs a step darker. `validate` for off-palette
   pixels, orphans and doubled outlines; `readPixels` `format:"grid"` on the legs to count rows.

## Mistakes

- **Table legs** (four equal columns straight down) → no hock, no elbow offset → apply rule 4:
  front straight, hind zig-zag with a back-pointing hock.
- **Every species identical** → same body plan, same ratios → pick the oversize feature and the
  topline from rules 8 and 11 before drawing.
- **Horse with a dog's eye** (forward, low) or **dog with side-set prey eyes** → rule 9.
- **Hind leg bends the wrong way** → the kink was drawn as a knee pointing forward → the kink
  points back (hock); the stifle stays hidden.
- **Cat with claws showing in a walk** → rule 10; add claws only on a swat frame.
- **Fused legs** → near and far outlines touch → 1 px gap, far leg one ramp step darker.
- **Plank body** → straight back and flat belly on a dog or cat → add 1 px of topline curve and
  tuck the belly at the groin.
- **Tail glued to the leg** → leave 1 px of air; root the tail at the croup, not at the buttock edge.
- **Pillow-shaded barrel** (light rim all around) → shade from the upper left only.

## Review

- Fill the sprite with one colour: is the species obvious, and is the oversize feature visible?
- Does the front leg run near-vertical and the hind leg zig-zag with a back-pointing hock?
- Are leg lengths and thicknesses consistent between near and far, and between frames?
- Is there a 1 px gap between near and far legs, and between tail and leg?
- Eye on the side and high for prey, forward and low for predators; one eye pixel, no extras.
- Hoof one block (horse), split (cattle/deer), paw oval (dog/cat); no claws on a walking cat.
- Light from the upper left; no rim shading all around; far legs darker.

## Sources

- Eliot Goldfinger, *Animal Anatomy for Artists* (2004): ch. 1 axes and volumes, skeleton and joint
  pp. 1–25, species plates pp. 112–217 (ratios measured from the figures).
- Ken Hultgren, *The Art of Animal Drawing* (Dover): three-mass construction pp. 3–5, 21–22; points of
  exaggeration pp. 48–49, 83, 90–93, 102–105.
- Preston Blair, *Advanced Animation*: rounded construction for animals, pp. 3, 19–22.
- Thomas and Johnston, *The Illusion of Life*: where animals squash and stretch (shoulders, haunches,
  toes), pp. 355–356 of the PDF.
- Jennifer Dawe and Matthew Humphries, *Make Your Own Pixel Art* (2019): sculpt-from-blob method, pp. 44–45.
- Pedro Medeiros (Saint11), *4LegsWalk* tutorial; Slynyrd, Pixelblog 25 (dog walk).
