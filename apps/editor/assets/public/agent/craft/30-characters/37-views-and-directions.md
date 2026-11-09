# Views and directions

Most direction failures are consistency failures: a head that grows between facings, a face drawn on the back of a skull, a sword hand that jumps sides when the sprite is mirrored, light that flips with it. A direction set is one character seen from several sides on a shared set of rows, not four separate drawings. Decide the set, fix the rows, then draw.

## Rules

1. **Choose the set first.** Side-scroller: E (W is its mirror). 4-direction: S, N, E (+ W mirror) = **3 drawings**. 8-direction: S, SE, E, NE, N (+ SW, W, NW mirrors) = **5 drawings**. Small detailed sprites can fake 8-direction movement with 4 drawings; diagonals only pay off on larger, more detailed sprites.
2. **Order of work.** Profile first for skeleton and timing (cheapest to get right, easiest to animate); then the hero read, front or 3/4 (the most characterful view — ship idle there); then back; then diagonals. Pure front and pure side are the weakest silhouettes, so the 3/4 view is the one to make attractive. Conflict between "design 3/4 first" and "plan in profile": do both, in that order, on the same row guides.
3. **Shared rows.** Head top, chin, shoulder, belt, crotch, knee and sole sit on the same pixel rows in every view; the character has the same height, the same feet baseline and the same centre of mass over the feet. Only widths change. Otherwise the figure bobs when the player turns. The turnaround template marks those rows (below).
4. **Mirror rules.** W = flip of E, unless asymmetry or light forbids. Flipping reverses the light, any held item and every asymmetric detail (scar, fringe, shoulder pad). Decide once: either keep light on one side by re-shading the flipped copy (as the 8-direction head strip does), or accept mirrored light game-wide. Prefer symmetrical gear, or budget a separate W set. A satchel on the far hip disappears in the near-side view; plan which side shows what.
5. **Width by view** (shoulders, u = head height; derived from Loomis, ¾ widths [INFERENCE]): front / back 2⅓u male, 2u female; ¾ ≈ 1.7–2u; side torso depth ≈ 1u at the chest and ≈ 1⅓u butt to belly at the pelvis. In ¾ the centre line of shirt and belly shifts 1–2 px toward the turn; the far arm is partly hidden by the torso; both feet read as separate shapes.
6. **Head turn shifts the features, not the outline.** Keep head outline and hair silhouette identical across views; move the face block. Front: both eyes symmetric. ¾ (SE): face block 2–3 px toward the turn, far eye closer to the edge. Profile (E): one eye hugging the front edge, face 3–4 px wide, nose a 1 px bump or none. NE: only a cheek sliver / one eye at the front edge. N: no face at all. Two-to-three px for ¾, four-to-five for profile on a 9-wide head.
7. **Never draw a face on the back of a head.** The N view is hair, nape and shoulders (and whatever is on the back: cape, strap, tail). Hair mass, collar and shoulder line must match the front outline.
8. **Side view needs help.** It is the weakest silhouette: push the spine curve, nose or chin, clothing and hair. Put one limb in shadow (or use two tones) so near and far limbs separate; leave 1 px between arm and torso or use an inner shade line.
9. **Top-down (≈ 45° camera).** You see the top of the head: hair and shoulders take up more of the sprite than the face, and the torso overlaps the legs; N is almost all hair and shoulders. Draw feet behind legs, legs behind torso, torso behind head. At small sizes head = ⅓–½ of sprite height. Sprite size follows the tile: 16×16, 16×32 (one wide, two tall) or 32×32. Objects lower on screen are nearer: y-sort by foot position. True 90° top views (shooters) lose depth; avoid for characters.
10. **Isometric.** The ground footprint is the 2:1 diamond; the body is not a projected cube. Rotate the pelvis and shoulder lines against the head's cross-line to show facing; draw on a tile so the feet read, then delete the tile (`71-isometric`).
11. **One canvas for all frames.** Same pixel scale, palette, outline logic and transparent margin (room for sword swings) in every direction; same canvas size per sheet; one row per direction in playback order (down, left, right, up is the usual sheet order). Cast shadow on its own layer under every direction.
12. **Halves of cycles mirror.** Top-down 6-frame walk = 3 frames + the same 3 flipped; run 4 frames = 2 + flipped, except hair, scarf and asymmetries redrawn (`47-top-down-animation`, `42-walk-and-run`). Back view moves torso and head less than front.
13. **Screen direction means something.** Facing right reads as progress for left-to-right readers: heroes face right, threats push in facing left. Keep it in cutscenes and key art.
14. **You cannot rotate pixel art.** Each facing is redrawn; `rotate90` only helps at 90° steps and never on characters (`75-rotation-and-turnarounds`).
15. **Recognition from one angle.** Check that the object or character is still recognisable at its default facing; an aircraft that reads as a tower is fixed by flipping or changing the angle, not by detail (`70-perspective`).

## By size

| canvas | views and head turn |
|---|---|
| 8 | S / N / E as colour and hair shape; a turn is a 1 px shift of the head. |
| 16 | 3 drawings (5 for 8-direction), face is eyes 1×1; E has one eye, N none; torso 1 px narrower in profile. Template `views-chibi-16-8dir`. |
| 24 | 3–5 drawings; SE face block shifts 1–2 px; feet separate in ¾. |
| 32 | 5 drawings for 8-direction; features per rule 6; turnaround with all four sides. Template `views-char-turnaround-32`. |
| 64 | Same rules; add overlap cues (near arm over torso, far leg shaded) and cloth direction. |

## Templates

```grid views-char-turnaround-32
O = outline        #2b1d2e
E = eye            #3a2433
H = hair-mid       #7a4a2a
h = hair-light     #a8703f
d = hair-shadow    #4a2c18
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
T = tunic-mid      #2f8f9d
l = tunic-light    #5cc0c8
t = tunic-shadow   #1f6070
B = belt           #6b4a2a
G = buckle         #e8c547
P = pants-mid      #3b3f6b
p = pants-shadow   #292c4d
K = boot-mid       #8a5a3a
k = boot-shadow    #5a3a22
U = pouch          #b8864b
---
.....OOOOO............OOOOOO...........OOOOOO...........OOOOO.....
....OhhhhdO..........OhhhhhdO.........OhhhhhdO.........OhhhhdO....
...OhHHHHHdO........OhHHHHHHdO.......OhHHHHHHdO.......OhHHHHHdO...
..OhHHHHHHHdO.......OhHHHHHHdO.......OhHHHHHHdO......OhHHHHHHHdO..
..OhHHHHSSSdO.......OhHHHHSSsO.......OhHHHHHSsO......OhHHHHHHHdO..
..OhSESSSESdO.......OhHSESSEsO.......OhHHHHSEsO......OhHHHHHHHdO..
..OhSESSSESdO.......OhHSESSEsO.......OhHHHHSEsO......OhHHHHHHHdO..
...OSSSsSSsO.........OhSSSsSsO........OhHHSSSsO.......OhHHHHHdO...
....OSSSSsO...........OOSSSSsO.........OhHSSsO.........OhHHHdO....
..OOOOSSsOOOO.......OOOSSsOOO..........OOSSsO........OOOOSHsOOOO..
.OllllTTTllltO.....OlllTTTtO..........OllTTTtO......OllllTHTllltO.
OlTTTTTTTTTTTtO...OlTTTTTTTtO.........OllltTTtO....OlTTTTTTTTTTTtO
OltOlTTTTTtOltO...OltOlTTTTTtO........OllltTTtO....OltOlTTTTTtOltO
OltOlTTTTTtOltO...OltOlTTTTTtO........OllltTTtO....OltOlTTTTTtOltO
OltOlTTTTTtOltO...OltOlTTTTTtO........OllltTtO.....OltOlTTTTTtOltO
OSsOlTTTTTtOSsO...OSsOlTTTTTtOSO......OlSSTTtO.....OSsOlTTTTTtOSsO
OSsOlTTTTTtOSsO...OSsOlTTTTTtOSO......OlSSTTtO.....OSsOlTTTTTtOSsO
OSsOlTTTTTtOSsO...OSsOlTTTTTtOSO......OlSSTTtO.....OSsOlTTTTTtOSsO
.OOOBBBGBBBOOO.....OOOBBBBGGBO........OBBBBBGO......OOOBBBBBBBOOO.
...OPPPPPUUO.........OPPPPPPUUO.......OPPPPPpO........OUUPPPPpO...
...OPPPPPUUO.........OPPPPPPUUO.......OPPPPPpO........OUUPPPPpO...
...OPPPPPPpO.........OPPPPPPPpO.......OPPPPPpO........OPPPPPPpO...
...OPPPpPPpO.........OPPPPpPPpO........OPPPPpO........OPPPpPPpO...
...OPPPpPPpO.........OPPPPpPPpO........OPPPPpO........OPPPpPPpO...
...OPPPpPPpO.........OPPPPpPPpO........OPPPPpO........OPPPpPPpO...
...OPPPpPPpO.........OPPPPpPPpO........OPPPPpO........OPPPpPPpO...
...OPPPpPPpO.........OPPPPpPPpO........OPPPPpO........OPPPpPPpO...
...OPPPpPPpO.........OPPPPpPPpO........OPPPPpO........OPPPpPPpO...
...OKKKkKKkO.........OKKKKkKKkO........OKKKKkOO.......OKKKkKKkO...
..OKKKKkKKKkO.......OKKKKKkKKKkO.......OKKKKKKkO.....OKKKKkKKKkO..
..OKKKKkKKKkO.......OKKKKKkKKKkO.......OKKKKKKkO.....OKKKKkKKKkO..
...OOOOOOOOO.........OOOOOOOOOO.........OOOOOOO.......OOOOOOOOO...
```

`views-char-turnaround-32` — one courier, 32 px, front (columns 0–14), ¾ right (18–31), side right (35–47), back (51–65), light upper-left, 1 px outline, 3.5 heads. Shared rows (0-based, outline included): hair top 0, eyes 5–6, chin 8, neck 9, shoulders 10, hands 15–17, belt 18, crotch 22, boots 28–30, sole outline 31. Asymmetries to track per view: the fringe sweeps to the viewer's right in front view and the pouch sits on the character's left hip (rows 19–20): viewer's right in front (columns 9–10), peeking out at the far edge in ¾ (28–29), viewer's left in back (55–56), hidden in the near-side profile. The back view shows no face and a hair tail instead.

```grid views-heads-8dir
O = outline        #2b1d2e
E = eye            #3a2433
H = hair-mid       #7a4a2a
h = hair-light     #a8703f
d = hair-shadow    #4a2c18
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
---
...OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO...
..OhhHHdO.....OhhHHdO.....OhhHHdO.....OhhHHdO.....OhhHHdO.....OhHHhdO.....OhHHhdO.....OhHHhdO..
.OhHHHHHdO...OhHHHHHdO...OhHHHHHdO...OhHHHHHdO...OhHHHHHdO...OhHHHHHdO...OhHHHHHdO...OhHHHHHdO.
OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO
OhHSSSSSHdO.OhHHHHHSSsO.OhHHHHHHSsO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OSSHHHHHHdO.OSSSHHHHHdO
OhSESSSESdO.OhHHSESSEsO.OhHHHsHSESO.OhHHHHHHHSO.OSHHHHHHHsO.OSHHHHHHHdO.OSESHsHHHdO.OSESSESHHdO
.OSSSsSSSO...OHHSSSsSO...OHHHsHSSO...OHHHHHHSO...OHHHHHHdO...OSHHHHHHO...OSSHsHHHO...OSsSSSHHO.
..OSSSSsO.....OHSSSsO.....OHHHSsO.....OdHHdSO.....OdSSSdO.....OSdHHdO.....OSSHHHO.....OSSSSHO..
...OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO...
```

`views-heads-8dir` — eight heads, 9×7 inside an outline (11×9 each), stride 12: S 0, SE 12, E 24, NE 36, N 48, NW 60, W 72, SW 84. The outline and hair cap are identical in all eight; only the face block travels: S eyes at interior columns 3 and 7, SE at 5 and 8 with the face starting at column 4, E one eye at column 8 beside the front edge and a 1×2 ear at column 5, NE a one-pixel cheek sliver on the edge, N no face and a nape strip. Light stays upper-left: W / SW / NW are the E / SE / NE heads flipped *and* re-shaded (edge cells swapped so the shadow stays on the right).

```grid views-chibi-16-8dir
O = outline        #2b1d2e
E = eye            #3a2433
H = hair-mid       #7a4a2a
h = hair-light     #a8703f
d = hair-shadow    #4a2c18
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
T = tunic-mid      #2f8f9d
l = tunic-light    #5cc0c8
t = tunic-shadow   #1f6070
B = belt           #6b4a2a
P = pants-mid      #3b3f6b
p = pants-shadow   #292c4d
K = boot-mid       #8a5a3a
k = boot-shadow    #5a3a22
---
...OOOOO.......OOOOO.......OOOOO.......OOOOO.......OOOOO...
..OhhHHdO.....OhhHHdO.....OhhHHdO.....OhhHHdO.....OhhHHdO..
.OhHHHHHdO...OhHHHHHdO...OhHHHHHdO...OhHHHHHdO...OhHHHHHdO.
OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO.OhHHHHHHHdO
OhHSSSSSHdO.OhHHHHHSSsO.OhHHHHHHSsO.OhHHHHHHHdO.OhHHHHHHHdO
OhSESSSESdO.OhHHSESSEsO.OhHHHsHSESO.OhHHHHHHHSO.OSHHHHHHHsO
.OSSSsSSSO...OHHSSSsSO...OHHHsHSSO...OHHHHHHSO...OHHHHHHdO.
..OSSSSsO.....OHSSSsO.....OHHHSsO.....OdHHdSO.....OdSSSdO..
.OlTOOOOOtO..OlTOOOOOtO...OlOOOOtO....OlOOOOtO...OlTOOOOOtO
.OlTTTTTtO...OlTTTTTtO....OlTTTtO.....OlTTTtO....OlTTTTTtO.
OlTTTTTTTtO..OlTTTTTTtO...OlTTTTtO....OlTTTTtO..OlTTTTTTTtO
OSOlTTTtOsO..OSOlTTtOsO...OlSTTtO.....OlTTTTtO..OlOTTTTTOtO
.OBBBBBBBO...OBBBBBBBO....OBBBBBO.....OBBBBBO....OBBBBBBBO.
..OPpOPpO....OPpOPPpO......OPPPpO.....OPPpPPO.....OPpOPpO..
.OKKkOKKkO...OKkOKKkO......OKKKkOO....OKKkKKkO...OKKkOKKkO.
..OOO.OOO.....OOO.OOO.......OOOOO......OOOOOO.....OOO.OOO..
```

`views-chibi-16-8dir` — a 16 px tall chibi in the five drawings of an 8-direction set: S (columns 0–10), SE (12–22), E (24–34), NE (36–46), N (48–58); same hair outline in all five, only the face block, arm and leg overlaps change. SW, W and NW are flips (re-shade for light). Start 16 px top-down characters from this.

## Procedure

1. State the set and canvas (rule 1, 11). `createDocument` with canvas wide enough for all frames in a row; `addLayer` one layer per direction or per part.
2. Draw the row guides first: one `applyBatch` `line` per landmark row (head top, chin, shoulder, belt, crotch, knee, sole) on a locked "guides" layer (`setLayer` `editable:false`).
3. Draw E (profile) with `applyBatch` `grid`, then the hero view (S or SE) at the same rows. `readPixels` `format:"grid"` to verify rows match the guides.
4. Derive N from S: copy with `applyBatch` `blit`, remove face, extend hair, keep collar and shoulders. Derive diagonals by shifting the face block (rule 6) and the torso centre line (rule 5).
5. Mirror E to W with `applyBatch` `blit` then `flip` on the copy; then repair asymmetric items and re-shade for the light direction.
6. `render` of all directions side by side at 1×, then `render` `filmstrip` if frames exist. Silhouette test each (`03-silhouette-and-form`).
7. `validate`; check the same number of body rows and the same feet row in every view.

## Mistakes

- Face on the back of the head → copied S and recoloured → remove face, extend hair (rule 7).
- Character grows or shrinks between views → rows not shared → re-measure against the guides (rule 3).
- Sprite bobs when turning → centre of mass shifts between views → align head centre over the feet.
- W has light from the right and looks sunk → raw flip → re-shade the copy (rule 4).
- Pouch, scar or weapon on the wrong side in W → asymmetric detail flipped → redraw it or make it symmetric.
- ¾ looks like a front view with a nose → face block not shifted, shoulders same width → shift centre line, narrow shoulders (rule 5).
- Side view is a flat slab → no spine curve, arms fused → push profile, add shade line (rule 8).
- Top-down character shows a full front face → camera angle ignored → show hair and shoulders, shrink the face (rule 9).

## Review

- Landmark rows (head top, chin, shoulder, belt, crotch, sole) are identical in every view.
- Head outline and hair silhouette are the same across directions; only the face block moves.
- The N view has no face; the E view has one eye and no second ear unless intended.
- Asymmetric details exist where the view says they should, and are consistent when mirrored.
- Light direction is the same in every direction of the set.
- All frames share canvas, scale, palette and outline logic.

## Sources

Bancroft, *Creating Characters with Personality* (turnarounds, ¾ first, pp. 55–57, 135–140, 157); Loomis, *Figure Drawing for All It's Worth* (mannikin in five views, pp. 26, 40); Blair, *Advanced Animation* (rotating ball heads, pp. 2–7); Williams, *The Animator's Survival Kit* (pp. 87, 169, 196–197); Muybridge, *The Human Figure in Motion*; Mateu-Mestre, *Framed Ink* (screen direction); Silber, *Pixel Art for Game Developers* (pp. 76, 106, 221); Pixel Logic (game views, pp. 135–160); Slynyrd Pixelblog PB22, PB49, PB59; Saint11 top-down walk and run tutorials; Pixnote and cyangmou direction-sheet conventions; MortMort and AdamCYounis direction and iso character videos.
