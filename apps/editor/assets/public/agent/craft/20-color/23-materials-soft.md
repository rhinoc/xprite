# Soft materials: cloth, skin, hair, fur, leather, scales, slime

Soft materials fail by being drawn like metal: sharp bands, a highlight on everything, texture as noise. They shade gradually, shine little or not at all, and are told mostly by their *edge* and by where the darks sit. Hard materials are in `22-materials-hard`; hair and clothing *shapes* in `35-hair-and-clothing`; faces in `32-heads-and-faces`; ramp numbers in `20-color-for-pixel-art`.

## Rules

1. **Soft = low contrast, gradual steps, little or no specular.** Soft flesh stretches over hard bone: soft forms get gradual steps, bone landmarks (cheekbone, knuckle, kneecap, collarbone) get abrupt light/shadow steps. Without landmarks a figure reads as a blob.
2. **Texture is not a gradient.** A hand-placed patch or a restrained dither describes a material without any light-to-dark ramp. Put texture in the half-tone band only; keep highlight and core flat (`13-dithering-and-texture`).
3. **The silhouette says the material first:** zig-zag edge = fur, soft scallop = cloth hem, smooth round = slime or skin, repeated arcs = scales.
4. **Cloth takes soft shadows and no highlight.** Exception: a 1 px edge catch on satin or leather. Three tones — lit, shadow, fold crease — hue-shifted cool (derived ramp below: H 262 → 250 → 238, V 78 → 58 → 40). Dark regions get less detail.
5. **Folds.** Parallel where tension is high; radiating from a compression point (elbow, clasp, pinch); perpendicular where tension is low. A fold shadows the cloth beside it. Shade the body underneath first — cloth respects the anatomy. Prints and emblems are displaced by folds. Too many folds = noise: 2–3 at 16 px. Wind moves cloth as a sine wave offset along the wind; light and shadow travel away from the source.
6. **Skin zones (32–64 px head).** Forehead warm yellow-peach (H ≈ 35, S ≈ 30, V ≈ 90). Cheeks, nose, ears reddish (H 10–15, S ≈ 45, V ≈ 80). Mouth-to-chin cool or grey (H ≈ 0 → 330, S 20–25, V ≈ 72). 16–24 px heads: two bands only, warm top and rosy-cool bottom. Add a 1–2 px red accent on the nostril wing, ear rim, cheek apex; knuckles and knees take warm reds, bony landmarks cooler tints.
7. **Skin shadow is redder first, cooler second.** Measured pairs: the first shadow step turns 10–22° toward red, S +19…+26, V unchanged or slightly lower — this is the terminator band, the most saturated warm step. The deeper core step goes cool and desaturated (violet-brown) (derived, reconciling the measured pairs with Gurney). A blue shadow on skin reads as dead.
8. **Skin gets more colours and tighter steps than other materials:** 3–4 skin colours, 15–25 % V gap between base and first shadow. Light skin travels +35…+60° over its ramp; **deep skin travels only ≈ +18°** — it needs a long value range (V 10 → 86) and almost no hue travel. Eye whites are the lightest skin tone or a cool off-white, never `#ffffff`.
9. **Light through thin flesh.** Backlit ear edge, fingertip, nostril, a terminator near the light: use the warmest, most saturated skin entry (translucency), one step wide.
10. **Hair is a mass, not strands.** 3–4 entries: undercoat, base, mid-light, highlight band. The band is 1–2 px wide, curved over the skull, offset toward the key light, at the top of the skull — not at the hairline. Hair is a colourless volume extension of the head: even black hair needs form shading (blue-black ramp).
11. **Hairline and parting.** Hair at least 2 px wide; separate from skin by colour contrast, not a black line (except at ≤ 16 px). Soft edge: one dither pixel or a one-step-lighter edge. A parting is an omitted outline pixel; strands over the face are dark colour, not black lines. At 16 px the hair silhouette is the main differentiator of characters.
12. **Fur: shade smooth first, carve tufts after.** No pillow shading; cut triangular or square tufts where they show (cheeks, top of legs); sparing checker dither where there is no room for a tuft (< 10 % of the area); stylise, do not copy photo texture. Stripes and spots wrap the contour; texture follows the form.
13. **Leather: slight gloss, not a ramp.** 1–2 px highlight on the lit edge, S ≈ 45–56 (duller than cloth, never saturated), darker toward creases. Stitches (derived): 1 px lighter dots every second pixel; wear (derived): lighter pixels on corners and edges. Leather, wood and stone are one family — rugged, no true specular.
14. **Scales** (no note covers them directly; derived from the pattern studies): **cells of one entry each,** not per-scale gradients. Light rim on top, dark arc below, rows offset by half a cell, cell size shrinking toward the silhouette (foreshortening, derived). Light zones shift the *whole cell* up or down the ramp. Do not draw every scale below 32 px — suggest them.
15. **Slime: four swatches** — small hard specular, base, reflected light, shadow — plus a darker *coloured* outline. The reflected patch sits on the side opposite the specular (light passing through). Round shapes, no sharp corners (it resists breaking); start asymmetrical. Hue steps 15–20°, as for foliage and crystal.
16. **Snow, blood, guts (brief).** Snow: warm white key, near-white light blue half-tone, blue-violet shadow (S 25–40, V 55–70), deep blue core (V 40–50), one blue-green pixel in hollows; cast shadows take the sky colour. Blood and guts: round shapes, hue variation in one material, small shiny spots for wet; orphan pixels only at very low res or on a particle's last frame.

## Material recipes (dark → light)

| material | ramp (hex) | numbers |
|---|---|---|
| cloth (derived) | `#292b66 #504394 #8863c7` | H 238 / 250 / 262, S 60 / 55 / 50, V 40 / 58 / 78 |
| skin, light (Endesga 64 + derived terminator) | `#5d2c28 #8d4a4e #d4624a #e69c69 #f6ca9f #f9e6cf` | dark H 355–5 S 46–57 V 22–45; mid H 13–24 S 50–61 V 54–75; light H 30–39 S 17–35 V 91–98 |
| skin, rose (AAP-64) | `#422433 #5b3138 #8e5252 #ba756a #e9b5a3` | H 330 → 15, S 30–46 (low) |
| skin, tan (Apollo) | `#4d2b32 #7a4841 #ad7757 #c09473 #d7b594 #e7d5b3` | S 23–50 |
| skin, deep (MagicPixel, 8) | `#1a0f0c #2e1a12 #472a1c #63402a #82573a #a3734f #c2936b #dbb894` | H travel +18°, S 32–61, V 10 → 86 |
| hair, blue-black | `#181425 #262b44 #3a4466 #5a6988` | highlight band = lightest step |
| hair, brown (derived) | `#3a2430 #6b4333 #8f5f3f #c08a55` | H 327 → 30 |
| hair, red (Resurrect 64) | `#7a3045 #9e4539 #cd683d #e6904e #fbb954` | |
| hair, blonde (derived) | `#7a5831 #bd9648 #e6ca6e #fff5b3` | H 32 → 52 |
| hair, white/grey (AAP-64) | `#6d758d #8b93af #b3b9d1 #dae0ea` | S 14–23 |
| fur (derived) | `#2b1d26 #6b3a36 #a8683f #d9a066` | coloured outline, no black |
| leather (AAP-64 browns) | `#322b28 #71413b #bb7547 #dba463 #f4d29c` | H 15–37; template uses duller `#4f3029 #7c4d36 #a8764a #c89a6a` |
| scales, green (Endesga 32) | `#193c3e #265c42 #3e8948 #63c74d #a5de5f` | H 183 → 87; teal alt (Resurrect 64) `#165a4c #239063 #1ebc73 #91db69 #cddf6c` |
| slime (Endesga 64) | `#134c4c #33984b #5ac54f #a5de5f #ecffd0` | H 180 → 84 |
| snow (derived) | `#3f4873 #7277a8 #e1edf5 #fffcf2` | shadow S 25–40 V 55–70 |

## By size

| | 8 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|
| cloth | 2 tones | 2–3 bands + 1 fold line from shoulder/clasp; no highlight | + second fold family, crease shadow | + displaced pattern, fold cast shadows |
| skin | base + 1 shadow | 2 tones + warm accent px; 2 bands | 3 tones, blush/lip, highlights on protrusions | three face zones, terminator band, translucent edges |
| hair | one mass | base + highlight + dark; distinct silhouette | 3–4 entries, curved band, 2–3 notches | + strand ends, soft hairline |
| fur | zig-zag edge | 2 px zig-zag + 1 tuft notch | 2–3 tuft clusters | layered tuft rows, dither < 10 % |
| leather | 2 tones | base + dark edge + 1 gloss px | + stitches, edge wear | + creases, gloss band |
| scales | none (2 tones + dashes) | 2–3 rows of 2 px dashes | pattern on shoulder / tail, fading out | full rows with lighting zones |
| slime | 3 tones + 1 spec | 4 swatches + outline | + bubbles, drips | + inner shapes |

## Templates

Light upper-left. Roles map onto your own ramps.

```grid mat-cloth-drape-12
O = outline      #1c1a45
L = cloth-lit    #8863c7
S = cloth-shadow #504394
D = fold-crease  #292b66
---
OOOOOOOOOOOO
OLLLDSSLLDSO
OLLLDSSLLDSO
OLLLDSSLLDSO
OLLLDSSLLDSO
OLLDSSLLDSSO
OLLDSSLLDSSO
OLLDSSLLDSSO
OLLDSSLLDSSO
OLDSSLLDSSLO
OLDSSLLDSSLO
.OOOOOOOOOO.
```

Hanging cloth: two fold creases (D) with a shadow flank (S) on their right, drifting one column left every four rows as they descend (a 1:4 slope, so they read as hanging, not diagonal); no highlight pixels.

```grid mat-skin-light-sphere-12
O = outline         #4b2a3a
H = highlight       #f9e6cf
A = light           #f6ca9f
B = mid             #e69c69
C = terminator-warm #d4624a
D = shadow-cool     #8d4a4e
R = bounce          #b8654f
---
....OOOO....
..OOAABBOO..
.OAHAAABBCO.
.OAHHAABBCO.
OAAAAAABBCRO
OBAAAABBBCDO
OBBAABBBBCDO
OCBBBBBBCCRO
.OCBBBCCCDO.
.ODCCCCCDRO.
..OORDDROO..
....OOOO....
```

Light skin: highlight → light → mid → *terminator* in saturated red-orange → cool red-brown shadow, warm bounce on the contour.

```grid mat-skin-deep-sphere-12
O = outline         #1a0f0c
H = highlight       #dbb894
A = light           #c2936b
B = mid             #a3734f
C = terminator-warm #8c5030
D = shadow          #472a1c
R = bounce          #63402a
---
....OOOO....
..OOAABBOO..
.OAHAAABBCO.
.OAHHAABBCO.
OAAAAAABBCRO
OBAAAABBBCDO
OBBAABBBBCDO
OCBBBBBBCCRO
.OCBBBCCCDO.
.ODCCCCCDRO.
..OORDDROO..
....OOOO....
```

Deep skin: the same bands, long value range, tiny hue travel; the highlight is a muted tan, never white.

```grid mat-hair-cap-14
O = outline        #1e1424
U = undercoat      #3a2430
B = base           #6b4333
M = mid-light      #8f5f3f
H = highlight-band #c08a55
---
....OOOOOO....
..OOBBHHBBOO..
.OBBHHHHHHBBO.
OBBHHBBBBHMBBO
OBHHBBBBBBMBBO
OBHBBBBBBBBBUO
OBBBBBBBBBBUUO
OBBUBBBBBUUUUO
.OU..UU..UU.O.
```

Hair cap on a skull: highlight band curved over the crown and offset to the lit side, mid-light shoulders, base, dark undercoat low and right; three fringe tips.

```grid mat-fur-pelt-14
O = outline    #2b1d26
A = fur-light  #d9a066
B = fur-mid    #a8683f
D = fur-shadow #6b3a36
---
OOOOOOOOOOOOOO
OAAAAAAAAAAABO
OAAAAAAAAABBBO
OAAAAABBBBBBDO
OAABBDBBBBDBDO
OBBBBDBBBDDBDO
OBDBDDBBDDBDDO
ODDBDDDBDDBDDO
.OD.ODD.OD.OD.
..O..OO..O..O.
```

Pelt edge: smooth shading first (light top, mid, shadow), then dark notch lines (D) that break the lower half into tufts and a stepped hem.

```grid mat-leather-strap-16
O = outline      #2a1c1a
G = gloss        #c89a6a
L = light-edge   #a8764a
M = body         #7c4d36
S = stitch       #d9b98a
D = shade        #4f3029
B = buckle-steel #8b9bb4
---
OOOOOOOOOOOOOOOO
OGGLLLLLLLLLLLLO
OMSMSMSMSMSMSMOO
OMMMMMMMMMMMMBBO
OMMMMMMMMMMMMMBO
ODDDDDDDDDDDDBBO
OOOOOOOOOOOOOOOO
```

Strap: 1 px light edge with a 2-px gloss, stitch dots every second pixel, dark underside, steel buckle (the only hard-edged part).

```grid mat-scales-swatch-18
O = outline-shadow  #193c3e
D = scale-shadow    #265c42
B = scale-body      #3e8948
L = scale-rim-light #63c74d
---
LLDDLLLLDDLLLLDDLL
BBDLBBBBDLBBBBDLBB
BOOLBBBOOLBBBOOLBB
OODDOOOODDOOOODDOO
DLLLLDDLLLLDDLLLLD
LBBBBDLBBBBDLBBBBD
LBBBOOLBBBOOLBBBOO
DOOOODDOOOODDOOOOD
LLDDLLLLDDLLLLDDLL
BBDLBBBBDLBBBBDLBB
BOOLBBBOOLBBBOOLBB
OODDOOOODDOOOODDOO
```

Scale field 18×12: each cell is 6 px wide and 4 rows tall — light rim on top, body, dark lower arc (`O`), a `D` gap at the corners; rows offset by half a cell so the gaps form a diamond lattice.

```grid mat-slime-blob-14
O = outline   #134c4c
G = base      #5ac54f
W = specular  #ecffd0
R = reflected #a5de5f
S = shadow    #33984b
---
....OOOOOO....
..OOGGGGGGOO..
.OGWWGGGGGGGO.
.OGWGGGGGGGGO.
OGGGGGGGGGGGGO
OGGGGGGGGGGGGO
OGGGGGGGGGGRRO
OSGGGGGGGGRRSO
OSSGGGGGGGSSSO
.OSSSSSSSSSSO.
..OOOOOOOOOO..
```

Slime: hard 2-px specular upper-left, reflected patch lower-right, coloured dark outline, flat bottom with a shadow rim.

## Procedure

1. Choose the material row from the table and set its ramp with `palette` op `set`; decide the light (`24-lighting-scenarios`).
2. Draw the silhouette with the material's edge signature (rule 3); `render`.
3. Fill the base tone; add *one* shadow step in the shadow side; for skin make that step the terminator (rule 7).
4. Add the material's structure: folds (cloth), highlight band (hair), tuft notches (fur), stitch row (leather), scale cells (scales), spec + reflected patch (slime). Draw with `applyBatch` ops `stroke`/`pixels`, or transcribe a template with op `grid`.
5. Add the deep core step and bounce only if the size allows (see By size); no highlight on cloth, fur, scales.
6. For skin add the warm accent pixels and the eye-white check (lightest skin tone, not white).
7. `readPixels` `format:"grid"`: no orphan pixels, no 2×1 dither pairs, folds not parallel everywhere. `validate`.

## Mistakes

| symptom | cause | fix |
|---|---|---|
| Cloth looks like plastic or metal | highlight pixels, hard bands | remove highlights; fold shadows only |
| Cloth looks scribbled | too many folds | 2–3 folds at 16 px; radiate from a compression point |
| Skin looks dead / bruised | blue shadow | shadow toward red, core violet-brown |
| Skin looks like clay | one skin ramp for every tone, same hue travel | deep skin: long V range, +18° travel |
| Hair looks like a helmet or a wig | highlight at the hairline, even bands, per-strand lines | band on top of the skull, offset to the light, silhouette notches |
| Black outline eats the hairline | outline on hair/skin border | colour contrast or dither pixel at ≤ 24 px; dark hair colour at the border |
| Fur looks like noise | random speckle | smooth shade first, then carved tufts, dither < 10 % |
| Leather looks like cardboard or cloth | no gloss pixel, too saturated | 1–2 px gloss on the edge, S ≈ 45–56 |
| Scales look like a checkerboard | per-pixel pattern at 8–16 px | dashes, cells of ≥ 4 px, pattern only on part of the body |
| Slime looks like a green ball | no reflected patch, no coloured outline | add the opposite-side reflection and a dark teal outline |

## Review

- No specular on cloth, fur, scales, hair (a band is not a specular); leather has at most a 2 px gloss.
- Skin shadow is redder than the base before it is cooler; no blue or black skin shadows; eye whites are not `#ffffff`.
- Dark skin shows a long value range, not a hue rotation.
- Hair highlight sits on the crown on the lit side, ≥ 2 px thick hair, soft hairline; the silhouette is distinct.
- Fur edge zig-zags in ≥ 2 px steps; interior dither < 10 %.
- Slime has all four swatches and a coloured outline.
- Folds radiate or run parallel for a reason; no uniform stripes.

## Sources

- Gurney, *Color and Light* (skin zones and translucency, hair as a mass, snow, transmitted light, pp. 152–159, 198–199); Solarski, *Drawing Basics and Video Game Art* (hair volume, skeletal landmarks).
- Saint11 (Pedro Medeiros) tutorials: Fabric, Goo, Blood; yamsdev's fur tutorial; Arne's painting tutorial (cloth, leather, subsurface scattering); Pixel Logic (pp. 108, 126: hair/skin separation, texture vs gradient); Silber, *Pixel Art for Game Developers* (skin ramp, pp. 59, 85–87); Dawe, *Make Your Own Pixel Art* (eyebrows, soft-material damage, pp. 120, 158–159).
- Measured skin and hair ramps: Endesga 64, Apollo, AAP-64, Resurrect 64, MagicPixel (Lospec JSON); BJG palette slide (shadow shift), art-pia (face colour budget), Tsugumo ch. 8 (hair silhouette) as read in the notes.
