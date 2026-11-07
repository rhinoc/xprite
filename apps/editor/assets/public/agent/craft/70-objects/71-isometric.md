# Isometric (2:1)

Isometric fails at the first line: a true 30° edge makes an uneven 2,3,2,3 stair and
the whole scene looks hand-wobbled. Everything below follows from one fact, pixel
isometric is a 2:1 dimetric grid, and from one habit, never eyeball a cube, a circle
or a roof. For the choice between projections see `craft/70-objects/70-perspective.md`.

## Rules

1. **The edge is 2:1.** Two pixels across per one pixel up or down (26.57°). Allowed
   edge directions: vertical, 2:1 (both ways), 1:1, 1:2 steep (windscreens, tapers),
   horizontal only for the rare flat rim. Every receding edge in the scene is the same
   2:1 line, runs of exactly 2,2,2. A 4,4,4 run is worse than 2,2,2; 2,3,2 is a bug.
2. **Draw lines with `applyBatch` `line`** from a point to a point with dx = 2·dy, then
   `readPixels` `format:"grid"` and confirm every row has the same run. Keep a ruler: one spare
   layer with one long 2:1 line you can slide against edges.
3. **A tile is a diamond twice as wide as tall, even sizes only:** 16×8, 24×12,
   32×16 (the default), 48×24, 64×32 (modern). Every tile in a set has one size.
   With a 4 px apex the row width is `min(4·(row+1), 4·(H−row))`; apex runs of 2, 3 or
   4 px are all seen, pick one and never mix.
4. **A cube is the diamond plus a side of half its width:** footprint W×W/2, side
   height W/2, silhouette W×W. Row width = `min(W, 4·(row+1), 4·(W−row))`. A slab of
   thickness h replaces the second W/2 by h: `min(W, 4·(row+1), 4·(h+W/2−row))`. Visible:
   3 faces, 9 edges; the far corner is never drawn.
5. **Three values, one light, whole scene.** Light from the upper left: top lightest,
   left face middle, right face darkest. Never flip it per object. Numbers (HSB
   brightness): top = base, convex edge +10%, left −15%, right −25% (two stacked 15%
   shifts make 27.75%, not 30%). Warm the top, cool the dark face.
6. **Edges:** an outer convex edge gets a lighter 1 px line just inside the silhouette;
   inner concave edges stay darker but readable. Outline last, selective
   (`craft/00-core/04-outlines-and-edges.md`); "black" objects still need left/right values.
7. **Verticals stay vertical, 1 px per px.** No vanishing point, no foreshortening:
   an object can be moved anywhere on the grid without redrawing.
8. **Grid arithmetic** (tile W×W/2): one step along +x moves the screen by (+W/2, +W/4),
   along +y by (−W/2, +W/4), one cube up by (0, −W/2). Nearer tiles overlap the ones behind,
   so draw back to front: ascending x+y, then ascending height.
9. **Floor circles are 2:1 ellipses** (16×8, 24×12, 32×16 …): table and templates in
   `craft/72-3d-forms.md`. `applyBatch` `fillEllipse` with that box draws the table exactly.
10. **Circles on a wall are skewed circles.** Draw the flat circle, shear it by 1 px
    per 2 px across (left wall: slope down to the right, right wall: mirror) and repair
    the first and last rows by hand. Bounding box ≈ d wide by 1.12·d tall. Even tricky shapes
    (round windows, evenly spaced arches) are planned in front view first.
11. **Cylinder = two ellipses joined on the vertical.** Top flat-lit; body shaded in
    columns, never rings; the bottom edge is the lower half of the same ellipse shifted
    down by the height; a taper uses a smaller top ellipse.
12. **Build from cuboids,** then carve (arches, stairs, cut-outs), texture last. Cone and
    pyramid: base diamond, apex above its centre; find the apex by copying the diamond up
    and crossing the diagonals. A sphere is a circle anywhere.
13. **Stairs and ramps:** one slope per object: 1 px up per 2 px along the floor axis
    (26.6°), or 1 px per 1 px for steep ones.
14. **Tall tiles** (walls, towers) share the footprint and extend upward. A water tile
    is about half cube height so it sits lower. Each of the three faces of a terrain
    tile must loop on its four sides. Do not mix flat-colour, textured and hi-detail
    tile sets in one scene.
15. **Ground every object** with a flat shadow: a 2:1 ellipse or diamond in one dark
    colour toward the lower right (light upper left). Floating objects look pasted
    without it.
16. **Characters:** the footprint is the diamond; the body is free-hand, a 2:1 stair
    across a round body looks robotic. Thin body, slightly large head, one shoulder
    visible, one foot lower on screen, eyes 1 px each with 1 px between, interior lines
    lighter than the outline. A person is 24–32 px on a 32×16 grid. Mechs at 32 px:
    torso like a tank front, shoulders higher than the head, leg+foot one unit (skis,
    talons, not shoes).
17. **Do not convert flat art with transforms.** `rotate90` and `resizeSprite` `nearest` are clean —
    every other transform resamples. Map by arithmetic instead: world tile (x, y) and
    height z in px → screen ((x−y)·W/2, (x+y)·W/4 − z), then draw.
18. **45° dimetric (1:1 steps)** is the alternative when tall structures must not
    block play; one choice per game, never mixed with 2:1. Iso is poor for twitch
    games (distances are hard to judge): say so when asked for an iso platformer.

## By size

| Size | What survives |
|------|---------------|
| 8 | Not worth it: an 8×4 diamond is a smudge. Use plan or 3/4 view. |
| 16 | Tile 16×8 (diamond rows 4,8,12,16,16,12,8,4), cube 16×16 (template). Props ≤ 16 px, 3 values, no inner outline. |
| 32 | Tile 32×16, cube 32×32, character 24–32 px, 1 px edge highlights, ellipse shadows. |
| 64 | Tile 64×32 or 128×64 for detail, texture per face, cars 63×45, windows and trim lines. |

## Templates

**iso-lines-2to1** — the four legal edge families (2:1 down, 2:1 up, 1:1, 1:2). Compare
any hand line against these runs.

```grid iso-lines-2to1
L = line           #4d3b6b
---
LL.....................LL.L......L..
..LL.................LL....L.....L..
....LL.............LL.......L.....L.
......LL.........LL..........L....L.
........LL.....LL.............L....L
..........LL.LL................L...L
```

**iso-tile-32** — flat ground tile 32×16, 4 px apex, 2 px edge line; the row widths are
`min(4·(row+1), 4·(16−row))`.

```grid iso-tile-32
O = tile-edge      #4d6b3f
T = tile-fill      #79a35a
---
..............OOOO..............
............OOTTTTOO............
..........OOTTTTTTTTOO..........
........OOTTTTTTTTTTTTOO........
......OOTTTTTTTTTTTTTTTTOO......
....OOTTTTTTTTTTTTTTTTTTTTOO....
..OOTTTTTTTTTTTTTTTTTTTTTTTTOO..
OOTTTTTTTTTTTTTTTTTTTTTTTTTTTTOO
OOTTTTTTTTTTTTTTTTTTTTTTTTTTTTOO
..OOTTTTTTTTTTTTTTTTTTTTTTTTOO..
....OOTTTTTTTTTTTTTTTTTTTTOO....
......OOTTTTTTTTTTTTTTTTOO......
........OOTTTTTTTTTTTTOO........
..........OOTTTTTTTTOO..........
............OOTTTTOO............
..............OOOO..............
```

**iso-cube-16** — plain three-value cube, no outline. The base for blocks, crates,
house volumes.

```grid iso-cube-16
T = top            #e6d6ac
L = left-face      #b79a7d
R = right-face     #7e6574
---
......TTTT......
....TTTTTTTT....
..TTTTTTTTTTTT..
TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTT
LLTTTTTTTTTTTTRR
LLLLTTTTTTTTRRRR
LLLLLLTTTTRRRRRR
LLLLLLLLRRRRRRRR
LLLLLLLLRRRRRRRR
LLLLLLLLRRRRRRRR
LLLLLLLLRRRRRRRR
LLLLLLLLRRRRRRRR
..LLLLLLRRRRRR..
....LLLLRRRR....
......LLRR......
```

**iso-cube-16-outlined** — outer outline plus lighter top-edge pixels (E). Stamp it, then
retint roles.

```grid iso-cube-16-outlined
O = outline        #2d2233
E = top-edge       #f7efd2
T = top            #e6d6ac
L = left-face      #b79a7d
R = right-face     #7e6574
---
......OOOO......
....OOTTTTOO....
..OOTTTTTTTTOO..
OOTTTTTTTTTTTTOO
OETTTTTTTTTTTTEO
OLEETTTTTTTTEERO
OLLLEETTTTEERRRO
OLLLLLEEEERRRRRO
OLLLLLLLRRRRRRRO
OLLLLLLLRRRRRRRO
OLLLLLLLRRRRRRRO
OLLLLLLLRRRRRRRO
OOLLLLLLRRRRRROO
..OOLLLLRRRROO..
....OOLLRROO....
......OOOO......
```

**iso-cubes-pair-16** — two neighbouring blocks (+x step = (8,4)); shows draw order and how
the outline separates overlaps.

```grid iso-cubes-pair-16
O = outline        #2d2233
E = top-edge       #f7efd2
T = top            #e6d6ac
L = left-face      #b79a7d
R = right-face     #7e6574
---
......OOOO..............
....OOTTTTOO............
..OOTTTTTTTTOO..........
OOTTTTTTTTTTTTOO........
OETTTTTTTTTTTTOOOO......
OLEETTTTTTTTOOTTTTOO....
OLLLEETTTTOOTTTTTTTTOO..
OLLLLLEEOOTTTTTTTTTTTTOO
OLLLLLLLOETTTTTTTTTTTTEO
OLLLLLLLOLEETTTTTTTTEERO
OLLLLLLLOLLLEETTTTEERRRO
OLLLLLLLOLLLLLEEEERRRRRO
OOLLLLLLOLLLLLLLRRRRRRRO
..OOLLLLOLLLLLLLRRRRRRRO
....OOLLOLLLLLLLRRRRRRRO
......OOOLLLLLLLRRRRRRRO
........OOLLLLLLRRRRRROO
..........OOLLLLRRRROO..
............OOLLRROO....
..............OOOO......
```

**iso-cylinder-16** — barrel, drum, pillar: flat top, column bands (highlight stripe two
columns in from the lit edge), 16×8 top ellipse, lower half-ellipse base one body height
(9 rows) below it; a 1 px highlight rim marks the front edge of the top.

```grid iso-cylinder-16
0 = core-shade     #685a6e
1 = shade          #8c7480
2 = mid            #b29679
3 = light          #d4bb93
T = top-flat       #e6d6ac
H = highlight      #f3e7c4
---
....TTTTTTTT....
..TTTTTTTTTTTT..
.TTTTTTTTTTTTTT.
TTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTT
3TTTTTTTTTTTTTT0
33HHTTTTTTTTHH00
33HHHHHHHHHH1100
33HH333322221100
33HH333322221100
33HH333322221100
33HH333322221100
33HH333322221100
33HH333322221100
.3HH33332222110.
..HH3333222211..
....33332222....
```

**iso-wall-circle-12** — a circle on the left wall face (flip horizontally for the right
face): porthole, window, shield boss.

```grid iso-wall-circle-12
C = shape          #8c7bb0
---
.CCCCC......
CCCCCCCC....
CCCCCCCCC...
CCCCCCCCCC..
CCCCCCCCCC..
CCCCCCCCCCC.
.CCCCCCCCCC.
.CCCCCCCCCCC
..CCCCCCCCCC
..CCCCCCCCCC
...CCCCCCCCC
....CCCCCCCC
......CCCCC.
```

## Procedure

1. Choose tile size and light direction; create a `ruler` layer with one long 2:1 line.
2. Stamp a cube/tile template with `applyBatch` `grid` (`transparent: "skip"` to overlay
   existing art), or compute the silhouette from rule 4 for other sizes.
3. Block the mass from cuboids on one layer per part (`addLayer`); carve last.
4. Colour faces top/left/right from one ramp (`palette` op `ramp`, `craft/00-core/02-shading-and-light.md`).
5. Add a 1 px light edge on convex corners, a flat shadow ellipse on the ground.
6. `readPixels` `format:"grid"` on edges to verify 2,2,2 runs; `render` at 1×; outline last
   (`outline` `position: "inside"` keeps the size); `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Jagged, uneven edges | Free-hand or 30° lines | Redraw with `applyBatch` `line` at dx = 2·dy |
| Object looks pasted on | No ground shadow | Add a flat 2:1 shadow |
| Faces read as one blob | Same value on left and right | Left −15%, right −25% |
| Light flips between blocks | Per-object lighting | One light for the scene |
| Round things look oval and flat | Circle eyeballed | Use the ellipse/skew templates |
| Tiles show gaps or double pixels | Mixed apex widths | One apex width per set |
| Stair of cubes looks wrong | Wrong draw order | Ascending x+y, then height |

## Review

- Every receding edge is 2:1 with regular runs; verticals are vertical.
- Three face values, light from one fixed side across all objects.
- Tile and object sizes even and consistent; apex style never mixed.
- Floor circles are 2:1 ellipses; wall circles are skewed, not stretched.
- Shadows on the ground in one direction; draw order back to front.
- Colour and texture level match across tiles in the scene.

## Sources

- Slynyrd, Pixelblog 4, 41, 54, 61 (isometric, cubes, tiles, vehicles, mecha).
- Pixel Logic (Ch. 6: 2:1 line, circles on planes, sprite-to-iso skew).
- Drububu and Pixelbath isometric guides; Tuts+ isometric character and vehicle tutorials.
- Saint11, Isometric tutorial; Cheishiru and Pixnote isometric room guides.
- Robertson & Bertling, *How to Draw* (forms on a grid, ellipse degrees).
