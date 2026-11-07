# Readability and scale

Readability is how fast a stranger understands what you pixelled, at the size it will be seen. Art that looks heroic
at 800% can vanish in the build; detail the scale cannot hold becomes blobs, and more pixels never fix a shape
problem. This file is the test battery and the detail budget; silhouette design is `craft/03-silhouette-and-form.md`.

## Rules

1. **Read before you refine.** If the subject is not obvious as a flat one-colour silhouette at 1×, no shading will
   rescue it. Run the battery below before shading and again before finishing.
2. **Test battery, in order.** (1) *1× test*: view at 100% (`render`), look away for 5 s, look back —
   can you name it instantly? (2) *Silhouette*: collapse to one value; subject and action still identifiable, 3–4
   characters in a line-up still distinct. (3) *Squint / greyscale*: desaturate; the focal object must remain the
   highest-contrast element against its surroundings. (4) *Three backgrounds*: dark, light, a real scene crop,
   every pose. (5) *Motion*: loop at game speed — a clear frame is not a clear motion. (6) *UI safe zone*: keep key
   silhouettes out of the bottom third and corners that HUD covers. Test the **worst** pose (widest action pose, contact pose), not the idle.
3. **Value before hue.** Order of importance: construction and pose, then values, then hue. If colour fails, fix the
   values. Every touching pair of colours must be distinguishable at 1×; if two blend, change one, drop one, or put a
   darker buffer between. Aim for ≥ 2 ramp steps between a body and the background directly behind it (derived).
4. **Smallest feature.** A feature under 2 px in its smallest dimension reads as noise, unless it is an eye, a
   highlight, a star or a spark. Limbs and branches are ≥ 2 px (a 1 px limb cannot be shaded and looks flimsy);
   1 px is for details. At 16 px a hand is a mitten and a boot is 3 px: separate by colour, not outline.
5. **Detail budget by size** (table below). Give detail only where the eye should rest; quiet corners get none.
   The longer the eye stays, the more detail. Keep one consistent detail level across all assets of a project.
6. **Interior lines are expensive.** At small sizes prefer value steps to interior outlines; black inlines make
   parts fuse and break the exterior read in motion. A face at 16 px has 3–5 interior pixels in total.
7. **Spacing is letter-spacing.** A mouth needs clear space above and below; eyes and parts must not touch the outline
   or each other unintentionally. Two parts closer than 1 px fuse into one blob (limb into torso); leave a 1 px
   gap or overlap them clearly. A **tangent** (two outlines meeting at a point) reads as one shape; overlap or separate.
8. **Exaggerate by numbers.** Make a cuff/wrist, boot/trouser or neck/collar break a width change of ≥ 2 px or a value change
   of ≥ 2 ramp steps; a 1 px, 1-step change vanishes at 1×. Give a design 1–2 charm features (eyebrows, weapon, ears) and push those, rather than adding more features.
9. **Colour jobs.** One main colour and one secondary contrast colour, 2–3 total. A feature coloured like
   something else is misread (orange nose = beak). Never carry information (team, danger, selection) in colour alone:
   add shape, icon or motion; make key reads work on value or blue–yellow contrast, not red–green only.
10. **Focal sharpness map.** The focal feature (face, eyes, weapon tip) gets the hardest 1 px contrast; secondary edges
    use neighbouring values with no outline; background characters become one flat shape plus one detail.
11. **Sprite vs background.** Calm the background first (lower contrast and saturation, less detail, near the
    gameplay), then add an outline or rim to the sprite. A dark outline helps on light scenes and vanishes on dark
    ones; alternatives are a coloured outline, rim light, or value separation.
12. **Scale only by whole numbers, and never to make a new size.** `resizeSprite` `nearest` resamples without inventing colours; `exportDocument` `scale` previews it with an
    integer factor; use it for **display** (×2…×4; ×4 is the chunkiest useful). To make a bigger or smaller sprite,
    **redraw** it with the same mass layout: big masses first, a few strong details, delete the least important
    detail as size drops (the face goes first). Never mix pixel sizes in one image.
13. **Small sprites exaggerate motion.** 1 px on a 20 px sprite is 5% of its width; on 100 px it is 1%. Keep key
    frame differences ≥ 2 px on the parts that matter (`craft/05-animation.md`).
14. **Scenes.** Plan three value bands (near darkest, mid, far lightest and lowest contrast) at ~32 px wide before
    detailing; at most ~3 focal elements; one persistent point of interest; decide where nothing should happen.

## By size

| Size | What survives | Budget |
|------|---------------|--------|
| 8 | Silhouette and one accent pixel; one dark pixel can be an eye | 1 value step + 1 accent; no outline needed |
| 16 | A class, a direction, one prop. Head 4–6 px, body 6–8 px, 1–2 px padding each side | 4–8 colours (character 5–6, item 3–4); 1 focal detail; 2–3 value steps |
| 32 | Facial suggestion, separate armour pieces, a believable weapon | ~10–15 colours; 2–3 details; ≤ ~12 interior face px; ramps of 3 per material |
| 64 | Real detail; the risk becomes noise, not scarcity | 4–6 secondary details; cluster size consistent within an object; distant planes drop to 1–2 px clusters |

Rule of thumb for scale in a game, before display scaling: hero 24–32 px tall, minion or pet 12–16 px (~50%), boss
64–128 px (2–4× hero). Size ratio is itself silhouette information.

## Templates

**`read-skull-8` / `read-skull-16` / `read-skull-32`** — the readability ladder. The same skull at three sizes: 8 px keeps
a head shape, two sockets, a tooth hint (no outline); 16 px adds an outline, a nose, a shaded side and a jaw; 32 px
adds large bevelled sockets, a nose cavity, a bite line with separate teeth and curved shading. Redraw, never resize.
```grid read-skull-8
L = bone       #efe6cf
B = bone-shadow #bfb2c4
K = socket     #1d1427
---
..LLLL..
.LLLLLL.
.LKLLKL.
.LKLLKB.
.LLLLLB.
..LLLB..
..LKLK..
```
```grid read-skull-16
L = bone-light #efe6cf
S = bone-shadow #a79bb4
O = outline    #3b2a4d
K = socket     #1d1427
---
................
.....OOOOOO.....
...OOLLLLLLOO...
..OLLLLLLLLLLO..
.OLLLLLLLLLLLLO.
.OLLLLLLLLLLSSO.
.OLKKKLLLLKKKSO.
.OLKKKLLLLKKKSO.
.OLLKKLLLLKKLSO.
..OLLLLKKLLLSO..
..OLLLLKKLLLSO..
...OLLLLLLLSO...
...OLLKLLKLSO...
...OLLKLLKLSO...
....OOOOOOOO....
................
```
```grid read-skull-32
L = bone-light #efe6cf
B = bone-mid   #cfc2a3
S = bone-shadow #a79bb4
O = outline    #3b2a4d
K = socket     #1d1427
---
................................
..........OOOOOOOOOOOO..........
......OOOOLLLLLLLLLLLLOOOO......
....OOLLLLLLLLLLLLLLLLLLBBOO....
...OLLLLLLLLLLLLLLLLLLLLBBBBO...
..OLLLLLLLLLLLLLLLLLLLLLBBBBBO..
..OLLLLLLLLLLLLLLLLLLLLLLBBBBO..
.OLLLLLLLLLLLLLLLLLLLLLLLBBBBSO.
.OLLLLLLLLLLLLLLLLLLLLLLLBBBBBO.
.OLLLLLLLLLLLLLLLLLLLLLLLBBBBBO.
.OLLLLLLLLLLLLLLLLLLLLLLLBBBBBO.
.OLLLLKKKKKLLLLLLLLLLKKKKKBBBSO.
.OLLLKKKKKKKLLLLLLLLKKKKKKKBBSO.
.OLLLKKKKKKKKLLLLLLKKKKKKKKBBSO.
.OLLLKKKKKKKKLLLLLLKKKKKKKKBBSO.
.OLLLLKKKKKKLLLLLLLLKKKKKKBBBSO.
.OLLLLLKKKKLLLKKKKLLLKKKKBBBSSO.
..OLLLLLLLLLLLKKKKLLLLLBBBBBSO..
..OLLLLLLLLLLLLKKLLLLLBBBBBBSO..
...OLLLLLLLLLLLLLLLLLBBBBBBSO...
...OLLLLLLLLLLLLLLLLBBBBBBBSO...
....OLLLLLLLLLLLLLLBBBBBBBSO....
....OLLLLLLLLLLLLLBBBBBBBSSO....
.....OLLLLLLLLLLLLLLLLLLLLO.....
.....OLLLKLLLKLLLLKLLLKLLLO.....
.....OLLLKLLLKLLLLKLLLKLLLO.....
.....OLLLKLLLKLLLLKLLLKLLLO.....
.....OKKKKKKKKKKKKKKKKKKKKO.....
.....OLLLLKLLLKLLKLLLKLLLLO.....
.....OLLLLKLLLKLLKLLLKLLLLO.....
......OOOOOOOOOOOOOOOOOOOO......
................................
................................
```
**`read-contrast-ladder`** — a Ø8 disc on the same background at 0, 1, 2, 3, 4 value steps (left to right). Step 0
vanishes; step 1 is weak at 1×; from step 2 it reads.
```grid read-contrast-ladder
B = background #b2afca
1 = disc-1-step #8481a3
2 = disc-2-steps #5d5b7c
3 = disc-3-steps #3b3a55
4 = disc-4-steps #1d1c2e
---
BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB
BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB
BBBBBBBBBBBB..BBBB1111BBBB..BBBB2222BBBB..BBBB3333BBBB..BBBB4444BBBB
BBBBBBBBBBBB..BBB111111BBB..BBB222222BBB..BBB333333BBB..BBB444444BBB
BBBBBBBBBBBB..BB11111111BB..BB22222222BB..BB33333333BB..BB44444444BB
BBBBBBBBBBBB..BB11111111BB..BB22222222BB..BB33333333BB..BB44444444BB
BBBBBBBBBBBB..BB11111111BB..BB22222222BB..BB33333333BB..BB44444444BB
BBBBBBBBBBBB..BB11111111BB..BB22222222BB..BB33333333BB..BB44444444BB
BBBBBBBBBBBB..BBB111111BBB..BBB222222BBB..BBB333333BBB..BBB444444BBB
BBBBBBBBBBBB..BBBB1111BBBB..BBBB2222BBBB..BBBB3333BBBB..BBBB4444BBBB
BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB
BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB..BBBBBBBBBBBB
```
**`read-knight-weak` → `read-knight-strong`** — silhouette test on a 16×16 knight. Symmetric, arms fused to the
body: any humanoid. With plume, shield, forward sword, bent stance and gaps: a knight.
```grid read-knight-weak
K = silhouette #1d1427
---
................
......KKKK......
......KKKK......
......KKKK......
......KKKK......
....KKKKKKKK....
....KKKKKKKK....
....KKKKKKKK....
....KKKKKKKK....
....KKKKKKKK....
.....KK..KK.....
.....KK..KK.....
.....KK..KK.....
.....KK..KK.....
....KKK..KKK....
................
```
```grid read-knight-strong
K = silhouette #1d1427
---
.............K..
....K.KK.....K..
...KKKKKK....K..
....KKKKK....K..
.....KKK.....K..
.KKK.KKKKK...K..
KKKK.KKKKKK..K..
KKKK.KKKKKKK.K..
KKKK.KKKKKKKKKKK
.KKK.KKKKKK.....
..K..KKKKKK.....
.....KK..KK.....
....KK....KK....
....KK.....KK...
...KKK.....KKK..
................
```
**`read-limbs-fused-vs-gap`** — arms touching the torso fuse into a T-block (left); detaching them below the
shoulder with a 1 px gap restores the arms (right).
```grid read-limbs-fused-vs-gap
K = silhouette #1d1427
---
....KKKK..........KKKK....
....KKKK..........KKKK....
....KKKK..........KKKK....
....KKKK..........KKKK....
.KKKKKKKKKK....KKKKKKKKKK.
.KKKKKKKKKK....KKKKKKKKKK.
.KKKKKKKKKK....K.KKKKKK.K.
.KKKKKKKKKK....K.KKKKKK.K.
.KKKKKKKKKK....K.KKKKKK.K.
.KKKKKKKKKK....K.KKKKKK.K.
.KK.KKKK.KK....K..KKKK..K.
....KKKK..........KKKK....
....KKKK..........KKKK....
....KKKK..........KKKK....
```
**`read-tangent-vs-overlap`** — two outlines that just touch fuse into a thick wall (left); one clearly in front of the
other reads as depth (right).
```grid read-tangent-vs-overlap
O = outline    #2b1d2e
F = fill       #d98d5f
---
..OOOO....OOOO.......OOOO...........
.OFFFFO..OFFFFO.....OFFFFO..........
OFFFFFFOOFFFFFFO...OFFFFFFOOOO......
OFFFFFFOOFFFFFFO...OFFFFFFOFFFO.....
OFFFFFFOOFFFFFFO...OFFFFFFOFFFFO....
OFFFFFFOOFFFFFFO...OFFFFFFOFFFFO....
.OFFFFO..OFFFFO.....OFFFFOFFFFFO....
..OOOO....OOOO.......OOOOFFFFFFO....
.........................OFFFFO.....
..........................OOOO......
```
**`read-limb-width`** — 1 px, 2 px and 3 px limbs. Only 2 px and up can carry a light and a shadow.
```grid read-limb-width
L = limb-light #f2c28b
M = limb-mid   #d98d5f
D = limb-shadow #a65a4e
---
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
M..LD..LMD.
```

## Procedure

1. Write down the smallest feature that must be visible (a face expression? a gem?) and choose the canvas from that.
2. Block in the silhouette; run test (2) on a copy: duplicate the layer (`applyBatch` `duplicateLayer`), collapse every colour to
   one value (`applyBatch` `replaceColor`), `render`, delete the copy.
3. Fix shape first: separate fused parts with a 1 px gap, break symmetry, exaggerate angles, enlarge the key feature.
4. Shade; then run test (3): duplicate, `effect` `hue-saturation` (`mode: "hsl-add"`, `saturation: -100`), `render`.
5. Test (4): a temporary layer under the sprite filled dark, light, then mid-grey (`addLayer`, `applyBatch` `fillRect`);
   `render` each. Adjust the outline or the background values, not the whole sprite.
6. Spend the detail budget on the focal point only; delete any interior line that the value steps already say.
7. `render` the sprite; for animation, `render` `filmstrip` and the motion test.
8. `validate`; it does not judge readability. The battery above is by eye.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "What is that?" at 1× | Detail the scale cannot hold | Delete interior detail until test (1) passes |
| Blob when shrunk | Resized instead of redrawn | Redraw at the new size from the masses |
| Arm and torso fuse | Parts touch with no gap | 1 px gap, or overlap clearly |
| Features read as other things | Colour or shape of a feature matches another object | Recolour / reshape the feature |
| Sprite lost on a dark scene | Dark outline on a dark background | Rim or coloured outline, or lighten the sprite |
| Eyes or mouth look dirty | Features touch an outline, or have no spacing | Clear space around; no tangents |
| Flat mush | Near-identical shades, shading from the outline inward | Fewer colours, more contrast, light direction |
| Everything the same weight | Uniform detail and contrast | Sharpness map: hard contrast only at the focus |

## Review

- Passes the 1×, silhouette, greyscale and three-background tests, in the widest pose.
- No feature under 2 px except eye, highlight, spark; no 1 px limbs.
- Touching colour pairs are distinguishable; body vs background ≥ 2 steps.
- Parts are separated by a gap or clearly overlapped; no tangents.
- Detail matches the size budget and is concentrated at the focal point.
- Size changes were redrawn; any display scaling is an integer factor.

## Sources

- *Pixel Logic*, Ch. 4 "Readability" (smallest feature, spacing, tangents, sprites vs backgrounds) and Ch. 7 (clean-up, scaling).
- Derek Yu, "Pixel Art Tutorial" part 2 (chunky pixels, fewer colours, more contrast); Tsugumo's and Saint11's resizing tutorials (resize = translation).
- Solarski, *Drawing Basics and Video Game Art* (squint test, exaggeration, grouping); Mateu-Mestre, *Framed Ink* (fast reading, contrast); Gurney, *Color and Light* (edge sharpness, colour-blind check).
- Slynyrd, Pixelblog 5 and 47 (integer scaling, tiny sprites); FreeGameSprites, FrameSprite and sprite-ai guides (test battery, per-size budgets).
