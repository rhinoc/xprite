# Impacts and game feel

A hit that is drawn correctly but feels like nothing is a missing-feedback bug: the
pose changes, nothing else does. "Feel" is a small stack — one contrast frame, one
smear, one spark, a freeze, a shake, a push-back — each short, and each tuned to the
size of the event. This file gives the stack, the numbers that shipped games use, and
which parts an agent can draw. Pose timing is in `craft/40-animation/44-attacks-and-impacts.md`,
effect art in `craft/80-effects-ui/80-vfx-fire-smoke-magic.md`.

## Rules

1. **Split the work.** Pixels the agent can draw: contrast frame, white hit-flash frame,
   smear frames, spark/ring frames, debris sprites, overshoot pose. Hitstop, shake,
   knockback, slow-motion and camera are engine-side: write them as a numbers list for
   the user (see Procedure), never fake them with extra sprite frames.
2. **A strike has five beats:** stance → anticipation → smear/strike → follow-through →
   recover, plus a 1-frame overshoot after recovery. The impact is **one frame**; recover
   slowly, impact fast. Player attacks skip anticipation (input lag): the strike pose is
   on frame 2. Enemy attacks keep it — it is the player's warning.
3. **Smear = one frame, 50 ms.** Fill the swept arc with the object's two brightest ramp
   colours, 100 % opaque, no transparency; the blade snaps to the end of its arc in the
   same frame. The next frame shows a thin collapsing remnant. Follow the natural path
   from the start pose to the follow-through pose. Heavy weapons: slower anticipation
   and recovery, but the smear stays 1–2 frames.
4. **Contrast frame first.** One frame in which the target is a flat white or flat dark
   silhouette (`replaceColor` on a copy). It makes the next frame hit harder.
   Pick **one** flash colour for the whole game — white, red or inverse — not per enemy.
5. **Spark at the contact point, aimed along the hit.** 3 frames: compact star → rays
   pulling out → a few dots. Same shape, colour-swapped, for all weapons; vary only size.
6. **Displace the target.** Push it a few pixels along the hit direction on the impact
   frame, then settle back. Hard hits bounce back; soft ones keep going. Mass is conserved
   in squash/stretch: widen means lower, stiff materials deform less.
7. **Hitstop numbers (60 fps).** Light 3 frames (50 ms), strong 6 (100 ms), rare maximum
   9 (150 ms). Both attacker and victim freeze, by the same amount. Celeste shipped
   exactly these and cut one 0.1 s freeze to 0.05 s as "far too long". Fighting games
   use 2–4 for normals. Kills may reach 100–200 ms. *Conflict:* Vlambeer's notes give
   both ~20 ms for an ordinary hit and 100–200 ms for a kill; use 20–50 ms / 100–200 ms
   for shooters and the 3/6/9 table for melee.
8. **Shake is directional, short, and never shakes the HUD.** Light 1 px for ~4 frames;
   heavy 3 px for up to 12 frames with decaying amplitude, along the line of the force
   (Celeste: 0.1–0.2 s). These two amplitudes are *derived*, unverified by a shipped
   source; keep them as defaults, not rules. Offer an off switch.
9. **Dynamic range.** A jab and a crit must not share the same freeze, shake and spark
   size. Save the biggest feedback (freeze + shake + 2× spark) for 1 in ~10 events.
10. **Muzzle flash and impact spark matter more than the bullet.** They tell the player
    where a shot started and ended. Muzzle flash = 4-point star or the bullet's first
    frame as a circle, 1–2 frames. A projectile hit gets its own mini-explosion.
11. **Hit reaction.** First frame is the strongest and throws the body furthest;
    overshoot it, then recover slowly. Death: impact → recover → "give up" (stop midway,
    knees bend, limbs lag) → ground contact → overshoot the ground by 1 px → bounce →
    rest. Small enemies: squish, then a contrast frame, then a burst.
12. **Defend shows the hit connecting with no damage:** bright flash on the shield, a
    small spark, the silhouette barely moves, long recovery.
13. **Telegraph before danger.** A hazard or enemy attack shows a tell 3–6 frames before
    it is lethal (flash, pose change, blink); danger zones are red or light green.
14. **Don't rotate pixel art for speed.** Fake fast spins with a smear or motion lines
    on one frame; at ≤32 px, fewer details on a fast object, stretched along travel.
15. **Sound is engine-side but visual leads it.** The impact flash lands 1–2 frames
    *before* the sound cue (the eye needs the drawing slightly early).
16. **Onomatopoeia is drawn type.** "POW" in 1–2 colours with a dark outline, sized by
    importance, tilted along the motion line, with lines converging on the impact. Use
    the fonts in `craft/80-effects-ui/84-bitmap-fonts.md`; rare, and only in comic-styled games.

## By size

| | 8 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|
| Hit spark | 5-px plus, 2 frames | 5–7 px star, 3 frames | 9 px (templates), 3–4 frames | 13–15 px + ring, 4 frames |
| Smear width | skip; 1 lighter 3–4 px streak | 3–4 px, 2 colours | 5–6 px, 3 tones | 8–10 px, 3 tones + trail |
| Muzzle flash | 3 px | 5 px | 7 px (template) | 11–13 px |
| Knockback | 1 px | 2–3 px | 4–6 px | 8–12 px (derived) |
| Shake (screen) | 1 px | 1–2 px | 2–3 px | 3–4 px |

Hitstop and flash do not scale with size: 3/6/9 frames at every resolution.

Frame budgets from shipped examples: attack = 3 strike + 4 return frames at 100 ms with
a 300 ms idle hold; jab = stance 50, smear 50, hit 100, follow 50, recover 50 ms; sword
= stance 50, anticipation 100, smear 50, hit 100, follow-through 50, recover 50,
overshoot 50 ms. Normals have only 1–4 active frames in fighting games, which is why
each needs a smear.

## Templates

**Hit spark, 3 frames (9×9).** Aim the long axis along the hit direction by mirroring.
Colour-swap for fire (`R/O/Y`) or ice (blues). Frame 3 may hold lone pixels.

```grid impact-spark-1
W = spark-core  #ffffff
Y = spark-tip   #fbf236
---
.........
....Y....
....W....
...WWW...
.YWWWWWY.
...WWW...
....W....
....Y....
.........
```

```grid impact-spark-2
Y = spark-mid   #fbf236
O = spark-tip   #df7126
---
....O....
.O..Y..O.
..Y...Y..
.........
OY.....YO
.........
..Y...Y..
.O..Y..O.
....O....
```

```grid impact-spark-3
R = spark-ember #ac3232
O = spark-tip   #df7126
---
....R....
.........
..O...O..
.........
R.......R
.........
..O...O..
.........
....R....
```

**Muzzle flash (7×7).** 1–2 frames at the barrel tip; swap `Y` for magenta on enemy shots.

```grid impact-muzzle-star
W = flash-core  #ffffff
Y = flash-tip   #fbf236
---
...Y...
...W...
..WWW..
YWWWWWY
..WWW..
...W...
...Y...
```

**Sword smear, 3 frames (18×18).** One crescent (outer radius 9, thickness peaking at 4 px on the
convex edge, tapering to a point at both ends), pivot 3 px left of the canvas; the arc sits right
of the wielder. Dark tail, mid body, white head on the leading end only. Frame 1 is the first
third of the arc, frame 2 two thirds, frame 3 the full crescent; same pivot on every frame, so
the arc grows from the tail. Flip horizontally for a left-facing swing.

```grid impact-smear-1
D = smear-tail  #8b9bb4
L = smear-mid   #c0cbdc
W = smear-head  #ffffff
---
.....DDD..........
......DDL.........
.......DLL........
........LLL.......
........LLLL......
........LLLW......
.........WWW......
..................
..................
..................
..................
..................
..................
..................
..................
..................
..................
..................
```

```grid impact-smear-2
D = smear-tail  #8b9bb4
L = smear-mid   #c0cbdc
W = smear-head  #ffffff
---
.....DDD..........
......DDD.........
.......DDD........
........DDL.......
........LLLL......
........LLLL......
.........LLL......
.........LLL......
.........LLLL.....
.........LLL......
.........WWW......
..........WW......
...........W......
..................
..................
..................
..................
..................
```

```grid impact-smear-3
D = smear-tail  #8b9bb4
L = smear-mid   #c0cbdc
W = smear-head  #ffffff
---
.....DDD..........
......DDD.........
.......DDD........
........DDD.......
........DDDD......
........DDDD......
.........DLL......
.........LLL......
.........LLLL.....
.........LLL......
.........LLL......
........LLLL......
........LLLL......
........LLL.......
.......LLL........
......WWL.........
.....WWW..........
..................
```

## Procedure

1. Read the attack or hit pose frames; do not redraw them. Put effects on their own
   layer(s) so the body art stays untouched.
2. **Contrast frame:** `copyFrame` the impact frame, `replaceColor` to flat
   white (or dark). Keep the silhouette; this is 1 frame at the front of the hit.
3. **Smear:** stamp the right `impact-smear-*` with `applyBatch` `grid` (`transparent: skip`)
   on the strike frame; recolour its three roles to the weapon's two brightest ramp
   colours (`palette` op `get` for indices). Keep the body silhouette stable.
4. **Spark:** stamp `impact-spark-1/2/3` on three consecutive frames at the contact
   point; muzzle star on the first frame of a shot.
5. **Overshoot:** on the recovery frame, `translate` the body 1 px past
   the stance, then the final frame returns to stance (the bounce).
6. `setFrameDuration` `durations`, e.g. `[50, 50, 100, 50, 100]` for contrast/smear/hit/follow/recover.
7. `render` `filmstrip`, then `render` `onionSkin` on smear → hit: the arc must connect
   the weapon's start and end positions.
8. Hand the user the engine-side list: hitstop `N` frames, shake `X` px × `F` frames
   decaying and directional, knockback `K` px, flash colour, sound lead 1–2 frames.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hit feels weightless | No contrast frame, no displacement | Add flat white frame; shift the target 2–4 px |
| Attack feels laggy | Anticipation on the player | Strike pose on frame 2; keep wind-up for enemies only |
| Smear looks like a ghost | Semi-transparent or 3+ frames | Opaque, two colours, one frame |
| Every hit is the same size | No dynamic range | Scale spark, freeze, shake by damage tier |
| Shake hides the HUD | Camera shake moves UI | Shake the world layer only; give an off option |
| Flash colours vary per enemy | Ad hoc palette swaps | One game-wide flash colour |

## Review

- [ ] A hit has a contrast frame, a smear or spark, a displacement and an overshoot.
- [ ] The impact pose lasts exactly one frame; recovery is longer than the strike.
- [ ] Smear is opaque, uses the two brightest ramp colours, spans the arc between poses.
- [ ] Spark colour matches the weapon; size matches the damage tier.
- [ ] The player attack has no anticipation frame; the enemy attack does.
- [ ] The report lists hitstop, shake, knockback and flash colour for the user.

## Sources

- Saint11 tutorials: Impact, Death, Defend, Squash, Easings, Bullets, Hazards, MotionBlur.
- Slynyrd Pixelblog 9 (melee attack timings) and 31 (projectile rules).
- Celeste freeze frames and shake values (public source and developer notes).
- Nijman, "The Art of Screenshake" (Vlambeer); Swink, *Game Feel*; Sakurai on hitstop.
- Thomas & Johnston, *The Illusion of Life*; Williams, *The Animator's Survival Kit* (accents, displacement).
- Wesnoth smear recipe; Silber, *Pixel Art for Game Developers* (cannon blast).
