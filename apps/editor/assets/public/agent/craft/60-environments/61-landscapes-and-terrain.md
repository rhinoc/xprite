# Landscapes and terrain

A landscape drawn as texture first, with no plan for planes, collapses into one muddy mass: mountains, trees and ground fuse, the player's lane is as busy as the scenery, and every ridge is a symmetrical triangle. This file is the *placement and shape* of the big masses (sky line, ranges, hills, ground bands, cliffs, dunes). Colour-with-distance is `60-skies-and-atmosphere`, scrolling is `62-parallax-backgrounds`, trees and water have their own files.

## Rules

**Plan**

1. Silhouettes before texture. Fill sky, far range, mid ground and near ground with four flat colours first. If they merge when you squint, no detail will rescue them. Add detail back to front, and the darkest pixels last.
2. Three planes: **far** (sky-coloured, almost no detail), **mid** (clear silhouettes, moderate contrast), **near** (darkest, selective accents, narrow). Overlap is the first depth cue, lower on screen is closer, repeated shapes shrink with distance. Keep each plane ≥8 px from its neighbour's skyline so they do not merge (derived).
3. Horizon row: decide it first and never use 50 %. Ground-heavy scenes (sprites walk on the ground band, JRPG backdrops) put it at 35–45 % from the top: Slynyrd's measured finals are 44 % (valley) and 35 % (desert). Sky-as-subject scenes put it at 55–65 %. Robertson's "a third from the bottom" is 67 % from the top and fits only the second case. Pick by what the scene is for, then stay on that row for the whole picture.
4. Keep the player's strip calm. Mark the ground line and the band the sprite reads against; decoration goes outside it. The background palette has lower contrast than the character palette (readability beats texture).
5. Ground bands get narrower toward the horizon. Slynyrd's 144-row valley: 2, 7, 12 rows then a 60-row foreground; desert 8, 13, then 60. Texture scale shrinks with distance too: near plane = thick 1-px vertical streaks, next plane = 1–2 px clusters, farther planes = flat colour, no blades.
6. At 320×180 as a start: near strip 18–24 rows, mid hills 40–70, far 60–90 (planes overlap).
7. Frame the foreground dark and narrow so it holds the picture without covering gameplay: at most 12 % of the canvas height (18–24 rows at 180), darkest ramp entry, no detail wider than 3 px. Light it only if the scene should invite the viewer in.

**Mountains and hills**

8. A ridge is never a symmetrical triangle or a smooth sine. Use sweeping dips and sharp climbs, steps of 1–3 px, different peak heights and widths, "rhyming" shapes that are related but not copies. Keep one step length per slope; mixing 2-steps and 1-steps in one slope is a jaggy (`10-lines-and-curves`).
9. Build a range in this order: ridge silhouette in the mid value → a guide of ridge lines branching from each peak → lit planes on the side facing the light, shaded planes one step darker and cooler on the other → snowcaps → haze band at the foot. With light from the upper left, the left face of a peak is lit and the right face is shaded.
10. Snow sits on the top few rows and on faces that look upward, with a ragged lower edge. In low sun a face flattens into one colour; at noon creases and snow show.
11. Far range = flat body in the second-lightest sky colour, one shade step for its shaded faces, no pure darks. A nearer range reuses the same shapes two steps darker. Reuse palette entries across planes (the far shadow can be a sky band colour); that is how a whole scene fits 15–16 colours.
12. Hills: 3 tones (rim, body, shade). Light the crest rim on rising and flat columns only; curves follow monotone run lengths. A tiny tower or tree on a far peak (3–4 px) adds scale and story.
13. Time of day is a palette: the same hill silhouette under dawn, noon, dusk and night ramps.

**Cliffs and dunes**

14. Cliff = flat grass top, thin dark lip, then a vertical face in cool purple or blue-grey, 1–2 tiles tall on tilesets. Grass overhangs the lip so collision stays clean. Rock hue relates to the ground hue. Strata run horizontally; broken dashes, not full lines.
15. Dunes: a crescent along the wind, one fixed light direction, cool soft shadow on the lee side, warm light on the windward side, a rim on the crest, small ripples following the wind. One big dune off-centre with smaller ones around. Close up, sand is coarse: use a few small dither patches, nothing more.
16. The focal point gets the only value jump of 4 or more ramp steps and the only 1–2 px detail; every other plane stays within 2 steps and gets flat clusters of 3+ px.

## By size

| Canvas | Planes | Mountain range | Ground |
|--------|--------|----------------|--------|
| 8 px | 1 | 6×3 single-tone peak, no snow | 1 flat colour |
| 16 px | 2 | 16×6, 1–2 peaks, lit + shade tones | rim row + body |
| 32 px | 2–3 | 6–10 px high peaks, 3 tones, 1–2 px snow | rim + body + 1 frame row |
| 64 px | 3 + haze | 12–20 px peaks, snow 3–4 px, gullies | 3 bands narrowing to the horizon |
| 192–320 px | 3–5 | 40–90 rows, haze band, tower on a peak | band heights above |

Numbers for 8 and 16 px are derived from the same proportions, not measured.

## Templates

Mountain range with snowcaps, lit left faces, shaded right faces, one gully per peak and a dithered haze foot. Draw it on its own layer.

```grid land-mountain-band-64
n = snow-lit       #f2f7ff
s = snow-shade     #b4c4e6
L = rock-lit       #7d8fc4
M = rock-ridge     #6a7bb3
D = rock-shade     #4a5590
h = haze           #9fb0d8
---
................................................................
................................................................
.....................................nn.........................
....................................nnns........................
...................................nnnns........................
..............n....................nnLnss.......................
.............nnss.................nnLLLnnn.............ns.......
............nnnsDD...............nLMLLLLLn...........nnnss......
...........nnLLsDD...............nMLLLLLLnD.........nLnnsss.....
...........nMLLLDDD..L..........nLMLLLLLLLD........nnLnLLDsD....
..........LMLLLDDDDDLDDD.......LLMLLLLLLLLDD.....LLLMLLLLDDDD...
.....LL..nLMLLLLMLDDLDDDD......LLMLLLLLLLLDDDD..LLLLMLLLLDDDDD..
...LLLLDLLMLLLLMLDDDLLLDDD....LLMLLLLLLLLLDDDDDDDLLMLLLLLLDDDDD.
..LLLLLDLLMLLLLMLLDDLLLDDDD...LLMLLLLLLLLLLLLDDLLLLMLLLLLDDDDDDD
.LLLLLLDLLLLLLMLLLLDLLLDDDDD.LLLLLLLLLLLLLLLDDDLLLMLLLLLLLLLDDDD
LLLLLLLLLLLLLLLLLLDDLLLLLDDDDLLLLLLLLLLLLLLLLDDLLLLLLLLLLLLDDDDD
LLLLLLLLLLLLLLLLLLLLLLLDDDDDDLLLLLLLLLLLLLLLLLDLLLLLLLLLLLLLDDDD
LLLLLLLLLLLLLLLLLLLLLLLLLLDDDLLLLLLLLLLLLLLLLDDLLLLLLLLLLLLLLLDD
LLLLLLLLLLLLLLLLLLLLLLLLLDDDDLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLDDDD
LhLhLhLhLhLhLhLhLhLhLhLhLhDhDhLhLhLhLhLhLhLhLhLhLhLhLhLhLhLhLhLh
hLhLhLhLhLhLhLhLhLhLhLhLhLhhhLhLhLhLhLhLhLhLhLhLhLhLhLhLhLhLhLhh
hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
```

Far range: two tones plus haze. Use for the plane nearest the sky; recolour toward the sky colour.

```grid land-mountain-far-48
f = range-far      #8fa6d8
g = range-far-shade #7b92c8
h = haze           #b2c4e6
---
....................................ff..........
........ff.........................fggg.........
.......ffggg......................ffgggg........
.....ffffgggg........fff.........ffffggggg......
....ffffffggggg.....ffggg.......fffffgggggg..ff.
...fffffffgggggg..ffffggggg....fffffffgggggggfff
fffffffffffggggggffffffggggg..ffffffffgggggggfff
fffffffffffggggggffffffggggggffffffffffggggggfff
ffffffffffffgggggfffffffgggggffffffffffggggggfff
ffffffffffffgggggfffffffgggggfffffffffffgggggfff
hfhfhfhfhfhfhghghfhfhfhfhghghfhfhfhfhfhfhghghfhf
hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
```

Rolling hills: rim, body, bottom shade. Raise or lower the profile per layer.

```grid land-hills-48
a = grass-rim      #a8d86a
b = grass-body     #6cb04a
c = grass-shade    #3f8a4e
---
................................................
................................................
................................................
.............................aaaa...............
.......aaaa................aabbbbba.............
.....aabbbbba............aabbbbbbbbbaa......aaa.
...aabbbbbbbbb..........abbbbbbbbbbbbbba..aabbbb
.aabbbbbbbbbbbba......aabbbbbbbbbbbbbbbbbabbbbbb
abbbbbbbbbbbbbbbb...aabbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbaabbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
cbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcb
cccccccccccccccccccccccccccccccccccccccccccccccc
```

Whole scene: sky bands, far range, far ground, hills, near ground with streaks, dark frame. Horizon at row 13 of 30 (43 %).

```grid land-scene-3plane-48
a = sky-top        #4f8fdc
b = sky-mid        #7fbdee
c = sky-horizon    #bfe4f0
f = range-far      #8fb2d8
g = range-shade    #7b9ccb
h = haze           #b3d2e0
e = far-ground     #9cc7a8
n = hill-rim       #8ccf6a
m = hill-mid       #4f9a56
p = ground-near    #2f6a46
q = ground-tuft    #1f4a3a
r = ground-frame   #173629
---
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
abababababababababababababababababababababababab
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbffbbbbbbbbbb
bbbbbbbbffbbbbbbbbbbbbbbbbbbbbbbbbbfgggbbbbbbbbb
bcbcbcbffgggbcbcbcbcbcbcbcbcbcbcbcffggggbcbcbcbc
cccccffffggggccccccccfffcccccccccffffgggggcccccc
ccccffffffgggggcccccffgggcccccccfffffggggggccffc
cccfffffffggggggccffffgggggccccfffffffgggggggfff
fffffffffffggggggffffffgggggccffffffffgggggggfff
hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeennnneeeeeeeeeeeeeee
eeeeeeennnneeeeeeeeeeeeeeeennmmmmmneeeeeeeeeeeee
eeeeennmmmmmneeeeeeeeeeeennmmmmmmmmmnneeeeeennne
eeennmmmmmmmmmeeeeeeeeeenmmmmmmmmmmmmmmneennmmmm
ennmmmmmmmmmmmmneeeeeennmmmmmmmmmmmmmmmmmnmmmmmm
nmmmmmmmmmmmmmmmmeeennmmmmmmmmmmmmmmmmmmmmmmmmmm
mmmmmmmmmmmmmmmmmmnnmmmmmmmmmmmmmmmmmmmmmmmmmmmm
ppppppmmmpppqppppppppmmmmmmmmmmppppppppppqpppppp
pqppppppppppqppppppqpppppppqppppppqppppppqpppppp
pqppppppqppppppppppqpppqppppppppppqpppqppppppppp
ppppqpppqpppppppqppppppqpppppppqppppppqppppppqpp
ppppqpppppppppppqppppppppppppppqpppppppppppppqpp
rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
```

Three dunes, crest rim, cool lee faces, ripples.

```grid land-dunes-48
a = crest-rim      #f7e2a4
b = sand-lit       #e8c07a
c = sand-ripple    #d6a561
d = sand-lee       #b9776a
---
................................................
................................................
................................................
.............aaa................................
...........aabbb................................
.........aabbbbbd...............................
.......aabbbbbbbdd................aaa...........
......abbbbbbbbbddd.............aabbbd..........
..aaaabbbbbbbbbbdddd..........aabbbbbdd.........
aabbbbbbccbbbbbbddddd........abbccbbbddd........
bbbbbbbbbbbbbbbbddddddd....aabbbbbbbbdddd.......
bbbbbbbbbccbbbbbbbdddddd..abbccbbbbbbbddddd.....
bbbbbccbbbbbbbbbbbbbbdbdbbbbbbbbbbbbbbbbdccbbbbb
```

Cliff face with grass overhang, strata and a darker foot. Tile horizontally (edges are free of detail).

```grid land-cliff-20
l = grass-lit      #8fd05a
g = grass          #5aa84a
k = grass-shade    #2f6f4a
d = lip            #2c2540
R = rock-lit       #9a8dc4
r = rock           #6c6199
s = strata         #b0a5d2
q = rock-shade     #4a4275
z = rock-deep      #332d55
---
...l...ll....l..ll..
llgllggllllgglgllgll
gggggggggggggggggggg
kkkgkkkkgkkkggkkkgkk
ddgddddkdddgdddkdddd
qqqzzqqqqqzqqqqzzqqq
rrrrrrqqrrrrrqrrrrrr
rRRrrrrssrrrrqqrrqqr
rRRrrrrrrqqrrrqrrrrr
rsssrrrrqrrssrrrqqrr
rRRrrrrrqqrrrrrqrrrr
rrrrrrqrrrrqqqrrrrrr
rrrrrrssrrrrqqrrsssr
rrrqqrrrrrrqrrrqqrrr
rqqqqrrrrqqrrrrrqqqr
qqqqqqqqzzqqqqqqzqqq
zzzzzqqqqzzzqqqzzzzz
zzzzzzzzzzzzzzzzzzzz
```

## Procedure

1. `getContext`; write down canvas, horizon row, light side, palette. Set the horizon with a guide line on its own layer.
2. Palette: sky ramp (4–5), a distance ramp for ranges, and per-plane greens or rock ramps. `palette` op `ramp` for each; reuse entries between planes.
3. Block in four flat masses with `applyBatch` `fillRect`/`stroke` (closed, `fill`): sky, far range, mid hills, near ground. `render`, then `effect` `hue-saturation` on a copy: the planes must separate by value alone.
4. Far to near, each on its own layer (`addLayer`): range silhouettes → shading planes → snow → haze → hills → ground. Stamp templates with `applyBatch` `grid`; adjust the profile by editing rows from `readPixels` `format:"grid"` (`rulers=false`).
5. Ground texture last, sized by distance (rule 5). Add the dark frame and a few accents near the focal point.
6. `render` at 1×. Check the player strip is calm, planes are ≥8 px apart, ridge steps are even, and the horizon is not at 50 %. `validate` for strays and banding.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Mountains read as cones or a sawtooth | Evenly spaced, equal height peaks | Vary height and width, odd counts, rhyming not copying |
| Planes fuse | Same value, no overlap | Separate by value and hue; ≥8 px between skylines |
| Far range is as dark and crisp as near | Detail and contrast not reduced | Distance ramp; remove pure darks and interior detail |
| Shading is vertical stripes | Shade edge on a single column | Slant the shade boundary down-right, jag it by ±1 px |
| Floating background strip when scrolling | Bottom of layer is transparent | Fill each plane down to the canvas bottom (`62-parallax-backgrounds`) |
| Horizon cuts through the sprite's neck | Horizon at 50 % or at eye height by accident | Move it to a third; give sprites feet on the ground band |
| Blades drawn on every plane | Same texture scale everywhere | Blades only on the near plane; flat colour behind |
| Cliff face looks like a flat wall | No lip, no strata, no foot | Dark lip, broken strata, darker foot |

## Review

- Squint (or `effect` `hue-saturation`): four masses are distinct and in value order sky → far → mid → near.
- Horizon is not 50 %, and the same row is used by every plane.
- Ridge steps are consistent per slope; peaks differ; snow and shade follow one light side.
- Far planes use sky-adjacent colours and few entries; near plane holds the darkest pixels and the biggest clusters.
- Sprite lane has lower contrast than the character; no texture noise there.
- Every plane reaches the bottom of the canvas.

## Sources

- Slynyrd Pixelblog PB62 *Landscape Backgrounds* (band heights, horizon, reuse of colours), PB11 *Landscape Pixeling*, PB13 *Rocks* (mountain steps).
- Silber, *Pixel Art for Game Developers*, ch. 9 mountains pp. 172–176, silhouette pp. 188–189.
- Solarski, *Drawing Basics and Video Game Art*, Landscape Drawing (planes, back-to-front work).
- Gurney, *Color and Light*, foreground lighting pp. 196–197, time-of-day series pp. 208–209.
- Robertson, *How to Draw*, horizon and composition pp. 119–121; Sprite Kitchen depth article; runevision on aerial perspective.
- saint11 tutorials: Sand, Ruins, Ice; TinyBird grassland cliff.
