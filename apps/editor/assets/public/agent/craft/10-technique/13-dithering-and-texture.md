# Dithering and texture

Dithering fakes a colour you do not have by mixing two you do; texture suggests a material. Both add pixels that
are not silhouette or light, so at small sizes they read as noise, and in animation they flicker. Without this file
an agent reaches for noise dither or a smooth gradient tool and produces grain, wobble, or plastic.

## Rules

1. **Default: don't.** First try one more palette colour or a flat step. Dither only when (a) the palette is
   locked, (b) the area is large and flat (sky, wall, floor) or rough (dirt, rock, chainmail), and (c) it is static.
   Small sprites and animated parts almost never need it.
2. **Cap it.** If dither covers about half of an object or becomes a field of its own, add a colour instead.
   It should taper at the ends and edges of an area, not fill it.
3. **Keep the two shades close.** Adjacent ramp steps with low value difference give a soft transition; high
   contrast gives a loud checkerboard. With a rich palette dither only between neighbouring ramp colours.
4. **Use ordered levels.** A 4×4 Bayer tile gives levels of 16 (table below). No two dither pixels touch
   orthogonally up to 50%; above 50% invert the roles so no two *holes* touch. `applyBatch` `dither`
   (`pattern` `checker` / `bayer2` / `bayer4` / `bayer8` / `noise`, `ratio` 0 = all `colorA`, 1 = all `colorB`) does
   this; `noise` is random, avoid it.
5. **Never a wide pixel.** Two touching dither pixels (2×1) read as a mistake. The usual cause is a **phase
   break**: two patches or a mirrored tile meeting, so the checker shifts by one. Keep one phase `(x+y) mod 2`
   across the whole area, or slide a block by 1 px and add or remove a pixel; for mirrored hills use two different tiles.
6. **Build the transition from the middle.** Put the 50% checker at the centre of the change, then 25/75
   outwards, then flat. Narrower bands = faster change. 3–5 levels are plenty.
7. **Bridge a hard edge** instead of blending a whole area: in the first row of the lighter band, every other pixel in
   the darker colour; for a second row, offset by one. This is the cheapest dither and the most useful at 32 px.
8. **Organic vs patterned.** Organic (quasi-random, density rising toward the seam from both sides) suits sky, shadow,
   anything natural. Patterned (checker, lines, crosshatch) suits metal, plastic, masonry and looks static on foliage.
   Random dither from a filter is lazy; hand-fix or turn it into a repeating tile.
9. **Stylised dither = gradient + texture at once.** A motif matched to the material (dashes for water, slashes for
   ground, zig-zag for grass) repeated as a tile, low contrast. A texture does not need a gradient, and a gradient does
   not need a pattern: a roof or wall can be textured with clean clusters and no dither.
10. **Orient texture to the form.** Straight marks on flat planes, curved marks around round forms, perspective
    on receding ones. Do not lay one global grid over a cylinder.
11. **Texture recipe.** Simplify (3 glyphs), repeat the same clusters, balance dense against empty, let negative space
    imply texture, no orphans (`craft/10-technique/11-clusters-and-noise.md`). Brick: group a few bricks, leave areas empty, hint
    mortar, shadow or light one brick; do not outline every brick.
12. **Never on faces or near a mouth, never on a sprite that moves.** Dither beside the face reads as stray pixels;
    on an animated part it flickers. Put dithered texture on a static background layer (`craft/00-core/06-layers-and-rigging.md`).
13. **Screens no longer blur dither into a blend**; the pattern is seen as a pattern. `applyBatch` `gradient` with
    `dither` (`bayer2`–`bayer8`) bands and dithers the seams; clean them by hand.

### Bayer 4×4 levels (derived)

| Level of 16 | 0 | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 16 |
|-------------|---|---|---|---|---|----|----|----|----|
| Share of dark | 0% | 12.5% | 25% | 37.5% | 50% | 62.5% | 75% | 87.5% | 100% |
| Look | flat | sparse diamonds | dots every 2nd px | dots + diagonals | checker | mirror of 37.5 | mirror of 25 | mirror of 12.5 | flat |

Other families: parallel lines (blur and limited animation only), broken lines, dents (a solid row then alternating
pixels: texture in little space, not a gradient), interwoven (two overlapping dithers).

## By size

| Size | Dither / texture budget |
|------|-------------------------|
| 8 | None. Texture is one accent pixel. |
| 16 | No dither on sprites. One texture tile of 2–4 clusters (brick, grass tuft). |
| 32 | Flat shading; bridge an edge at most (rule 7). Dither only on static backgrounds. |
| 64+ | Sky and wall gradients with 2–3 levels; stylised motif tiles; patterned dither on large metal/stone. |

## Templates

**`dither-ladder-bayer4`** — the nine levels of the table as 8×8 swatches, top row 0 → 50%, bottom row 50 → 100%.
```grid dither-ladder-bayer4
A = shade-light #e7c9a0
B = shade-dark #7d5a7a
---
AAAAAAAA.BAAABAAA.BABABABA.BABABABA.BABABABA
AAAAAAAA.AAAAAAAA.AAAAAAAA.ABAAABAA.ABABABAB
AAAAAAAA.AABAAABA.BABABABA.BABABABA.BABABABA
AAAAAAAA.AAAAAAAA.AAAAAAAA.AAABAAAB.ABABABAB
AAAAAAAA.BAAABAAA.BABABABA.BABABABA.BABABABA
AAAAAAAA.AAAAAAAA.AAAAAAAA.ABAAABAA.ABABABAB
AAAAAAAA.AABAAABA.BABABABA.BABABABA.BABABABA
AAAAAAAA.AAAAAAAA.AAAAAAAA.AAABAAAB.ABABABAB
............................................
BABABABA.BBBABBBA.BBBBBBBB.BBBBBBBB.BBBBBBBB
ABABABAB.ABABABAB.ABABABAB.BBABBBAB.BBBBBBBB
BABABABA.BABBBABB.BBBBBBBB.BBBBBBBB.BBBBBBBB
ABABABAB.ABABABAB.ABABABAB.ABBBABBB.BBBBBBBB
BABABABA.BBBABBBA.BBBBBBBB.BBBBBBBB.BBBBBBBB
ABABABAB.ABABABAB.ABABABAB.BBABBBAB.BBBBBBBB
BABABABA.BABBBABB.BBBBBBBB.BBBBBBBB.BBBBBBBB
ABABABAB.ABABABAB.ABABABAB.ABBBABBB.BBBBBBBB
```
**`dither-transition-5band`** — flat · 25% · 50% · 75% · flat, 4 px bands: the standard 5-step bridge.
```grid dither-transition-5band
A = shade-light #e7c9a0
B = shade-dark #7d5a7a
---
AAAABABABABABBBBBBBB
AAAAAAAAABABABABBBBB
AAAABABABABABBBBBBBB
AAAAAAAAABABABABBBBB
AAAABABABABABBBBBBBB
AAAAAAAAABABABABBBBB
AAAABABABABABBBBBBBB
AAAAAAAAABABABABBBBB
```
**`dither-edge-bridge`** — hard edge (left) versus a two-row crenellation bridge (right), two colours only.
```grid dither-edge-bridge
A = shade-light #e7c9a0
B = shade-dark #7d5a7a
---
AAAAAAAAAAAA..AAAAAAAAAAAA
AAAAAAAAAAAA..AAAAAAAAAAAA
AAAAAAAAAAAA..AAAAAAAAAAAA
AAAAAAAAAAAA..BABABABABABA
AAAAAAAAAAAA..ABABABABABAB
BBBBBBBBBBBB..BBBBBBBBBBBB
BBBBBBBBBBBB..BBBBBBBBBBBB
BBBBBBBBBBBB..BBBBBBBBBBBB
BBBBBBBBBBBB..BBBBBBBBBBBB
BBBBBBBBBBBB..BBBBBBBBBBBB
```
**`dither-organic`** — quasi-random: density rises toward the seam from each side, minority dots kept apart. Use for sky and shadow.
```grid dither-organic
A = shade-light #e7c9a0
B = shade-dark #7d5a7a
---
AAAAAAAAAABABBBBBABBBBBB
AAAAAAAABAAAABABBBBBBBBB
AAAAAAAAAAABABBBBBBBBBBB
AAAAAAAAAAAAABBBABBBBBBB
AAAAAAAAABAAABBBBBBBBBBB
AAAAAAABAAABABABABBBBBBB
AAAAAAAAABAAABBBBBBBBBBB
AAAAAAABAAAABABABBBBBBBB
AAAAAAAAAAAAABABBABBBBBB
AAAAAAAAABABABBBBBBBBBBB
AAAAAAAAAAAAABBABBBBBBBB
AAAAAAAAAABABABBBBBBBBBB
```
**`dither-phase-bad` → `dither-phase-fixed`** — two checker patches with different phase leave vertical pairs at the
seam (red); one phase across the area leaves none.
```grid dither-phase-bad
A = shade-light #e7c9a0
B = shade-dark #7d5a7a
X = flaw       #e8365a
---
BABABABABABA
ABABABABABAB
BABABABABABA
AXAXAXAXAXAX
AXAXAXAXAXAX
BABABABABABA
ABABABABABAB
BABABABABABA
```
```grid dither-phase-fixed
A = shade-light #e7c9a0
B = shade-dark #7d5a7a
---
BABABABABABA
ABABABABABAB
BABABABABABA
ABABABABABAB
BABABABABABA
ABABABABABAB
BABABABABABA
ABABABABABAB
```
**`dither-families`** — pattern vocabulary at about 50%/33%: horizontal lines · vertical lines · diagonal 1-in-3 ·
crosshatch diamonds · broken lines. Pick by material (metal, rope, cloth, mesh, brick).
```grid dither-families
A = shade-light #e7c9a0
B = shade-dark #7d5a7a
---
BBBBBBBBBB..BABABABABA..BAABAABAAB..BAAABAAABA..BBBABBBABB
AAAAAAAAAA..BABABABABA..AABAABAABA..ABABABABAB..AAAAAAAAAA
BBBBBBBBBB..BABABABABA..ABAABAABAA..AABAAABAAA..BABBBABBBA
AAAAAAAAAA..BABABABABA..BAABAABAAB..ABABABABAB..AAAAAAAAAA
BBBBBBBBBB..BABABABABA..AABAABAABA..BAAABAAABA..BBBABBBABB
AAAAAAAAAA..BABABABABA..ABAABAABAA..ABABABABAB..AAAAAAAAAA
BBBBBBBBBB..BABABABABA..BAABAABAAB..AABAAABAAA..BABBBABBBA
AAAAAAAAAA..BABABABABA..AABAABAABA..ABABABABAB..AAAAAAAAAA
BBBBBBBBBB..BABABABABA..ABAABAABAA..BAAABAAABA..BBBABBBABB
AAAAAAAAAA..BABABABABA..BAABAABAAB..ABABABABAB..AAAAAAAAAA
```
**`dither-sphere-cel` → `dither-sphere-buffer`** — the same Ø20 sphere with a flat terminator, and with a 3 px dither
buffer between mid and shadow. Only worth it at 32 px and up, and static.
```grid dither-sphere-cel
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.......OOOOOO.......
.....OOFFFFFFOO.....
...OOFFFFFFFFFFOO...
..OFFFLLFFFFFFFFFO..
..OFLLLLLLFFFFFFFO..
.OFFLLLLLLFFFFFFFFO.
.OFFLLLLLLFFFFFFFFO.
OFFFLLLLLLFFFFFFFFDO
OFFFLLLLLLFFFFFFFFDO
OFFFFLLLLFFFFFFFFFDO
OFFFFFFFFFFFFFFFFDDO
OFFFFFFFFFFFFFFFFDDO
OFFFFFFFFFFFFFFFDDDO
.OFFFFFFFFFFFFFFDDO.
.OFFFFFFFFFFFFFDDDO.
..OFFFFFFFFFFFDDDO..
..OFFFFFFFFFDDDDDO..
...OOFFFFFDDDDDOO...
.....OODDDDDDOO.....
.......OOOOOO.......
```
```grid dither-sphere-buffer
O = outline    #2b1d2e
L = fill-light #f2c28b
F = fill-mid   #d98d5f
D = fill-shadow #a65a4e
---
.......OOOOOO.......
.....OOFFFFFFOO.....
...OOFFFFFFFFFFOO...
..OFFFLLFFFFFFFFFO..
..OFLLLLLLFFFFFFFO..
.OFFLLLLLLFFFFFFFFO.
.OFFLLLLLLFFFFFFFFO.
OFFFLLLLLLFFFFFFFDFO
OFFFLLLLLLFFFFFFFFDO
OFFFFLLLLFFFFFFFFDFO
OFFFFFFFFFFFFFFFDFDO
OFFFFFFFFFFFFFFFFDDO
OFFFFFFFFFFFFFFFDDDO
.OFFFFFFFFFFFFFDFDO.
.OFFFFFFFFFFFFDFDDO.
..OFFFFFFFFFFDFDDO..
..OFFFFFFFDFDFDDDO..
...OOFFDFDFDDDDOO...
.....OOFDFDDDOO.....
.......OOOOOO.......
```
**`dither-stylised-motifs`** — gradient by motif: dashes lengthen (water, top) · diagonal hatch thickens (ground, bottom).
```grid dither-stylised-motifs
A = shade-light #9fd0e0
B = shade-dark #3f77a6
---
AAAAAABBBAAABBBBBABB
AAABAAAAABBBBAABBBBB
AAAAAABBBAAABBBBBABB
AAABAAAAABBBBAABBBBB
AAAAAABBBAAABBBBBABB
AAABAAAAABBBBAABBBBB
AAAAAABBBAAABBBBBABB
AAABAAAAABBBBAABBBBB
....................
AAAABAAABAAABBAABBBA
AAAAABAAABBAABBAABBB
AAAAAABAAABBAABBBABB
AAAAAAABAAABBAABBBAB
AAAABAAABAAABBAABBBA
AAAAABAAABBAABBAABBB
AAAAAABAAABBAABBBABB
AAAAAAABAAABBAABBBAB
```
**`texture-brick-implied`** — 16×16 tile: partial mortar, a few lit and shaded bricks, empty areas left to the viewer.
```grid texture-brick-implied
W = wall-mid   #b0705a
M = mortar     #6a4046
H = wall-light #cf927a
S = wall-shadow #8b5550
---
MMMMMMMWWMMMMMMM
WHHWWWWMWHHWWWWW
WWWWWWWMWWWWWWWW
WWWWSSWMWWWWWSSW
MWMMMMMMMMWWMMMM
WWWMHHWWWWWMHWWW
WWWMWWWWWWWMWWWW
SSSWWWWWWWSMWWWW
MMMMMMWWMMMMMMMW
HHWWWWWMWHHWWWWM
WWWWWWWMWWWWWWWM
WWWWWWWWWWWWWSSM
MMWMMMMMMMMWWMMM
WWWMWHHWWWWWWWWW
WWWMWWWWWWWWWWWW
WWWWWWSSWWWWWWWW
```

## Procedure

1. Ask: can one more palette colour or a bridge do this? If yes, stop.
2. Pick two adjacent ramp shades (`palette` op `analyze` shows ramp structure and near-duplicates).
3. Confine the area with `select` (`rect` / `ellipse` / `color`), then `applyBatch` `dither` with `pattern`
   `bayer4` or `checker`, and a `ratio` from the table — or draw a 3–5 band transition with `grid` from a template.
4. `readPixels` `format:"grid"` over the seams: find touching dither pixels or phase breaks (rule 5); slide a block or add/remove
   one pixel.
5. Taper the dither at the ends and borders; clean the outline of the dithered area as you would any contour.
6. `render` the sprite: it must read as a smooth step, not as grain. Compare with the flat version.
7. Textures: build one stamp, repeat it with changed spacing, leave empty areas, tile 3×3 and check for lattices.
8. `validate` (`strays`, `banding`). It does not check dither; rule 5 is by eye.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Grainy sprite | Dither on a small or animated part | Replace with a flat step or a bridge |
| Vertical or horizontal lines in a checker | Phase break, mirrored even-width tile | One phase; slide a block; two tiles |
| Loud, harsh pattern | The two shades differ too much | Use adjacent ramp steps |
| Looks like a screen door | Pattern dither on foliage or skin | Organic dither, or clusters instead |
| Gradient looks plastic | Smooth gradient tool or concentric bands | Fewer steps, bridged or dithered seams |
| Dither beside a face | Used for cheek or mouth shadow | Delete; use a flat shade |
| Texture looks like wallpaper | One density everywhere, aligned accents | Stagger; leave empty areas |
| Colours go muddy | Dither between unrelated hues | Same hue family, close values |

## Review

- Dither exists only on static, large areas; none on small or moving parts.
- The two shades are neighbours on a ramp; the pattern is one family per area.
- No two dither pixels touch orthogonally (≤ 50%); no phase breaks at seams.
- Transition has 3–5 levels and tapers; it does not cover half the object.
- Texture is repeated clusters with empty areas; no orphans; no lattice when tiled.
- In the `render` it reads as a smooth step or a material, not grain.

## Sources

- *Pixel Logic*, Ch. 5 "Dithering" (checkered family, wide-pixel rule, contrast, line/dent/intertwined/random/stylised families, buffer shade).
- Silber, *Pixel Art for Game Developers*, Ch. 9 (organic vs patterned dither, dither and animation).
- Dawe, *Make Your Own Pixel Art*, pp. 35–37 (bridging a band edge, offset rows).
- Classic pixel tutorials: Cure (cap, contrast, double duty), Arne (dither doubles as texture), Ferrari talk notes (ordered vs diffusion).
- Saint11 "Fundamentals" and 1-bit tutorial; Slynyrd, Pixelblog 2 "Texture" (five texture principles, brick); Solarski, *Drawing Basics and Video Game Art* (hatch direction).
