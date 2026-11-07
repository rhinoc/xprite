# Eyes and expressions

At sprite scale a face is 20–60 pixels and emotion lives in three channels — eye openness,
brow slope, mouth shape — each 1–3 px. One pixel the wrong way and surprise reads as anger,
or the face reads as nothing. This file gives the eye ladder per head size, gaze, blinks, mouth
shapes and seven expressions at 16 and 32 px heads. Where features sit on the head:
`craft/30-characters/32-heads-and-faces.md`. Bust portraits: `craft/30-characters/38-portraits.md`. Idle and blink timing:
`craft/40-animation/41-idle-and-breathing.md`, `craft/40-animation/40-timing-and-spacing.md`.

## Rules

1. **Eyes get their pixels first** and are never the thing you cut — cut brows, nose, ears.
   With no room for even 1 px, imply the eye area with a shadow instead of a sub-pixel eye.
2. **Keep the eye ladder to head height, not canvas size:** 8 px head 1×1 or none; 12 px
   1×2; 16 px 2×2; 24 px 3×3; 32 px 5×4; 48 px 7×5; 64 px 11×6. (Pixnote and Sandro put 2×2
   at "32 px" — that is a 32 px *sprite* with an 8–10 px head, which this ladder agrees with.)
3. **Orientation reads as age:** a 1×2 vertical eye is young and alert, a 2×1 horizontal one
   old or disinterested. Pick one per character.
4. **Whites are not white.** Use the lightest skin tone or a pale grey-blue. Skip whites
   unless each eye is ≥3 px wide; with whites, keep a 2×2 pupil off the outline or the eyes
   read as ears (the SMB3 frog fix).
5. **One catch-light:** a single white pixel at the pupil's upper left, in the same place on
   both eyes. Cute and heroic faces get it, villains and blank stares do not. Keep lid,
   pupil and highlight off one shared row or column (banding).
6. **Pupil position is the gaze** (Thomas & Johnston): pupil touching the lid or rim = a
   definite look; moved in from the rim = the look changes; white all round with a small pupil
   = shock or vagueness; a smaller pupil = dazed. Centred on a camera-facing face reads as a
   dead stare: set it 1 px off centre or low. In 3/4 the pupil never touches the top in one eye
   and the bottom in the other (cross-eyed); both look the same way.
7. **Brows carry the emotion with 1 px of tilt.** Inner end down = angry; inner end up =
   sad/worried; level = neutral; raised with wide eyes = surprise; one brow 1 px higher =
   puzzled or thinking. Leave a 1-px gap between brow and eye — touching reads as a thicker
   eye — except for anger and determination, where touching is the point.
8. **Three controls, in this order:** brows, lower lid and cheek (a smile pushes the lower lid
   up), pupils (up/side = thinking, down = sad). Change only these on one base face so
   identity holds, and keep eye spacing constant.
9. **The whole head acts.** Raise a shoulder row 1 px = tense, drop it = defeated; tilt the
   head; on animals ears are a channel. A body that contradicts the face cancels the face
   (`craft/30-characters/31-anatomy-and-pose.md`).
10. **Break symmetry by one pixel** — one brow a row higher, one eye wider. A perfectly
    symmetric expression reads as a mask. Exceptions: surprise and the squeezed hurt eye.
11. **Do not take the logical midpoint between expressions.** Go A → X → B: insert a blink or
    a brow-only frame. Never change expression during a broad, fast move: switch one pose
    before or after it (Williams).
12. **Mouth: 3 speech shapes at 16 px (8 with the mood mouths), 5–9 at 32 px.** Closed (M B
    P), small open (most vowels), wide open (A, shouts); at 32 px add round (O), pucker (U W),
    teeth grin (C D S T Z) and teeth-on-lip (F V). Swap on beats, not letters; hold each ≥2 frames (≥80–100 ms); give M B
    P F V a closed frame of ≥2 frames or they vanish. The jaw drops, the upper features stay:
    open the lower half, never only the lip.
13. **Blink = closed lid darker than skin.** 16 px and below: open → closed (1 frame, 80–100
    ms). 24 px and up: half → closed → half (50/80/50 ms). The 7-drawing blink of animation
    books (290–580 ms) is for ≥48 px. Blink every 2–4 s, on a different period from the
    breathing loop, and on gaze changes and at the end of a hold. Lids keep their thickness and
    never wobble (T&J).
14. **Eyes never jitter.** No eye pixel moves unless intended. Swap whole eyes between frames
    and keep lid lines on fixed rows.
15. **Eye shape speaks:** round, big, low = cute; big dark pupil + catch-light = baby; heavy
    lids = tired or lazy; slanted, narrow, small pupil = sly or hostile.
16. **If 16 px cannot show the emotion, change the size, not the pixels:** head ≥40% of the
    sprite height, eyes ≥2 px, or exaggerate the brows (Mario's shocked face is lost under his
    moustache).
17. **Contrast:** the eye strip is the strongest contrast on the head, doubly so under a helmet
    or headband. Tears and sweat are 1-px light-blue accents.

## By size

| Head | Eye | Brow | Mouth | Expression channels | Blink |
|---|---|---|---|---|---|
| 8 px | 1×1 or none | — | 1–2 px | colour, head tilt | eye px → skin |
| 12 px | 1×2 | — | 3 px | eye 1×2 ↔ 1 px, mouth row | 1 frame |
| 16 px | 2×2 | 2 px | 2–6 px, 3 rows | brow slope, eye 2×2 / `>` / `^`, 8 mouths | 2 frames |
| 24 px | 3×3 | 3 px | 3–5 px | + lid row, catch-light, pupil | 2–3 frames |
| 32 px | 5×4 | 5 px | 5–9 px, 5 rows | + sclera, gaze, tears, teeth | 3 frames |
| 48 px | 7×5 | 7 px | 8–12 px | + lid crease, iris dark/light | 3–5 frames |
| 64 px | 11×6 | 11 px | 12–16 px | + iris pattern, lower lid | 5–7 frames |

## Expression recipes

Brow positions assume the neutral brow at row 6 (16 px) and row 13 (32 px).

| | Brows | Eyes | Mouth | Extra |
|---|---|---|---|---|
| Neutral | level | open, catch-light | 2 px (16) / 5 px (32) line | — |
| Happy | level, or 1 row up | closed arcs `^` 3 px (16) / 5 px (32) | smile, corners 1 px up; at 32 open with teeth | blush |
| Angry | inner end 1–2 px down, touching the lid | squint, top row hidden | 4-px line + corners down (16); clenched teeth (32) | — |
| Sad | inner end 1–2 px up | pupils low, catch-light kept | corners 1 px down | tear 1×2–1×3 |
| Surprised | raised: 1 row (16 px), 3 rows (32 px) | widest: white all round, 1-px pupil | round O: 2×2 (16), 5×4 (32) | — |
| Hurt | inner end up (32 px; none at 16 px) | squeezed `> <` | open grimace with teeth | sweat drop |
| Determined | low, flat, touching the lid (32 px: inner end 1 px down) | half-lid, pupil forward | firm line, one corner 1 px up | — |

## Templates

Eye ladder — each eye sits on a skin tile with its brow. 8 / 12 px, the 2×1 "old" eye,
16 px with catch-light, and a flat 2×2 for masks and monsters:

Tiles 7×6, left to right: 8 px head, 12 px head, horizontal 2×1, 16 px head, flat 2×2.

```grid eyes-ladder-small
S = skin #e8a77c
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
---
SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS
SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS
SSSESSS.SSSESSS.SSEESSS.SSWESSS.SSEESSS
SSSSSSS.SSSESSS.SSSSSSS.SSEESSS.SSEESSS
SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS
SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS.SSSSSSS
```

24 px head (tile 9×10, 3-px brow, 3×3 eye) and 32 px head (tile 11×10, 5-px brow, 5×4 eye).

```grid eyes-ladder-mid
O = outline #2b1d2e
S = skin #e8a77c
k = hair-dark #3d2318
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
w = highlight #ffffff
---
SSSSSSSSS.SSSSSSSSSSS
SSSkkkSSS.SSSkkkkkSSS
SSSSSSSSS.SSSSSSSSSSS
SSSOOOSSS.SSSOOOOOSSS
SSSwEESSS.SSSWwEIWSSS
SSSWEESSS.SSSWIEIWSSS
SSSSSSSSS.SSSSWWWSSSS
SSSSSSSSS.SSSSSSSSSSS
SSSSSSSSS.SSSSSSSSSSS
SSSSSSSSS.SSSSSSSSSSS
```

48 px head (tile 13×13, 7×5 almond eye with dark upper iris) and 64 px head (tile 17×13, 11×6 eye with lower lid).

```grid eyes-ladder-large
O = outline #2b1d2e
S = skin #e8a77c
D = skin-shadow #b9695a
k = hair-dark #3d2318
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
j = iris-dark #35618a
w = highlight #ffffff
---
SSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS
SSSkkkkkkkSSS.SSSkkkkkkkkkkkSSS
SSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS
SSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS
SSSSOOOOOSSSS.SSSSSOOOOOOOSSSSS
SSSSjjjjjSSSS.SSSSWWjjjjjWWSSSS
SSSWIwEEIWSSS.SSSWWjIwEEIjWWSSS
SSSWIEEEIWSSS.SSSWWIIEEEIIWWSSS
SSSSWIIIWSSSS.SSSSWWIIEIIWWSSSS
SSSSSSSSSSSSS.SSSSSDDDDDDDSSSSS
SSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS
SSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS
SSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS
```

Gaze at 32 px, eye 5×4 (tiles 9×8): centre, left, right, up, down. The iris block moves; the lid does not.

```grid eyes-gaze-32
O = outline #2b1d2e
S = skin #e8a77c
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
w = highlight #ffffff
---
SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS
SSOOOOOSS.SSOOOOOSS.SSOOOOOSS.SSOOOOOSS.SSOOOOOSS
SSWwEIWSS.SSwEIWWSS.SSWWwEISS.SSWwEIWSS.SSWWWWWSS
SSWIEIWSS.SSIEIWWSS.SSWWIEISS.SSWWWWWSS.SSWwEIWSS
SSSWWWSSS.SSSWWWSSS.SSSWWWSSS.SSSWWWSSS.SSSIIISSS
SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS
SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS
SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS.SSSSSSSSS
```

Blink at 16 px: open, half (lid shade over the top row), closed (2-px lid line). Windows 8×4; stamp each at x 3, y 7 of the 16 px head; the half frame is optional.

```grid blink-16
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
---
LSSSSSSS.LSSSSSSS.LSSSSSSS
WESSSSWE.DDSSSSDD.SSSSSSSS
EESSSSEE.EESSSSEE.OOSSSSOO
SSSSSSSS.SSSSSSSS.SSSSSSSS
```

Blink at 32 px: open, half, closed (lid line + lower-lid shade). Windows 17×5; stamp at x 7, y 14 of the 32 px head; play 50 / 80 / 50 ms.

```grid blink-32
O = outline #2b1d2e
S = skin #e8a77c
D = skin-shadow #b9695a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
w = highlight #ffffff
---
SSSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSSS
OOOOOSSSSSSSOOOOO.DDDDDSSSSSSSDDDDD.SSSSSSSSSSSSSSSSS
WwEIWSSSSSSSWwEIW.OOOOOSSSSSSSOOOOO.SSSSSSSSSSSSSSSSS
WIEIWSSSSSSSWIEIW.WwEIWSSSSSSSWwEIW.OOOOOSSSSSSSOOOOO
SWWWSSSSSSSSSWWWS.SWWWSSSSSSSSSWWWS.SDDDSSSSSSSSSDDDS
```

Mouths at 16 px (tiles 8×5, one per shape): closed, small open, wide open, O, teeth grin, F/V, smile, frown. Stamp tile top-left at x 3, y 10.

```grid mouths-16
S = skin #e8a77c
M = lip #a14a52
m = mouth-dark #5a2030
T = teeth #f4ede2
R = blush #d9826f
---
SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS
SSSSSSSS.SSMMMMSS.SMMMMMMS.SSSMMSSS.SMMMMMMS.SSMMMMSS.SMSSSSMS.SSSSSSSS
SSMMMMSS.SSMmmMSS.SMmmmmMS.SSMmmMSS.SSTTTTSS.SSTTTTSS.SSMMMMSS.SSMMMMSS
SSSSSSSS.SSSMMSSS.SSMMMMSS.SSSMMSSS.SSSMMSSS.SSSRRSSS.SSSSSSSS.SMSSSSMS
SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS.SSSSSSSS
```

Mouths at 32 px (tiles 11×7): closed, small open, wide open (A), O, pucker (U), teeth (C D S), F/V, smile, frown. Stamp at x 10, y 22 — the seam lands on row 25.

```grid mouths-32
S = skin #e8a77c
M = lip #a14a52
m = mouth-dark #5a2030
T = teeth #f4ede2
R = blush #d9826f
---
SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS
SSSSSSSSSSS.SSSSSSSSSSS.SSMMMMMMMSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS
SSSSSSSSSSS.SSMMMMMMMSS.SSMTTTTTMSS.SSSSMMMSSSS.SSSSSSSSSSS.SSMMMMMMMSS.SSMMMMMMMSS.SSMSSSSSMSS.SSSSSSSSSSS
SSMMMMMMMSS.SSMmmmmmMSS.SSMmmmmmMSS.SSSMmmmMSSS.SSSSMMMSSSS.SSMTTTTTMSS.SSTTTTTTTSS.SSSMMMMMSSS.SSSMMMMMSSS
SSSRRRRRSSS.SSSMMMMMSSS.SSMmmmmmMSS.SSSMmmmMSSS.SSSSMmMSSSS.SSMMMMMMMSS.SSSRRRRRSSS.SSSSRRRSSSS.SSMSSSSSMSS
SSSSSSSSSSS.SSSSSSSSSSS.SSSMMMMMSSS.SSSSMMMSSSS.SSSSMMMSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS
SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS.SSSSSSSSSSS
```

Expression sets: one base head per size, only brows, eyes and mouth change. 16 px: full heads
(x offsets 0, 15, 30, 45 — each block 14 wide, 1 px gap), same rows as `heads-front-16` in
`craft/30-characters/32-heads-and-faces.md`. 32 px: the face window only — 21×17, x offsets 0, 22, 44, 66 —
stamped at x 5, y 12 of `heads-front-32`; the rest of the head is unchanged.
Order: neutral, happy, angry, sad / surprised, hurt, determined.

16 px heads: neutral, happy, angry, sad.

```grid expr-16-a
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
k = hair-dark #3d2318
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
M = lip #a14a52
R = blush #d9826f
G = tear #8fd0ee
---
....OOOOOO.........OOOOOO.........OOOOOO.........OOOOOO....
..OOHHHHHHOO.....OOHHHHHHOO.....OOHHHHHHOO.....OOHHHHHHOO..
.OHHhhHHHHHHO...OHHhhHHHHHHO...OHHhhHHHHHHO...OHHhhHHHHHHO.
OHHhhHHHHHHHHO.OHHhhHHHHHHHHO.OHHhhHHHHHHHHO.OHHhhHHHHHHHHO
OHHHHHHHHHHHHO.OHHHHHHHHHHHHO.OHHHHHHHHHHHHO.OHHHHHHHHHHHHO
OHHSSSSSSSSHHO.OHHSSSSSSSSHHO.OHHSSSSSSSSHHO.OHHSSSSSSSSHHO
OHSkkLSSSkkDHO.OHSLLLSSSSSDHO.OHSkLLSSSSkDHO.OHSLkLSSSkSDHO
OSSLSSSSSSSDDO.OSSLSSSSSSSDDO.OSSLkSSSSkSDDO.OSSkSSSSSSkDDO
OSSWESSSSWEDDO.OSSSESSSSESDDO.OSSEESSSSEEDDO.OSSWESSSSWEDDO
OSSEESSSSEEDDO.OSSESESSESEDDO.OSSEESSSSEEDDO.OSSEESSSSEEDDO
.OSSSSSSSSSDO...OSSSSSSSSSDO...OSSSSSSSSSDO...OSGSSSSSSSDO.
.OSRSSSSSSRDO...OSRMSSSSMRDO...OSRSSSSSSRDO...OSGSSSSSSRDO.
..OSSSMMSSSO.....OSSMMMMSSO.....OSSMMMMSSO.....OSSSMMSSSO..
..OSSSSSSSSO.....OSSSSSSSSO.....OSMSSSSMSO.....OSSMSSMSSO..
...OSDDDDSO.......OSDDDDSO.......OSDDDDSO.......OSDDDDSO...
....OOOOOO.........OOOOOO.........OOOOOO.........OOOOOO....
```

16 px heads: surprised, hurt, determined.

```grid expr-16-b
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
k = hair-dark #3d2318
h = hair-light #9a6238
H = hair-mid #6b3f2a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
M = lip #a14a52
T = teeth #f4ede2
R = blush #d9826f
Y = sweat #8fd0ee
---
....OOOOOO.........OOOOOO.........OOOOOO....
..OOHHHHHHOO.....OOHHHHHHOO.....OOHHHHHHOO..
.OHHhhHHHHHHO...OHHhhHHHHHHO...OHHhhHHHHHHO.
OHHhhHHHHHHHHO.OHHhhHHHHHHHHO.OHHhhHHHHHHHHO
OHHHHHHHHHHHHO.OHHHHHHHHHHHHO.OHHHHHHHHHHHHO
OHHkkSSSSkkHHO.OHHSSSSSSSSHHO.OHHSSSSSSSSHHO
OHSLLLSSSSSDHO.OHSLLLSSSSSYHO.OHSLLLSSSSSDHO
OSWWWSSSSWWWDO.OSSLSSSSSSSYDO.OSkkkSSSSkkkDO
OSWEWSSSSWEWDO.OSSESSSSSSEDDO.OSSWESSSSWEDDO
OSWWWSSSSWWWDO.OSSSESSSSESDDO.OSSEESSSSEEDDO
.OSSSSSSSSSDO...OSESSSSSSEDO...OSSSSSSSSSDO.
.OSRSSMMSSRDO...OSRSSSSSSRDO...OSRSSSSMSRDO.
..OSSSMMSSSO.....OSMTTTTMSO.....OSSMMMSSSO..
..OSSSSSSSSO.....OSSMMMMSSO.....OSSSSSSSSO..
...OSDDDDSO.......OSDDDDSO.......OSDDDDSO...
....OOOOOO.........OOOOOO.........OOOOOO....
```

32 px face windows: neutral, happy, angry, sad.

```grid expr-32-a
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
k = hair-dark #3d2318
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
M = lip #a14a52
T = teeth #f4ede2
N = nose-shade #c47a5a
w = highlight #ffffff
R = blush #d9826f
G = tear #8fd0ee
---
SSSSSLLLSSSSSSSSSSSSS.SSSkkkkLSSSSSSkkkkSSS.SSkSSLLLSSSSSSSSSSkSS.SSSSSkkLSSSSSSkkSSSSS
SSkkkkkSSSSSSSkkkkkSS.SSSSSSSSSSSSSSSSSSSSS.SSSkkSSSSSSSSSSSkkSSS.SSSkkSSSSSSSSSSSkkSSS
SSSSSSSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSSSSSSS.SSSSSkkSSSSSSSkkSSSSS.SSkSSSSSSSSSSSSSSSkSS
SSOOOOOSSSSSSSOOOOOSS.SSSSSSSSSSSSSSSSSSSSS.SSOOOOOSSSSSSSOOOOOSS.SSOOOOOSSSSSSSOOOOOSS
SSWwEIWSSSSSSSWwEIWSS.SSSSESSSSSSSSSSSESSSS.SSWwEIWSSSSSSSWwEIWSS.SSWwIIWSSSSSSSWwIIWSS
SSWIEIWSSSSSSSWIEIWSS.SSSESESSSSSSSSSESESSS.SSSWEWSSSSSSSSSWEWSSS.SSWIEIWSSSSSSSWIEIWSS
SSSWWWSSSSSSSSSWWWSSS.SSESSSESSSSSSSESSSESS.SSSSSSSSSSSSSSSSSSSSS.SSSWEWSSSSSSSSSWEWSSS
SSSSSSSSSSSNSSSSSSSSS.SSSSSSSSSSSNSSSSSSSSS.SSSSSSSSSSSNSSSSSSSSS.SSSGSSSSSSSNSSSSSSSSS
SSSLLSSSSSSNSSSSSSSSS.SSSLLSSSSSSNSSSSSSSSS.SSSLLSSSSSSNSSSSSSSSS.SSSGLSSSSSSNSSSSSSSSS
SSLLSSSSSNNNSSSSSSSSD.SSLLSSSSSNNNSSSSSSSSD.SSLLSSSSSNNNSSSSSSSSD.SSLGSSSSSNNNSSSSSSSSD
SSSRRRSSSSSSSSSRRRSSD.SSSRRRSSSSSSSSSRRRSSD.SSSRRRSSSSSSSSSRRRSSD.SSSRRRSSSSSSSSSRRRSSD
SSSSSSSSSSSSSSSSSSSSD.SSSSSSSSSSSSSSSSSSSSD.SSSSSSSSSSSSSSSSSSSSD.SSSSSSSSSSSSSSSSSSSSD
OSSSSSSSSSSSSSSSSSSSO.OSSSSSMMMMMMMMMSSSSSO.OSSSSSSMMMMMMMSSSSSSO.OSSSSSSSSSSSSSSSSSSSO
OSSSSSSSMMMMMSSSSSSSO.OSSSSSSMTTTTTMSSSSSSO.OSSSSSMTTTTTTTMSSSSSO.OSSSSSSSSMMMSSSSSSSSO
.OSSSSSSSSSSSSSSSSSO...OSSSSSSMMMMMSSSSSSO...OSSSSSMMMMMMMSSSSSO...OSSSSSSMSSSMSSSSSSO.
..OSSSSSSSSSSSSSSSO.....OSSSSSSSSSSSSSSSO.....OSSSSSSSSSSSSSSSO.....OSSSSSSSSSSSSSSSO..
...OSSSSSSSSSSSSSO.......OSSSSSSSSSSSSSO.......OSSSSSSSSSSSSSO.......OSSSSSSSSSSSSSO...
```

32 px face windows: surprised, hurt, determined.

```grid expr-32-b
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
k = hair-dark #3d2318
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
M = lip #a14a52
m = mouth-dark #5a2030
T = teeth #f4ede2
N = nose-shade #c47a5a
w = highlight #ffffff
R = blush #d9826f
Y = sweat #8fd0ee
---
SSSSSLLLSSSSSSSSSSSSS.SSSkkkLLSSSSSSSkkkSYS.SSSSSLLLSSSSSSSSSSSSS
SSSSSSSSSSSSSSSSSSSSS.SSkSSSSSSSSSSSSSSSkYS.SSkkSSSSSSSSSSSSSkkSS
SSSOOOSSSSSSSSSOOOSSS.SSSSSSSSSSSSSSSSSSYYY.SSSSkkkSSSSSSSkkkSSSS
SSWWWWWSSSSSSSWWWWWSS.SSESSSSSSSSSSSSSSSESS.SSOOOOOSSSSSSSOOOOOSS
SSWWEWWSSSSSSSWWEWWSS.SSSESSSSSSSSSSSSSESSS.SSWwEIWSSSSSSSWwEIWSS
SSWWWWWSSSSSSSWWWWWSS.SSSSESSSSSSSSSSSESSSS.SSSWWWSSSSSSSSSWWWSSS
SSSWWWSSSSSSSSSWWWSSS.SSSESSSSSSSSSSSSSESSS.SSSSSSSSSSSSSSSSSSSSS
SSSSSSSSSSSNSSSSSSSSS.SSESSSSSSSSNSSSSSSESS.SSSSSSSSSSSNSSSSSSSSS
SSSLLSSSSSSNSSSSSSSSS.SSSLLSSSSSSNSSSSSSSSS.SSSLLSSSSSSNSSSSSSSSS
SSLLSSSSSNNNSSSSSSSSD.SSLLSSSSSNNNSSSSSSSSD.SSLLSSSSSNNNSSSSSSSSD
SSSRRRSSSSSSSSSRRRSSD.SSSRRRSSSSSSSSSRRRSSD.SSSRRRSSSSSSSSSRRRSSD
SSSSSSSSSSSSSSSSSSSSD.SSSSSSSSSSSSSSSSSSSSD.SSSSSSSSSSSSSSSSSSSSD
OSSSSSSSSMMMSSSSSSSSO.OSSSSSMMMMMMMMMSSSSSO.OSSSSSSSSSSSSMSSSSSSO
OSSSSSSSMmmmMSSSSSSSO.OSSSSSMTTTTTTTMSSSSSO.OSSSSSSSMMMMMSSSSSSSO
.OSSSSSSMmmmMSSSSSSO...OSSSSSMmmmmmMSSSSSO...OSSSSSSSSSSSSSSSSSO.
..OSSSSSSMMMSSSSSSO.....OSSSSSMMMMMSSSSSO.....OSSSSSSSSSSSSSSSO..
...OSSSSSSSSSSSSSO.......OSSSSSSSSSSSSSO.......OSSSSSSSSSSSSSO...
```

## Procedure

1. Draw the base head with no eyes, brows or mouth (`craft/30-characters/32-heads-and-faces.md`).
2. Put the face on its own layer (`addLayer` "face", `craft/00-core/06-layers-and-rigging.md`)
   so an expression is a swap, not a repaint.
3. Pick the eye size from the ladder; `applyBatch` `grid` the entry at the eye line — once per
   eye, the second at the mirrored x, catch-light on the same side in both.
4. One expression per frame: `copyFrame`, clear the face cel region
   (`applyBatch` `clear`), stamp brows, eyes, mouth from the recipe table; `addTag` per
   expression name.
5. `render` `filmstrip`: each expression must be told apart by brows plus mouth alone. Cover
   the eyes with a thumb — if two faces become identical, fix the mouth; cover the mouth —
   same test for the brows.
6. `readPixels` `mode:"diff"` between neutral and each frame: only brow, eye and mouth cells may change.
7. Blink: duplicate the idle frame, stamp the half and closed eyes, `setFrameDuration` `durations`
   (closed 80–100 ms; or 50/80/50), `render` `onionSkin` to check the lids sit on the same rows.
8. Talk: swap among ≤3 mouths (16 px) or ≤6 (32 px) on `addTag` "talk"; `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Surprise reads as fear or anger | Brows level or low, eyes not wider | Brows 1 row up, white all round, O mouth |
| Anger reads as sleepy | Brow slope reversed | Inner end *down*, touching the lid |
| Dead stare | Pupil centred, no highlight | Pupil 1 px off, add the catch-light |
| Cross-eyed | Pupils touch different edges in 3/4 | Same relative position, same row |
| Eyes vanish at 1× | White, iris and lid all one value | Make the eye strip the darkest/lightest on the head |
| Mask-like face | Perfect symmetry | Lift one brow 1 px |
| Smile reads as grimace | Corner pixels on the wrong row | Corners sit 1 row *above* the line for a smile |
| Mouth flaps like a puppet | Lip moved, jaw fixed; or too many shapes | Drop the whole lower half; ≤3–6 shapes, ≥2 frames each |
| Blink invisible | Lid line as light as skin | Lid line in outline colour, lower lid 1 skin step darker |
| Eyes twitch in motion | Eye pixels shifted between frames | Swap whole eyes on fixed rows |

## Review

- Eye size matches the ladder for the head height; one catch-light, same spot on both eyes.
- Pupil 1 px off centre, or the stare is deliberate; no cross-eyed 3/4.
- Brow tilt matches the emotion; 1-px gap except anger and determination.
- Each expression is distinguishable by brows plus mouth alone, at 1×.
- Only brows, eyes, mouth (and extras) differ between expression frames.
- One asymmetry per face except surprise and the squeezed hurt eye.
- Blink: closed frame darker than skin, ≥80 ms or 50/80/50, not on the breathing period.
- Talk set ≤3 mouths at 16 px, each held ≥2 frames; closed mouth present for M B P.
- Eye strip is the highest-contrast part of the head.

## Sources

- Thomas & Johnston, *The Illusion of Life* — pupil rules, blinks, expression staging (eyes and blinks section).
- Williams, *The Animator's Survival Kit* — expressions, blink formula, dialogue pp. 218–221, 304–326.
- Blair, *Advanced Animation* — mouth positions p. 35, expression sheet p. 17.
- Bancroft, *Creating Characters with Personality* — eye expression and pupil placement pp. 138–140.
- Solarski, *Drawing Basics and Video Game Art* — Facial Expressions; Mateu-Mestre, *Framed Ink* pp. 98, 102–103.
- Dawe, *Make Your Own Pixel Art* pp. 119–122; *Pixel Logic* pp. 88, 99–100, 106–107 (eyes, spacing).
- Pixnote and Sandro Maglione eye guides; art-pia small-canvas guide; Saint11 "Cuteness"; Tsu tutorials 7–8.
- Hultgren, *Animal Drawing: Anatomy and Action* — ear and head channels (pp. 10–12).
