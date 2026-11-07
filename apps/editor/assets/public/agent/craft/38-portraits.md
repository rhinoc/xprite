# Portraits

A portrait is a face at 32–64+ px shown in a dialogue box, a select screen or a status panel,
usually held for seconds. It must carry identity (face shape, hair, one defining feature) and
emotion (a swappable brow/eye/mouth set) and still read at 1×. Without rules agents draw a
sprite head made big: 2×2 eyes, no planes, hair as a helmet. Head geometry:
`craft/32-heads-and-faces.md`; eyes, mouths and expression recipes:
`craft/33-eyes-and-expressions.md`.

## Rules

1. **Size by use.** 32 px for HUD and status (face only), 48 px for dialogue on ~320×180
   screens, 64 px and up for key portraits. Dialogue portraits are large: a 54-px panel in a
   240×160 frame is a third of the screen height. Seen in games: 42×42 (a Sega RPG study),
   64×80 (OHRRPGCE).
2. **Frame first.** Face-only or bust (head, neck, shoulders cut by the canvas edge); front or
   slightly turned. Head (hair top to chin) 60–75% of the canvas height, 1–2 px of air above
   the hair, shoulders below. Turned heads: build from `heads-tq-32` in rules 32 and keep these
   landmark rows. Conflict: one guide gives 60–70% for a 32 px bust, the 48 px template is
   75% because bob hair adds height; both sit in the range.
3. **Three decisions before any shading:** face shape, brow shape, eye shape. Then exaggerate
   one defining feature (big nose, heavy lids, strong brow) and push the face off symmetry
   (parting, one brow a row higher, unequal highlights).
4. **Build order:** rough sketch (coloured lines at small sizes) → one flat shape for face,
   neck and shoulders → hair as flat masses → big base colours only → 2–3 skin planes → eyes
   last → highlights, anti-aliasing, selective outline. If the head shape is off at step one,
   the final is off; fix it there.
5. **Landmarks (H = hair top to chin, 36 rows at 48 px):** hairline 22–28%; brow 40–42%; eye
   line 52–56%; nose base halfway between brow and chin (≈72%); mouth seam 80–83%; chin 100%.
   Eye width = face width ÷ 5 (realistic) to ÷ 4 (stylised, the template); eye gap 1–1.5 eye
   widths; mouth width = face width ÷ 3 to ÷ 2.5; ear ≈ nose size, hidden by hair in the
   template.
6. **Light and skin.** One source, upper left. Three skin tones plus one dark accent (nostril,
   lip seam, eye crease). Shadow turned 10–22° toward red, saturation +19–26, brightness equal
   or lower (measured on a published sprite palette). Light patches: forehead, cheek apple, nose
   bridge, chin. Shadow: the far cheek 1–2 px, under the hair edge 1 px, under the chin. From
   32 px, forehead warmer, mid-face rosier, lower face cooler (`craft/20-color-for-pixel-art.md`).
7. **Hair.** Flat mass first, then flow lines from the part or cowlick, 3–4 tones with the
   highlight band following the skull curve and the lightest tone on top; strands ≥2 px wide;
   the hairline is a colour edge, not an outline (`craft/35-hair-and-clothing.md`).
8. **Eyes.** 7×5 at 48 px, 11×6 at 64: dark lid line, darker upper iris, pupil, catch-light,
   pale grey-blue whites. From 48 px make one eye dominant — brighter highlight or darker lid —
   and keep the other softer. Draw at final size; when reducing a bigger paint, enlarge the eyes
   by 2–3 px first or they vanish.
9. **Lines.** Outline the outer silhouette only; separate interior shapes by value. A dark
   border around head and shoulders lifts the portrait off its backdrop; on the shadow side a
   rim sampled from the backdrop beats black (`craft/04-outlines-and-edges.md`).
10. **Emotion = one base face with swappable brows, eyes and mouth** on their own layers;
    every expression must still be recognisably the same person. Idle: blink plus a 1-px jaw
    or hair shift (2 frames); talk: ≤3 mouth shapes; damage portraits may swap expression.
11. **Backdrop and frame.** Flat or a soft gradient, less saturated and lower in contrast than
    the face; no clutter or tiny text behind it; frame per `craft/83-ui-and-icons.md`.
12. **Check at 1×,** then on a flipped, desaturated copy (`craft/14-readability-and-scale.md`).
    Post-draw checklist: eyes not too small, nose defined, mouth corners deliberate (no
    accidental grin), hair and beard not too dark, pupils not lost.

## By size

| Canvas | Head | Eye | Brow | Mouth | Skin / hair tones | Detail budget |
|---|---|---|---|---|---|---|
| 32 | 20–24 px (face-only: `heads-front-32`) | 3×3 – 5×4 | 3–5 px | 5–7 px | 3 / 3 | eyes, mouth, hair part |
| 48 | 32–36 px | 7×5 | 7 px | 10–12 px | 3+accent / 4 | + lid crease, nose shade, lip tones |
| 64 (derived) | 44–48 px | 11×6 | 11 px | 14–16 px | 4 / 4–5 | + iris pattern, ear, cheek and jaw planes |

Rows in the 48 px template (0-based): hair 2–33; hairline 10–11 (centre-left), brows 16–17,
eyes 19–23 (left x 13–19, right x 28–34, gap 8), nose base 28, mouth 30–32 with seam 31,
chin 37, neck x 19–28, shoulders from row 39. Face 28 wide (x 10–37), hair 36 wide (x 6–41).

## Templates

Front-facing bust, hair parted on the viewer's left, lit from the upper left.

Finished 48×48 bust: bob hair with a highlight band and strands, three skin tones plus accent, 7×5 eyes, shaded V-neck tunic. Transparent backdrop — add your own.

```grid portrait-48
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
j = iris-dark #35618a
M = lip #a14a52
m = mouth-dark #5a2030
N = nose-shade #c47a5a
C = cloth-mid #3f6fa0
c = cloth-light #6a9ccf
d = cloth-dark #27476b
w = highlight #ffffff
R = blush #d9826f
---
................................................
................................................
.................OOOOOOOOOOOOOO.................
.............OOOOHHhhhhhhhhhHHHOOOO.............
...........OOHHHHhhHhhhhhhhhhHHHHHHOO...........
.........OOHHHHhhhhhHHHHHHHHHhhhHHHHHOO.........
........OHHHHHhhhHHHHHHHHHHHHHHHhhHHHHHO........
.......OHHHHHHhHHHkkkkkHHHHHHHHHHHhHHHHHO.......
......OHHHHHHhHHHHHHHHHkkkkkHHHHHHHhHHHHHO......
......OHHHHHHHHHHHHHHHHHHHHHkkkkHHHHhHHHHO......
......OHHHHHHHHHHDHHHHHHHHHHHHHHkkHHHhHHHO......
......OHHHHHHHHHDSDDHHHHHHHHHHHHHHkHHHhHHO......
......OHhHHHHHHDSLLLDDDDHHHHHHHHHHHkHHHHHO......
......OHhHHHHHDSLLLLLSSSDDHHHHHHHHHHkHHHHO......
......OHhHHHHHSSSSSSSSSSSSDDDDDHHHHHHkHHHO......
......OHhHHHHDSSSSSSSSSSSSSSSSSDDHHHHHkHHO......
......OkhHHHHkkkkkSSSSSSSSSSSSkkkkkHHHkHkO......
......OkhHHHHSSSSSkSSSSSSSSSSkSSSDDHHHkHkO......
......OkhHHHHSDDDDDSSSSSSSSSSDDDDDDHHHkHkO......
......OkhHHHDSOOOOOSSSSSSSSSSOOOOODDHHHkkO......
......OkhHHHSSjjjjjSSSSSSSSSSjjjjjDDHHHkkO......
......OkHHHHSWIwEEIWSSSLSSSSWIwEEIWDHHHkkO......
......OkHHHHSWIEEEIWSSSLSSSSWIEEEIWDHHHkkO......
......OkHHHHSSWIIIWSSSSLSDSSSWIIIWDDHHHHkO......
......OkHHHHSLLSSSSSSSSLSDSSSSSSSSDDHHHHkO......
......OkHHHSLLSSSSSSSSSLSDSSSSSSSSSDDHHHkO......
......OkHHHkLLLSSSSSSSLLSDSSSSSSSSSDDHHHkO......
......OkHHHkSLSSSSSSSNSSSSNSSSSSSSDDHHHHkO......
......OkHHHkSRRSSSSSSNDDDDNSSSSSSRRDHHHHkO......
.......OkHHkHSSSSSSSSSSSSSSSSSSSSDDHkHHHO.......
.......OkHkHHSSSSSSSMMMMMMMMSSSSSSDHkHHkO.......
........OHkHHHSSSSDmmmmmmmmmmDSSSDHHkHHO........
.........OOHHHHSSSSSRRRRRRRRSSSSDHHHkOO.........
...........OOOOOOSSSSSDDDDSSSSSOOOOOO...........
.................OSSSSSSSSSSSSO.................
..................OSSSLLLSSSSO..................
...................OSSSSSSSSO...................
...................ODDDDDDDDO...................
...................OSSDDDDDDO...................
................OOOSSSSSSDDDDOOO................
..........OOOOOOccccSSSSSDDDddddOOOOOO..........
......OOOOccccccCCCccSSSSDDddddCCCCCCCOOOO......
...OOOccccCCCCCCCCCCccSSSDcCCCCCCCCCCCCdddOOO...
.OOcccCCCCCCCCCCCCCCCccSScCCCCCCCCCCCCdddddddOO.
OccCCCCCCCdCCCCCCCCCCCccCCCCCCCCCCCCCddddddddddO
cCCCCCCCCCCdCCCCCCCCCCCcCCCCCCCCCCCCdddddddddddd
CCCCCCCCCCCdCCCCCCCCCCCCCCCCCCCCCCCddddddddddddd
CCCCCCCCCCCCdCCCCCCCCCCCCCCCCCCCCCdddddddddddddd
```

Stage 2 of the procedure: skin, hair and cloth as three flat shapes with the outer outline — check shape and hairline before any shading.

```grid portrait-48-blockin
O = outline #2b1d2e
S = skin #e8a77c
H = hair-mid #6b3f2a
C = cloth-mid #3f6fa0
---
................................................
................................................
.................OOOOOOOOOOOOOO.................
.............OOOOHHHHHHHHHHHHHHOOOO.............
...........OOHHHHHHHHHHHHHHHHHHHHHHOO...........
.........OOHHHHHHHHHHHHHHHHHHHHHHHHHHOO.........
........OHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHO........
.......OHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHO.......
......OHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHO......
......OHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHO......
......OHHHHHHHHHHSHHHHHHHHHHHHHHHHHHHHHHHO......
......OHHHHHHHHHSSSSHHHHHHHHHHHHHHHHHHHHHO......
......OHHHHHHHHSSSSSSSSSHHHHHHHHHHHHHHHHHO......
......OHHHHHHHSSSSSSSSSSSSHHHHHHHHHHHHHHHO......
......OHHHHHHHSSSSSSSSSSSSSSSSSHHHHHHHHHHO......
......OHHHHHHSSSSSSSSSSSSSSSSSSSSHHHHHHHHO......
......OHHHHHHSSSSSSSSSSSSSSSSSSSSSSHHHHHHO......
......OHHHHHHSSSSSSSSSSSSSSSSSSSSSSHHHHHHO......
......OHHHHHHSSSSSSSSSSSSSSSSSSSSSSHHHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
......OHHHHSSSSSSSSSSSSSSSSSSSSSSSSSSHHHHO......
......OHHHHSSSSSSSSSSSSSSSSSSSSSSSSSSHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
......OHHHHHSSSSSSSSSSSSSSSSSSSSSSSSHHHHHO......
.......OHHHHHSSSSSSSSSSSSSSSSSSSSSSHHHHHO.......
.......OHHHHHSSSSSSSSSSSSSSSSSSSSSSHHHHHO.......
........OHHHHHSSSSSSSSSSSSSSSSSSSSHHHHHO........
.........OOHHHHSSSSSSSSSSSSSSSSSSHHHHOO.........
...........OOOOOOSSSSSSSSSSSSSSOOOOOO...........
.................OSSSSSSSSSSSSO.................
..................OSSSSSSSSSSO..................
...................OSSSSSSSSO...................
...................OSSSSSSSSO...................
...................OSSSSSSSSO...................
................OOOSSSSSSSSSSOOO................
..........OOOOOOCCCCSSSSSSSSCCCCOOOOOO..........
......OOOOCCCCCCCCCCCSSSSSSCCCCCCCCCCCOOOO......
...OOOCCCCCCCCCCCCCCCCSSSSCCCCCCCCCCCCCCCCOOO...
.OOCCCCCCCCCCCCCCCCCCCCSSCCCCCCCCCCCCCCCCCCCCOO.
OCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCO
CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
```

Left-eye states, 7×7 windows: open, half, closed. Stamp at x 13, y 18; stamp the same window at x 28, y 18 for the right eye.

```grid portrait-48-eyes
O = outline #2b1d2e
S = skin #e8a77c
L = skin-light #f7d2ac
D = skin-shadow #b9695a
E = eye-dark #2b1d2e
W = eye-white #dfe2ea
I = iris #4f86b8
j = iris-dark #35618a
w = highlight #ffffff
---
SDDDDDS.SDDDDDS.SDDDDDS
SOOOOOS.SSSSSSS.SSSSSSS
SjjjjjS.SDDDDDS.SSSSSSS
WIwEEIW.OOOOOOO.SSSSSSS
WIEEEIW.WIEEEIW.DOOOOOD
SWIIIWS.SWIIIWS.SDDDDDS
LLSSSSS.LLSSSSS.LLSSSSS
```

Talk and mood mouths, 16×7 windows: closed, smile, small open, wide open, O. Stamp at x 16, y 29; the seam stays on row 31.

```grid portrait-48-mouths
S = skin #e8a77c
D = skin-shadow #b9695a
M = lip #a14a52
m = mouth-dark #5a2030
T = teeth #f4ede2
R = blush #d9826f
---
SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSSSMMMMMMSSSSS
SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSMMMMMMMMMMSSS.SSSSMmmmmmmMSSSS
SSSSMMMMMMMMSSSS.SSmmSSSSSSSSmmSS.SSSSMMMMMMMMSSSS.SSSMTTTTTTTTMSSS.SSSSMmmmmmmMSSSS
SSDmmmmmmmmmmDSS.SSSSmmmmmmmmSSSS.SSSMmmmmmmmmMSSS.SSSMmmmmmmmmMSSS.SSSSMmmmmmmMSSSS
SSSSRRRRRRRRSSSS.SSSSSRRRRRRSSSSS.SSSSMmmmmmmMSSSS.SSSMmmmmmmmmMSSS.SSSSSMMMMMMSSSSS
SSSSSSDDDDSSSSSS.SSSSSSDDDDSSSSSS.SSSSSRRRRRRSSSSS.SSSSMRRRRRRMSSSS.SSSSSSSSSSSSSSSS
SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS.SSSSSSSSSSSSSSSS
```

## Procedure

1. `getContext`; choose canvas and head height from the size table. Build palettes first:
   `palette` op `ramp` for skin (5 steps), hair (4), cloth (3) (`craft/01-palette-and-color.md`).
2. Layers (`addLayer`): backdrop, body, head, hair, face (eyes, brows, mouth), accents
   (`craft/06-layers-and-rigging.md`). Expressions will swap the face layer only.
3. Block in: `applyBatch` `grid` or `ellipse` for the face-neck-shoulders shape, then the hair
   masses, in flat colour (`portrait-48-blockin`). `render` at 1×; fix the head shape now.
4. Guide layer: `applyBatch` `line` rows for hairline, brow, eye line, nose base, mouth, chin from
   rule 5; delete it at the end.
5. Planes: fill the light patches and the far-side shadow with `applyBatch` `fill`; add the 1-px
   shadow under the hair edge and the chin. `render`.
6. Hair: flow lines from the part, highlight band, 2-px strands; no outline on the hairline.
7. Eyes, brows, nose, mouth, in that order; `readPixels` `format:"grid"` with a `region` to check gaps and
   mirror positions. Catch-light on the same side of both eyes.
8. Outline the outer silhouette; set the backdrop; `render`, flip a copy
   (`flip`) and judge it desaturated.
9. Expressions: `copyFrame`, swap the face cel per `craft/33-eyes-and-expressions.md`,
   `addTag` per expression; blink frames from `portrait-48-eyes`. `render` `filmstrip`,
   then `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Looks like a sprite head enlarged | 2×2 eyes, no planes | Eyes ≥7×5 at 48 px, three skin tones, planes |
| Doll face | Perfect symmetry, one flat skin tone | One brow or highlight off, hue-shifted shadow |
| Eyes tiny after resizing | Painted large then scaled | Draw at final size; enlarge eyes first |
| Hair is a helmet | One flat mass, no flow | Part, strands ≥2 px, highlight band, 3–4 tones |
| Dark lines inside the face | Interior outlines | Split by value; outline the outer edge only |
| Face sinks into the backdrop | Same value, saturated backdrop | Dark border or rim; calmer backdrop |
| Pillow-shaded face | Dark rim all round | One light side only |
| Expression sheet shows different people | Features redrawn per frame | Same base; swap brows, eyes, mouth only |
| Accidental grin | Mouth corners 1 px too high | Lower corners, check the seam length |

## Review

- Head 60–75% of canvas height; hair top 1–2 px from the edge; shoulders cut by the frame.
- Landmark rows within the ranges in rule 5; eye width ≥ the size table.
- Exactly one light direction; three skin tones plus accent; shadow under hair and chin.
- Hair has flow lines and a highlight band; hairline not outlined.
- Eyes: lid, iris, pupil, catch-light, pale whites; catch-lights on the same side.
- Interior separation by value, not lines; outer silhouette outlined.
- Reads at 1× and on a flipped, desaturated copy.
- Expression set: only brows, eyes, mouth differ; blink and ≤3 talk mouths exist.

## Sources

- Saint11, "Portraits" (four-step process) and the big portrait measurements; AdamCYounis, dialogue bust and GBA panel video.
- Slynyrd Pixelblog 29 (Anime Faces and Hair) and 39 (Sci-fi RPG, 42×42 portraits).
- Loomis, *Figure Drawing for All It's Worth* — portrait and lighting, pp. 171, 181; Solarski, *Drawing Basics and Video Game Art* — Male Head Study, focal eye.
- Bancroft, *Creating Characters with Personality* — face-shape and feature decisions, pp. 68–72, 81; Dawe, *Make Your Own Pixel Art* — portraits in games p. 118.
- BMR portrait method (OHRRPGCE legacy portraits); art-pia small-canvas guide (bust framing); BJG skin-tone palette slide; Gurney, *Color and Light* — face zones p. 156.
- Derek Yu, *Pixel Art Tutorial* — flip and desaturate check.
