# Tiles and autotiling

A tile is drawn once and shown a thousand times, so every flaw is multiplied: a lone rock becomes wallpaper, a seam becomes a grid, an edge set without inner corners breaks on the first L-shaped patch. And an autotile set authored in the wrong order exports a wangset that picks the wrong tile everywhere. This file is the method for seamless tiles, terrain transitions and the standard autotile layouts, and how the tilemap ops drive it. Ground textures: `craft/60-environments/65-ground-rocks-grass.md`; brick, doors, windows: `craft/60-environments/67-architecture-and-interiors.md`.

## Rules

**Seamless tiles**

1. **The tile size belongs to the game, not to you.** Ask. 16 is the safe default, 8 and 32 are common, 48 is RPG Maker MV/MZ. Edge doubling quadruples the area (one 32 holds four 16s), so never mix sizes in one set. Tiles are perfect squares with no gaps; a big object is split into tile-sized pieces.
2. **Draw a master tile that wraps on every edge first**: rough it in, offset by half on both axes, rework the middle (the old seams), offset back. Side-view strips need horizontal wrap only; top-down fields need both axes.
3. **Never judge a tile alone.** Repeat it 3×3 (2×2 minimum) and look at game scale. Seams are invisible in isolation.
4. **What makes a grid show**: one distinct element, a gradient across the tile, a strong shadow or high-contrast pixels, one feature filling the tile, detail piled in one corner, pixels piled along the edge, shapes repeating every N px in aligned lines. Break it by letting clusters cross the border. A visible grid is acceptable only for naturally gridded materials (floor slabs, ridged metal).
5. **Variants change only the centre.** Keep the outer 1–2 px identical to the master (for 16 px: leave x and y in 0–1 and 14–15 untouched, derived) so every variant still joins every other. Make 3–4 variants of any heavily used tile and place them semi-randomly.
6. **Layer textures that do not fill a tile.** Tufts, rocky dirt, cracks go on transparent and sit over a different base: texture combinations without baking each pair. Draw order bottom → top: dirt, grass, shadows, trees and rocks, cliffs, shadows 2, cliffs 2.
7. **Shadows are short and uniform.** Cast on one or two faces only, never longer than one tile, the same length for every wall height. Bake a shadow into a tile only when it fits inside it; otherwise keep shadow tiles on their own layer.
8. **Tiles are quieter than sprites**: desaturated, same base hues. A palette-swapped copy of a set is a legitimate way to get a second town.
9. **Tall things** (trees, towers, walls): the footprint stays on the grid, only the top may exceed it. Split into tile-sized pieces so they can sort by y.

**Transitions**

10. **Cut transitions out of the two full tiles.** Take pixels from terrain A where a mask says A and from B elsewhere, then run one boundary pass. Both sides then join their full tile with no seam. Do not repaint the sides.
11. **Fix the boundary offset and make both ends equal.** In the templates the boundary sits 5 px in from the tile edge and wobbles ±1 px in runs of 2+; the profile starts and ends at 5 so neighbours agree. Corner arcs end on the same 5 px point.
12. **Boundary pass with light from upper-left**: 1 px dark outline on the edge-most pixels of the upper terrain, a light rim on the pixels just inside when the edge faces north or west, a 1 px shadow on the lower terrain on the south and east sides. Flipping or rotating a lit edge puts the rim on the wrong side: after a flip re-run the pass, swapping rim and shadow (`replaceColor`).
13. **Side-view top edge**: grass lip overhangs the dirt (4 bands: light rim, base, dark underside, dirt); the shadow row under the lip is on the dirt. Collision stays below the lip.

**Autotile sets** — layouts in the section below

14. **Pick the set by the terrain, not by habit.** Rectangles and UI boxes: 9-slice (+ 4 inner corners). Pipes, roads, wall lines: 4-bit, 16 tiles. Smooth terrain at minimum art: dual-grid, 16 tiles. Full terrain with the tile atlas export: blob47. RPG Maker: A2 (20 minitiles → the same 47 shapes).
15. **A diagonal neighbour counts only when both cardinals beside it are present.** That rule collapses 256 masks to exactly 47. Bit order, clockwise from north: N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128.
16. **`stampTiles` indexes into the tileset in canonical order**: the 47 reduced masks in ascending numeric order at Aseprite tile indices 1–47 (index 0 is the reserved empty tile). Wangtile id = index − 1. Any other order autotiles wrongly.
17. **Build the body tile first, then edges, then corners**; draw no detail until every connection works. Squeeze every tile: avoid rare cases. Test with a single cell, a 3×3 patch (9 different tiles), an L shape (inner corner), a ring (hole), a plus.
18. **Two terrains on one map**: give them priorities and draw overlays lowest to highest; the higher terrain's open sides read the lower one as its background.
19. **Animated tiles** cycle frames inside one autotile index; the index changes only when a neighbour changes.
20. **Platformer kit** (any tile size): 3×3 block (floor, ceiling, walls, corners) + inner-corner set = 12 tiles at 8 px gives every level without slopes.

## By size

| Tile | Boundary offset | Detail | Autotile set that works |
|------|-----------------|--------|--------------------------|
| 8 px | 2–3 px (derived) | 3 colours, 2–3 clusters, no outline on grass | dual-grid 16, or 3×3 block + 4 inner corners; blob47 is too fine to read |
| 16 px | 5 px | 3–4 colours, 1 px outline, rim + shadow | any; blob47 is the standard |
| 32 px | ~10 px (derived) | 4 colours, 2 px wobble runs, texture on three levels | blob47 or 9-slice; 3–4 centre variants |
| 64 px | not a tile size | build from 16/32 modules | 9-slice for panels and rooms |

## Templates

Four tiles from one grass/dirt pair (`ground-grass-16`, `ground-dirt-16`): `o` is the boundary outline, rim `l` and shadow `D` come from the pass in rule 12.

- `tiles-edge-n-16` — blob47 mask 124 (N open: grass below, dirt above). West edge = the same mask transposed, then re-run the pass.
- `tiles-corner-nw-16` — mask 28 (N and W open, corner rounded). The straight runs end on the same 5 px as the edges.
- `tiles-inner-nw-16` — mask 127 (only NW open): a dirt notch with the same 5 px runs.
- `tiles-platform-top-16` — side-view ground top, horizontal wrap only.

```grid tiles-edge-n-16
o = grass-outline #1f4a38
d = grass-dark    #2d6a45
m = grass-mid     #46984a
l = grass-light   #86c653
D = dirt-dark     #5b3a31
B = dirt-mid      #8c5d3e
L = dirt-light    #b98a58
---
BBBBBBBBBBBBBBBB
BBBBBBBBBDDDBBBB
BBLLBBBBBBBBBBBB
BBLDDBBBBBBBBBBB
BBBooDBBBBBooDBB
ooollooDBoollooo
lllmmlloollmmlll
mmlmmmmlllmlmmmm
mmlmmmmmmlmlmmmm
mmdmmmmmmdmdmddd
dmmmmlmlmmmmmmdd
mmmmmlmlmmmmmmmm
mllmmdmdmmmmlmlm
mmllmmmmmmlmlmlm
mmmmmdddmmdmdmdm
mmmmmmdddmmmmmmm
```

```grid tiles-corner-nw-16
o = grass-outline #1f4a38
d = grass-dark    #2d6a45
m = grass-mid     #46984a
l = grass-light   #86c653
D = dirt-dark     #5b3a31
B = dirt-mid      #8c5d3e
L = dirt-light    #b98a58
---
BBBBBBBBBBBBBBBB
BBBBBBBBBDDDBBBB
BBLLBBBBBBBBBBBB
BBLDDBBBBBBBBBBB
BBBBBBBBBBBooDBB
BLLBBBBBooollooo
BBBBBBoolllmmlll
BBBBBBolmlmlmmmm
BBBBBolmmlmlmmmm
BBBBBolmmdmdmddd
BDDDBollmmmmmmdd
BBBBolmlmmmmmmmm
BBBBolmdmmmmlmlm
BBBBBolmmmlmlmlm
BBBBBoldmmdmdmdm
BBBBBolddmmmmmmm
```

```grid tiles-inner-nw-16
o = grass-outline #1f4a38
d = grass-dark    #2d6a45
m = grass-mid     #46984a
l = grass-light   #86c653
D = dirt-dark     #5b3a31
B = dirt-mid      #8c5d3e
L = dirt-light    #b98a58
---
BBBBBolmmmmmmmml
BBBBBolmmdddmmml
BBLLBolmmmdddmmd
BBLDolmmmmmmmmmm
BBBolmmmmmmmmmml
ooolmllmmmmmmlml
lllmmmllmmmmmdmd
mmlmmmmmmlmlmmmm
mmlmmmmmmlmlmmmm
mmdmmmmmmdmdmddd
dmmmmlmlmmmmmmdd
mmmmmlmlmmmmmmmm
mllmmdmdmmmmlmlm
mmllmmmmmmlmlmlm
mmmmmdddmmdmdmdm
mmmmmmdddmmmmmmm
```

```grid tiles-platform-top-16
d = grass-dark    #2d6a45
m = grass-mid     #46984a
l = grass-light   #86c653
D = dirt-dark     #5b3a31
B = dirt-mid      #8c5d3e
L = dirt-light    #b98a58
---
................
..ll...l..ll....
llmmlllmllmmllll
mmmmmmmmmmmmmmmm
mmmmmmmmmmmmmmmm
ddmmddmmmddmmddd
DDddDDmmdDDddDDD
BBDDBBdmDBBDDBBB
BBBBBBDdBLLBBBBB
BBBBBBBDBLDDBBBB
BDDDBBBBBBBBBBBB
BBBBBBBBBBBBBDBB
BBBBBLLBBBBBBBDD
BBBBBLDDBBBBBBBB
BBBBBBBBBBLLBBBB
BBBBBBBBBBBBBBBB
```

### Layout: blob47 (the canonical atlas order)

`#` = neighbour is the same terrain, `.` = not, centre always terrain. Each cell is `index=mask`; the index is the Aseprite tile index, the mask is the sum of the set bits. Author in this order.

```text
 1=0     2=1     3=4     4=5     5=7     6=16    7=17    8=20
...     .#.     ...     .#.     .##     ...     .#.     ...
.#.     .#.     .##     .##     .##     .#.     .#.     .##
...     ...     ...     ...     ...     .#.     .#.     .#.

 9=21   10=23   11=28   12=29   13=31   14=64   15=65   16=68
.#.     .##     ...     .#.     .##     ...     .#.     ...
.##     .##     .##     .##     .##     ##.     ##.     ###
.#.     .#.     .##     .##     .##     ...     ...     ...

17=69   18=71   19=80   20=81   21=84   22=85   23=87   24=92
.#.     .##     ...     .#.     ...     .#.     .##     ...
###     ###     ##.     ##.     ###     ###     ###     ###
...     ...     .#.     .#.     .#.     .#.     .#.     .##

25=93   26=95   27=112  28=113  29=116  30=117  31=119  32=124
.#.     .##     ...     .#.     ...     .#.     .##     ...
###     ###     ##.     ##.     ###     ###     ###     ###
.##     .##     ##.     ##.     ##.     ##.     ##.     ###

33=125  34=127  35=193  36=197  37=199  38=209  39=213  40=215
.#.     .##     ##.     ##.     ###     ##.     ##.     ###
###     ###     ##.     ###     ###     ##.     ###     ###
###     ###     ...     ...     ...     .#.     .#.     .#.

41=221  42=223  43=241  44=245  45=247  46=253  47=255
##.     ###     ##.     ##.     ###     ##.     ###
###     ###     ##.     ###     ###     ###     ###
.##     .##     ##.     ##.     ##.     ###     ###
```

Families (derived): 0 cardinals = 1 tile; 1 = 4 end caps; 2 = 2 straights, 4 outer corners, 4 outer corners with the inside diagonal filled (the 4 notches); 3 = 4 T-shapes × 4 corner fills; 4 = 1 plus-without-corners, 4, 6, 4, 1 full. Total 1 + 4 + 10 + 16 + 16 = 47.

### Layout: 16-tile sets

4-bit edge (Wang edge): `index = N·1 + E·2 + S·4 + W·8`, no inner corners.

| idx | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|-----|---|---|---|---|---|---|---|---|
| shape | single | N cap | E cap | N+E corner | S cap | N–S straight | S+E corner | T, W closed |

| idx | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|-----|---|---|----|----|----|----|----|----|
| shape | W cap | N+W corner | E–W straight | T, S closed | S+W corner | T, E closed | T, N closed | plus |

Wang corner / dual grid: the data grid is offset half a tile from the display grid; each display tile looks at the 4 data cells at its corners, `index = TL·1 + TR·2 + BR·4 + BL·8`. The boundary runs through the middle of the tile, so inner corners come free.

| idx | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|-----|---|---|---|---|---|---|---|---|
| terrain in | none | TL | TR | top half | BR | TL + BR | right half | all but BL |

| idx | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|-----|---|---|----|----|----|----|----|----|
| terrain in | BL | left half | TR + BL | all but BR | bottom half | all but TR | all but TL | all |

Indices 5 and 10 are saddle tiles: decide once which terrain connects through the middle.

### Layout: RPG Maker A2 autotile

Think in half tiles (minitiles, 8 px at 16). A block is 2 × 3 tiles = 4 × 6 minitiles; an A2 sheet is 8 × 4 blocks (16 × 12 tiles; 256 × 192 px at 16 px).

```text
minitile (col,row)     col: 0   1 | 2   3
row 0                      P   P | I   I     P = palette preview, unused in maps
row 1                      P   P | I   I     I = inner (concave) corner pieces
                           ------+------
rows 2-5  = box rows 0-3   B   B   B   B     B = outer corners, rims, centre
                           B   B   B   B
                           B   B   B   B
                           B   B   B   B
```

Every minitile always lands in the same quarter of the assembled tile (a top-left piece in the top-left quarter). A quarter depends on two cardinals and one diagonal: both cardinals open → outer corner; one open → rim along that side; both closed and the diagonal open → inner corner; all closed → full. Source piece per quarter (box coords col,row; derived from the geometry):

| Quarter | outer corner | horizontal rim | vertical rim | full | inner corner |
|---------|--------------|----------------|--------------|------|--------------|
| TL | (0,0) | (2,0) | (0,2) | (2,2) | I top-left |
| TR | (3,0) | (1,0) | (3,2) | (1,2) | I top-right |
| BL | (0,3) | (2,3) | (0,1) | (2,1) | I bottom-left |
| BR | (3,3) | (1,3) | (3,1) | (1,1) | I bottom-right |

Edge contract: draw edges per minitile, not per tile. The right edge of every top-left piece must match the left edge of every top-right piece it can touch; same for top and bottom pairs. 4 quarters × 5 states = 20 minitiles cover all 47 shapes.

### What this means for the tilemap ops

- Author the atlas mockup on an image layer in canonical order — index 0 empty, the 47 masks left to right, 8 per row — then `convertToTilemap` `tileWidth`/`tileHeight`. Identical cells collapse into one tileset entry; `stampTiles` addresses them by tileset index. Any deduplication means two mockup cells were identical: redraw the pair.
- `paintTiles` draws pixels straight onto a tilemap layer's cel and auto-packs new tile-sized blocks into the tileset — the way to edit a tile in place or grow the set without re-converting.
- `stampTiles` places tileset indices by grid cell (`{x, y, tile}`); use it to test the set with patches — single cell, 3×3, L, ring, plus.
- Export is `exportDocument` `png`/`spritesheet` `grid` (the picture) or `aseprite` (the project with embedded tilesets). There is no Tiled/Godot wangset format — hand the user the index → mask table above.

## Procedure

1. Fix the tile size and palette (`craft/20-color/21-limited-and-platform-palettes.md` for platform sets). Make the canvas a whole number of tiles.
2. Master tile: draw it, blit the four quadrants swapped to move the seam to the middle (`translate` does not wrap), rework, swap back.
3. Wrap test: `applyBatch` `blit` the tile into its eight neighbours on a scratch layer, `render`, then `readPixels` `format:"grid"` the first and last columns and rows and check they continue each other.
4. Transitions: composite A and B through the mask, then the boundary pass (rule 12). One edge, one outer corner, one inner corner cover all four sides once flipped and re-lit.
5. Autotile set: paint the mockup cells in canonical order, body tile (mask 255, index 47) first. For every pair of tiles that show terrain on touching sides, `readPixels` the border column or row and check it is identical.
6. `convertToTilemap` the mockup layer (`tileWidth`, `tileHeight`). `getContext` the tileset: 48 entries means all 47 distinct plus empty. Fewer means two tiles are identical: redraw the pair on the image layer and convert again.
7. Test patches with `stampTiles` on the tilemap layer, `render`: single cell, 3×3, L, ring, plus. Fix a tile in place with `paintTiles`.
8. Export the atlas with `exportDocument` `png`/`spritesheet` `grid`, or `aseprite` for the full project; hand the index convention to the user.
9. `validate` `layers`, `strays`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Grid pattern across the map | Features at the same place in every tile, aligned pixel lines | Offset, let clusters cross borders, add centre variants |
| Thin vertical line between tiles | Edge column differs between neighbours | Compare border columns with `readPixels` `format:"grid"`, copy one |
| Edges have a notch at the junction | Boundary offsets differ between edge and corner | Same offset, both profile ends equal |
| Light rim on the south side | Flipped a lit edge | Re-run the boundary pass |
| Fewer than 48 tileset entries | Set incomplete, or two identical tiles were deduplicated | Draw all 47, make them distinct |
| Wrong tile chosen everywhere | Tiles not in ascending mask order | Reorder the mockup by the diagram, `convertToTilemap` again |
| Inner corners missing | 4-bit set used for blob terrain | Use blob47 or dual-grid |
| Shadows run across tiles | Real-length cast shadow | One tile max, same length for all heights |

## Review

- Every tile repeated 3×3 shows no seam, no grid, no aligned pixel lines.
- Variants differ in the centre only; borders are identical.
- Transition tiles join both full tiles without a visible step; boundary offsets agree on every side.
- Light direction is the same on all edges; no rim on a south or east edge.
- Set order is canonical; `tileCount` is 47 (blob47) and the patch tests (single, 3×3, L, ring, plus) look correct.
- Tiles are less saturated than the sprites that walk on them.

## Sources

- Silber, *Pixel Art for Game Developers*, ch. 9: seamless textures, 9-slice and three-tile transitions, platform tiles.
- Slynyrd, *Pixelblog* 20, 28, 35, 43, 45, 47, 60 (tile sets, layered tiles, 3×3 + inner corner kits) — slynyrd.com/pixelblog-catalogue.
- Saint11 tutorial *Tiles* — saint11.art/blog/pixel-tutorials.
- Red Blob Games, tile-mask autotiling write-ups; cr31 blob-47 template and comments (OpenGameArt); Godot docs, *Using tilesets* (terrain peering modes).
- RPG Maker A2 autotile block diagrams (RPG Maker blog, nerulio); Tiled manual, terrain/wang sets.
- Tsugumo, *So You Want To Be A Pixel Artist?* ch. 2 (the grid), 4, 5.
- Dawe, *Make Your Own Pixel Art*, pp. 105–111 (tilesets, seams, plus-shaped starter set).
