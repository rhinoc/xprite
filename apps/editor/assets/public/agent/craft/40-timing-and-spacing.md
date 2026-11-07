# Timing and spacing

A sprite has 4–12 drawings, so *when* each one shows and *how far apart* they sit does more than any single drawing.
Equal durations and even spacing read as a slideshow of good poses; the same poses with held extremes and eased gaps
read as weight. This file maps the twelve principles onto pixels and milliseconds and holds the shared tables.
Cycles live in `craft/42-walk-and-run.md`, `craft/41-idle-and-breathing.md`, `craft/43-jump-fall-land.md`.

## Rules

1. **Timing is when, spacing is how far.** Fix the beat first ("impact lands on frame 4 of 8"), then choose per-frame
   offsets. Offsets MUST sum to the travel distance. Spacing is the rarer skill; test it with a plain dot before drawing.
2. **Author on a tick ladder.** Williams' film rate gives ones 42 ms, twos 83, threes 125, fours 167; a 60 Hz game
   gives multiples of 16.7 (33, 50, 67, 83, 100, 117, 133, 167). Pick one base tick per animation and use multiples.
   Default sprite rate: 100 ms (twos). Use 42–50 ms only for a smear, impact or snap frame.
3. **Ease with spacing, not with frame count.** Gaps close to the key pose, wide in the middle. 6 frames over 12 px:
   1,2,3,3,2,1 (in and out); ease-out leaves fast and cushions in (33 / 25 / 17 / 12 / 8 / 4 % of travel, as in the ladder). Linear spacing
   is for machines. Below 1 px a gap is a hold or a sub-pixel (`craft/46-subpixel-animation.md`).
4. **Weight lives in holds and recovery.** Shape: long start, very short action, medium settle (150 / 40 / 40 / 170 /
   75 ms in a shipped heavy swing). A heavy hit is heavy because recovery is long, not because windup is.
5. **A pose meant to be read stays ≥ 83 ms.** Two frames at 60 Hz (33 ms) is invisible (derived); an accent needs ≥ 2
   film frames (83 ms) and a read-hold ≥ 4 (≈ 170 ms). A smear, snap or "pop" frame (42–50 ms, one drawing) is subliminal on purpose.
6. **Anticipation budget.** Player-controlled actions: none, or one frame ≤ 50 ms in the opposite direction;
   any extra is input lag. Enemies, bosses, cutscenes and fighters' attacks: 2–3 frames at 100–125 ms, pulling 2–4 px
   opposite. Conflict resolved: books preach anticipation, game tutorials forbid it for the player; both are right per actor.
7. **Frames between keys are personality.** Same two poses: 0–1 in-betweens = violent snap; 2–4 sharp, alert; 5–8
   casual; 9+ slow, heavy. Change the count, not the art, to change the mood.
8. **Mass is constant under squash and stretch.** Widen by N, lower by about N. Rigid things do not deform (a coin with
   good spacing already reads). One squash drawing at contact; a second makes a frog hop.
9. **Arcs, not lines.** Plot head, hand and weapon tip as dots on a guide layer; each frame's pivot sits on the curve.
   Three collinear frames only where intended (short, fast, powerful moves).
10. **Leader first, followers late.** Hair, cape, tail, weapon tip trail 1–2 frames and decay 3 → 2 → 1 → 0 px; a
    1 px overshoot is "felt" even when unseen (`craft/45-secondary-motion.md`).
11. **Cut the in-between to hit harder.** Skip the frame where fist meets face: show the fist past the target and the
    target displaced 2–4 px, held 2–3 frames. Fewer drawings over the same distance feel faster than eight.
12. **Ones for accents, twos for everything else.** Character and scrolling background share one rate, or the
    mismatch strobes. Never time one object on two clocks unless it is a deliberate smear.
13. **Minimum frame counts.** 2 frames = flicker, no arc; 3 = A, breakdown, B; 3–4 frame loops may reuse a frame
    (1-2-3-2). A wheel needs ≥ 3 positions to rotate. Adjacent keys in a fast cycle differ by ≥ 3 px in silhouette,
    or the eye strobes.
14. **Vary at least two durations in any loop of 4+ frames** (`validate` flags uniform timing). Offset loop lengths
    of parts (feet 8, arms 16, hair 12) so a cycle does not look like one.
15. **Held longer than ~1 s, something must drift** (moving hold: a second drawing pushed 1 px past the first,
    blink or sway).

### The twelve principles at sprite scale

| Principle | Pixel rule |
|-----------|-----------|
| Squash & stretch | area ±5 %; 8×8 ball ↔ 10×6 / 6×10; ≤ 16 px: 1–2 px; 32: 2–3; 64: 2–4; stretch is also the cheap smoother for fast moves |
| Anticipation | opposite move 2–4 px; 0–1 frame for player, 2–3 for enemies; 1-frame 42 ms "invisible" snap before fast actions |
| Staging | one idea per frame; the acting limb in the clear of the body; flat-fill silhouette test per pose (`craft/03-silhouette-and-form.md`) |
| Straight ahead / pose to pose | keys at final quality first, breakdowns, fills; straight ahead only for flame, cloth, particles |
| Follow-through & overlap | leader first; followers 1–2 frames late; settle in 2–4 frames |
| Slow in / slow out | gaps 1,2,3,3,2,1; or keep the extremes and cut the middle drawing |
| Arcs | guide-layer dots; weapon sweep on a circle, not a line |
| Secondary action | own layer, subordinate; face change only in a still moment (≥ 3–4 frames) |
| Timing | frames-between-keys scale (rule 7); hold lengths 42–400 ms |
| Exaggeration | draw keys at ~150 % of what feels right; 1× viewing eats subtlety |
| Solid drawing | volume constant; no twins (arms and legs differ by ≥ 1 px or angle); weight shows on the down pose |
| Appeal | big readable shapes, one read per frame, simple attitude over interior detail |

## By size

| Px | Idle | Walk | Run | Attack | Squash | Smear |
|----|------|------|-----|--------|--------|-------|
| 8 | 2 | 2–4 | 2–4 | 2-frame thrust, 50 ms | ≤ 1 px | baked in colour |
| 16 | 2 | 4 (A, stand, B, stand) | 4–6 | 3–4 + 1–2 recover | 1 px | 1 frame, 3–6 px fan |
| 32 | 4–8 | 6–8 | 6–8 | 3–4 + 3 recover @ 100 ms | 2–3 px | 3–6 px fan, 2 brightest colours |
| 64 | 8 | 8–12 | 8–12 | 5–7 | 2–4 px | required |

At 8–16 px use hold lengths (80 / 80 / 120 / 80) instead of more drawings; 8 walk frames cannot be told apart at 16 px.

Tempo (Williams, frames per step at 24 fps → ms): 4 → 167 very fast run; 6 → 250 run; 8 → 333 cartoon walk / slow run;
12 → 500 brisk walk; 16 → 667 stroll; 20 → 833 tired; 24 → 1000 slow; 32 → 1333 very slow. At twos halve the drawing
count. Cadence per sprite frame: `craft/42-walk-and-run.md`.

### Shipped numbers (frames × ms)

| Item | Frames × ms | Note |
|------|-------------|------|
| Shovel Knight NPC idle | 2 × 350 | ≤ 5 colours |
| Stardew walk / run | 4 × 200 / 8: 90,60,120,60 ×2 | run cycle 660 ms |
| Pokémon gen 3 walk / run | 4 × 133 / 5,3,5,3 ticks (267 ms) | one cycle sped up |
| Owlboy Otus / Alphonse run | 8 × 100 / 6 × 100 | heavy body: fewer, bigger frames |
| Saint11 walk / run / jump | 12 × 100 / 8 × 80 / 24 × 80 | effects 60–80, slow loops 100–140 |
| Run-and-gun hero (8×16) | idle, walk 120; run, shoot, land, dust 60 | |
| Hero run, 6 frames | 100,150,100,100,150,100 | long frames on contacts |
| Mech walk, 12 frames | 100 each; dash 4 × 50 | slow = heavy |
| Stardew melee / heavy swing | 55,45,25,25,25,+var / 150,40,40,170,75 | |
| Jab / cross (side view) | 50,100,50,50,50 / 50,50,50,100,100,50,50 | smear 50, hit 100 |
| Street Fighter III Ryu, 60 Hz frames | 3/2/5, 5/3/10, 4/3/17 | startup / active / recovery |
| Celeste freeze on hit | 3 / 6 / 9 frames = 50 / 100 / 150 ms | shipped 100, cut to 50 |

## Templates

Spacing charts are marks on a grid, one per drawing; the balls are the 8×8 reference for rule 8.

**Ball at rest, 8×8** (52 px). The reference mass for the two deformations below and the apex shape.

```grid timing-ball-8-rest
O = outline #2b1d2e
H = light   #ffd6a5
F = mid     #e8743b
D = shadow  #a63d2f
---
..OOOO..
.OHHFFO.
OHHFFFFO
OHFFFFDO
OFFFFFDO
OFFFFDDO
.ODDDDO.
..OOOO..
```

**Squash, 10×6** (48 px). Contact frame only, one drawing. Wider by 2, lower by 2: area held within ~8 %.

```grid timing-ball-10-squash
O = outline #2b1d2e
H = light   #ffd6a5
F = mid     #e8743b
D = shadow  #a63d2f
---
..OOOOOO..
.OHHFFFFO.
OHHFFFFFDO
OFFFFFFDDO
.ODDDDDDO.
..OOOOOO..
```

**Stretch, 6×10** (56 px). Fast part of the path, along the motion; the last fall frame and the first rise frame.

```grid timing-ball-6-stretch
O = outline #2b1d2e
H = light   #ffd6a5
F = mid     #e8743b
D = shadow  #a63d2f
---
.OOOO.
OHHFFO
OHFFFO
OHFFFO
OFFFFO
OFFFDO
OFFFDO
OFFDDO
ODDDDO
.OOOO.
```

**Spacing ladder.** One 24 px move in 6 steps (7 marks), one mark per drawing. Linear gaps 4,4,4,4,4,4; ease in and out 2,4,6,6,4,2; ease out 8,6,4,3,2,1. Same frame count, three different actions. Offsets always sum to the travel.

```grid timing-spacing-ladder
a = linear      #e8453c
b = ease-in-out #3b82e8
c = ease-out    #3fae5a
---
a...a...a...a...a...a...a
a...a...a...a...a...a...a
.........................
b.b...b.....b.....b...b.b
b.b...b.....b.....b...b.b
.........................
c.......c.....c...c..c.cc
c.......c.....c...c..c.cc
```

**Bounce arc.** Heights above the floor per drawing for a 12 px drop: 12, 11, 9, 5, 0 (contact, `x`), 5, 9, 11, 12. Drawings bunch at the top and spread near the floor; the contact is one drawing with the squash ball above.

```grid timing-bounce-arc
# = height-mark  #e8453c
x = contact      #3b82e8
= = ground       #3a3a4a
---
#.......#
.#.....#.
.........
..#...#..
.........
.........
.........
...#.#...
.........
.........
.........
.........
....x....
=========
```

**Overshoot and settle.** Position per frame toward a target of 12: 0, 6, 10, 12, **14**, 13, 12, 12. Gaps 6,4,2 then a 2 px overshoot and two 1 px settles. Use for a hit pose, a weapon stop, a recoil.

```grid timing-overshoot-settle
# = position #e8453c
- = target   #3fae5a
---
....#...
.....#..
---#--##
........
..#.....
........
........
........
.#......
........
........
........
........
........
#.......
```

## Procedure

1. Choose the tick and budget from the tables above; write the beat ("windup 2, strike 1, hold 2, recover 3").
2. Block the keys only: `addFrame` ops, `applyBatch` `grid` per key. `render` `filmstrip`: the story must read from
   the keys alone, and each pose must pass the flat-fill test.
3. Place offsets from a spacing ladder: `translate` `dx`/`dy` per frame. Use `tweenCels` with `inOut` /
   `out` only for secondary parts; whole-pixel rounding stutters a small primary move.
4. Add breakdowns, then followers on their own layers (`craft/06-layers-and-rigging.md`). `render` `onionSkin` on the moving part's
   `layerId`: ghost gaps must match the chart.
5. `setFrameDuration` `durations` in timeline order. Long on extremes and contacts, short on the action.
6. `addTag` per cycle. `render` `filmstrip`; `validate` with `checks: ["animation"]` for uniform timing and
   volume drift.

## Mistakes

- **Slideshow** → even spacing and equal durations. Add holds and ease.
- **Sluggish mush** → in-betweens on every gap. Keep the extremes, delete the middle drawing.
- **Floaty** → no hold on the apex or impact, no overshoot. Hold the extreme; add one settle frame.
- **Strobe / jitter** → two clocks on one object, or near-identical adjacent silhouettes. One tick; differ ≥ 3 px.
- **Laggy controls** → anticipation on a player action. Zero or one 50 ms frame.
- **Smear lingers** → blur held ≥ 3 ticks. One frame, 42–50 ms.
- **Cycle looks like a cycle** → all parts share one period. Offset the secondary loops.
- **Mushy hit** → contact frame drawn. Skip it; show the displaced target.

## Review

- Every duration is on the ladder; any loop of 4+ frames has ≥ 2 distinct durations.
- Offsets sum to the travel; gaps match an ease pattern, not a ruler.
- Player actions have ≤ 1 anticipation frame; enemy telegraphs have 2–3.
- Squash conserves area; contact squash is one drawing; smear is one frame.
- `render` `filmstrip` and `onionSkin` read the same weight and speed as the intent.

## Sources

- Thomas & Johnston, *The Illusion of Life*, ch. on the basic principles (squash and stretch, timing, arcs, moving hold,
  slow in/out); Williams, *The Animator's Survival Kit*, timing and spacing, charts, ones and twos, accents, tempo table.
- Blair, *Advanced Animation*, ch. 1 (bouncing-ball chart, strobing); Pixel Logic (Michael Azzi), ch. 9 (frame-time
  tables, ease, overshoot, smears, limited frames); Silber, *Pixel Art for Game Developers*, ch. 8; Dawe, *Make Your Own Pixel Art*.
- Slynyrd Pixelblogs 8, 9, 53, 59, 60; Saint11 tutorials *Easings*, *Impact*, *Squash*, *loop*; Stardew Valley modding
  wiki (farmer sprite); pokeemerald source; Owlboy and Shovel Knight GIFs; Celeste `Player.cs` and freeze-frame wiki; SF3 frame data.
