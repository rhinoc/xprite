# VFX: fire, smoke, explosions and magic

Effects are judged by motion alone, and agents draw them as stills: a flame with a black
outline, smoke as a grey ball, an explosion as one orange frame. Each effect has a fixed
layer order, colour order and frame skeleton; this file gives them. Hit timing and shake
are in `craft/81-impacts-and-game-feel.md`, falling things in `craft/82-particles-and-weather.md`,
light cast on the scene in `craft/24-lighting-scenarios.md`.

## Rules

1. **One layer at a time.** An explosion is flash, blast, fire, smoke, debris: draw and
   animate each as its own pass (its own layer), then judge the stack. One drawing per frame
   comes out muddy.
2. **Light sources get no black outline.** The outer ring of a flame or blast is the darkest
   *fire* colour, then orange, yellow, white. An outline turns glow into a sticker. Contrast
   comes from a dark disc *behind* the effect on frame 1 (rule 9).
3. **Fire ramp, hottest at the base:** `#ac3232` dark red, `#df7126` orange, `#fbf236` yellow,
   `#ffffff` white (add `#3f2832` as a darkest step). White is 1–3 pixels at the root of a flame
   or centre of a blast, never a fill. The tip is the coolest part.
4. **A flame is one connected body plus a few detached bits.** The body changes outline every
   frame but keeps its area; embers (1 px) break off the tip and rise. Yellow stays inside
   orange. Measured torch at 32 px: 9–12 wide, 15–20 tall, tip height ±3–4 px between frames.
5. **Fire loops in 6–8 frames at 80–120 ms with uneven durations** (e.g. 100/80/120/100).
   Start a new "wave" every 2–3 frames; the last frame must lead into the first. At ≤16 px
   4 frames suffice. *Conflict:* the Saint11 reference fire is 30 frames at 100 ms; at ≤32 px
   the extra frames are indistinguishable, so use 6–8. Equal frames and durations strobe.
6. **Wind leans the tip, not the base:** shift the top 2–3 rows by 1 px, keep the bottom.
7. **Smoke dies by shrinking, not transparency.** Each frame rise 2–3 px, widen, lighten toward
   the background (3 → 2 colours), and finally break into 2–4 clusters. Break late; early
   breakup reads as noise. Violet-grey, never neutral (`craft/20-color-for-pixel-art.md`).
8. **Smoke puffs are lobed discs:** light crescent upper-left, one dark crescent lower-right,
   bumps on top. No pillow shading (`craft/11-clusters-and-noise.md`).
9. **Explosion: at least 4 frames, in order:** (1) contrast — a dark disc, so the next frame
   feels brighter; (2) white flash; (3) sharp blast, hard angles, no noise; (4+) fade — fire
   leaves fast, smoke slowly. Draw the *force shape* first: sphere in open air, half-dome on
   a wall, quarter-dome in a corner.
10. **Expansion is fast, then slows;** in a 6-frame, 32 px blast the radius gains about
    +4, +3, +2, +1, +1 px (derived). Colour runs white → yellow → orange → brown/grey, so the
    last frames carry no yellow.
11. **Debris follows gravity and lands.** Nothing hangs mid-air; fragments rest on the last frame.
12. **Electricity flickers:** shock (sharp zig-zag) → brighter frame with a *different* shape →
    empty → faded echo of the first → empty → 2-frame fade. Blank frames are part of it.
13. **Beams: white core, 1 px coloured fringe;** pulse thickness 1 → 3 → 5 → 3 → 1 px, with a
    charge ball at the muzzle first.
14. **Glow is concentric rings, not alpha:** core → light → mid → dark, 1–2 px per ring, outer
    ring dithered (`craft/13-dithering-and-texture.md`). Light it casts drops about 2 ramp steps
    per doubling of distance (`craft/24-lighting-scenarios.md`).
15. **Pick the magic palette by the feeling.** Dark magic: complementary pair (lime `#99e550`
    against purple `#c327ff`), lit from below, sharp shapes, spiral smoke, black disc behind.
    Holy magic: analogous and bright (cyan, white, yellow), lit from above, rounded shapes,
    sparks that fall slowly or rise, no smoke, no spikes.
16. **Projectile cores are warm and bright, borders cool and dark:** orange `#fee761 #feae34
    #f77622 #9e2835`; cyan `#ffffff #2ce8f5 #0095e9 #124e89`; green `#fee761 #63c74d #3e8948
    #265c42`. Fast bullets: fewer details, stretched along travel.

## By size

| Canvas | Flame | Smoke puff | Explosion | Glow / orb |
|--------|-------|-----------|-----------|-----------|
| 8 px | 4–5 × 6–8, 2 colours, 3 frames | 3–4 px blob, 3 frames | 3 frames: white disc, yellow star, 2 dots | 2 rings |
| 16 px | 7–9 × 9–12, 3 colours + 1–2 white px, 4 frames | 6–8 px, 3 colours, 4 frames | 11–13 px, 4 frames | 3 rings (11 px) |
| 32 px | 9–12 × 15–20, 4 colours, 6–8 frames, 2–4 embers | 10–16 px lobed, 5–6 frames | 24–32 px, 6 frames + debris | 4 rings, dithered edge |
| 64 px | 2–3 tongues in one body, 8 frames | staggered puffs | 8 frames: rings → fireball → smoke column | layered glow + rays |

Budget at 16 px: ≤ 70 filled pixels and ≤ 2 detached per flame frame; ≤ 3 clusters per smoke frame.

## Templates

All frames share one canvas size per effect so they stack in one sprite; colours are
roles — map them to your palette (`craft/21-limited-and-platform-palettes.md`).

**Torch flame, 3 frames (9×12).** Upright, lean-right, short with a detached spark.
For a lean-left frame mirror `vfx-flame-2` (`flip`) and shift the yellow
core sliver by 1 px. Play with uneven durations.

```grid vfx-flame-1
R = fire-dark   #ac3232
O = fire-mid    #df7126
Y = fire-light  #fbf236
W = fire-core   #ffffff
---
.........
....R....
...RRR...
...ROR...
..RROOR..
..ROOOOR.
.RROYOOR.
.ROOYYOR.
.ROYYWYR.
.ROYYYYR.
..ROYYR..
...RRR...
```

```grid vfx-flame-2
R = fire-dark   #ac3232
O = fire-mid    #df7126
Y = fire-light  #fbf236
W = fire-core   #ffffff
---
.........
.....R...
.....RR..
....RRR..
....ROR..
...RROOR.
..RROOOR.
.RROYOOR.
.ROOYYOR.
.ROYYWYR.
..ROYYYR.
...RRRR..
```

```grid vfx-flame-3
R = fire-dark   #ac3232
O = fire-mid    #df7126
Y = fire-light  #fbf236
W = fire-core   #ffffff
---
.....Y...
.........
....R....
...RRR...
..RROOR..
.ROOOOR..
.RROYOOR.
.ROOYYOR.
.ROYYWYR.
.ROYWYYR.
..ROYYR..
...RRR...
```

**Smoke puff, 4-frame cycle (12×16), frames 1–3 drawn.** One puff rising from the bottom
edge: forms, swells, turns ragged and light. Frame 4 is 3–4 clusters of 2–3 px (`M`/`L`
only) over the top 6 rows; only the last frame may hold lone pixels. Same origin for all.

```grid vfx-smoke-1
D = smoke-dark  #5a5266
M = smoke-mid   #8a8496
L = smoke-light #bdb9c8
---
............
............
............
............
............
............
............
............
............
............
...LLL......
..LLLMM.....
.LLLMMMM....
.LLMMMMD....
.LMMMMDD....
..MMMDD.....
...DDD......
............
```

```grid vfx-smoke-2
D = smoke-dark  #5a5266
M = smoke-mid   #8a8496
L = smoke-light #bdb9c8
---
............
............
............
...LL.......
..LLLL.LL...
.LLLLLLLLM..
LLLLMMMMMMM.
LLLMMMMMMMD.
LLMMMMMMMDD.
.LMMMMMMDDD.
.MMMMMMDDD..
..MMDDDDD...
...DDDD.....
............
............
............
```

```grid vfx-smoke-3
M = smoke-mid   #8a8496
L = smoke-light #bdb9c8
---
..LL..LL....
.LLLLLLLL...
LLLL.LLLML..
LLLLLLLMML..
.LLMM.MMMM..
.LMMMMMM.M..
..MM.MMM....
...M........
............
............
............
............
............
............
............
............
```

**Explosion, 4 frames (13×13).** Frame 0 (not drawn here) is a dark disc of about
7 px, `#222034`, via `applyBatch` `fillEllipse` (filled disc). Then flash, sharp blast, fireball, fade.
Hold flash and blast for 1 tick each (40–60 ms), fireball 80 ms, fade 100–120 ms (derived).

```grid vfx-explosion-1
W = flash-white  #ffffff
Y = fire-light   #fbf236
---
......W......
......W......
.....YYY.....
...YYWWWYY...
...YWWWWWY...
..YWWWWWWWY..
WWYWWWWWWWYWW
..YWWWWWWWY..
...YWWWWWY...
...YYWWWYY...
.....YYY.....
......W......
......W......
```

```grid vfx-explosion-2
W = fire-core   #ffffff
Y = fire-light  #fbf236
O = fire-mid    #df7126
---
......O......
......Y......
......Y......
..O...Y...O..
...Y.YYY.Y...
....YYWYY....
OYYYYWWWYYYYO
....YYWYY....
...Y.YYY.Y...
..O...Y...O..
......Y......
......Y......
......O......
```

```grid vfx-explosion-3
W = fire-core   #ffffff
Y = fire-light  #fbf236
O = fire-mid    #df7126
R = fire-dark   #ac3232
K = smoke-dark  #3b3550
---
.............
....RRRR.....
..RROOOORR...
.ROOOYYOOORR.
.ROOYYYYOOOR.
RROOYYWYYOOOR
ROOYYWWYYYOOR
ROOYYYYYYYOOR
RROOYYYYYOORR
.RROOOYYOOOR.
..RRROOOORR..
.KK.RRRRRR.K.
K..KK...K..KK
```

```grid vfx-explosion-4
M = smoke-mid   #6b6578
D = smoke-dark  #3b3550
E = ember       #df7126
R = fire-dark   #ac3232
---
.............
....MMM......
..MMMMMMM....
.MMMMMMMMMM..
.MMDMMMMDMM..
..MMDDDDDM...
...MDDEDDM...
....DDDD.....
.R.......E...
.......R.....
.............
.............
.............
```

**Magic orb (11×11).** Ring glow: one frame, or pulse by swapping the ring colours
one step outward each frame. Dither the outer `N` ring for a soft edge.

```grid vfx-orb-glow
W = glow-core   #ffffff
C = glow-light  #2ce8f5
B = glow-mid    #0095e9
N = glow-dark   #124e89
---
...NNNNN...
..NBBBBBN..
.NBBCCCBBN.
NBBCCCCCBBN
NBCCCWCCCBN
NBCCWWWCCBN
NBCCCWCCCBN
NBBCCCCCBBN
.NBBCCCBBN.
..NBBBBBN..
...NNNNN...
```

**Lightning bolt, 2 frames (9×12).** Frame 1 thin and sharp (2 px segments on 1:1 diagonals joined by horizontal kinks); frame 2 a white core in a
halo, mirrored so the shape changes. Order: 1, 2, empty, 1 at half the colour, empty, gone.

```grid vfx-bolt-1
C = bolt-main  #5fcde4
---
.....CC..
....CC...
...CC....
..CCCCCC.
.....CC..
....CC...
...CC....
..CCCCC..
....CC...
...CC....
..CC.....
.CC......
```

```grid vfx-bolt-2
W = bolt-core  #ffffff
C = bolt-halo  #5fcde4
---
..CWC....
...CWC...
..CCCWC..
.CWWWWWC.
..CWCCC..
...CWC...
....CWC..
.....CWC.
....CWWWC
....CWCC.
.....CWC.
......CWC
```

## Procedure

1. Fix the feeling and the ramp: `palette` op `set` with the 4–5 role colours, or `palette` op
   `ramp` from `#df7126` if the project palette lacks a fire ramp.
2. Make a transparent `fx` layer (`addLayer`); `addFrame` to the frame count.
3. Draw each frame with `applyBatch` `grid` from a template, same origin on every frame.
4. `render` `filmstrip`, then `render` `onionSkin` on middle frames: the body keeps its
   volume and the tip travels, not teleports.
5. `setFrameDuration` `durations` with uneven values; `addTag` the loop (`fire-loop`) or
   one-shot (`explosion`).
6. `validate` flags single-pixel sparks as orphans: expected on embers and last-frame debris;
   anything else is a defect.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Flame is a sticker | Black outline, flat orange | Dark-red rim, 3 inner tones |
| Fire strobes | Equal frames and durations | Uneven durations, tip ±2–3 px |
| Smoke is a rock | Pillow shading, opaque grey, no breakup | Lobed top, one dark crescent, break into clusters |
| Explosion lacks punch | Went straight to the fireball | Add dark contrast frame and white flash |
| Lightning looks like a crack | One constant frame | Alternate shapes with blank frames |

## Review

- [ ] No black outline on light sources; darkest ring is a fire/magic colour.
- [ ] Yellow is enclosed by orange; white covers ≤ 5 % of a flame frame.
- [ ] Filmstrip: body area steady (±15 %), tip wobbles, loop closes.
- [ ] Explosion has contrast, flash, blast, fade in order (≥ 4 frames).
- [ ] Smoke lightens and breaks into clusters; no flat grey disc.
- [ ] Palette matches the feeling (dark vs holy).

## Sources

- Saint11 (Pedro Medeiros) tutorials: Fire, SmokeSheet, Explosion, Electric, DarkMagic, LightMagic, Bullets, RocketTrail.
- Dawe, *Make Your Own Pixel Art*, pp. 146–155 (flame, laser, glow, explosion).
- Slynyrd Pixelblog 31 (aerial explosion, projectile rules); Ferrari's palette-cycling talk (unequal ramp lengths).
- Colours measured from tutorial GIFs (fire ramp, bolt cyan); values marked "derived" are ours.
