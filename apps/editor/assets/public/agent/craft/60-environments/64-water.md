# Water

Water drawn as a blue fill with white dashes looks like a rug. It needs three things at once: a depth gradient, a surface layer that moves less than one pixel at a time, and a reflection or shore that is cut into strips instead of mirrored whole. This file covers still water, flowing water, waterfalls, reflections and animated tiles. Particle foam and rain are `82-particles-and-weather`; tile connection logic is `66-tiles-and-autotiling`; ice and slime are `22-materials-hard` and `23-materials-soft`.

## Rules

**Colour and depth**

1. Water is a vertical gradient. Looking steeply into near water you see through it: dark, transparent, tinted by the bed (green-brown). Far water at a shallow angle mirrors the sky: the sky ramp, one or two steps darker. Default: dark near → sky-coloured far, as hard bands joined with a dithered checker row (`13-dithering-and-texture`).
2. Reflected light objects are slightly *darker* than the objects. Dark objects (trees, hulls) reflect weakly or vanish. Shadows on clear deep water vanish; on turbid water (brown-green cast) they are soft. At dusk, clear water reflects the cool sky evenly.
3. Depth ramp for underwater and streams: shallows show the warm bed (red-brown, ochre) → olive-green → teal → blue-green → indigo. Red goes first (about 3 m), oranges by about 7.6 m; below that only blue, cyan and violet, with low contrast. Horizontal distance acts like depth. Add warm light only if there is a source (lamp, flash).
4. Keep a low-contrast base and a small overlay. Measured saint11 tile (16×16): base `#627aea` with 17 % flecks one step darker (`#5b6ee1`); overlay mid `#639bff` 28 %, cyan glint `#5fcde4` 7 %, pale `#cbdbfc` under 2 %; the rest transparent. Overlay shapes are 1–2 px thick wavy dashes, 4–7 px long, pale pixels next to cyan ones. Sea and grass must not share one noise structure.

**Surface animation**

5. Two layers. Top: wave shapes (think circles changing size) where nothing moves more than 1 px, each ripple one chunk, never split into parts; ripples travel a small closed loop (up, left, down, right) with no rest frame. Bottom: the base tile scrolls right at constant speed (0.5 px/frame in saint11's 100 ms loop). Add small bright spots on wave tips and move them slightly.
6. Waves: build a chain of ovals as a loopable guide: circles give short deep waves, wide ovals shallow ones; crests are steeper than troughs, so use asymmetric ovals. A sine is fine for small narrow waves. Frame budget: 2–4 frames for a tile; 8 frames at ~8 fps for ocean waves or they look choppy.
7. Surface sparkle is a 6-frame loop of simple linear moves; bright patches mirror the clouds above. Animate tiles inside each autotile index. Rivers without a grid: small pulsing-line loops (4 frames) where flow shows.
8. Blend trick for wet contrast: duplicate the water layer, lower one *multiply*, the upper *overlay*, both ~50 %.

**Shores and edges**

9. Shore stack from land: sand (grey-green yellow, not cartoon yellow) → wet sand, darker → thin foam line → shallow (lightest, bed visible) → mid → deep. Give sand/water a 1-px darker separation line. Silber's top-down sea darkens near the beach, but Gurney's stream ramp puts light shallows over darker deeps. Use the light shallows with a dark line: it keeps both the separation and the physics.
10. Edge animation menu: *undulate* (edge pixels 1 px up, left, down, right), *expand/contract* (rest, −1, rest, +1; cheap, but the water area visibly grows), *side waves* (¼ of the edge contracts, ¼ expands, shifting a quarter per frame over 4 frames), *ocean waves* (expand with a transparent under-wave, slower contraction, 8 frames). Animating the inner outline only keeps the coast calm. Foam sweeps along one diagonal, it does not pulse everywhere. RPG Maker-style water autotile = 3 frames played 1-2-3-2-1, the land connection drawn on the side frames.

**Reflections**

11. Reflect only upright objects (people, trees, posts), never flat things (cobblestones). Mirror about the object's ground-contact line, shorten the copy about 25 %, darken one ramp step, desaturate ~10, keep only the silhouette's big shapes.
12. Break it: cut the reflection into horizontal 1-px strips and shift alternate strips ±1 px in a 2-row period. Vertical lines survive, horizontal lines break; light breeze turns reflections into webs of vertical strokes. Fade the lowest third by replacing every other pixel with water colour. Add a few glints on crests.
13. Animate by swapping the strip offsets on alternate frames (rows 0/1 ↔ 1/0), or with a slow ripple distort whose source sits off the bottom edge so waves travel one way (PB10: speed 0.5, width 10, height 3). Pad the layer with transparent space and render with hard pixels.

**Waterfalls, streams, underwater**

14. A waterfall is three parts: **mouth** (lip, brightest, with reflections), **flow** (vertical bands that sag and darken as they fall and break up toward the bottom) and **splash** (foam particles, looped in sync). Shake the column ±1 px. A narrow fall has a twisting V highlight; two overlays at different speeds widen the wave as it falls.
15. Loop the flow by shifting the streak pattern down with wrap. The shift per frame must divide the pattern period: period 8, shift 2 → 4 frames (the template); or 16 px with shifts 6, 5, 5. Apparent speed comes from the *length* of each streak segment, not the cycle speed: short at the lip (about 3 px), long below (5–10 px). Bridge each seam between segments with a margin band: its top half takes the last colour above, its bottom half the first colour below, otherwise a flash crosses the flow. For transparency, checker two phases of the same pattern.
16. Mountain streams: warm shallows, olive, teal, dark pools; rapids = near-white foam in the lightest 1–2 entries with a dithered edge, and dark troughs between.
17. Under the surface: a darker translucent purple-blue region; objects displaced by a sine; bubbles with random horizontal drift that fade or rise. Caustics = a network of 1-px lines in the lightest water tone on the bottom, shifting 1 px in alternating directions over 4–8 frames.
18. Iso water tile sits half a cube lower than land; its texture drops 1 px per frame while highlight pixels alternate, 16-frame loop (`71-isometric`).

## By size

| Canvas | Surface | Reflection / edge | Waterfall |
|--------|---------|-------------------|-----------|
| 8 px | 2 tones, 2-px dashes, 2 frames | 1 px darker copy, no strips | 2-px streaks, 2 frames |
| 16 px | base + 3-tone overlay, 4 frames (`water-tile-16-x4`) | foam line + 1 shallow band | 12–16 px wide, 3–4 frames |
| 32 px | + caustic lines, sparkle | strips ±1 px, fade lowest third | mouth + flow + splash, 4–6 frames |
| 64 px | ripple chains, 2 overlays at two speeds | webbed vertical strokes | two overlays, foam as particles |

## Templates

Water surface tile: static base with flecks, a ripple overlay that moves each chunk 1 px around a small loop; frames are side by side, cut at the transparent column.

```grid water-tile-16-x4
a = water-base     #627aea
b = water-fleck    #5b6ee1
m = ripple-mid     #639bff
c = glint-cyan     #5fcde4
p = glint-pale     #cbdbfc
---
aaaaabaaaaaaaaaa.aaaaabaaaaaaaaaa.aaaaabaaaaaaaaaa.aaaaabaaaaaaaaaa
aaaaapaaaammmcca.aaaaaapaaaaaabaa.aaaaaaaaaaaaabaa.aaaaaaaaammmccaa
ammmmccaaaammaaa.abmmmmccaammmcca.abaaaapaammmccaa.abaaapaaaammaaaa
aammabaaabaaaaaa.aaammbaaabammaaa.aammmmccabmmaaaa.ammmmccaabaaaaaa
aaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaa.aaammaaaaaaaaaaa.aammaaaaaaaaaaaa
aaaaaaabaaaaaaab.aaaaaaabaaaaaaab.aaaaaaabaaaaaaab.aaaaaaabaaaaaaab
aaabaaaaaaaaabaa.aaabaaaaaaaaabaa.aaabaaaapaaaabaa.aaabaaaaapaaabaa
aaaaaaaaapabaaaa.aaaaaaaapaabaaaa.aaaammmmccabaaaa.aaaaammmmccbaaaa
aaaaammmmccaaaaa.aaaammmmccammmcc.caaaammaaaaammmc.aaaaaammaaaaaaaa
baaaaammbaammmcc.baaaammabaaammaa.baaaaaaabaaaamma.caaaaaaabaaammmc
abaaaaaaaaaammaa.abaaaaaaaaaabaaa.abaaaaaaaaaabaaa.abaaaaaaaaaabmma
aaapbaaaaaaaaaaa.aaaapaaaaaaaaaaa.aaaabaaaaaaaaaaa.aaaabaaaaaaaaaaa
mmmccaaaabaaaaaa.ammmccaaabaaaaaa.aaaapaaaabaaaaaa.aaapaaaaabaaaaaa
ammaaabaammmmcca.aammaabaaaaaaaba.ammmccbaaaaaaaba.mmmccabammmmccba
aabaaaaaaammaaaa.aabaaaaaammmmcca.aammaaaammmmccaa.ammaaaaaammaaaaa
aaaaaaaaaabaaaaa.aaaaaaaaaammaaaa.aaaaaaaaammaaaaa.aaaaaaaaaabaaaaa
```

Top-down shoreline tile, two frames. Sand, wet sand, wavy foam line, shallow, mid and deep with dithered joins; frame 2 pushes the foam one row out.

```grid water-shore-16-x2
s = sand           #e3c98a
t = sand-grain     #c9a96a
w = wet-sand       #b9946a
f = foam           #f1fbff
a = shallow        #6ccbd0
b = water-mid      #3c9bc7
d = water-deep     #2b64a8
---
sssssssssssstsss.sssssssssssstsss
sstsssssssssssss.sstsssssssssssss
sssssssssstsssss.sssssssssstsssss
ssssssstssssssts.ssssssstssssssts
ssssstssssssssss.ssssstssssssssss
wwwwwwwwwwwwwwww.wwwwwwwwwwwwwwww
wwwwwwffwwwwwwff.wwwwwwwwwwwwwwww
ffwwffaaffwwffaa.wwwwffwwwwwwffww
aaffaaaaaaffaaaa.wwffaaffwwffaaff
aaaaaabaaaaaaaba.ffaaaaaaffaaaaaa
abaaabbbabaaabbb.aaaaabaaaaaaabaa
bbbabbbbbbbabbbb.aababbbaaababbba
bbbbbbbdbbbbbbbd.abbbbbbbabbbbbbb
dbbbdbdddbbbdbdd.bbbbdbbbbbbbdbbb
ddbdddddddbddddd.bbbdddbdbbbdddbd
dddddddddddddddd.dbdddddddbdddddd
```

Side-view water body: surface highlight line with crest steps, sparkle, light-to-abyss bands with dithered joins.

```grid water-side-surface-32
p = sparkle        #f4fcff
h = surface-line   #9fe3f2
a = water-light    #58bfe0
r = ripple-dash    #8ad6ee
b = water-mid      #3a95cc
c = water-deep     #2b6aaa
d = water-abyss    #23468a
---
hhh.p.hhhh....hhhhh...hhh...hhhh
aaahhhaaaahphhaaaaahphaaahhpaaaa
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
babaaarrbaaaaabababaaabrraaababa
bbbbabbbbbababbrrbbbabbbbbabbrbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
cbcbbbcbcbbbbbcbcbcbbbcbcbbbcbcb
ccccbcccccbcbcccccccbcccccbccccc
cccccccccccccccccccccccccccccccc
cccccccccccccccccccccccccccccccc
dcdcccdcdcccccdcdcdcccdcdcccdcdc
ddddcdddddcdcdddddddcdddddcddddd
dddddddddddddddddddddddddddddddd
```

Waterfall, 4 frames: bright lip, streak pattern of period 8 shifted down 2 px per frame, darker toward the bottom, foam splash.

```grid water-waterfall-12-x4
f = foam           #f4fcff
l = lip            #d9f4fb
w = streak-light   #a8e4f2
m = flow-mid       #4fa8d6
d = flow-dark      #2d6eae
e = fall-edge      #245a8f
---
elllllllllle.elllllllllle.elllllllllle.elllllllllle
ewwmmmmwwmme.emmwwmmwwmme.emmwwwwmmwwe.ewwmmwwmmwwe
ewwmmmmmmwwe.emmwwmmwwmme.emmwwmmmmmme.emmmmwwmmwwe
ewwmmwwmmwwe.ewwmmmmwwmme.emmwwmmwwmme.emmwwwwmmwwe
emmmmwwmmwwe.ewwmmmmmmwwe.emmwwmmwwmme.emmwwmmmmmme
emmwwwwmmwwe.ewwmmwwmmwwe.ewwmmmmwwmme.emmwwmmwwmme
emmwwmmmmmme.emmmmwwmmwwe.ewwmmmmmmwwe.emmwwmmwwmme
eddmmddmmdde.eddmmmmddmme.emmddmmddmme.emmddddmmdde
eddmmddmmdde.eddmmdddddde.eddddmmddmme.emmddddddmme
emmddddmmdde.eddmmddmmdde.eddmmmmddmme.emmddmmddmme
emmddddddmme.eddmmddmmdde.eddmmdddddde.eddddmmddmme
eddeeddeedde.eddeeeeddeee.eeeddeeddeee.eeeddddeedde
eeeeeddeedde.eddeeeeeedde.eeeddeeddeee.eeeddeeeeeee
edffddddffde.edffddffddde.effdddffddfe.eddffdffdfde
edddddffddde.eddfddfddfde.eddffdddffde.effdfddddffe
efdffffdfffe.effffdffffde.effdffffdffe.edffffdffffe
eddffdddffde.eddffdddffde.eddffdddffde.eddffdddffde
edddddddddde.edddddddddde.edddddddddde.edddddddddde
edddddddddde.edddddddddde.edddddddddde.edddddddddde
```

Reflection of a tree, two frames: shortened, darker, cut into 2-row strips offset ±1 px, lowest rows faded to water.

```grid water-reflection-20-x2
L = leaf-light     #63c74d
M = leaf-mid       #3e8948
D = leaf-dark      #265c42
T = trunk-lit      #b57a4a
V = trunk-shade    #5e3a2a
h = surface-line   #9fe3f2
a = water-light    #58bfe0
b = water-mid      #3a95cc
c = water-deep     #2b6aaa
r = ripple-dash    #8ad6ee
n = reflect-dark   #16372c
---
.......LLLMM................LLLMM........
.....LLLMMMMMD............LLLMMMMMD......
....LLLLMMMMMMD..........LLLLMMMMMMD.....
....LLLMMMMMMDD..........LLLMMMMMMDD.....
...LLLMMMMMMMDD.........LLLMMMMMMMDD.....
...LLMMMMMMMDDD.........LLMMMMMMMDDD.....
...MMMMMMMMDDDD.........MMMMMMMMDDDD.....
...MMMMMMDDDDDD.........MMMMMMDDDDDD.....
....MMMDDDDDDDD..........MMMDDDDDDDD.....
......DDDDDDD..............DDDDDDD.......
.........TV...................TV.........
.........TV...................TV.........
.........TV...................TV.........
.........TV...................TV.........
.........TV...................TV.........
........TTVV.................TTVV........
hhhhhhhhhhhhhhhhhhhh.hhhhhhhhhhhhhhhhhhhh
aaaaaaaaVVVVaaaaaaaa.aaaaaaaaaVVVVaaaaaaa
aaaaaaaaaVVaaaaaaaaa.aaaaaaaaaaVVaaaaaaaa
aaaaaaaaaaVVaaaaaaaa.aaaaaaaaaVVaaaaaaaaa
bbbbbbbbbbVVbbbbbbbb.bbbbbbbbbVVbbbbbbbbb
bbbbbbbbbVVbbbbrrbbb.bbbbbbbbbbVVbbbrrbbb
bbbbbbnnnnnnnbbbbbbb.bbbbbbbnnnnnnnbbbbbb
bbbbDDDDDDnnnnnnbbbb.bbbDDDDDDnnnnnnbbbbb
rrbbDDDDDDDDnnnnbbbb.rrbDDDDDDDDnnnnbbbbb
cccMMDDDDDDDnnnccccc.ccccMMDDDDDDDnnncccc
ccccMcMcDcDcDcnccrrc.ccccccMcDcDcDcnccrrc
cccccMcMcDcDcDcncccc.cccccMcMcDcDcDcccccc
ccccccMcMcDcDcnccccc.ccccccMcDcDcDccccccc
cccccccccccccccccccc.cccccccccccccccccccc
```

Depth ramp from the warm shallows to deep indigo with checker joins.

```grid water-depth-ramp-8
s = bed-shallow    #d9c27a
t = olive-green    #7da35a
u = teal           #3e9a8c
v = blue           #2f6fa0
x = indigo-deep    #243a78
---
ssssssss
ssssssss
stststst
tstststs
tttttttt
tutututu
utututut
uuuuuuuu
uvuvuvuv
vuvuvuvu
vvvvvvvv
vxvxvxvx
xvxvxvxv
xxxxxxxx
xxxxxxxx
```

## Procedure

1. `getContext`. Decide the water type (tile, side-view, fall, reflection), frame count and loop. Build a water ramp of 4–5 entries with `palette` op `ramp` or `set`, with hue travel from cyan-teal (light) to indigo (deep).
2. Base on its own layer: `applyBatch` `fillRect` fill, flecks with `pixels`, bands with `fillRect` and `dither` (pattern `checker`) on the joins.
3. Overlay on a second layer, `applyBatch` `grid` for ripples. Add frames with `addFrame` `duplicate`; move each ripple chunk by re-drawing (≤1 px) or with `translate` for a whole overlay. Tag the loop with `addTag`.
4. Waterfall: draw the period pattern once, then each frame is the pattern shifted down by the step with wrap: `applyBatch` `blit` two pieces (rows 0…H−s to y = s, rows H−s…H to y = 0). The splash is drawn per frame.
5. Reflection: `applyBatch` `blit` from the object (above its contact line) to below it, then `flip` `vertical` on it; `adjustHsl` and `effect` `hue-saturation` on that region; then one `blit` per 2-row strip with `x ± 1` in one `applyBatch` call, last third dithered with `dither` (pattern `checker`) against the water colour.
6. `render` `filmstrip` for the loop and `onionSkin` to check ≤1 px moves; `validate` checks `animation` timing and strays. Check tile seams on 3×3 copies.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Water is a rug of white dashes | No depth gradient, big overlay | Bands + dithered joins; overlay ≤ 30 % of pixels |
| Ripples jump or twinkle | Moved more than 1 px, or split into parts | One chunk per ripple, ≤1 px per frame |
| Reflection is a perfect mirror | No darkening, no strips | Darken, shorten, strip ±1 px, fade |
| Reflection of cobbles under a bridge | Flat objects reflected | Reflect only upright objects |
| Waterfall seems to blink | Seam bridge missing, shift ≠ divisor | Margin bands; period 8 shift 2 |
| Waterfall looks static | Equal streak length top to bottom | Short at the lip, long below |
| Shore looks like a hard seam | Sand and water share a value | Wet sand, foam line, lighter shallows, 1-px dark line |
| Whole coast pulses | Foam animated everywhere | Sweep foam along one diagonal; animate the inner outline |
| Ocean waves choppy | Too few frames | 8 frames at ~8 fps |
| Deep water as bright as shallow | Value-flat ramp | Dark near and deep, sky colour far |

## Review

- Depth gradient present; the near/deep end is darkest and the far end matches the sky.
- Ripple moves ≤1 px per frame, each ripple one connected chunk; loop closes (filmstrip).
- Reflection is upright objects only, darker, shorter, strip-offset, faded; no perfect mirror.
- Shore stack is readable: sand, wet sand, foam, shallow, mid, deep.
- Waterfall has lip, flow, splash; streak period divides the loop; speed grows down the fall.
- No water colour is brighter than the sky it mirrors; no black outlines around water.

## Sources

- saint11 *Water* tutorial (two layers, ripple chunks, bubbles, waterfall particles) and the measured 16×16 tile; Wolthera's water-edge sheets; RPG Maker VX waterfall tile test; Bilou's waterfall tutorial; Kortham on reflections.
- Slynyrd Pixelblog PB10 *Water in Motion* (oval-chain waves, waterfall mouth/flow/splash, reflection distort), PB23, PB43.
- Gurney, *Color and Light*, water pp. 200–205 (reflections, streams, colour under water), caustics pp. 160–161.
- Ferrari's waterfall recipe (segment length controls apparent speed; seam bridging; checker transparency).
- Silber, *Pixel Art for Game Developers*, top-down water pp. 162–164; Arne's beach notes.
