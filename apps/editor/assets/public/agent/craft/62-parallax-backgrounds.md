# Parallax backgrounds

Parallax layers fail in motion, not in the still: a seam that pops when the strip wraps, a layer that
hovers because its bottom is transparent, a sun that repeats every screen, scroll rates that make the
far hills outrun the near ones, or a layer shifted by half a pixel so the edges shimmer. This file is
the authoring contract for a layer: how many, how fast, how wide, how it loops, and how it is coloured
relative to its neighbours. Distance colour rules are `craft/60-skies-and-atmosphere.md`, silhouettes
`craft/61-landscapes-and-terrain.md`.

## Rules

**Layers and speed**

1. Three layers is the sweet spot, five the maximum, two a valid start (Shovel Knight ~3, Dead Cells ~4;
   Slynyrd's racing scene used 9 only because it is a showcase). Add a layer only if the new distance makes
   the scene clearer. Engines may cap layers: plan merges (distant mountains baked into the sky strip).
2. Order, back to front: sky (static) → far mountains and clouds → near hills or far city → tree line
   or near city → gameplay layer → optional foreground.
3. Speed is a **ratio of camera speed**, not px per frame: `render_x = (x − camera_x) × factor + offset_x`.
   Closer = faster. Three independent sources agree on the order of magnitude:

   | Layer | Factor |
   |-------|--------|
   | sky, sun, moon, stars | 0 (static) – 0.2 |
   | far (mountains, skyline) | 0.2 – 0.4 |
   | middle (hills, trees) | 0.4 – 0.6 |
   | near background (walls, fences) | 0.6 – 0.8 |
   | gameplay | 1.0 |
   | foreground | 1.1 – 1.5 |

   UI uses factor 0 plus an offset. A vertical factor of 0 keeps a horizontal-only game flat.
4. **Whole pixels only.** Round the offset after multiplying; a layer at factor `s` advances one pixel per
   `1/s` camera pixels. Uneven steps and sub-pixel offsets shimmer the edges. In a looping preview the layer
   speed (px per frame) must divide the layer width, otherwise the loop does not close:

   | Layer width | Rates that close the loop (px/frame) |
   |-------------|--------------------------------------|
   | 96 px | 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48 |
   | 192 px | 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64 |
   | 240 px | 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30 |

   With one shared layer width the loop is width ÷ the *slowest* rate frames long. Slower than 1 px/frame jitters;
   if you need 0.5, the image must repeat twice on screen (PB46 uses 0.5 for far clouds on a 192 px loop).
5. Example rates from shipped tutorials: PB63, 240 px layers: grass 4, tree row 1 → 3, tree row 2 → 2,
   mountains + clouds → 1, far clouds → 0.5, sky → 0. PB46, 192 px: racetrack 32, 24, trees 16, ground 6,
   4, 3, 2, clouds 1, far clouds 0.5. Each step is a divisor of the width.

**Authoring a layer**

6. One image per plane, all with the **same canvas size** so they align at (0,0); transparent above the
   silhouette, 1× scale, nearest-neighbour filtering. Never scale a background layer to fake distance:
   mixed pixel sizes read as an error (see `craft/90-platform-styles.md`).
7. Every non-sky layer fills **solid down to the bottom** of its canvas. A transparent bottom leaves the
   layer hovering when the camera moves vertically. For a tree line, darken toward the bottom
   (`parallax-treeline-loop-32`).
8. Seam: the left edge equals the right edge, pixel for pixel. Silhouette height, colours and anything
   crossing the edge must be continuous. Put distinct features in the centre and gradual, repeating
   shapes near the edges. An object that crosses the seam is drawn twice: the right part at the left edge
   and the left part at the right edge (`parallax-wrap-bush-24`).
9. The longer the asset, the less obvious the loop: varied features (mountains) get a wide layer (≈240
   px), consistent textures (trees) tolerate repetition. A sun or moon on a looping sky repeats every
   width, so it is a separate fixed sprite.
10. Test the seam with three copies side by side at game scale, then in motion. Check for pops, gaps,
    jitter, a busy play area and blurred edges (`validate` cannot see a seam).

**Colour and depth**

11. Depth cues in order of strength: colour first, detail second, speed third. Reduce saturation 20–40 %
    per receding layer, compress the value range, shift hue toward the sky colour, drop interior detail
    (`craft/60-skies-and-atmosphere.md` 14–19). Do not invert it: muted foreground over saturated
    background kills depth. The slowest layer must also be the palest and simplest; if speed and colour
    disagree the layer reads as a mistake.
12. Backgrounds are softer and lower-contrast than the gameplay layer. Action games (platformer, shmup)
    want muted, simple backgrounds; RPG and adventure scenes can be richer. A quick readability pass on the
    assembled scene: every layer except the nearest grass gets about −20 % saturation and −15 % contrast
    and +15 % brightness (PB63), which also deepens the atmosphere (`effect` `hue-saturation` / `shade`).
13. The foreground (factor >1) is narrow and dark, hugs the screen edges and never hides the play
    area. Foreground objects must clearly sit *above* the player (`parallax-foreground-grass-32`).
14. Reuse palette entries across layers; sky 2–3 colours, far layer ~3, foreground low colour count. A city
    uses the sky colours for the farthest buildings; one tile can suggest two buildings by window
    arrangement alone.
15. Plan landmarks: one memorable shape every 1–2 screens; vary the distribution (a big chunk, scattered
    islands, open space).

**Modes and canvases**

16. Three modes: *following* (all layers same direction, different speeds), *travelling* (layers opposite,
    the scene turns), *revolving* (loop). Top-down games can parallax grass over leaves. SNES-style
    scanline parallax scrolls horizontal bands at different speeds for a floor in perspective.
17. Canvas follows sprite size and must multiply into 1920×1080: 8 px sprites → 320×180 or 256×144; 16 px →
    320×180 or 384×216; 32 px → 480×270 or 640×360; 64 px → 640×360 or 960×540.

## By size

| Sprite size | Canvas | Layers | Per layer |
|-------------|--------|--------|-----------|
| 8 px | 256×144 / 320×180 | 2–3 | 2–3 colours, no texture |
| 16 px | 320×180 / 384×216 | 3 | far ~3 colours, mid 3–4, strip height 40–90 |
| 32 px | 480×270 / 640×360 | 3–4 | clusters follow the sprite's scale |
| 64 px | 640×360 / 960×540 | 4–5 | rim + body + shade per layer |

Distant layers may use slightly chunkier clusters than the gameplay layer, but never 1-px noise behind a 16 px
sprite.

## Templates

All loops are drawn on a torus: the last column continues into the first.

Far mountains, 40 px loop, ends at heights 5 and 6, shade wedge wraps across the seam.

```grid parallax-far-loop-40
f = range-far      #8fa6d8
g = range-shade    #7b92c8
h = haze           #b2c4e6
---
........................................
.................................fff....
......fff.......................ffggg...
....fffgggg....................fffgggg..
...ffffggggg.................ffffffgggg.
.gffffffgggggf.....fff......fffffffggggg
ggffffffgggggff..fffggg....fffffffffgggg
ggfffffffggggfffffffgggg..ffffffffffgggg
ggfffffffggggffffffffgggfffffffffffffggg
ggffffffffgggffffffffgggfffffffffffffggg
hghfhfhfhfhghfhfhfhfhfhghfhfhfhfhfhfhfhg
hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
```

Tree line, 32 px loop, ground fill to the bottom, no rim in the lower rows so the seam is invisible.

```grid parallax-treeline-loop-32
b = tree-lit       #6fb08a
a = tree-body      #3f8a74
c = ground-fill    #2a5f55
---
..................b.............
..................b.............
.................baa............
...b.............baaa...........
..baa...........baaaaa..........
..baaa...........baaa...bbbb....
.baaaaa..bbbb...baaaaa.baaaaa...
..baaa..baaaaa...baaa.baaaaaaa..
.baaaaabaaaaaaabaaaaaaaaaaaaaaba
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
cccccccccccccccccccccccccccccccc
cccccccccccccccccccccccccccccccc
```

Two-layer city: far skyline in sky colours, near buildings darker with window dots and a street fill.

```grid parallax-city-loop-32
k = bldg-far       #9fc3e2
m = win-far        #b9d6ee
n = bldg-near      #6d8fbd
p = roof-lit       #9db8dc
w = win-near       #cfe0f2
z = street         #3f5578
---
................................
................k...............
................k...............
................k...............
..............kkkkkk............
..............kkkkkk....kkkk....
.....kkkkk....kmkmkk....kkkk....
.....kkkkk....kkkkkkkkkkkmkk....
.....kmkmkkkkkkkkkkkkkkkkkkk....
kkkkkkkkkkkkkkkmkmkkkmkkkkkkkkkk
kkkkkkkkkkkmkkkkkkkkkkkkkmkkkkkk
kmkmkkmkmkkkkkkkpppppppkkkkkkmkk
kkpppppkkkkkkkkmnnnnnnnkkkkkkkkk
kknnnnnkkkkmkkkknwnwnwnkppppppkk
kmnwnwnkppppppkknnnnnnnknnnnnnkk
kknnnnnknnnnnnkknwnwnwnknwnwnnkk
kknwnwnknwnwnnkknnnnnnnknnnnnnkk
zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
```

A bush crossing the seam: right part at the left edge, left part at the right edge; a whole bush for context.

```grid parallax-wrap-bush-24
b = bush-lit       #7fcf66
a = bush-body      #4d9a4f
d = bush-shade     #2f6a46
---
........................
........bbbb........bbbb
a......bbbaaa......bbbaa
aad...bbbaaaaad...bbbaaa
add...baaaaaadd...baaaaa
add...aaaaaaadd...aaaaaa
dd.....ddddddd.....ddddd
........................
```

Foreground strip (factor 1.2): dark tufts with a lit tip, solid bottom, 32 px loop.

```grid parallax-foreground-grass-32
l = blade-lit      #3e7a3d
o = blade-dark     #12301f
---
................................
................................
................................
....................lo..........
......lo...........loo..........
.....loo..........looo..........
.lo..ooo....lo....ooooo....lo...
ooo..oooo..oooo..oooooo..oooo..o
oooooooooooooooooooooooooooooooo
oooooooooooooooooooooooooooooooo
```

## Procedure

1. Fix the canvas (rule 17), the layer count, the camera rates and the loop widths *before* drawing:
   pick rates from the divisor table, then width = `rate × frames`.
2. `createDocument` with the layer width × height. One layer per plane (`addLayer`, names
   `sky`, `far`, `mid`, `near`, `fg`). Palette: sky ramp, distance ramp, plane ramps via `palette` op `ramp`.
3. Draw far to near. Each plane: silhouette with `applyBatch` `grid` or `stroke`, a fill to the bottom, then shading,
   then texture sized by distance. Compute the silhouette so the first and last column match.
4. Seam check on a scratch copy (`manageDocument` `duplicate`): `resizeCanvas` to 3× width, `applyBatch` `blit` the
   strip to x = width and x = 2 × width, `render`. Close without saving over the original.
5. Motion check: one frame per camera step, `setCel` the layer's `x` to `−rate × frame` (layer pre-tiled twice),
   `render` `filmstrip` or `onionSkin`. Rates must be whole pixels.
6. Apply the readability pass (rule 12), then export per-layer PNGs (`exportDocument` `png` with the other layers hidden, via
   `setLayer` `visible`) at 1×.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Visible pop every loop | Edges differ by one row or a window is cut | Match edge columns; draw crossing objects twice |
| Layer hovers when the camera rises | Transparent bottom | Fill to the canvas bottom |
| Far hills move faster than near trees | Factors reversed | Closer = larger factor; check against rule 3 |
| Edges shimmer | Fractional offset or uneven rate | Round the offset; use a divisor of the width |
| Sun slides and repeats | Baked into the looping sky | Separate static sprite |
| Background fights the player | Equal contrast, detailed far layers | Readability pass; less saturation and fewer entries |
| Layers feel pasted on | Same hue and saturation on every plane | Blend toward the sky colour per layer |
| Foreground blocks gameplay | Large, opaque foreground | Narrow dark strip at the edge |
| Scene blurs when upscaled | Filtered scaling | Nearest-neighbour only, integer zoom |

## Review

- Layer count ≤5 and each layer earns its place.
- Same canvas size on every plane; every plane filled to the bottom; edges match on three copies.
- Rates are ratios in the right order, whole pixels, divisors of the width (or the image repeats).
- Colour order agrees with speed order: slower = paler, cooler, simpler.
- Sun, moon and landmarks are not baked into a looping layer.
- Background contrast stays below the gameplay layer; foreground is narrow and dark.

## Sources

- saint11 *Parallax* tutorial (scroll-factor formula, depth cue table); Sprite Kitchen parallax and Godot `Parallax2D` article; freepixel.art and sprite-ai.art background guides (rates, layer counts).
- Slynyrd Pixelblog PB23 *Parallax Scrolling* (pixel-perfect rates), PB46 (9-layer breakdown), PB63 (6 layers, readability pass), PB32 (layer counts for shmups), PB62 (colour reuse).
- Silber, *Pixel Art for Game Developers*, ch. 9 pp. 167–203 (layer order, fill to the bottom, city layers).
- Azzi, *Pixel Logic* pp. 109–110, 235–236 (modes of parallax); Ferrari's X-Men (Storm) scanline parallax.
