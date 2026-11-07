# Jump, fall and land

A jump is a position curve plus three squashes. Without the curve the character floats; without the squashes there
is no weight; without a fall pose the player cannot read which way they are moving. The poses below are 16 px side
views facing right; mirror for left. Easing and frame-rate vocabulary: `craft/40-timing-and-spacing.md`.

## Rules

1. **Choose the mode first.** *Gameplay*: the engine owns the arc, the sprite is a set of poses picked by vertical
   speed (up, invert, fall) plus a landing one-shot. *Timed strip* (enemy, cutscene, fighter): you draw every frame.
   Never play a gameplay air phase by time; it desyncs from the physics.
2. **Space the arc by gravity: widest at launch and landing, tightest at the apex.** For apex height H and 8 air frames
   the heights are 0, ½, ⅘, 1, 1, ⅘, ½, 0 × H (derived from a parabola; 12 px → 0, 6, 10, 12, 12, 10, 6, 0). On the
   way down gaps grow as odd numbers, 1 : 3 : 5. Hold the apex frame 1.5–2× the others. Conflict resolved: one web
   note says to cluster drawings at take-off; the animation books and physics put the dense spacing at the apex.
3. **Anticipation is a crouch, and it costs input lag.** Player jump: no crouch, rise on the next frame. Fighters keep a
   3–5 frame pre-jump (50–83 ms at 60 Hz) because it is game data; enemies, bosses, cutscenes get 2 frames at 100–120 ms.
4. **Put the squash on the landing, not on the launch.** Landing = the crouch drawing, held 1–2 frames, 60–120 ms.
   Equal depth is the default; go 1 row deeper after a fall longer than ~1.5× the jump height. Scale the squash by
   fall speed, not by material height (a 1.6 × 0.4 cap in one shipped game).
5. **Contact before squash; keep one toe down at launch.** Bounce: contact frame (normal shape, just touching), then
   squash for one frame (a second squash frame makes it a frog hop), then stretch away. Jump: the rear toe is still on
   the ground in the launch drawing; leaving takes no extra contact frame. The foot never teleports.
6. **Keep the ground pivot fixed.** The foot contact pixel sits on one canvas coordinate on every ground frame
   (registration cross, `translate` for offsets). The hitbox is fixed across frames and never larger than the sprite.
7. **Stretch where it is fast, squash where it stops.** Launch and the last fall frame stretch along the motion; the
   apex is the rest shape; contact squashes. Area stays constant ±2 %: width ×1.25 → height ×0.8. Hard things barely
   squash (steel ball: tiny bounce, then roll); jelly squashes 2 : ½.
8. **Floating is cured by action inside the action.** The air phase needs at least two sub-motions: arms 1 frame
   late, back leg 1 frame behind, hair or cape trailing up on the fall. A rigid pose slid along the arc floats.
9. **Give up and down different poses.** One rising pose, one falling pose, a 1-frame bridge at the sign change
   (the apex). The viewer reads vertical speed from the pose alone: rising = limbs trailing, falling = arms up, legs
   reaching, head level. Add a forward variant when horizontal speed > 0.
10. **Light falls slow, heavy falls fast.** Cloth, feathers, leaves: 6–10 frames of easing with ±1–2 px sway. Heavy: 2–3
    frames of acceleration, then terminal speed (constant spacing) and a hard stop with 1 bounce frame. Past
    ~½ sprite height of travel per frame (derived) add a stretch frame or trail; fast motion otherwise vanishes.
11. **The landing is interruptible.** 2–3 frames, cancelled by input or a new state. Dust at take-off and at any landing
    from a fall ≥ half terminal speed: 4 frames, 60 ms, on its own layer.
12. **Flips:** tuck to a ball of ~55–60 % standing height, rotate 90–120° per frame, 6–8 frames at 80 ms (derived).

## By size

| Px | Poses | Crouch / land | Stretch | Apex rise (typ., derived) | Frames in air |
|----|-------|---------------|---------|------------------|---------------|
| 8 | rest, squash, stretch | squash 1 px lower, 2 px wider | 2 px taller, 1–2 px thinner | 6–8 | 2–3, hold the apex |
| 16 | 5 (above) | head 3 rows lower (13 vs 16) | +2 rows | 8–12 | 4–6 |
| 32 | 6–8 | head −9…−12 px, thighs near horizontal | line toe to hand ≈ 36 px | +10…+14 px for a standing jump | 6–8 |
| 64 | 8–12 + smear | knees ~110°, torso 45° forward | +2…+4 px, smear 1 frame | 20–30 | 8–10 |

Timed 8-frame strip, 32 px, mixed timing (derived from the plates of a standing broad jump; head dy in px, + is up):

| # | Pose | Head dy | ms |
|---|------|---------|----|
| 1 | stand, arms up | 0 | 120 |
| 2 | dip, arms swinging back | −3 | 80 |
| 3 | crouch, torso 45° | −9 | 100 |
| 4 | push, arms forward | −4 | 60 |
| 5 | take-off line, toes on ground | +2 | 60 |
| 6 | apex, knees tucking | +10 | 80 |
| 7 | descent, legs forward | +6 | 60 |
| 8 | landing crouch (= 3) | −9 | 140 |

Then 2 rise frames back to stand, 120 ms each. Cartoon strip: crouch 2 @ 100–120, launch 1 @ 60–80, rise 2 @ 80,
apex 1–2 @ 100–120, fall 2 @ 80, land 1–2 @ 100–120, recover 2 @ 80–100 (≈ 1.0–1.2 s).

Shipped: Celeste's Madeline has jumpSlow 4, jumpFast 4, fall 8, fallSlow 2, fallFast 2, bigFall 11 and a 19-frame
recovery; squash is code (jump 0.6 × 1.4, landing up to 1.6 × 0.4, back to 1.0 in ~0.23 s), dust only on hard landings.
An 8×16 run-and-gun hero: up pose, down pose, landing = crouch at 60 ms, no anticipation.

## Templates

Heights below count fill rows, outline excluded; light upper-left, far limbs darker.

**1 · Crouch (anticipation).** Side view, facing right, 13 rows tall against 16 standing. Hips back and low, thigh forward, shin short, torso leaning, arm swung back (opposite to travel). Enemies and cutscenes only; a player sprite skips it.

```grid jump-16-crouch
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
C = cloth-mid      #4a86c8
c = cloth-shadow   #2f5a96
A = cloth-light    #7db4e6
a = sleeve-shadow  #2f5a96
P = pants          #5a4a7a
p = pants-shadow   #3e3358
B = boots          #5b3a29
b = boots-shadow   #3b2519
H = hair           #6b3a2a
---
.......OOO..
......OHHHO.
.....OHHHHSO
.....OHHSOSO
....OOOHSSSO
...OCCCOsSO.
...OCAAaOO..
.OOAAAAaO...
OSSSAaOOO...
OSSCcPPpO...
OccccPPpO...
.OOPPPpO....
..OPPOOO....
.OBBBBObO...
..OOOOOO....
```

**2 · Launch (stretch).** 18 rows: one diagonal line from toe to fingertip, arm up and forward, rear toe still on the ground. One frame, 60–80 ms, or a single smear-stretch frame at speed.

```grid jump-16-launch
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
C = cloth-mid      #4a86c8
c = cloth-shadow   #2f5a96
A = cloth-light    #7db4e6
a = sleeve-shadow  #2f5a96
P = pants          #5a4a7a
p = pants-shadow   #3e3358
B = boots          #5b3a29
b = boots-shadow   #3b2519
H = hair           #6b3a2a
---
........OOO....
.......OHHHO...
......OHHHHSOO.
......OHHSOSSSO
......OOHSAASSO
.....OCCAASSOOO
....OCCAAAaOssO
....OCCAAOOOOO.
...OCCCcOO.....
..OCCCcOppO....
..OccccOppO....
...OPPOpppO....
..OPPpOppO.....
..OPPOOppO.....
.OPPpObbOO.....
.OPPO.OObbO....
OBOO....OO.....
.OBBO..........
..OOBO.........
....O..........
```

**3 · Apex (tuck).** Knees up, arms out, the least vertical travel. Back arm and front arm differ (no twins). Doubles as the invert/bridge pose when vertical speed changes sign.

```grid jump-16-apex
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
C = cloth-mid      #4a86c8
c = cloth-shadow   #2f5a96
A = cloth-light    #7db4e6
a = sleeve-shadow  #2f5a96
P = pants          #5a4a7a
p = pants-shadow   #3e3358
B = boots          #5b3a29
b = boots-shadow   #3b2519
H = hair           #6b3a2a
---
......OOO.....
.....OHHHO....
....OHHHHSO...
....OHHSOSO...
....OOHSSSO...
...OCCOsSO....
...OCAAaOOOOO.
.OOAAAAaOaassO
OSSSAaCcassssO
OSSCCCcpOpOOO.
.OOccccPpOO...
...OOOOPPOO...
.....OPPpOO...
.....OPPOpO...
.....OPPObbO..
....OBBBBOO...
.....OOOO.....
```

**4 · Fall.** Arms up, legs reaching for the ground, head still level. Cloth and hair would flap upward here. Loopable while the player is airborne.

```grid jump-16-fall
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
C = cloth-mid      #4a86c8
c = cloth-shadow   #2f5a96
A = cloth-light    #7db4e6
a = sleeve-shadow  #2f5a96
P = pants          #5a4a7a
p = pants-shadow   #3e3358
B = boots          #5b3a29
b = boots-shadow   #3b2519
H = hair           #6b3a2a
---
...OOOO....
..OHHSSO...
.OHHHSSOOO.
.OHHSSAOssO
.OOHASaOssO
OCCOAAOsOO.
OCCAAaOO...
OCCAAOO....
OCCCcO.....
OCCCcpO....
OccccPpO...
.OOOOPPO...
..OpOPPpO..
..OppOPPO..
.ObOOOPPO..
..ObOBBOO..
...OOOOBBO.
.....O.OO..
```

**5 · Land (squash).** 12 rows: the crouch with the arms thrown forward, held 1–2 frames. Reuse the crouch drawing, 1 row deeper only after a long fall.

```grid jump-16-land
O = outline        #2b1d2e
S = skin-light     #f2b48a
s = skin-shadow    #c47a5a
C = cloth-mid      #4a86c8
c = cloth-shadow   #2f5a96
A = cloth-light    #7db4e6
a = sleeve-shadow  #2f5a96
P = pants          #5a4a7a
p = pants-shadow   #3e3358
B = boots          #5b3a29
b = boots-shadow   #3b2519
H = hair           #6b3a2a
---
......OOO....
.....OHHHO...
....OHHHHSO..
....OHHSOSO..
....OOHSSSO..
...OCCOsSO...
..OCCAAaOOOO.
..OCCAAAAaSSO
.OCCCcOASSSSO
OCCCcPPpOOOOO
OccccPPpOOOO.
.OOPPpOO.....
.OBBBBObO....
..OOOOOO.....
```

**8 px stretch.** 7×9 (≈ 51 px against 48 for the resting slime, same mass). Rest is `idle-8-slime-a`, squash is `idle-8-slime-b` in `craft/41-idle-and-breathing.md`: rest → squash → stretch → rest → squash on landing.

```grid jump-8-slime-stretch
O = outline     #2b1d2e
G = body-light  #b9f0a0
F = body-mid    #6fcf6f
N = body-shadow #2f8f5a
---
..OOO..
.OGGFO.
OGFFFFO
OFOFOFO
OFFFFFO
OFFFFFO
ONNNNNO
.ONNNO.
..OOO..
```

**Spacing chart.** One column per frame, rows = height above ground (12 px jump): gaps 6, 4, 2, 0, −2, −4, −6. Tightest at the apex, widest at launch and landing. Scale by the fractions in rule 2.

```grid jump-arc-8f
# = height-mark #e8453c
= = ground      #3a3a4a
---
...##...
........
..#..#..
........
........
........
.#....#.
........
........
........
........
........
#......#
========
```

## Procedure

1. `getContext`; decide gameplay or timed strip. Keep the foot pixel on one x,y. Draw rest, crouch, launch, apex, fall,
   land with `applyBatch` `grid`, one frame each. `render`: all silhouettes must differ filled solid (`craft/03-silhouette-and-form.md`).
2. Timed strip: lay out heights with the rule 2 fractions; `translate` `dy` per frame. Keep `tweenCels` for secondary
   parts only: whole-pixel rounding stutters a small arc.
3. Squash/stretch: edit the drawing; `readPixels` `mode:"diff"` against rest for pixel counts. `render` `onionSkin` on the body
   layer: ghost gaps must show 6 – 4 – 2 – 0 – 2 – 4 – 6, not even steps.
4. `setFrameDuration` `durations` for the strip; `addTag` one tag per state: `jump-up`, `fall`, `land` (the land
   tag plays once). `render` `filmstrip`, then `validate` with `checks: ["animation"]`.

## Mistakes

- **Floaty** → even spacing, no apex hold, rigid pose. Use the 6-4-2-0 gaps and add two sub-motions.
- **Lands without weight / frog hop** → no squash, squash on the way up, or two squash frames. One drawing, on contact.
- **Late control** → anticipation on a player jump. Cut the crouch or shorten it to one frame (≤ 50 ms).
- **Teleporting foot** → launch frame has both toes off the ground. Keep the rear toe down.
- **Growing body** → stretch and squash do not conserve area. Count pixels.
- **Reads as standing** → up and down use the same pose. Different poses, plus a bridge.

## Review

- Foot pivot identical on every ground frame; pixel count within ±2 % of rest on every frame.
- Heights follow ½, ⅘, 1, 1, ⅘, ½ (or a deliberate variant); the apex frame is held longest.
- Rising, apex and falling poses differ as flat silhouettes; landing squash is 1–2 frames; a player jump has no crouch
  before take-off (or ≤ 1 frame), an enemy jump has one.

## Sources

- Williams, *The Animator's Survival Kit* (skips, hops, jumps; weight in a jump; bounce contact fix); Blair, *Advanced
  Animation* ch. 1; Thomas & Johnston, *The Illusion of Life*; Muybridge, *The Human Figure in Motion* (broad jump,
  high jumps, somersault); Hultgren, *Animal Drawing* (horse leap); Silber, *Pixel Art for Game Developers* ch. 8.
- Saint11 *Jump*, *WallSlide*, *Squash*; Slynyrd, Pixelblogs 60 and 64; Celeste `Player.cs` and frame folders; SF3 frame data.
