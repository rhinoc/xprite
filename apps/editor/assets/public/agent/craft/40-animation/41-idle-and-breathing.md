# Idle and breathing

An idle frame held still reads as a corpse; an idle drawn by shifting the whole sprite 1 px reads as a lift. What
sells "alive" is small, lagging, feet-planted motion that loops without a seam and never changes the character's
size. This file is the recipe, with the frames to copy. Timing vocabulary lives in `craft/40-animation/40-timing-and-spacing.md`.

## Rules

1. **No sprite sits identical for more than ~1 s.** Animators cap a held drawing near 2 s and add a drift, blink or
   sway well before that; 1 s is the safe sprite figure (derived). Exceptions: a 16 px RPG walker shares its 2-frame
   walk as idle, and 8 px items may be 2 drawings at most.
2. **The minimum idle is two poses with the feet planted.** Upper body 1 px down, arms and knees give a little, mass
   unchanged. The ground contact never moves, or the sprite skates.
3. **Move chunks in order, not the whole sprite.** Torso first, arms and hands 1 frame later, head last or not at
   all on some steps. Extremities travel 2–4× the core (core 1 px, fists 2–4 px at 92 px tall). A uniform 1 px
   bob across 3 frames is the textbook stiff version.
4. **Silhouette moves first, contents follow.** Shift the outline, then face and shading pixels a frame later.
   Vertical-only motion is dull: add a 1 px horizontal drift on a secondary part (hair, hand, cloth).
5. **Mass is constant.** Opaque pixel count may vary ±2 % between frames. When the body drops, shorten the legs or
   widen a soft body; never let the character grow. `validate` checks volume drift.
6. **Time it by holds, not by frame count.** Hold the two extremes about twice as long as the transitions; the
   breath slows at the top like a jump apex. Fast-down/slow-up is a bounce or a ready stance; slow-in/fast-out is
   calming down; fast-in/slow-out is out of breath. Equal durations are the metronome (`craft/00-core/00-core-principles.md`).
7. **Pick the frame count by size and scope.** 2 / 4 / 6 / 8 is the ladder: 2 = minimum, 4 = life, 6 = arms move,
   8 = hair and accessories. Keep the ladder step identical for the whole cast.
8. **A 16 px top-down walker needs no breath; a 16 px front or side action sprite gets the 2-frame version; ≥ 32 px
   always breathes.** 1 px is ~6 % of a 16 px body (a hop) and ~1 % of a 100 px one (a breath). A big sprite that holds
   still is noticed. Tiny action sprites may use a personality idle instead (foot tap, sword spin).
9. **Stance is the personality.** Choose the rest pose from the role (boxer guard, karate low stance, slump, weight
   on one leg) before animating. It must pass the silhouette test (`craft/00-core/03-silhouette-and-form.md`).
10. **Weight shift is the best standing idle.** Weight moves foot to foot; the head lags the hips by about 2 sprite
    frames; a slow blink rides on it. One shift is ~1–1.3 s. Alternate it with plain breaths.
11. **Blink on a different clock than the breath.** One blink every 2–4 s, 1–3 frames (half, closed, half at ≥ 32 px;
    one eye-row change at 16 px). Build a long loop (breath 4 frames ×2, blink in only one half) so they never lock.
    Fidgets (look round, scratch, yawn, stretch) are separate tagged one-shots on a 4–10 breath timer.
12. **Secondary parts lag and overshoot.** Hair, cape, tail, weapon tip: 1–2 frames behind, 1–4 px overshoot,
    settle over 2–3 frames (`craft/40-animation/45-secondary-motion.md`). A loop for the secondary part with a different length
    than the body hides the repeat.
13. **Non-living idles use a clock, not a heartbeat.** Floating things (ghosts, orbs, hover): ±1–2 px sine, period
    8–16 frames, via `tweenCels` with `pingpong`. Flames and foliage: `craft/80-effects-ui/80-vfx-fire-smoke-magic.md`.
14. **Never animate the face in the loop** except the blink: eyes, brows and mouth pixels are identical across
    frames, or the face shimmers. A character that must emote does it in a one-shot.
15. **The loop closes.** The last frame is a plausible predecessor of frame 1; 3 unique drawings + `pingpong` = a
    4-step loop. Do not texture or dither moving areas (inconsistent pixels flash).

**Conflicts.** Most sources animate the whole upper body down 1 px; one animates torso and arms *up* with head and
legs fixed. Both are the same breath seen from different rest poses: choose the rest pose, then move the upper chunk
away from it by 1 px. Idle tempo ranges 100–500 ms/frame across sources: calm characters 300–500, ready stances
100, because a stance is a bounce, a villager is a lung.

## By size

| Px | Frames | Motion | ms per frame |
|----|--------|--------|--------------|
| 8 | 2 | body 1 px or squash 1 px; no separate parts | 300–500 |
| 16 | 2, or 4 with head lag | torso+arms 1 px, legs shorten 1 row, blink = 1 eye row | 150–400 (peaks long) |
| 32 | 4–8 | 1 px torso, 2 px hands, hair/cloth lag 1–2 frames (`idle-32-hero-keys`) | 100–125 (hold peaks) |
| 64+ | 8 | 1–2 px core, 2–4 px fists, head holds on some steps, sub-pixel shifts (`craft/40-animation/46-subpixel-animation.md`) | 50–125 |

Shipped idles (frames × ms): Shovel Knight NPC 2 × 350, ≤ 5 colours; measured 35 px archer 8 × 125, head dips 1 px
for frames 2–5, bow lags the head 2 frames, hem flares 3–4 px; fighter 48×92, 8 frames, 100 × 4 then 50 × 4 (600 ms
total); 8×16 run-and-gun hero idle 120; top-down hero idle 6 frames 200/200/400/200/200/400; Celeste keeps a short
base idle (9 drawings) plus long rare fidgets (12–24); Pokémon gen 3 front sprites are 2 drawings driven by a timing script (median 72 ticks, 1.2 s).

| Mood | Loop (ms) | Notes |
|------|-----------|-------|
| Calm / villager | 400, 150, 400, 150 (derived) | frames A, M1, B, M2 |
| Ready stance | 100, 100, 100, 100, 50, 50, 50, 50 | 8 frames; down fast, up slow |
| Cute / bouncy | 250, 250 + 1 px squash | 2 frames, `pingpong` |

A 92 px fighter's offsets, step by step (core, hands): F1→2 +1 up, hands +2/+4; F2→3 all +1 (highest); F3→4 core −1,
head holds, hands −2; F4→5 knees out, −1, hands −2/−3; F5→6 −1, hands −2; F6→7 −1 (lowest); F7→8 all +1, head holds.
Head holds on two of the seven steps and the fists travel 2–4× the core: that is what makes the breath look soft.

## Templates

Hero is 14×16 including a 1 px margin: figure 12 px wide, light upper-left, outline is also the eye colour. Feet
stay on row 15 in every frame.

**Frame A — high (rest).** Stand-in for the whole set: head rows 0–5, torso 6–10, legs 11–15. Draw this first; every other frame is an edit of it.

```grid idle-16-hero-a
O = outline      #2b1d2e
H = hair         #6b3a2a
S = skin-light   #f2b48a
T = cloth-mid    #4a86c8
L = cloth-light  #7db4e6
D = cloth-shadow #2f5a96
P = pants        #5a4a7a
K = boots        #5b3a29
---
....OOOOOO....
...OHHHHHHO...
...OHHHHHHO...
...OSOSSOSO...
...OSSSSSSO...
....OSSSSO....
..OTLTTTTTTO..
.OTDLTTTTTDTO.
.OTDTTTTTTDTO.
.OSDDDDDDDDSO.
..OODTTTTDOO..
...OPPOOPPO...
...OPPOOPPO...
...OPPOOPPO...
..OKKKOOKKKO..
..OOOOOOOOOO..
```

**Frame M1 — falling.** Torso, arms and belt drop 1 row, the head holds, a 1-row neck fills the gap, legs lose a pants row so feet stay on row 15. The head lag is the whole trick.

```grid idle-16-hero-m1
O = outline      #2b1d2e
H = hair         #6b3a2a
S = skin-light   #f2b48a
T = cloth-mid    #4a86c8
L = cloth-light  #7db4e6
D = cloth-shadow #2f5a96
P = pants        #5a4a7a
K = boots        #5b3a29
---
....OOOOOO....
...OHHHHHHO...
...OHHHHHHO...
...OSOSSOSO...
...OSSSSSSO...
....OSSSSO....
.....OSSO.....
..OTLTTTTTTO..
.OTDLTTTTTDTO.
.OTDTTTTTTDTO.
.OSDDDDDDDDSO.
..OODTTTTDOO..
...OPPOOPPO...
...OPPOOPPO...
..OKKKOOKKKO..
..OOOOOOOOOO..
```

**Frame B — low.** Head follows the torso down 1 row. Legs stay 1 row shorter (knees bend). Loop A → M1 → B → M2, where M2 = A with the head still on row 1 (chin overlaps the shoulder row) — or tag A, M1, B `pingpong` and skip M2.

```grid idle-16-hero-b
O = outline      #2b1d2e
H = hair         #6b3a2a
S = skin-light   #f2b48a
T = cloth-mid    #4a86c8
L = cloth-light  #7db4e6
D = cloth-shadow #2f5a96
P = pants        #5a4a7a
K = boots        #5b3a29
---
..............
....OOOOOO....
...OHHHHHHO...
...OHHHHHHO...
...OSOSSOSO...
...OSSSSSSO...
....OSSSSO....
..OTLTTTTTTO..
.OTDLTTTTTDTO.
.OTDTTTTTTDTO.
.OSDDDDDDDDSO.
..OODTTTTDOO..
...OPPOOPPO...
...OPPOOPPO...
..OKKKOOKKKO..
..OOOOOOOOOO..
```

**Weight shift.** Torso and head sit 1 px left of the legs, right leg tucked in 1 px: weight lands on the left foot. Hold ~1 s, use once per 4–6 breaths.

```grid idle-16-hero-shift
O = outline      #2b1d2e
H = hair         #6b3a2a
S = skin-light   #f2b48a
T = cloth-mid    #4a86c8
L = cloth-light  #7db4e6
D = cloth-shadow #2f5a96
P = pants        #5a4a7a
K = boots        #5b3a29
---
...OOOOOO.....
..OHHHHHHO....
..OHHHHHHO....
..OSOSSOSO....
..OSSSSSSO....
...OSSSSO.....
.OTLTTTTTTO...
OTDLTTTTTDTO..
OTDTTTTTTDTO..
OSDDDDDDDDSO..
.OODTTTTDOO...
...OPPOPPO....
...OPPOPPO....
...OPPOPPO....
..OKKKOKKKO...
..OOOOOOOOO...
```

**Blink (head only, rows 0–5).** Eye pixels become the skin shadow for one frame (50–100 ms); nothing else in the sprite changes. Paste over frame A's head rows.

```grid idle-16-hero-blink-head
O = outline      #2b1d2e
H = hair         #6b3a2a
S = skin-light   #f2b48a
s = skin-shadow  #c47a5a
---
....OOOOOO....
...OHHHHHHO...
...OHHHHHHO...
...OSsSSsSO...
...OSSSSSSO...
....OSSSSO....
```

**32 px, four frames (side view).** Strip of four 15×33 frames, figure 30 px tall, ground row last: A rest (hip 15,
legs nearly straight), M1 torso falls 1 px while the head holds (the 1 px gap fills with the neck row), B low (hip 14,
knees give, head follows), M2 hip back to 15 with the head still low. Feet, boots and the far leg never move; hands
sway 2–4° out and in, so they travel about 1 px, later than the torso. Opaque pixels 271 / 274 / 267 / 264 (±2.5 %).
Loop A → M1 → B → M2 at 400, 150, 400, 150 ms (mood table), blink from `idle-16-hero-blink-head` redrawn at this size
on a separate clock. `render` `filmstrip`: only the torso, head and hands change.

```grid idle-32-hero-keys
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
C = tunic-light    #d9604a
c = tunic-shadow   #9c3a3c
A = sleeve-light   #e8806a
a = sleeve-shadow  #b24c47
P = pants-light    #4a5b8c
p = pants-shadow   #34405f
B = boot-light     #9a6a3f
b = boot-shadow    #6a4529
H = hair           #7a4a2a
---
............................................................
.....OOOOO..........OOOOO...................................
....OHHHHHO........OHHHHHO.........OOOOO..........OOOOO.....
...OHHHHHHHO......OHHHHHHHO.......OHHHHHO........OHHHHHO....
...OHHHHSSSO......OHHHHSSSO......OHHHHHHHO......OHHHHHHHO...
...OHHHSSOSO......OHHHSSOSO......OHHHHSSSO......OHHHHSSSO...
...OHHHSSSSO......OHHHSSSSO......OHHHSSOSO......OHHHSSOSO...
....OHHSSSSO.......OHHSSSSO......OHHHSSSSO......OHHHSSSSO...
...OOOHSSSsO........OHSSSsO.......OHHSSSSO......OOHHSSSSO...
..OCCCOssOO.......OOOOssOO.......OOOHSSSsO.....OCCOHSSSsO...
..OCCCAOOcO......OCCCCOOcO......OCCCOssOO......OCCCAssOO....
..OCCAAaCcO......OCCCACCcO......OCCCAOOcO......OCCAAaOcO....
..OCCAAaCcO......OCCAAaCcO......OCCAAaCcO......OCCAAaCcO....
...OCAAaCcO......OCCAAaCcO......OCCAAaCcO.......OCAAaCcO....
...OAAaCCcO.......OCAAaCcO.......OCAAaCcO.......OCAAaCcO....
...OASSCCcO.......OAAaCCcO.......OCAAaCcO.......OCASSCcO....
...OASSCCcO.......OASSCCcO.......OCASSCcO.......OCASSCcO....
...OCSSSCcO.......OASSCCcO.......OCASSCcO.......OCCSSCcO....
...OccSSccO.......OCSSCCcO.......OCCSSCcO.......OccSSccO....
....OPSSpOO.......OcSScccOO......OccSSccOO.......OPSSpOO....
....OPSSpOO........OSSPPpOO.......OOSSPpOO.......OPSSpOO....
....OPPPpOpO.......OSSPPpOpO.......OSSPpOpO......OPPPpOpO...
....OPPPpOpO........OPPPPpOpO......OPPPPpOpO.....OPPPpOpO...
....OPPPpOpO.........OPPPpOpO.......OPPPpOpO.....OPPPpOpO...
....OPPpOpO..........OPPPpOO........OPPPpOO......OPPpOpO....
....OPPpOpO.........OPPPpOpO.......OPPPpOpO......OPPpOpO....
....OPPpOpO.........OPPpOppO.......OPPpOppO......OPPpOpO....
...OPPpOpppO.......OPPpOppO.......OPPpOppO......OPPpOpppO...
...OPPpOpppO.......OPPpOppO.......OPPpOppO......OPPpOpppO...
...OPPpOOOpOOO....OPPpOOOpOOO....OPPpOOOpOOO....OPPpOOOpOOO.
...OBBBBBBObbbO...OBBBBBBObbbO...OBBBBBBObbbO...OBBBBBBObbbO
...ObbbbbbObbbO...ObbbbbbObbbO...ObbbbbbObbbO...ObbbbbbObbbO
....OOOOOOOOOO.....OOOOOOOOOO.....OOOOOOOOOO.....OOOOOOOOOO.
```

**8 px, frame A (rest).** 8×7, mass ≈ 50 px. For 8–16 px blobs, creatures and items a 2-frame idle is the whole budget.

```grid idle-8-slime-a
O = outline      #2b1d2e
F = body-mid     #6fcf6f
G = body-light   #b9f0a0
N = body-shadow  #2f8f5a
---
..OOOO..
.OGGFFO.
OGFFFFFO
OFOFFOFO
OFFFFFFO
ONNNNNNO
.OOOOOO.
```

**8 px, frame B (squash).** 10×6: 2 px wider, 1 px lower, bottom row unchanged. Loop A/B with `pingpong`.

```grid idle-8-slime-b
O = outline      #2b1d2e
F = body-mid     #6fcf6f
G = body-light   #b9f0a0
N = body-shadow  #2f8f5a
---
...OOOO...
.OGGFFFFO.
OGFFFFFFFO
OFOFFFFOFO
ONNNNNNNNO
.OOOOOOOO.
```

## Procedure

1. `getContext`, then rig on layers: head, torso+arms, legs (`craft/00-core/06-layers-and-rigging.md`). Legs hold feet static.
2. Draw frame A and run the silhouette test (`craft/00-core/03-silhouette-and-form.md`).
3. `copyFrame` (`linkCels` off) twice. On frame 2 `translate` the torso layer `dy: 1`; on frame 3 also
   the head layer. Redraw the legs 1 row shorter with `applyBatch` `grid`; paint the neck row on frame 2.
4. `readPixels` `mode:"diff"` frame 1 → 2 and 2 → 3: only edge rows and the moved chunk should change. If more than ~50 % of
   the pixels differ you moved too much.
5. `render` `onionSkin` on the torso `layerId`: the ghosts must sit 1 row apart, never 2.
6. `setFrameDuration` `durations` e.g. `[400, 150, 400, 150]` ms. `addTag` `idle`, direction `forward`
   (4 unique) or `pingpong` (3 unique).
7. Add the blink as its own cel range or tag, not inside the breath. `render` `filmstrip`, then `validate` with
   `checks: ["animation"]` and fix volume drift or uniform timing.

## Mistakes

- **Skating feet / sprite slides** → whole sprite shifted. Anchor the foot row; move only chunks above the ankle.
- **Inflating and deflating** → pixel count drifts. Shorten legs on the low frame; diff the counts.
- **Stiff lift** → whole-sprite 1 px bob over 3 frames. Offset parts: hands lag 1 frame, head holds on 1–2 steps.
- **Hole between head and body** → head held, torso dropped. Add a neck row (frame M1), not a new head.
- **Strobing flicker** → amplitude 2 px on a 16 px body, or in-between identical to a key. Back to 1 px.
- **Metronome** → equal durations. Hold the extremes ~2×.
- **Face shimmer** → eyes or highlights redrawn per frame. Copy them from frame A pixel for pixel.
- **Blink locks to breath** → both loop at the same period. Lengthen the loop or move the blink to frame 3 of 8.
- **Loop seam** → last frame is not a predecessor of the first. Reorder or add one hold.

## Review

- Feet on the same rows in every frame; the figure never grows (±2 % pixels).
- Core moves ≤ 1 px at 16–32 px; hands/hair move more, later.
- At least two distinct durations in any loop ≥ 3 frames; extremes held longest.
- Face unchanged except a blink; blink period ≠ breath period.
- `render` `filmstrip` reads as breathing, not as bobbing; the loop point is invisible.

## Sources

- Thomas & Johnston, *The Illusion of Life*, moving hold, ch. on timing and acting; Williams, *The Animator's Survival
  Kit*, ch. on overlapping action (the "hardest thing is nothing" idle) and weight shift.
- Pixel Logic (Michael Azzi), ch. 8 Sub-pixeling (Owlboy idle, soldier A/B/C breathing) and ch. 9 Animation; Silber, *Pixel Art
  for Game Developers*, ch. 8 (two-frame idle).
- Slynyrd (Raymond Schlitter), Pixelblog 8 (idle ladder), 52 (fighting stance offsets, 100/50 ms), 55, 59–60; Saint11, *Character Idle*;
  Imonk, hero idle tutorial; Shovel Knight NPC blog (Yacht Club Games); Tsugumo, *So You Want To Be A Pixel Artist?* chs. 10–11
  (breathing cycle, size scaling); Dawe, *Make Your Own Pixel Art*, ch. on idle exercises.
