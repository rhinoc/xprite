# Perspective and projection

Generated scenes fail at perspective one way: a 3/4 house, a front-on fence and a
top-down tree share a screen, each from its own camera. Pixel games dodge true
perspective on purpose. This file is how to pick one parallel projection, hold it,
and where real vanishing points are still worth drawing. Isometric specifics are
in `craft/70-objects/71-isometric.md`, shaded forms in `craft/72-3d-forms.md`.

## Rules

1. **One projection per scene; name it before the first pixel.** Houses, trees,
   props, vehicles and characters share one camera. A wrong-but-uniform projection
   still reads right; a correct one mixed with another does not.

   | Projection | Faces seen | Receding edges | Typical use |
   |------------|-----------|----------------|-------------|
   | Side | front | none | platformers |
   | Plan (top-down) | top | none | maps, shmup sprites |
   | 3/4 top-down | top at about half height + front | none | RPGs, the default on 16 px tiles |
   | Oblique ("cabinet") | front flat + top + one side | one slant, 1:1 (or 2 up per 1 across) | side-scrollers with tilted platform tops |
   | Isometric 2:1 | top + two sides | 2:1 | strategy, builders |
   | 45° dimetric | top + two sides | 1:1 | big maps where tall things must not hide play |

2. **Sprites use parallel projection.** Parallel lines stay parallel, a sprite is
   the same size wherever it stands, one drawing serves every position. Real
   vanishing-point perspective is for whole-frame art only: first-person corridors,
   roads, hyperspace, battle backdrops.
3. **Fix the horizon first** in any scene with receding ground. Put its row on a
   guide layer and keep it on that row. Things at eye level sit on it: equal-height
   figures on flat ground are all cut by it at the same body height, the farther
   one just smaller. Place it near ⅓ or ⅔ of the height, not at ½.
4. **3/4 top-down building:** draw the front elevation as seen straight on, cut the
   wall height to about ½, add a roof with overhang, and keep the roof pitch from
   the elevation (1:1 or 2:1), do not flatten it. A 16 px facade becomes about 8 px
   of wall plus the roof band. A 1-row stone footer straightens the silhouette
   beside flat tiles.
5. **Corner view (3/4 side):** the near wall is about half its frontal width, the
   second wall beside it takes a clearly different value, roof lines stay at 45°
   (which limits how narrow the facade can get). Depth comes from the value split,
   not from line work.
6. **Oblique:** the front face stays flat and undistorted; every depth edge runs
   one slant with a constant step. One slant for the whole scene.
7. **Equal things recede with shrinking gaps.** Windows, planks, posts: mild
   convergence loses 1 px per item (gaps 8,7,6,5); strong convergence multiplies the
   gap by about 0.8 per item (derived: distance from the vanishing point ∝ 1/(d₀+n)).
   Tops and bottoms of equal-height items meet at the same vanishing point.
8. **Use clean slopes only:** 0, 1:4, 1:3, 1:2, 1:1, 2:1, 3:1, 4:1, vertical. Mixed
   ratios (3:2, 5:3) are acceptable only when the run pattern repeats exactly
   (2,1,2,1). A converging bundle cannot be all clean: put the vanishing point on an
   integer column so the main edges hit clean ratios, let the rest differ by ±1 px at
   their ends, and round run lengths, not endpoints (`craft/10-technique/10-lines-and-curves.md`).
9. **Two-point corner pairs map to slopes:** 45/45 → 1:1 and 1:1; 60/30 → 2:1 steep
   and about 1:2; 75/15 → 4:1 steep and 1:4 (read off book diagrams, approximate).
   The 2:1 + 1:2 pair is isometric, `craft/70-objects/71-isometric.md`.
10. **Fake 3-point lean:** tilt verticals 1 px per 8–12 rows toward the vanishing
    direction. Never below 32 px tall.
11. **Lens, in pixel terms.** Default to the long lens (near-parallel verticals,
    far wheel at least 0.75 of the near width, layer scale ratio about 1.2:1). A wide
    lens is a deliberate hero shot: far item about 0.5 of near, foreground 3× the
    background.
12. **Keep key shapes in the central ⅔ of the canvas;** strongly converging edges
    belong in the margins.
13. **A symmetric 3/4 object has a foreshortened far half.** Mirroring the near half
    horizontally is wrong; redraw the far half narrower (up to 25% on a long lens).
14. **Never flip a 3/4 sprite vertically to make "the same thing facing down".** The
    skew reads wrong; redraw. Plan-view sprites can flip. Horizontal flips carry every
    asymmetric detail with them, fix those by hand.
15. **Do not mix tilted and straight-on items** in a geometrically consistent prop
    set. Check by placing the sprites side by side at 1× (a barrel that looks wrong
    usually needs more lid and less side).
16. **Scale bible:** person ≈ 1.5–2 cubes tall, door ≈ 2 cubes, tree 3–5 cubes,
    sedan length ≈ 2× its width. One tile = one stated real-world size; shrunken
    exteriors with big interiors are fine if the ratio is the same everywhere.
17. **Depth order is y-sorting:** order = object y + an offset at the bottom of its
    collision box (where it touches the ground). Floating things use the ground
    point beneath them. Split tall or long shapes (walls, stairs, totems) into pieces,
    each with its own offset.
18. **Shadows are short and subtle,** on their own layer unless they fit inside the
    sprite frame (a tree). A shmup drop shadow is the sprite flattened to one dark
    colour, about half size, offset down-right; scale it on a duplicate document with `resizeSprite` `nearest`, then `blit` + `translate` it into place.
19. **Whole-frame one-point art** (96×58 corridor): vanishing point at the centre;
    flat-colour walls divided by vertical lines whose gaps grow toward the viewer;
    nearest panel flush with the canvas edge; far end gets a dark dithered gradient,
    the same dither on every frame. Forward walk = 4 frames (only the vertical lines
    move), side opening and dead end = 16 each, 90° turn = 7 in-betweens built around
    a middle frame at exactly 45°, mirrored for the second half. Hyperspace: rays
    every 10°, streaks made of segments that grow outward, 24 frames at 50 ms.

## By size

| Size | What perspective can do |
|------|-------------------------|
| 8 | None. Commit to side or plan view; at most a 1–2 px top band. |
| 16 | 3/4 top-down: top band 3–4 px over an 8–9 px front, no receding lines. Props fit one 16×16 tile. |
| 32 | 3/4 or 2:1 buildings, one receding family, two values per wall, 1–2 px eave. |
| 64 | Corridors, wide-lens hero shots, 3-point lean; far objects drop the darkest colour and lose saturation (`craft/20-color/20-color-for-pixel-art.md`). |

## Templates

**persp-projections-cube** — one cube in side, plan, 3/4 top-down, oblique and
isometric. Use it to decide which family a scene is in and to explain the choice.

```grid persp-projections-cube
T = top-face       #e6d6ac
F = front-face     #b79a7d
S = side-face      #7e6574
---
FFFFFFFF.TTTTTTTT.TTTTTTTT.....TTTTTTTT.......TTTT......
FFFFFFFF.TTTTTTTT.TTTTTTTT....TTTTTTTTS.....TTTTTTTT....
FFFFFFFF.TTTTTTTT.TTTTTTTT...TTTTTTTTSS...TTTTTTTTTTTT..
FFFFFFFF.TTTTTTTT.TTTTTTTT..TTTTTTTTSSS.TTTTTTTTTTTTTTTT
FFFFFFFF.TTTTTTTT.FFFFFFFF.FFFFFFFFSSSS.TTTTTTTTTTTTTTTT
FFFFFFFF.TTTTTTTT.FFFFFFFF.FFFFFFFFSSSS.FFTTTTTTTTTTTTSS
FFFFFFFF.TTTTTTTT.FFFFFFFF.FFFFFFFFSSSS.FFFFTTTTTTTTSSSS
FFFFFFFF.TTTTTTTT.FFFFFFFF.FFFFFFFFSSSS.FFFFFFTTTTSSSSSS
..................FFFFFFFF.FFFFFFFFSSS..FFFFFFFFSSSSSSSS
..................FFFFFFFF.FFFFFFFFSS...FFFFFFFFSSSSSSSS
..................FFFFFFFF.FFFFFFFFS....FFFFFFFFSSSSSSSS
..................FFFFFFFF.FFFFFFFF.....FFFFFFFFSSSSSSSS
........................................FFFFFFFFSSSSSSSS
..........................................FFFFFFSSSSSS..
............................................FFFFSSSS....
..............................................FFSS......
```

**persp-house-34-20x19** — 3/4 top-down house: roof band 9 rows, wall 5, footer 1,
roof planks as alternating rows, chimney breaking the roof edge. Recolour roles.

```grid persp-house-34-20x19
K = outline        #2b1d2e
B = chimney-brick  #a8553d
b = chimney-shade  #7a3a33
L = roof-light     #e0604f
R = roof-mid       #c8372d
P = roof-plank-line #a02a35
D = eave-shade     #6a2336
e = wall-shadow    #b8a08a
C = wall           #e8d5b0
G = window         #7fb4d6
O = door           #7a4a35
S = footer-stone   #9a96a8
---
.............KKKK...
.............KBbK...
.............KBbK...
..KKKKKKKKKKKKBbKK..
..KLLLLLLLLLLKBbKK..
..KRRRRRRRRRRKKKKK..
..KPPPPPPPPPPPPPPK..
..KRRRRRRRRRRRRRRK..
..KPPPPPPPPPPPPPPK..
..KRRRRRRRRRRRRRRK..
..KDDDDDDDDDDDDDDK..
..KKKKKKKKKKKKKKKK..
....KeeeeeeeeeeK....
....KCGGCCCCGGCK....
....KCGGCOOCGGCK....
....KCCCCOOCCCCK....
....KCCCCOOCCCCK....
....KSSSSSSSSSSK....
....KKKKKKKKKKKK....
```

**persp-corridor-1pt-24** — one-point corridor: back wall 8×8 centred, all four
planes bounded by 1:1 diagonals (clean by construction), panel lines at x=6,3 and
17,20 (gaps 2 then 3 toward the viewer) with floor lines at y=17,20 on the same depth
steps.

```grid persp-corridor-1pt-24
B = back-wall      #6b5b8c
C = ceiling        #3a3052
F = floor          #7d6a5c
f = floor-line     #5b4a4a
L = left-wall      #8d7aa8
l = left-panel-line #6a5a86
R = right-wall     #574a73
r = right-panel-line #43385c
D = corner-edge    #2a2038
---
DCCCCCCCCCCCCCCCCCCCCCCD
LDCCCCCCCCCCCCCCCCCCCCDR
LLDCCCCCCCCCCCCCCCCCCDRR
LLLDCCCCCCCCCCCCCCCCDRRR
LLLlDCCCCCCCCCCCCCCDrRRR
LLLlLDCCCCCCCCCCCCDRrRRR
LLLlLLDCCCCCCCCCCDRRrRRR
LLLlLLlDCCCCCCCCDrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlLBBBBBBBBRrRRrRRR
LLLlLLlDFFFFFFFFDrRRrRRR
LLLlLLDffffffffffDRRrRRR
LLLlLDFFFFFFFFFFFFDRrRRR
LLLlDFFFFFFFFFFFFFFDrRRR
LLLDffffffffffffffffDRRR
LLDFFFFFFFFFFFFFFFFFFDRR
LDFFFFFFFFFFFFFFFFFFFFDR
DFFFFFFFFFFFFFFFFFFFFFFD
```

**persp-wall-receding-36x18** — a wall running away to a vanishing point on the right at
(x≈48, row 9): top and bottom edges are clean 1:6 slopes, windows start 2,10,17,23,28
(gaps 8,7,6,5) and shrink 4,3,3,2,2 px wide; each window's top and bottom follow the
same two converging lines. Use for fences, colonnades, plank rows.

```grid persp-wall-receding-36x18
K = edge           #2b1d2e
W = wall           #c9b48c
G = window         #4b5f86
---
....................................
KKK.................................
WWWKKKKKK...........................
WWWWWWWWWKKKKKK.....................
WWWWWWWWWWWWWWWKKKKKK...............
WWWWWWWWWWWWWWWWWWWWWKKKKKK.........
WWGGGGWWWWGGGWWWWWWWWWWWWWWKKKKKK...
WWGGGGWWWWGGGWWWWGGGWWWGGWWWWWWWWKK.
WWGGGGWWWWGGGWWWWGGGWWWGGWWWGGWWWWK.
WWGGGGWWWWGGGWWWWGGGWWWGGWWWGGWWWWK.
WWGGGGWWWWGGGWWWWGGGWWWGGWWWGGWWWWK.
WWGGGGWWWWGGGWWWWGGGWWWGGWWWGGWWWWK.
WWGGGGWWWWGGGWWWWGGGWWWWWWWWKKKKKK..
WWGGGGWWWWWWWWWWWWWWWWKKKKKK........
WWWWWWWWWWWWWWWWKKKKKK..............
WWWWWWWWWWKKKKKK....................
WWWWKKKKKK..........................
KKKK................................
```

## Procedure

1. Write one line: projection, light direction, tile or scale. Everything else
   follows from it.
2. `addLayer` a `guide` layer. Draw the horizon row, vanishing point and a
   long ruler line with `applyBatch` `line`; hide it before export.
3. Block each object as a box in flat colour (`applyBatch` ops `fillRect`, `grid`), tops and
   fronts only as the projection allows.
4. Place receding repeats by writing their gap sequence on the guide first.
5. Put two sibling sprites side by side and `render` at 1×; fix the
   outlier, not the pair.
6. Apply values per face (`craft/00-core/02-shading-and-light.md`), then `readPixels` `format:"grid"` to
   count slope runs. Delete the guide, run `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Fence flat, house tilted, tree from above | Each sprite drawn in its own camera | Pick the projection from rule 1, redraw the outliers |
| Distant figures float | Horizon not shared | Put one horizon row on the guide; feet land lower as they get nearer |
| Receding windows evenly spaced | Gaps copied, not shrunk | Gap sequence 8,7,6,5 |
| Wobbly depth edges | Mixed 3:2 / 5:3 slopes | Snap every edge to the clean slope list |
| Mirrored car looks skewed | Near half flipped to build the far half | Redraw the far half narrower |
| Enemy "facing down" looks wrong | 3/4 sprite flipped vertically | Redraw for the other facing |
| Roof flat and dull | Roof pitch squashed with the wall | Keep the elevation pitch, halve only the wall |

## Review

- One projection across every sprite; no object shows a face the others cannot.
- Horizon row consistent; equal-height figures straddle it at equal body height.
- Receding repeats shrink; tops and bottoms converge on one point.
- Every edge sits on a clean slope; no 2,3,2 stair runs.
- No vertically flipped 3/4 sprite; no mirrored-near-half symmetry.
- Shadows short, one direction, sorted with the object.

## Sources

- Slynyrd, Pixelblog 3 and 4 (Graphical Projection), Pixelblog 40 (3D Pixel Art Animation).
- Robertson & Bertling, *How to Draw* (perspective, ellipses, lens comparison).
- Pixel Logic (Ch. 6, game perspectives); Silber, *Pixel Art for Game Developers* (ch. 7).
- Loomis, *Figure Drawing for All It's Worth* (horizon and figure placement).
- Mateu-Mestre, *Framed Ink* (camera and lens); Solarski, *Drawing Basics and Video Game Art*.
- Saint11, Top-Down Tricks (y-sorting); Slynyrd, Pixelblog 64 (cabinet projection tiles).
