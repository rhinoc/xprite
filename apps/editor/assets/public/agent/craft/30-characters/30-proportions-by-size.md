# Proportions by size

Head count is the first decision in a figure and the one most often made by accident. Seven heads on a 16 px canvas leaves a 2 px head with no face; two heads on a 64 px canvas reads as a toy even when the brief says "veteran". Heads-tall carries age and tone, and the canvas decides how many of them you can afford.

## Rules

1. **Head px = canvas height ÷ heads. The head must be ≥ 4 px tall.** Eyes plus a mouth need 3–4 rows. If the sum comes out below 4, cut the head count; never shrink the face to fit. Table A marks the dead cells.
2. **Head count is tone, not anatomy.** 1–3 toy / cute; 3–4 default game character (classic JRPG sprites measure ≈ 3 heads, head + hair 34–38 % of height); 5–6 teen or grounded; 7½–8 mature adult; 8½–9 noble, elf, heroic, villain. A figure with fewer than 7 heads reads young whatever its face says.
3. **Head size stays near 6–8 px from 24 px upward; spare height goes to torso and legs.** A 4-head figure at 32 px and a 6-head figure at 48 px both have an 8 px head. Do not scale the head with the canvas. (The web "head 14–18 px at 48" figure is a 3-head chibi; this file uses the arithmetic.)
4. **Leg share rises with head count, then plateaus.** 2 heads: legs ≈ 28 % of height; 3 heads ≈ 38 %; 4 heads and up: crotch at the half-way row (at 8 heads the crotch is exactly half; strictly the hip joint is half and the crotch a hair below).
5. **Landmark order is fixed at every size** (rows counted from the top): chin at 1 head; shoulder line ≈ ⅓ head below the chin; elbows level with the navel; wrists level with the crotch; fingertips mid-thigh; knees at ¾ of height; ankle one pixel above the sole. Table B turns this into rows.
6. **Widths by build.** Shoulders, outer edge to outer edge: male 2⅓ heads at 8 heads (2⅔ heroic), female 2 heads; stylised 4–6-head figures run 1.5–2 heads. The female figure differs in shoulder, waist and hip, not in height (about ½ head shorter at most). Hips ≈ shoulders for women.
7. **Cute levers** (use at least three): head 40–60 % of height and as wide as the torso or wider; no neck; eyes below the head's mid-line; short torso; body under 4 heads; limbs short and tapering (3 px at the base, 2 at the end); hands and feet small but never under the size limit. **Weight levers:** small head (⅙), barrel chest ≈ 50 % of height, hands 3×3 on a 24 px body, feet ≥ 4 px wide.
8. **Age ladder, stylised** (Bancroft): baby 2½ heads, child 3½, teen 5+, adult 6. Eyes shrink with age while nose, ears and feet keep growing. On a shared canvas a child is the adult's head plus fewer body rows, not a rescaled adult: on a 32 px adult canvas, 10 yr ≈ 24 px tall with a 7 px head, 5 yr ≈ 19 px with 7, toddler ≈ 14 px with 6 (derived from Loomis's height ratios .73/.58/.45). Template `proportions-ages-32`.
9. **Pick the sprite height from the screen, not the character.** Character height as a share of screen height: platformer ≈ 10–16 %, beat-'em-up ≈ 25 %, fighter ≈ 45 %. Common heights 16 / 32 / 48 / 64 / 128. One pixel scale and one canvas for the whole cast.
10. **Outlines cost room.** At ≤ 24 px outline only the outer silhouette and separate interior parts by colour; a full outline on a 24 px figure makes it stumpy.
11. **Limb width at 16 px.** Two sources disagree (arm 1 px vs ≥ 2 px). Rule: the arm is 2 px *including* its outline column; from 24 px up it is 2 px of colour inside the outline.
12. **Parity decides the centre.** Odd widths give one centre column (symmetric head, legs, buckle); even widths give two. Choose head and torso parity together so the shoulder width matches the head's centre column.
13. **A new size is a redraw.** The same character at world / battle / portrait size is drawn three times. When shrinking, keep silhouette, ground contacts and the biggest accessory, drop the rest (see `14-readability-and-scale`).

## By size

Table A — head height in px (✗ = under 4 px, no face possible):

| canvas | 2 heads | 3 | 4 | 5 | 6 | 8 |
|---|---|---|---|---|---|---|
| 16 | 8 | 5 | 4 | ✗ 3 | ✗ 3 | ✗ 2 |
| 24 | 12 | 8 | 6 | 5 | 4 | ✗ 3 |
| 32 | 16 | 11 | 8 | 6 | 5 | 4 |
| 48 | 24 | 16 | 12 | 10 | 8 | 6 |
| 64 | 32 | 21 | 16 | 13 | 11 | 8 |

Table B — default build, pixel rows from the top (row 0), inclusive. Bold = the template exists.

| canvas | heads | head rows | shoulder | elbow | crotch | fingertip | knee | sole | width over arms | arm | hand | leg (thigh/shin) | foot |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 16 | 2.7 (**mannequin**) | 0–5 | 6 | – | 10 | 9 | 13 | 15 | 9 | 1 + outline | 1×1 | 2 | 3×1 |
| 24 | 3 | 0–7 | 8 | 11 | 15 | 14 | 19 | 23 | 11 | 2 | 2×2 | 3 | 4×2 |
| 32 | 4 (**mannequin**) | 0–7 | 9 | 13 | 16 | 18 | 24 | 31 | 13 | 2 | 2×3 | 3 / 3 | 5×2 |
| 48 | 6 (**mannequin**) | 0–7 | 9 | 18 | 24 | 27 | 36 | 47 | 19 | 4 / 3 | 3×4 | 4 / 3 | 6×2 |
| 64 | 8 realistic | 0–7 | 11 | 24 | 32 | 37 | 48 | 63 | 19 male, 16 female | 5 / 4 | 4×6, fingers 1 px | 7 / 5 | 8×3 |
| 64 | 6 stylised | 0–10 | 12 | 24 | 32 | 38 | 48 | 63 | 22 | 5 / 4 | 4×6 | 8 / 6 | 9×3 |

Rows for 24, 64 and the 3-head 32 px figure are derived from the landmark order in rule 5; the 16 / 32 / 48 rows are read off the templates. The cute 32 px variant is 3 heads: head 0–10, torso 11–19, crotch 20, legs 12 rows.

Table C — 8-head realistic landmarks (rows from the top; u = canvas ÷ 8):

| canvas | u | chin | shoulder | nipple | navel | crotch | fingertip | knee |
|---|---|---|---|---|---|---|---|---|
| 48 | 6 | 6 | 8 | 12 | 18 | 24 | 28 | 36 |
| 64 | 8 | 8 | 11 | 16 | 24 | 32 | 37 | 48 |
| 96 | 12 | 12 | 16 | 24 | 36 | 48 | 56 | 72 |

Below 48 px an 8-head figure is not drawable; use 4–6 heads.

## Templates

```grid proportions-ladder-32
H = head          #e8c547
T = torso         #8e5ea2
L = legs          #d9788f
---
.....HHHHH..........HHHHH.......HHHHH......HHHHH......HHHHH..
...HHHHHHHHH.......HHHHHHH.....HHHHHHH....HHHHHHH....HHHHHHH.
..HHHHHHHHHHH.....HHHHHHHHH...HHHHHHHHH...HHHHHHH....HHHHHHH.
.HHHHHHHHHHHHH...HHHHHHHHHHH..HHHHHHHHH...HHHHHHH....HHHHHHH.
.HHHHHHHHHHHHH...HHHHHHHHHHH..HHHHHHHHH...HHHHHHH.....HHHHH..
HHHHHHHHHHHHHHH..HHHHHHHHHHH..HHHHHHHHH....HHHHH....TTTTTTTTT
HHHHHHHHHHHHHHH..HHHHHHHHHHH...HHHHHHH...TTTTTTTTT..TTTTTTTTT
HHHHHHHHHHHHHHH..HHHHHHHHHHH....HHHHH....TTTTTTTTT..TTTTTTTTT
HHHHHHHHHHHHHHH...HHHHHHHHH...TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
HHHHHHHHHHHHHHH....HHHHHHH....TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
HHHHHHHHHHHHHHH.....HHHHH.....TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
.HHHHHHHHHHHHH....TTTTTTTTT...TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
.HHHHHHHHHHHHH....TTTTTTTTT...TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
..HHHHHHHHHHH.....TTTTTTTTT...TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
...HHHHHHHHH......TTTTTTTTT...TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
.....HHHHH........TTTTTTTTT...TTTTTTTTT..TTTTTTTTT..TTTTTTTTT
...TTTTTTTTT......TTTTTTTTT...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...TTTTTTTTT......TTTTTTTTT...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...TTTTTTTTT......TTTTTTTTT...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...TTTTTTTTT......TTTTTTTTT...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...TTTTTTTTT......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...TTTTTTTTT......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...TTTTTTTTT......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
...LLLL.LLLL......LLLL.LLLL...LLLL.LLLL..LLLL.LLLL..LLLL.LLLL
```

`proportions-ladder-32` — the same body at 2, 3, 4, 5 and 6 heads on a 32 px canvas (heads of 16 / 11 / 8 / 6 / 5 px, figure columns 0–14, 17–27, 30–38, 41–49, 52–60). Use it to *choose*: put the brief next to it and pick the column that matches the tone.

```grid proportions-ages-32
H = head          #e8c547
T = torso         #8e5ea2
L = legs          #d9788f
---
................................HHHHH..
...............................HHHHHHH.
..............................HHHHHHHHH
..............................HHHHHHHHH
..............................HHHHHHHHH
..............................HHHHHHHHH
...............................HHHHHHH.
................................HHHHH..
......................HHH.....TTTTTTTTT
.....................HHHHH....TTTTTTTTT
....................HHHHHHH...TTTTTTTTT
....................HHHHHHH...TTTTTTTTT
....................HHHHHHH...TTTTTTTTT
............HHH......HHHHH....TTTTTTTTT
...........HHHHH......HHH.....TTTTTTTTT
..........HHHHHHH...TTTTTTT...TTTTTTTTT
..........HHHHHHH...TTTTTTT...LLLL.LLLL
..........HHHHHHH...TTTTTTT...LLLL.LLLL
.HHHHH.....HHHHH....TTTTTTT...LLLL.LLLL
HHHHHHH.....HHH.....TTTTTTT...LLLL.LLLL
HHHHHHH....TTTTT....TTTTTTT...LLLL.LLLL
HHHHHHH....TTTTT....TTTTTTT...LLLL.LLLL
HHHHHHH....TTTTT....TTTTTTT...LLLL.LLLL
.HHHHH.....TTTTT....LLL.LLL...LLLL.LLLL
.TTTTT.....TTTTT....LLL.LLL...LLLL.LLLL
.TTTTT.....TTTTT....LLL.LLL...LLLL.LLLL
.TTTTT.....LL.LL....LLL.LLL...LLLL.LLLL
.TTTTT.....LL.LL....LLL.LLL...LLLL.LLLL
.LL.LL.....LL.LL....LLL.LLL...LLLL.LLLL
.LL.LL.....LL.LL....LLL.LLL...LLLL.LLLL
.LL.LL.....LL.LL....LLL.LLL...LLLL.LLLL
.LL.LL.....LL.LL....LLL.LLL...LLLL.LLLL
```

`proportions-ages-32` — one cast on a shared 32 px adult canvas, feet on one baseline: toddler (columns 0–6, 14 px tall, head 6), 5 yr (10–16, 19 px, head 7), 10 yr (20–26, 24 px, head 7), adult (30–38, 32 px, head 8). The head barely changes; the body rows do. Use it to place a child next to an adult.

```grid proportions-mannequins-16-32-48
H = dummy-head      #e8c547
T = dummy-torso     #8e5ea2
A = dummy-arm       #5aa05a
J = dummy-joint     #8a6040
L = dummy-leg       #d9788f
---
...................................HHHHH.......
..................................HHHHHHH......
.................................HHHHHHHHH.....
.................................HHHHHHHHH.....
.................................HHHHHHHHH.....
.................................HHHHHHHHH.....
..................................HHHHHHH......
...................................HHHHH.......
....................................JJJ........
............................AAAATTTTTTTTTTTAAAA
............................AAAATTTTTTTTTTTAAAA
............................AAAATTTTTTTTTTTAAAA
............................AAAATTTTTTTTTTTAAAA
............................AAAA.TTTTTTTTT.AAAA
............................AAAA.TTTTTTTTT.AAAA
............................AAAA.TTTTTTTTT.AAAA
.................HHH........AAAA.TTTTTTTTT.AAAA
................HHHHH.......AAAA.TTTTTTTTT.AAAA
...............HHHHHHH......JJJJ..JJJJJJJ..JJJJ
...............HHHHHHH......AAA..TTTTTTTTT..AAA
...............HHHHHHH......AAA..TTTTTTTTT..AAA
...............HHHHHHH......AAA..TTTTTTTTT..AAA
................HHHHH.......AAA..TTTTTTTTT..AAA
.................HHH........AAA..TTTTTTTTT..AAA
.................JJJ........JJJ..LLLL.LLLL..JJJ
............AATTTTTTTTTAA...JJJ..LLLL.LLLL..JJJ
............AATTTTTTTTTAA...JJJ..LLLL.LLLL..JJJ
............AA.TTTTTTT.AA...JJJ..LLLL.LLLL..JJJ
............AA.TTTTTTT.AA........LLLL.LLLL.....
............JJ..JJJJJ..JJ........LLLL.LLLL.....
............AA.TTTTTTT.AA........LLLL.LLLL.....
............AA.TTTTTTT.AA........LLLL.LLLL.....
...HHH......JJ.LLL.LLL.JJ........LLLL.LLLL.....
.HHHHHHH....JJ.LLL.LLL.JJ........LLLL.LLLL.....
.HHHHHHH....JJ.LLL.LLL.JJ........LLLL.LLLL.....
.HHHHHHH.......LLL.LLL...........LLLL.LLLL.....
.HHHHHHH.......LLL.LLL...........LLLL.LLLL.....
...HHH.........LLL.LLL...........LLLL.LLLL.....
ATTTTTTTA......LLL.LLL...........LLLL.LLLL.....
A.TTTTT.A......LLL.LLL...........LLLL.LLLL.....
A.TTTTT.A......JJJ.JJJ...........LLLL.LLLL.....
J.TTTTT.J......LLL.LLL...........LLLL.LLLL.....
..LL.LL........LLL.LLL...........LLLL.LLLL.....
..LL.LL........LLL.LLL...........LLLL.LLLL.....
..LL.LL........LLL.LLL...........LLLL.LLLL.....
..JJ.JJ........LLL.LLL...........LLLL.LLLL.....
..LL.LL......JJJJJ.JJJJJ.......JJJJJJ.JJJJJJ...
.JJJ.JJJ.....JJJJJ.JJJJJ.......JJJJJJ.JJJJJJ...
```

`proportions-mannequins-16-32-48` — flat colour-coded dummies (head yellow, torso purple, arms green, legs pink, neck / hands / feet / elbows / knees brown) bottom-aligned on one baseline: 16 px at columns 0–8, 32 px at 12–24, 48 px at 28–46. Draw the one that matches the canvas on a hidden "dummy" layer, build the character over it, then delete it. Joint marks show elbow, knee and ankle rows.

## Procedure

1. Write the tone in one line, map it to a head count (rule 2), compute head px (Table A). Under 4 px: lower the count.
2. `getContext` to confirm the canvas; `addLayer` "dummy". Draw the matching mannequin with `applyBatch` `grid` (feet on the bottom row), or lay a guide line with `applyBatch` `line` at every head unit.
3. `render` at 1× next to the ladder for the read; `readPixels` `format:"grid"` to verify landmark rows against Table B.
4. Adjust one segment at a time: `applyBatch` `blit` the region to its new x/y, then `applyBatch` `clear` the old one, comparing against the other segments (`translate` moves a whole cel only). Fix proportions before any colour.
5. Dress the dummy (`35-hair-and-clothing`); keep tight clothing first so anatomy is not hidden.
6. Hide the dummy, run `validate`, then `render` again. Check silhouette against `03-silhouette-and-form`.

## Mistakes

- Face is a smear → head under 4 px → cut heads or enlarge the canvas.
- Adult brief reads as a child → head count under 6 or legs under half → add rows to legs, shrink head share.
- 48 px sprite has a 14 px head and still "looks small" → head scaled with the canvas → hold head at 6–8 px (rule 3).
- Stubby 24 px figure → outline on every part → outline the silhouette only (rule 10).
- Whole cast has the same build → same head share and shoulder width → vary heads by ±1 and width by role.
- Crotch far below the middle on a "heroic" figure → leg rows stolen by the torso → crotch at row H/2.
- Child made by shrinking an adult → head ratio unchanged → keep head px, remove body rows (rule 8).

## Review

- Head px matches Table A for the stated style and is ≥ 4.
- Crotch row ≈ H/2 for ≥ 4 heads; knee ≈ ¾ H; wrists level with the crotch.
- Head, torso and leg rows are three different masses, not equal thirds.
- Female / male differ in shoulder and hip width, not in head count.
- Every character in the set shares one pixel scale.

## Sources

Loomis, *Figure Drawing for All It's Worth* (ch. proportions, ages, pp. 26–33); Bancroft, *Creating Characters with Personality* (age ladder pp. 97–105, cute proportions pp. 66–67, 90–91); Blair, *Advanced Animation* (character types pp. 12–15); Solarski, *Drawing Basics and Video Game Art* (Proportions; Gravity and Movement); Goldfinger, *Animal Anatomy for Artists* (order of detail); Dawe, *Make Your Own Pixel Art*; Silber, *Pixel Art for Game Developers* (ch. 5); Pixel Logic (pp. 101–102); Slynyrd Pixelblog PB17, PB22, PB49; Saint11 "Cuteness"; AdamCYounis scale cheat-sheet; Pixnote, SpriteGen small-sprite guides; Derek Yu small-sprite advice.
