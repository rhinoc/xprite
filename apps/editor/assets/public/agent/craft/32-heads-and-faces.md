# Heads and faces

Heads fail at sprite scale in three ways: features on the wrong lines (eyes too high, mouth
glued to the chin), a flat front-on mask where a turned head was wanted, and features drawn
before the shape that holds them. This file fixes the geometry — where each feature sits at
8, 12, 16, 24 and 32 px in front, 3/4 and side view. Eyes, brows and emotion:
`craft/33-eyes-and-expressions.md`. Bust portraits from 48 px: `craft/38-portraits.md`. Head
size against the body: `craft/30-proportions-by-size.md`.

## Rules

1. **Shape before features.** Block one filled egg or rounded square, then a centre axis and
   the eye line (guide layer, deleted last), then features, hair, shade, outline. Features
   placed first float.
2. **H = hair top to chin, outline included.** All landmarks are fractions of H from row 0.
3. **Eye line at 50–56% of H** for game heads (templates: 12 px 50%, 16 px 56%, 24/32 px
   52–53%); 56–65% for cute heads — low eyes under a high forehead is the baby cue. Realistic
   8-head faces sit at 50%. Sources counting from the hairline (Loomis quarters, st0ven)
   land 3–4% lower; we count from the hair top because that is what the grid shows.
4. **Front landmarks (derived by fitting the Loomis/Hampton/Slynyrd divisions to the grid):**
   hairline 25–33%, brow 38–42%, nose base halfway from brow to chin (63–74%), mouth 77–83%
   (about a third of the way from nose base to chin), chin 100%. Rows are in the table.
5. **Width.** Realistic W ≈ 0.7–0.75 H (Loomis' drawings; an estimate, not a printed figure);
   3–4-head game figures 0.85–0.9 H (the templates are 0.86–0.88); chibi 1.0. Side depth ≈ H
   plus the nose.
6. **Odd or even width, decided first.** Odd (11, 21, 27) has a centre column: 1-px nose,
   1- or 3-px mouth. Even (8, 14) has none: 2-px mouth, no nose. Never a 1-px feature on an
   even head or a 2-px feature on an odd one.
7. **Features never touch.** ≥1 px skin between mouth and nose/chin, brow and eye, eye and
   contour; ≥2 px between the eyes (1 px fuses them into a brow). Spacing is letter-spacing.
8. **Eye gap 1–2 eye widths** for adults, ≤1 eye width for cute faces *with enlarged eyes*.
   Blair and Saint11 both want wide-set cute eyes but Saint11's ratios shrink the gap; both
   hold when the eye grows and the absolute gap stays ≥2 px.
9. **Nose.** None at ≤16 px (blush instead). 24 px: 1 px one skin step darker. ≥32 px: bridge
   shade on the shadow side plus 2–3 px at the base. Never outline-dark (reads as a smudge).
   In profile it is the silhouette bump: +1 px at 12–16, +2 at 24, +3 at 32.
10. **Mouth.** Width ≈ distance between pupils, two thirds of that if cute: 2 px at 16, 3–4 at
    24, 5–9 at 32. Seam darkest, lower lip lighter, no separate upper lip below 24 px.
11. **Ears.** Front: top at the brow line, bottom at the nose base, height ≈ nose length. ≤16 px
    hide under hair; 24 px a 1-px bump; 32 px 2 wide × 4–5 tall. Side: just behind the
    vertical midline, lower-back quarter of the side plane.
12. **3/4 view.** Axis moves 1–2 px toward the turn at 16 px, 2–3 at 32. Far eye one notch
    narrower (16 px 2→1, 24 px 3→2, 32 px 5→3), ≥1 px off the far contour. Far cheek in 1–2 px;
    the nose breaks the far contour; near ear shows, far ear hides; chin shifts toward the
    turn. Equal eyes in a turned head is the tell. At ≤12 px a 1-px eye cannot narrow: shift
    nose and mouth, break the contour, show the near ear.
13. **Tilt.** Head up bows the eye line up in the middle; down bows it down. Move the whole
    eye+nose+mouth block 1 row (2 at 32) and bend the mouth 1 px. Never nudge single features.
14. **A profile needs a profile:** forehead out, eye in, nose out, lips, chin — ≥3 bumps on the
    front contour. The eye is a wedge 1–3 px behind the contour. A straight front edge is the
    weakest silhouette (Bancroft).
15. **Hair is the face at ≤16 px.** ≥2 px of hair at the sides, hairline 1–2 px above the eyes,
    hair split from skin by colour, never one black line across the forehead
    (`craft/35-hair-and-clothing.md`).
16. **Skin: three tones** — base, light (forehead, cheek apple), shadow turned 10–22° toward
    red and cooler, 15–25% darker; shadow away from the light, under the hair edge and chin
    (`craft/20-color-for-pixel-art.md`). Face contrast below the rest of the sprite so it stays
    one unit; eyes the highest contrast on the head. A mirrored head flips its light: re-shade.
17. **When pixels run out cut:** ears → nose → brow → mouth → jaw shape → hair silhouette. Eyes
    and hair are never cut.
18. **Shape is character.** Square jaw = jaw width held near skull width to the chin; pointed =
    taper from mid-height; round = the templates. Younger = lower eyes, bigger cranium,
    smaller nose; older = eyes a notch higher, bigger nose and ears (`craft/36-character-design.md`).

## By size

Rows count from 0 at the top (outline row); x from 0 at the template's left edge. Front:

| | 8 px | 12 px | 16 px | 24 px | 32 px |
|---|---|---|---|---|---|
| Head W×H | 8×8 | 11×12 | 14×16 | 21×24 (+ears: 23) | 27×32 (+ears: 31) |
| Hair rows | 1–2 | 1–4 | 1–5 | 1–7 | 1–10 |
| Brow | — | — | row 6 | row 9, 3 px | row 13, 5 px |
| Eyes | 1×1, row 4, x 2, 5 | 1×2, rows 5–6, x 3, 7 | 2×2, rows 8–9, x 3–4, 9–10 | 3×3, rows 11–13, x 6–8, 14–16 | 5×4, rows 15–18, x 7–11, 19–23 |
| Nose | — | 1 px, row 8 | — | 1 px, row 15 | bridge + 3 px, rows 19–21 |
| Mouth | 2 px, row 6 | 3 px, row 9 | 2 px, row 12 | 3 px, row 18 | 7 px, row 25, lip row 26 |
| Chin row | 7 | 11 | 15 | 23 | 31 |

3/4 and side, both facing right:

| | 12 px | 16 px | 24 px | 32 px |
|---|---|---|---|---|
| 3/4 eyes near / far | 1×2 / 1×2, front x | 2×2 x 4–5 / 1×2 x 10 | 3×3 x 7–9 / 2×3 x 15–16 | 5×4 x 9–13 / 3×4 x 21–23 |
| 3/4 nose bump, mouth | +1 row 7; x 6–7 row 8 | +1 row 10; x 8–9 row 12 | +2 row 15; x 11–14 row 18 | +2–3 rows 19–22; x 14–21 row 25 |
| 3/4 near ear | 1 px x 1 | 2×2 x 1–2 | 2×2 x 0–1 | 3×4 x 0–2 |
| Side eye | 1×2 x 7 | wedge x 10–11 | 3×4 x 16–18 | 4×3 x 24–27, rows 15–17 |
| Side nose tip, mouth | +1 row 7; x 7–8 row 8 | +1 row 10; x 11–12 row 12 | +2 rows 14–16; x 17–20 row 18 | nose +3 rows 19–22; mouth x 27–30 rows 24–25 |
| Side ear | 2×2 x 4–5 | 2×3 x 5–6 | 4×5 x 8–11 | 5×6 x 13–17, rows 14–19 |

At 48–64 px use the 32 px recipe with eyes ≥7 px wide and planes in the cheeks. Below 8 px
there is no face: two dark pixels or one shadow row.

## Templates

Lit from the upper left; hair is a short cap so hairline and brow rows stay visible — swap
the hair, keep the rows. Each strip holds self-contained heads side by side.

Front 8 / 12 / 16 px (left edges x = 0, 9, 21). 8 px: dots only; 12 px: odd width, centre nose; 16 px: catch-lit 2×2 eyes, blush.

```grid heads-front-small
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
M = lip #a14a52
N = nose-shade #c47a5a
R = blush #d9826f
---
..OOOO......OOOOO........OOOOOO....
.OHHHHO...OOHHHHHOO....OOHHHHHHOO..
OHhHHHHO.OHHhhHHHHHO..OHHhhHHHHHHO.
OLLSSSDO.OHHHHHHHHHO.OHHhhHHHHHHHHO
OSESSEDO.OHHHDDDHHHO.OHHHHHHHHHHHHO
OSSSSSDO.OSSESSSESSO.OHHDDDDDDDDHHO
.OSMMDO..OSSESSSESDO.OHSLLLSSSSSDHO
..OOOO...OSLSSSSSSDO.OSSLSSSSSSSDDO
..........OSSSNSSSO..OSSWESSSSWEDDO
..........OSSMMMSSO..OSSEESSSSEEDDO
...........OSDDDDO....OSSSSSSSSSDO.
............OOOOO.....OSRSSSSSSRDO.
.......................OSSSMMSSSO..
.......................OSSSSSSSSO..
........................OSDDDDSO...
.........................OOOOOO....
```

Front 24 / 32 px (x = 0, 24). 24 px: brows, 3×3 eyes, 1-px nose; 32 px: full features, ears, bridge shade.

```grid heads-front-large
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
k = hair-dark #3d2318
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
M = lip #a14a52
N = nose-shade #c47a5a
w = highlight #ffffff
e = ear-shade #c47a5a
R = blush #d9826f
---
.......OOOOOOOOO..................OOOOOOOOOOO..........
.....OOHHHHHHHHHOO..............OOHHHHHHHHHHHOO........
...OOHHHhhhhHHHHHHOO..........OOHHHhhhhhhhHHHHHOO......
..OHHHhhhHHHHHHHHHHHO........OHHhhhHhhhHHHHHHHHHHO.....
.OHHHhhHHHHHHHHHHHHHHO......OHHhhhhHHHHHHHHHHHHHHHO....
.OHHhHHHHHHHHHHHHHHHHO.....OHHhhHHHHHHHHHHHHHHHHHHHO...
.OHHHHHHHHHHHHHHHHHHHO.....OHhhHHHHHHHHHHHHHHHHHHHHO...
.OHHHHHHHDDDDDDDDHHHHO....OHHhHHHHHHHHHHHHHHHHHHHHHHO..
.OHSSSSSSSSSSSSSSSSSHO....OHHHHHHHHHHHHHHHHHHHHHHHHHO..
.OHSSSkkkSSSSSkkkSSSHO....OHHHHHHHHHHHHHHHHHHHHHHHHHO..
.OHSSSSSSSSSSSSSSSSSHO....OHHHHHHHDDDDDDDDDDDHHHHHHHO..
.OSSSSOOOSSSSSOOOSSSDO....OHHHHSSSLLSSSSSSSSSSSSHHHHO..
OeSSSSwEESSSSSwEESSDDeO...OHSSSSSSLLLSSSSSSSSSSSSSSHO..
OeSSLLWEESSSSSWEESSDDeO...OHSSSkkkkkSSSSSSSkkkkkSSSHO..
.OOSLLSSSSSSSSSSSSSDOO....OHSSSSSSSSSSSSSSSSSSSSSSSHO..
..OSSSSSSSSNSSSSSSSDO....OOHSSSOOOOOSSSSSSSOOOOOSSSHOO.
...OSRRSSSSSSSSSRRSO....OeSSSSSWwEIWSSSSSSSWwEIWSSDDSeO
...OSSSSSDSSSDSSSSSO....OeSSSSSWIEIWSSSSSSSWIEIWSSDDSeO
....OSSSSSMMMSSSSSO.....OeSSSSSSWWWSSSSSSSSSWWWSSSDDSeO
....OSSSSSSSSSSSSSO.....OeSSSSSSSSSSSSSSNSSSSSSSSSDDSeO
.....OSSSSSSSSSSSO.......O.OSSSSLLSSSSSSNSSSSSSSSSDO.O.
......OSSDDDDDSSO..........OSSSLLSSSSSNNNSSSSSSSSDDO...
.......OSSSSSSSO............OSSSRRRSSSSSSSSSRRRSSDO....
........OOOOOOO.............OSSSSSSSSSSSSSSSSSSSSDO....
.............................OSSSSSDSSSSSSSDSSSSSO.....
.............................OSSSSSSMMMMMMMSSSSSSO.....
..............................OSSSSSSRRRRRSSSSSSO......
...............................OSSSSSSSSSSSSSSSO.......
................................OSSSSSSSSSSSSSO........
.................................OSSDDDDDDDSSO.........
..................................OSSSSSSSSSO..........
...................................OOOOOOOOO...........
```

3/4 right 12 / 16 px (x = 0, 12). 12 px: only nose, mouth and ear move; 16 px: near eye 2 px, far eye 1 px.

```grid heads-tq-small
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
M = lip #a14a52
N = nose-shade #c47a5a
e = ear-shade #c47a5a
R = blush #d9826f
---
...OOOOOO.......OOOOOO....
.OOHHHHHHO....OOHHHHHHOO..
OHHhhHHHHHO..OHHhhHHHHHHO.
OHHHHHHHHHO.OHHhhhHHHHHHHO
OHHHDDDHHHO.OHHHHHHHHHHHHO
OHSESSSESO..OHHHHHDDDDDHHO
OHSESSSESO..OHHSSSSSSSSHSO
OeLSSSSSNDO.OHSSSSSSSSSDO.
.OSSSSMMSO..OeeSWESSSSEDO.
.OSSDDDSSO..OeeSEESSSSEDO.
..OOSSSOO....OSSSSSSSSSDNO
....OOO......OSRSSSSSSSDO.
..............OSSSSSMMSO..
...............OSSSSSSSO..
................OSDDDDO...
.................OOOOO....
```

3/4 right 24 / 32 px (x = 0, 25). Far eye narrower, nose breaks the far contour, chin shifted toward the turn.

```grid heads-tq-large
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
k = hair-dark #3d2318
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
M = lip #a14a52
N = nose-shade #c47a5a
w = highlight #ffffff
e = ear-shade #c47a5a
R = blush #d9826f
---
.......OOOOOOOOO...................OOOOOOOOOOO...........
.....OOHHHHHHHHHOO...............OOHHHHHHHHHHHOO.........
...OOHHHhhhhHHHHHHOO...........OOHHHhhhhhHHHHHHHOO.......
..OHHHhhhHHHHHHHHHHHO.........OHHhhhhHHHHHHHHHHHHHO......
.OHHHhhHHHHHHHHHHHHHHO.......OHHhhhHHHHHHHHHHHHHHHHO.....
.OHHhHHHHHHHHHHHHHHHHO......OHHhhHHHHHHHHHHHHHHHHHHHO....
.OHHHHHHHHHHHHHHHHHHHO......OHhhHHHHHHHHHHHHHHHHHHHHO....
.OHHHHHHHDDDDDDDDDHHO......OHHhHHHHHHHHHHHHHHHHHHHHHHO...
.OHSSSSSSSSSSSSSSSSHO......OHHHHHHHHHHHHHHHHHHHHHHHHOO...
.OHSSSSkkkSSSSSkkkSHO......OHHHHHHHHHHHHHHHHHHHHHHHO.....
.OHSSSSSSSSSSSSSSSSDO......OHHHHHHHHHDDDDDDDDDDDDHHO.....
.OSSSSSOOOSSSSSOOSSDO......OHHHHHSSSSSSSSSSSSSSSSSSO.....
OeSSSSSwEESSSSSEESSDO......OHSSSSSSSLLLSSSSSSSSSSSSO.....
OeSSLLSWEESSSSSEESDDO......OHSSSSSkkkkkSSSSSSSkkkkSO.....
.OOSLSSSSSSSSSSSSSDDO......OHSSSSSSSSSSSSSSSSSSSSSDO.....
..OSSSSSSSSSSNSSSSDOOO....OOSSSSSSOOOOOSSSSSSSOOOSDO.....
...OSRRSSSSSSSSRRSO......OeSSSSSSSWwEIWSSSSSSSWIESDO.....
....OSSSSSDSSSSDSSDO.....OeSSSSSSSWIEIWSSSSSSSWIESDO.....
.....OSSSSSMMMMSSSO......OeSSSSSSSSWWWSSSSSSSSSWSDDO.....
.....OSSSSSSSSSSSSO......OeSSSSSSLLSSSSSSSSNSSSSSDDO.....
......OSSSSSSSSSSO........O.OSSSLLSSSSSSSSSNSSSSSDDO.....
.......OSSDDDDDSO...........OSSSSSSSSSSSSSNNSSSSSDDSO....
........OSSSSSSO.............OSSSSRRRSSSSSSSSSSRRRDO.....
.........OOOOOO..............OSSSSSSSSSSSSSSSSSSSOO......
..............................OSSSSSSSDSSSSSSSSDO........
..............................OOOSSSSSSMMMMMMMMSO........
.................................OSSSSSSRRRRRRSSSO.......
..................................OSSSSSSSSSSSSSO........
...................................OSSSSSSSSSSSO.........
....................................OSSDDDDDDDO..........
.....................................OSSSSSSSO...........
......................................OOOOOOO............
```

Profile right 12 / 16 px (x = 0, 12). One wedge eye, 1-px nose bump, ear behind the midline.

```grid heads-side-small
O = outline #2b1d2e
S = skin #e8a77c
D = skin-shadow #b9695a
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
M = lip #a14a52
N = nose-shade #c47a5a
e = ear-shade #c47a5a
R = blush #d9826f
---
...OOOOO........OOOOOO.....
.OOHHHHHOO....OOHHHHHHOO...
OHHhhHHHHO...OHHhhhHHHHHO..
OHhHHHHHHO..OHHhhHHHHHHHHO.
OHHHHHHHHO..OHhHHHHHHHHHHO.
OHHHDDDESO..OHHHHHHHHHHHHO.
OHHHeeSESO..OHHHHDDDDDHHHO.
OSSSeSSSNSO.OHHHHSSSSSSSSO.
.OSSSSSMMO..OHHHHeeSSSWESO.
..OSSSSSO...OSSSSeOSSSEESO.
...OSSSOO....OSSSeeSSRSSNSO
....OOO......OSSSSSSSSSSSO.
..............OSSSSSSSSMMO.
...............OSSSDDDSSO..
................OOSSSSSOO..
..................OOOOO....
```

Profile right 24 / 32 px (x = 0, 25). Hair swept back off the forehead, 2–3 px nose, lips and chin on the contour.

```grid heads-side-large
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
k = hair-dark #3d2318
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
M = lip #a14a52
N = nose-shade #c47a5a
w = highlight #ffffff
e = ear-shade #c47a5a
R = blush #d9826f
---
.......OOOOOOOO......................OOOOOOO................
....OOOHHHHHHHHOOO...............OOOOHHHHHHHOOOO............
...OHHhhhhHHHHHHHHOO...........OOHHHHhhhhhhHHHHHOOO.........
..OHhhhHHHHHHHHHHHHHO........OOHHhhhhhhhhhhHHHHHHHHOO.......
.OHhhHHHHHHHHHHHHHHHHO......OHHHhhhhhhhhHHHHHHHHHHHHHO......
OHhhHHHHHHHHHHHHHHHHHO......OHHhhhhhhHHHHHHHHHHHHHHHHO......
OHHHHHHHHHHHHHHHHHHHHO.....OHhhhhhhHHHHHHHHHHHHHHHHHHHO.....
OHHHHHHHHHHHHHHHHHHHHO.....OHHhhhhHHHHHHHHHHHHHHHHHHHHHO....
OHHHHHHHHHHHHHHHHHHHHO.....OHHHhhHHHHHHHHHHHHHHHHHHHHHHO....
OHHHHHHDDDDDDDDDDDHHHO....OHHHHHHHHHHHHHHHHHHHHHHHHHHHHO....
OHHHHHHSSSSSHSSSSSSSSO....OHHHHHHHHHHHHHHHHHHHSSSSSSSSSSO...
OHHHHHHSSeeSHSSSkkkkSO....OHHHHHHHHHHHHHHHHSSSSSSSSSSSSSO...
OHHHHHHSeeeeSSSSOOOSSO....OHHHHHHHHHHHHHHSSSSSSSSSSSSSSSO...
OHHHHHHSeOOeSSSSWwESSO.....OHHHHHHHHHHHHSSSSSSSkkkkkkkSSO...
.OSSSSSSeeOeSSSSWIESSSO....OkHHHHHHHHHHSSSSSSSSSSSSSSSSSO...
.OSSSSSSSeeSSSSSSWRRSSSO...OkkHHHHHHHHSSSSSSSSSSSwWEESSO....
.OSSSSSSSSSSSSSSSSSSSNO.....OkkHHHHHSSSeeSSSSSSSSWIEESSOO...
..OSSSSSSSSSDDSSSSSSSN......OSkkHHHHSSSeeSSSSSSSSSWWSSSSSO..
..OSSSSSSSSSSSSSSMMMMO.......OSkkHHSSSSeeSSSSSSSLLLSSSSSSO..
...OSSSSSSSSSSSSSSSSSO........OSSkSSSSSSSSSSSSSSLLLLLSSNSSO.
....OSSSSSSSSSSSSSSSO..........OSSSSSSSSSSSSSSSRRRLLSSSSSLSO
.....OOSSSSSSDDDDDOO............OSSSSSSSSSDDSSSSSSSSSSSSNSO.
.......OOSSSSSSOOO...............OSSSSSSSSDDSSSSSSSSSSSNSO..
.........OOOOOO...................OSSSSSSSSSSSSSSSSSSSSSSO..
..................................OSSSDSSSSSSSSSSSSSMMMMO...
...................................OSDDDDSSSSSSSSSSSMMMSO...
....................................OSSDDDSSSSSSSSSSSSSSO...
.....................................OOSDDDDDSSSSSSSSDDSO...
.......................................OSSDDDDDDDDDDSSSSO...
........................................OOSSSSSDDDDDDSSSO...
..........................................OOOOSSSSSSSOOO....
..............................................OOOOOOO.......
```

## Procedure

1. `getContext`; fix H from the heads-tall plan and pick odd/even width (rule 6).
2. `addLayer` "guide"; `applyBatch` `line` the centre axis and one row per landmark from
   the table. At ≤12 px skip the guide and read rows off the table.
3. On a "head" layer block the silhouette in one flat skin colour (`applyBatch` `grid` from the
   nearest template, or `applyBatch` `fillEllipse` and trim). `render` at 1×: it must read
   as a head already (`craft/03-silhouette-and-form.md`).
4. Eyes on the eye line, then mouth, brows, nose, ears (rule 17). `readPixels` `format:"grid"` with a
   `region` to check rows, gaps, parity.
5. Hair on its own layer; hairline 1–2 px above the eyes.
6. Three skin tones: `palette` op `ramp` from the base; light top-left, shadow right, under
   hair and chin (`craft/02-shading-and-light.md`). Outline the silhouette only
   (`craft/04-outlines-and-edges.md`).
7. Turns: start from the matching 3/4 or side template; for the opposite facing `flip`
   on a copied layer, then re-shade (`craft/37-views-and-directions.md`).
8. Delete the guide; `render`, then `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Old, alien, "all forehead" | Eye line above 50% | Eyes to 52–56% |
| Eyes read as one thick brow | 1 px between eyes, or brow touching | ≥2 px gap; 1 px under the brow |
| Mouth glued to chin or nose | Mouth below 83%, no skin row | Mouth at 77–83%, skin both sides |
| 3/4 head = front head plus a nose | Equal eyes, axis not moved | Narrow the far eye, shift the axis |
| Profile is a blank egg | Straight front edge | Nose bump, brow step, lip and chin steps |
| Black line across forehead | Outline between hair and skin | Split by colour |
| Plastic skin | One saturated tone, luminance-only shadow | Shadow toward red/cool, 15–25% darker |
| Wrong light after a flip | Mirrored copy kept its shading | Re-shade |
| Face wobbles in animation | Features moved by sub-pixels | Move the whole head by whole pixels |

## Review

- Eye line within 50–56% of head height (≤65% only on deliberately cute heads).
- ≥2 px between eyes; ≥1 px eye–contour, brow–eye, mouth–nose, mouth–chin.
- Parity respected; nose absent at ≤16 px and never outline-dark.
- ≤16 px: ≥2 px of hair at the sides, hairline above eyes, no outline on it.
- 3/4: unequal eyes, far cheek pulled in, nose breaks the contour, one ear.
- Profile: ≥3 bumps on the front contour; nose bump matches the table.
- Three skin tones, one light side; eyes the highest contrast on the head.
- One deliberate asymmetry on an otherwise symmetric face.

## Sources

- Loomis, *Figure Drawing for All It's Worth* — head construction and features sheet, pp. 171–177.
- Hampton, *Figure Drawing: Design and Invention* — nine-step head, pp. 57–82.
- Bancroft, *Creating Characters with Personality* — view line-up pp. 55–57, 3/4 p. 135.
- Blair, *Advanced Animation* — Construction of the Head; the cute head, p. 15.
- Solarski, *Drawing Basics and Video Game Art* — Massing the Head.
- Dawe, *Make Your Own Pixel Art* pp. 118–123; Silber, *Pixel Art for Game Developers* pp. 31–34.
- *Pixel Logic* — spacing p. 106, hair p. 108, faces pp. 168–169, no sub-pixel faces p. 205.
- Saint11 "Portrait"/"Cuteness"; Slynyrd Pixelblog 17 and 29; st0ven fighter faces (2006);
  Tsu tutorials 7–9; art-pia small-canvas guide; Derek Yu's pixel art tutorial.
