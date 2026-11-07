# Walk and run

A walk that skips the pass pose reads as sliding; a run with no airborne frame
reads as a fast walk; a cycle whose foot speed does not match the engine's
ground speed skates. Without per-frame numbers an agent draws "legs apart, legs
together" and every character ends up with the same limp. This file gives the
poses, the pixel offsets per frame, the timings and the checks for side-view
humanoids. Quadrupeds are `craft/51-animal-gaits.md`; top-down is
`craft/47-top-down-animation.md`; timing theory is `craft/40-timing-and-spacing.md`.

## Rules

1. **A step is four poses: contact, down, pass, up.** Two steps (near leg, then
   far leg) are one 8-frame cycle. Draw the two contacts and the pass first,
   then down and up, then check the filmstrip. Contact and pass fix stride and
   speed; the rest is built around them (Williams, Blair).
2. **Contact is the widest pose.** Front heel touching with the leg nearly
   straight, back toe still pushing, arms at their widest, the arm opposite each
   leg. Stride (front heel to back toe) is about a third of figure height: 10 px
   at 30 px (Muybridge's frames give 10–12 at 32).
3. **Weight lives on `down`.** The front knee flexes and the hip is at its
   lowest one frame after contact. A walk with no `down` floats. Hold contact
   up to 25 ms longer than the other frames (rule 7 limits how far).
4. **`pass` is the frame people omit.** Support leg straight and vertical, swing
   leg tucked with its foot at the support knee, arms hanging and crossing,
   body at full height. Never replace it with "legs together".
5. **Bob is small.** Total hip travel on a walk: 1 px at 16 px, 2 px at 24–32,
   3 px at 64. Shape it as a triangle (sharp at pass, flat at down), not a
   sine. Decision: sources disagree on which pose is lowest (Williams: `down`;
   Slynyrd: contact; Muybridge: both). Contact drops the hip ~1 px because the
   straight legs are spread (derived), and `down` drops it one more; ship that. Heavy or
   macho walk doubles the bob, a glide or sneak is 0–1 px.
6. **Arms oppose legs.** Near leg forward, near arm back. Walk swing ±25–30°
   with 10–15° elbow bend (hand travel 3–4 px at 30 px); run swing ±50° with a
   90° elbow and closed fists. Arms are widest at contact (Williams says widest
   at `down` in a naturalistic walk; for sprites contact reads better and
   he concedes it).
7. **The foot on the ground goes backwards at engine speed.** The planted
   foot's x-shift per frame ÷ frame time must equal the engine's px/s, or the
   feet skate. Walk table: near foot +5, +3, 0, −3 = 2.5 px per frame (± rounding)
   ≈ 21 px/s at 115–120 ms. Run table: +3, −1, −5 = 4 px per 80 ms = 50 px/s.
   Keep each duration within ±25 ms of the cycle mean so slide stays under half a
   pixel; beyond that, space the foot by milliseconds. Tell the user the speed.
8. **Feet are never level in the air.** Heel strike: toe 1 px above heel.
   Down: flat. Toe-off: heel 2 px up, toe on the ground. Swinging foot: toe down
   just after toe-off, tucked and horizontal at pass, toe up as it reaches.
9. **Walk = one foot always down; run = a flight phase.** Walk double-support is
   ~20 % of the cycle. A run has 25–40 % flight: at least 2 of 8 frames with no
   foot touching, lowest foot ≥ 2 px (table uses 4–5) above the ground line.
   Williams allows 2–3 airborne drawings in a cartoon run and 1 in a
   naturalistic one; ship 2 of 8.
10. **Run contact is under the body.** Foot 1–3 px ahead of the hip with a bent
    knee, not the 5 px reach of a walk. Back foot has already left the ground.
    Lean 10–15° (hip-to-shoulder shifts ~2 px), head 1 px ahead, fists up, hair
    and cloth stream back (`craft/45-secondary-motion.md`). Hip bob is 3–4 px at
    30 px (Williams: never more than half a head).
11. **Frame-count ladder.** 8 frames is the fluid optimum; more is taste. Walk:
    8 → 6 by deleting `up`, → 4 by deleting `down` too (contact, pass ×2).
    Run: 8 → 6 by deleting `down`, → 4 by deleting `flight` too. Keep the
    cycle's contacts; delete the in-betweens first (Slynyrd PB8/PB50).
12. **The loop closes.** Frame 5–8 are frames 1–4 with near and far limbs
    swapped, not flipped; flipping reverses facing and light. Frame 1 must be a
    plausible successor to frame 8, and the head must not drift.
13. **Timing is part of the pose set.** Walk 8 frames: 100–140 ms (cycle 0.8–1 s;
    Muybridge's walker is about 1 s). Run 8 frames: 70–100 ms (cycle 0.55–0.8 s).
    A run cycle is roughly half the duration of a walk with the same frame
    count. One cycle at several speeds is cheaper than new drawings.
14. **Keep volume.** Thigh, shin and arm lengths and thickness are constant in
    every frame; only foreshortening may shorten them. Drift shows as a limb
    "growing" by frame five.
15. **Personality: at most three tweaks** to the base cycle — lean, head delay,
    arm one frame late, wider bob, dragged toe. Change a little, the whole walk
    changes (Williams). Never ship a "silly" walk as the default.

## By size

| Size | Frames (walk / run) | Hip bob walk / run | Stride (± hip) | Arm swing | Notes |
|------|---------------------|--------------------|----------------|-----------|-------|
| 8 px | 2 / 2 | 0 / 1 | legs swap, 1 px | none | alternate which leg is 1 px longer; run = same frames at 60 ms |
| 16 px | 4 / 4–6 | 1 / 1–2 | ±3 | 2 px, no elbow | step, stand, step, stand (Pokémon, Stardew 133–200 ms); heel lift ≤ 1; run = lean + faster timing |
| 24 px | 6–8 / 6–8 | 2 / 2–3 | ±4 | 3 px | `walk-24-keys`, `run-24-keys` |
| 32 px | 6–8 / 6–8 | 2 / 3–4 | ±5 | 3–4 px | `walk-30-keys`, `run-30-keys` |
| 64 px | 8–12 / 8 | 3 / 5–6 | ±10 | 8 px | heel/toe roll visible, hair/cloth lag, sub-pixel for easing (`craft/46-subpixel-animation.md`) |

The 8 and 16 px rows come from shipped 4-step loops and the 1 px bob figures;
24 and 64 px are scaled from the 30 px table (derived).

Pixel budget at 30 px: head 7 (+1 neck), torso 8 (6–7 wide), leg 12 hip to
ankle (thigh 4 px wide, shin 3), arm 5 + 4.5 with a 2 px fist, boot 5×2. At 24 px
thigh 3, shin 2, leg 10. Limbs under 2 px wide flicker in motion.

### 8-frame walk, 30 px figure, facing right

`x` = columns from the hip column (+ forward). `heel↑` = rows between the
ground and the heel. Arm = shoulder swing from vertical (+ forward) / elbow bend.
Frames 5–8 repeat 1–4 with near and far limbs swapped. Standing hip = 15 (the
pass pose); hip dy is measured from it.

| # | Pose | Hip dy | Lean | Near foot (x, heel↑, shape) | Far foot | Near arm | Far arm | ms |
|---|------|--------|------|-----------------------------|----------|----------|---------|----|
| 1 | contact | −1 | 3° | +5, 0, heel strike | −5, 2, toe-off | −34° / 14° | +34° / 14° | 140 |
| 2 | down | −2 | 3° | +3, 0, flat | −3, 3, toe drags | −22° / 12° | +22° / 12° | 100 |
| 3 | pass | 0 | 0° | 0, 0, flat (leg straight) | +1, 4, tucked | 0° / 10° | 0° / 10° | 100 |
| 4 | up | −1 | 2° | −3, 2, toe-off | +4, 3, reaching, toe up | +26° / 14° | −26° / 14° | 120 |
| 5–8 | mirror | | | far-foot values of 1–4 | near-foot values | swapped | swapped | same |

Total 920 ms. Head follows the torso; at ≥ 30 px let the head land one frame
after the hip (hip −2 on `down`, head −1) so it does not bob as a block.

**6-frame walk:** frames 1, 2, 3, 5, 6, 7 at 160 / 120 / 140 ms (840 ms).
**4-frame walk:** frames 1, 3, 5, 7 at 240 / 220 / 240 / 220 ms; the pass frame
carries a 1 px head rise, nothing else. At 16 px this is step–stand–step–stand.

### 8-frame run, 30 px figure, facing right

Lean 12° on every frame. Standing hip = 15; flight reaches 16 because the legs
are fully extended. Arms are bent 90° and closed.

| # | Pose | Hip dy | Near foot | Far foot | Near arm | Far arm | ms |
|---|------|--------|-----------|----------|----------|---------|----|
| 1 | contact | −1 | +3, 0, heel strike, knee bent | −6, 5, trailing | −55° / 95° | +50° / 90° | 80 |
| 2 | down | −2 | −1, 0, flat, knee most bent | −3, 7, heel up, knee swinging | −40° / 90° | +35° / 90° | 80 |
| 3 | push | 0 | −5, 2, toe-off, leg extended | +2, 6, thigh driving, shin folded | −20° / 90° | +20° / 90° | 70 |
| 4 | flight | +1 | −8, 5, trailing, toe down | +1, 5, knee high, shin folded | +40° / 100° | −50° / 90° | 90 |
| 5–8 | mirror | | far-foot values of 1–4 | near-foot values | swapped | swapped | same |

Total 640 ms. Frames 4 and 8 have both feet off the ground; hold them 10–20 ms
longer for hang time. **6-frame run:** frames 1, 3, 4, 5, 7, 8 at 100 / 90 / 110
ms (600 ms). **4-frame jog:** frames 1, 3, 5, 7 at 120 / 100 ms; no flight, so
call it a jog.

## Templates

Each block is a strip of 4 equal-width frames, near leg first; cut at multiples
of the frame width (20, 22, 17 and 19 columns for `walk-30-keys`, `run-30-keys`,
`walk-24-keys`, `run-24-keys`). The ground row is the same in every frame and
every frame shares one rig: thigh 4 / shin 3 wide (24 px: 3 / 2), hip-to-ankle
12 px (24 px: 10), identical in all four poses. Head top drops 2 px from pass
to down; in the walk the boots never leave the last row, in the run only the
flight frame lifts them. Far limbs use the shadow glyphs
and the near leg is outlined against the far one, so the far leg stays distinct
in pass and up.

`walk-30-keys` — contact, down, pass, up at 30 px (20 columns, 33 rows). Start
here for a 3–4 head side-view character; recolour roles, keep the offsets.

```grid walk-30-keys
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
................................................................................
................................................OOOOO...........................
........OOOOO..................................OHHHHHO..............OOOOO.......
.......OHHHHHO..............OOOOO.............OHHHHHHHO............OHHHHHO......
......OHHHHHHHO............OHHHHHO............OHHHHSSSO...........OHHHHHHHO.....
......OHHHHSSSO...........OHHHHHHHO...........OHHHSSOSO...........OHHHHSSSO.....
......OHHHSSOSO...........OHHHHSSSO...........OHHHSSSSO...........OHHHSSOSO.....
......OHHHSSSSO...........OHHHSSOSO............OHHSSSSO...........OHHHSSSSO.....
.......OHHSSSSO...........OHHHSSSSO..........OOOOHSSSsO............OHHSSSSO.....
.....OOOOHSSSsO............OHHSSSSO.........OCCCCOssOO...........OOOOHSSSsO.....
....OCCCCOssOO...........OOOOHSSSsO.........OCCCACOOO...........OCCCCOssOO......
....OCCCACOOO...........OCCCCOssOO..........OCCAAaCcO...........OCCCACOOO.......
....OCCAAaCcO...........OCCCACOOO...........OCCAAaCcO...........OCCAAaCcO.......
....OCAAaCCcO...........OCCAAaCcO............OCAAaCcO...........OCCAAaCcO.......
....OAAaCCCcO...........OCCAAaCcO............OCAAaCcO............OCCAAacO.......
....OSSaCCCcsO...........OAAaCCcO............OCASSCcO...........OaCCCASSO.......
...OASSCCCCcssO..........OAAaCCcO............OCASSCcOO..........OaCCCASSSO......
...OSSSCCCCcsssO........OASSCCCcO............OCCSSCcppO..........OCCCCASSSOO....
...OSSCCCCCcOsssO.......OASSCCCcOO...........OccSSScpppO........OsCCCCCcSSppO...
...OSScccccpOOssO........OSSCCCcpO............OPPSSOppppO.......OccccccpSSSppO..
...OSSOOPPPPpOOO........OSSScccPPpO...........OPPSSpOpppO.......OssOPPPPpSSppO..
....OOOpOPPPpO..........OSSOOPPPPPpO...........OPPPpOppO........OssOOPPPpOppO...
.......OOPPPPpO.........OSSOOOPPPPPpO..........OPPPpOpO..........OO.OPPPPpOpO...
.......OpOPPPpO..........OO.OOOOPPPpO..........OPPPpOO..............OOPPPpOpO...
.....OOpppOPPpO...........OOpppOPPpO...........OPPpOpO.............OPPPPpOpO....
....OpppppOPPpO..........OpppppOPPpO...........OPPpOOOO...........OPPPpOOppOOO..
...OpppppOOPPpO.........OpppppOPPpO............OPPpObbbO.........OPPPpOOpppbbbO.
..OppppOO..OPPpO........ObbpOOOPPpO............OPPpObbbO........OPPpOO.ObbbbbbO.
..ObbOOO....OPPpOOO.....ObbbOOOPPpO............OPPpOOOO.........OBBOOO.ObbbbOO..
..ObbbbbO...OPPBBBBO.....ObbbbOPPpOOO..........OPPpOOO..........ObBBBBO.OOOO....
...ObbbbbO..OBBBbbbO......ObbbOBBBBBBO.........OBBBBBBO..........ObbbBBO........
....OOObbO..ObbbOOO........OObObbbbbbO.........ObbbbbbO...........OOObbO........
.......OO....OOO.............OOOOOOOO...........OOOOOO...............OO.........
```

`run-30-keys` — contact, down, push, flight. Note the lean, the fists and the
two airborne feet in the last frame. Frame width 22, 34 rows; the flight frame
keeps both boots ≥ 2 rows above the ground row.

```grid run-30-keys
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
........................................................................................
.............................................................................OOOOO......
.......................................................OOOOO................OHHHHHO.....
...........OOOOO......................................OHHHHHO..............OHHHHHHHO....
..........OHHHHHO................OOOOO...............OHHHHHHHO.............OHHHHSSSO....
.........OHHHHHHHO..............OHHHHHO..............OHHHHSSSO.............OHHHSSOSO....
.........OHHHHSSSO.............OHHHHHHHO.............OHHHSSOSO.............OHHHSSSSO....
.........OHHHSSOSO.............OHHHHSSSO.............OHHHSSSSO..............OHHSSSSO....
.........OHHHSSSSO.............OHHHSSOSO..............OHHSSSSO............OOOOHSSSsO....
..........OHHSSSSO.............OHHHSSSSO............OOOOHSSSsO...........OCCCCOssOOOO...
........OOOOHSSSsO..............OHHSSSSO...........OCCCCOssOO...........OCCCCACOO.OSSO..
.......OCCCCOssOO.OO..........OOOOHSSSsO..........OCCCCACOO.............OCCCAAacOOSSSO..
......OCCCCACOO..OssO........OCCCCOssOO...........OCCCAAacO.............OCCCCAAaOOSSO...
......OCCCAAacO.OsssO.......OCCCCACOO.............OCCCAAacO.OOO.........OCCCCAAaOSSSO...
......OCAAAaCcaOsssO........OCCCAAacO...OO........OCCAAacaOOsssO.......OaCCCCCAASSSO....
......OSSAaCcaasssO.........OCCAAaCcOOOOssO.......OCCAAacaOssssO........OCCCCCcASSO.....
.....OASSSCCcaassO..........OCCAAacaOsssssO.......OCASSSSOOOsOO.........OCCCCCcOAO......
......OASSSCcOOaO...........OCSSaCcasssssO........OCASSSSSSSpO.........OCCCCCcOppO......
......OCCSSScO.O............OASSSCcassOOO........OCCCACcSSSSppO........OccccccOpppO.....
.....OCCCCSSpO..............OCASSScOaO...........OccccccOpppppO.........OPPPPpOppppO....
.....OccccccPpO............OCCCCSSSOO.............OOPPPPpOpppO..........OPPPpOpppppO....
......OOpOPPPpO............OcccccSSOO...............OPPPpOppO...........OPPPpOppppO.....
........OOPPPPpO............OpOPPPPpO...............OPPPpOpO..........OOOPPPpOpppO......
....OOOOOpOPPPPpO..........OpppOPPPpOO..............OPPPpOpO........OOPPPPPPpOppO.......
...OpppppppOPPPpO..........ObbbOPPPPpOO............OOPPPpOOOO......OPPPPPPPpOpppO.......
..OppppppppOPPpO...........ObbbbOPPPpOO...........OPPPPpObbbbO....OPPPPPpOOOpppOOO......
..ObbppppppOPPpO............OObOPPPpOO...........OPPPpOObbbbbO....OBBPOOO..ObbbbbbO.....
..ObbbOOOOOOPPpO..............OOPPpOO...........OPPPpO.OOOOOO.....ObBBOO...ObbbbbbO.....
...ObbbbO..OPPpO..............OPPpO............OPPpOO..............ObBBBO...OOOOOO......
....ObbbbO.OPPpOOO............OPPpO............OBBOOO...............ObbBBO..............
.....OObbO.OPPBBBBO..........OPPpOOO...........ObBBBBO...............OObbO..............
.......OO..OBBBbbbO..........OBBBBBBO...........ObbbBBO................OO...............
...........ObbbOOO...........ObbbbbbO............OOObbO.................................
............OOO...............OOOOOO................OO..................................
```

`walk-24-keys` — the same poses at 24 px: thigh 3 wide, shin 2, bob 2 px, frame
width 17, 27 rows. Standing hip = 12 (hip rows 11, 10, 12, 11).

```grid walk-24-keys
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
....................................................................
.........................................OOOO.......................
.......OOOO.............................OHHHHO............OOOO......
......OHHHHO............OOOO...........OHHHHHHO..........OHHHHO.....
.....OHHHHHHO..........OHHHHO..........OHHHSSSO.........OHHHHHHO....
.....OHHHSSSO.........OHHHHHHO.........OHHSSOSO.........OHHHSSSO....
.....OHHSSOSO.........OHHHSSSO..........OHSSSSO.........OHHSSOSO....
......OHSSSSO.........OHHSSOSO........OOOOHSSsO..........OHSSSSO....
.....OOOHSSsO..........OHSSSSO.......OCCCCOssO..........OOOHSSsO....
....OCCCOssO..........OOOHSSsO.......OCCCAAOO..........OCCCOssO.....
....OCCAAOOO.........OCCCOssO........OCCCAAcO..........OCCAAOOO.....
....OCAAaCcO.........OCCAAOOO........OCCCAAcO..........OCCAAacO.....
....OCAACCcO.........OCCAACcO.........OCCAAcO..........OCCCAAcO.....
....OSSaCcsO.........OCAAaCcO.........OCCSScO..........OCCCAAOOOO...
....OSSCCcssO........OCAACcO..........OCCSScpOOO.......OCCCASSpppO..
...OSSSCCcOssO.......OCSSCcO..........OccSSSOpppO......OCCCCSSSppO..
...OSSccccpOOsO......OCSSCcOOO.........OOPSSOOppO......OcccccSSSpO..
...OSSOOPPPPpOO......OSSSccPPpO..........OSSPpOO.......OsOPPpOSSpO..
...OSSOpOOPPpO.......OSSOOPPPpO...........OPPpO........OssOPPPpOO...
....OOOpppOPPO.......OSSppOPPpO...........OPPpO.........OOPPPPpOO...
...OppppppOPPpO.......OpppOPPpO...........OPPOO.........OPPPPpOpOO..
...OppppOpOOPPO......ObbOOOPPO...........OPPpObO........OPPOOObbbbO.
..ObbOOO.O.OPPOO.....ObbbOOPPO...........OPPObbO.......OBBOOObbbbbO.
..ObbbbO...OPBBBO.....ObbbOPPOO..........OPPOOO........ObBBBOOOOOO..
...ObbbbO.OBBBbbO......ObOBBBBBO........OBBBBBO.........ObbBBO......
....OObbO.ObbbOO........OObbbbbO........ObbbbbO..........OObbO......
......OO...OOO...........OOOOOO..........OOOOO.............OO.......
```

`run-24-keys` — 24 px run, shorter arms, same four poses and flight frame
(both boots ≥ 2 rows up); frame width 19, 28 rows.

```grid run-24-keys
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
............................................................................
..................................................................OOOO......
...............................................OOOO..............OHHHHO.....
.........OOOO.................................OHHHHO............OHHHHHHO....
........OHHHHO..............OOOO.............OHHHHHHO...........OHHHSSSO....
.......OHHHHHHO............OHHHHO............OHHHSSSO...........OHHSSOSO....
.......OHHHSSSO...........OHHHHHHO...........OHHSSOSO............OHSSSSO....
.......OHHSSOSO...........OHHHSSSO............OHSSSSO...........OOOHSSsO....
........OHSSSSO...........OHHSSOSO...........OOOHSSsO..........OCCCOssOOO...
.......OOOHSSsO............OHSSSSO..........OCCCOssO...........OCCAAOOOSSO..
......OCCCOssOOO..........OOOHSSsO..........OCCAAOOO..........OCCCAAaOSSSO..
......OCCAAOOOssO........OCCCOssO..........OCCCAAcO...........OCCCCAAaSSO...
.....OCAAAacOsssO........OCCAAOOOOO........OCCAAacOOOO........OCCCCcASSSO...
.....OSSAaCcassO........OCCAAacOOssO.......OCCAAcppppsO.......OCCCCcOSSO....
.....OSSSCcasssO........OCAAaCcssssO.......OCCSSSppppsO.......OCCCCcpOOO....
.....OCSSCcOssO.........OSSaCcssssO........OCCSSSSSppO........OcccccppppO...
.....OCSSScOOO..........OSSSScssOO.........OccccSSSpO..........OPPpOppppO...
.....OccSScpOO..........OCSSSSOO............OPPpOpppO..........OPPpOOppO....
....OOOpOPPPPpO.........OcccSSO..............OPPpOpO........OOOPPPpOpppO....
...OpppppOOPPpO.........ObbOPPpOO...........OOPPpOpOO......OPPPPPPpOppO.....
...OpppppppOPPO.........ObbbOPPPpO.........OPPPPpObbbO.....OPPPpOPOppOO.....
..ObbOOpppOPPpO..........ObbOOPPpO........OPPPPpObbbbO....OBBOOO.ObbbbbO....
..ObbbOOOpOPPO............OOPPPpO.........OPPOOOOOOOO.....ObBBO..ObbbbbO....
...ObbbO.OOPPOO...........OPPPpO.........OBBOO.............ObBBO..OOOOO.....
....ObbbO.OPBBBO..........OPPOO..........ObBBBO.............ObBBO...........
.....ObbOOBBBbbO.........OBBBBBO..........ObbBBO.............ObbO...........
......OO.ObbbOO..........ObbbbbO...........OObbO..............OO............
..........OOO.............OOOOO..............OO.............................
```

## Procedure

1. Write the spec first: size, facing, weight, speed, frame count (8 unless the
   style demands less), personality tweaks (≤ 3).
2. `addLayer` ops to rig the body onto layers: head, torso, near arm, far arm, near leg, far leg
   (`craft/06-layers-and-rigging.md`). Far limbs one shade darker so they read
   behind. Feet on one fixed ground row.
3. Frame 1 (contact) and frame 3 (pass) with `applyBatch` `grid`, from a template
   above or by hand. Look at both before continuing.
4. `copyFrame` for 2 and 4; move limbs per layer with `setCel`
   or `translate`. Re-measure limb length after each move.
5. Frames 5–8: duplicate 1–4 and swap near/far layer contents; `replaceColor` the
   swapped limbs to near/far shades. Do not flip the canvas.
6. `render` `onionSkin` on 1→2→3 to judge foot travel and hip bob, then
   `render` `filmstrip` over the whole loop including frame 1 again.
7. `setFrameDuration` `durations` with the ms column; `addTag` for the cycle.
8. `validate`. Then the foot-slide check: planted foot Δx per frame ÷ frame
   time = the engine speed to tell the user.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Character glides or skates | planted foot does not travel at ground speed | recompute foot x per frame; set engine speed from it |
| Walk floats, no weight | no `down` frame, bob under 1 px | add the lowest frame after contact, hip −1 more |
| Looks like sliding legs | pass frame missing or legs just "together" | tuck the swing foot at the support knee |
| Robotic bounce | bob is a sine / head moves with torso every frame | triangle wave, head one frame late |
| Both arms swing with their own leg | arm/leg opposition lost | near arm opposite near leg |
| Run reads as fast walk | no airborne frame, upright torso | 2 flight frames, 12° lean, 90° elbows |
| Limbs "grow" or shrink mid-cycle | volume drift from nudging pixels | redraw from the rig, measure segments |
| Legs bend backwards at the knee | foot target beyond leg length | shorten stride or lift the hip |
| Cycle pops at the loop | frame 8 → 1 mismatch, drift in head x | onion frame 8 over 1; fix head and hip |
| Left-facing version has wrong light | whole-sprite flip | re-shade or accept and say so (`craft/03-silhouette-and-form.md`) |

## Review

- Fill one frame flat: is it a walker, with clear space between the two legs?
- Is there a pass frame with a straight support leg and a tucked swing foot?
- Hip lowest after contact, highest at pass; total bob matches the size.
- Arm opposite each leg; widest at contact; no twin poses on both sides.
- Run: ≥ 2 frames with both feet off the ground; forward lean visible.
- Every frame keeps limb lengths and thickness (`render` `filmstrip`).
- Planted foot travel is consistent and a speed in px/s was stated.
- Ground row identical in every frame; head does not drift in x.
- Durations are not uniform: contacts held longer (or run flight held).
- Frame 1 follows frame 8 without a visible jump.

## Sources

- Richard Williams, *The Animator's Survival Kit*, walk chapter pp. 102–118,
  runs pp. 176–200, sneaks pp. 167–175.
- Eadweard Muybridge, *The Human Figure in Motion*, Series 1, 10, 11, 84, 85
  (photo intervals .083 s walk, .042–.057 s run).
- Preston Blair, *Advanced Animation*, walk and run charts pp. 24–31.
- Frank Thomas & Ollie Johnston, *The Illusion of Life*, weight and walks.
- Andrew Loomis, *Figure Drawing for All It's Worth*, pp. 115–119.
- Slynyrd, Pixelblog 8 (Intro to Animation), 25 (Motion Cycles), 50 (Human Walk
  Cycle), 55 (Top-Down), 60 (Run 'N Gun) — slynyrd.com.
- Pedro Medeiros (Saint11), Walk and RunCycleSimple tutorials — saint11.art.
- Owlboy run cycles (D-Pad Studio), Stardew Valley farmer sprite wiki,
  pokeemerald object-event animation tables (shipped timings).
- Pixel Logic, ch. 9 (Animation), for ones/twos and limited-frame loops.
