# Secondary motion

A sprite whose hair, cape and weapon move in lock-step with the body reads as a
cut-out. A sprite whose loose parts flap at random reads as broken. Secondary
motion is the middle path: every loose part is attached to something, starts
later than it, travels further at its free end, overshoots when the body stops,
and settles. This file is for hair, capes, scarves, tails, loose cloth, flags,
carried items and weapon tips. Primary cycles are `craft/40-animation/42-walk-and-run.md` and
`craft/40-animation/44-attacks-and-impacts.md`; motion below one pixel is
`craft/40-animation/46-subpixel-animation.md`; wind particles are `craft/80-effects-ui/82-particles-and-weather.md`.

## Rules

1. **Leader first, followers later.** Draw the body's motion, then each loose
   part with a lag of **1–2 frames** behind the part it hangs from. A hair tip
   hangs from the head, the head from the torso: lags add up, the tip is last.
2. **The root does not move relative to its anchor.** Pixels at the attachment
   stay identical frame to frame (grass roots, hair at the scalp, cape at the
   clasp); amplitude grows towards the free end.
3. **Overshoot, then settle with decaying amplitude.** After the body stops,
   loose parts keep going 2–4 frames: 3 px, 2 px, 1 px, 0. Never a single frozen
   frame. Settle takes 250–400 ms in total. Thin cloth swings further and faster
   than heavy cloth (Williams).
4. **Counteract the body bob.** The body drops on `down`; hair and cape lift
   (continue upward) one frame later, then fall as the body rises. In a run the
   free end sits in antiphase to the hip with a one-frame delay
   (`secondary-run-cape-hair`). Restrain it — a visible 1–2 px is enough.
5. **Cloth streams with speed.** Walk: cape hangs with 1 px sway. Run: it
   trails nearly horizontal with a 2–3 px bob. Sudden stop: it swings through to
   vertical, rebounds, and hangs (`secondary-cape-stop`).
6. **Draw the edge as one continuous curve** (C, S or reverse C). Step lengths
   change smoothly, e.g. 4-2-1-1-2-4, never kink. A wave is a sine offset along
   the wind direction with the phase shifting along the length; flow points
   12 px apart moving 2 px per frame make a 6-frame loop
   (`secondary-flag-wave-6`, Slynyrd PB33). Hair locks use the same wave, drawn
   thinner.
7. **Few folds.** At 16 px a cape is 2–3 value bands and one fold line that
   radiates from the shoulder or clasp; at 32 px add a second fold family. No
   highlights on cloth, dark areas stay low-detail, light and shadow move away
   from the wind source. Folds that appear and disappear every frame are noise.
8. **Each loose part gets its own layer and loop length.** Cape 8 frames, hair
   6, orbiting item 5: the combined pose never repeats exactly (Saint11 loop
   rule). Start copies of the same loop on different frames. Cross-reference
   `craft/00-core/06-layers-and-rigging.md`.
9. **Protect the silhouette.** Run the flat-fill test with the cape on: it must
   not merge with the legs or the back arm. Leave a 1 px gap or separate by
   value (dark cape against bright tunic).
10. **Carried items lag like pendulums.** A weapon tip, bag or lantern trails
    the hand by one frame at start and stop (Muybridge's carried loads lag one
    photo). Hold the item's offset from the hand constant while the body is
    steady.
11. **Small colour counts survive motion.** Detail correct in a still is lost at
    speed; merge clusters that split and join frame to frame, and keep the hair
    highlight moving by tiny amounts on a steady rhythm (Slynyrd PB55, PB58).
12. **Animals:** tails lag the spine by about two frames and pivot at the sacrum;
    ears swing out on stretch frames and hang on the settle (Goldfinger, Blair;
    gaits in `craft/50-creatures/51-animal-gaits.md`).
13. **Skip it when it cannot be seen.** At 8 px leave hair and cape fixed or use
    a 1 px flicker. Celeste draws hair in code from a chain of followers; if
    the engine can do that, say so instead of baking 12 frames.

## By size

| Size | Hair | Cape / cloth | Lag | Notes |
|------|------|--------------|-----|-------|
| 8 px | fixed | 1 px flick | 1 f | colour flicker only |
| 16 px | 1–2 px strand | 2 px wide, 4–6 long | 1–2 f | one fold line; 2 amplitude steps (2 px, 1 px) |
| 24–32 px | 2–3 px locks | 3–4 px wide, 12–17 long | 1–2 f | templates below; 3-step settle (3, 2, 1) |
| 64 px | locks and bangs separate | multi-fold, wave along edge | 2 f | sub-pixel on the tip, flow points 12 px apart |

## Lag and amplitude tables (30 px figure)

Free-end position of the cape relative to its clasp (3 px behind and 1 px below
the shoulder; px, +x forward, +y up), the `secondary-cape-stop` sequence. Frame 1
is the run, frame 2 is the first frame after the body stops. Durations
60 / 60 / 80 / 80 / 120 ms (derived).

| # | Body | Cape mid | Cape tip | Note |
|---|------|----------|----------|------|
| 1 | running, lean 12° | (−8, −2) | (−13, −5) | streams back |
| 2 | stopped | (−8, −6) | (−10, −13) | swings down, fast |
| 3 | stopped | (−4, −9) | (−4, −17) | hangs, longest reach |
| 4 | stopped | (−6, −8) | (−8, −15) | rebound, amplitude 4 → 2 |
| 5 | stopped | (−4, −9) | (−5, −17) | settle, amplitude 1 |

Run with cape and ponytail (`secondary-run-cape-hair`), tip offset in y relative
to the clasp / head anchor; body hip dy −1, −2, 0, +1 (as `run-30-keys`):

| Pose | Cape tip dy | Ponytail tip dy |
|------|-------------|-----------------|
| contact | −4 | −1 |
| down | −2 (lifts as the body drops) | +1 |
| push | −4 | −1 |
| flight | −7 (falls as the body peaks) | −2 |

## Templates

Frame widths: 32 (`secondary-cape-stop`), 32 (`secondary-run-cape-hair`) and 14
(`secondary-flag-wave-6`) columns. Cut at multiples; the body keeps the same ground
row in every frame and is the `walk-30-keys` / `run-30-keys` rig (same bone lengths).

`secondary-cape-stop` — five frames: cape streaming, swinging down, hanging,
rebounding, settled. Re-use the table for any long cloth.

```grid secondary-cape-stop
O = outline          #2b1d2e
S = skin-light       #f2b48a
s = skin-shadow      #c47a5a
C = tunic-light      #d9604a
c = tunic-shadow     #9c3a3c
A = sleeve-light     #e8806a
a = sleeve-shadow    #b24c47
P = pants-light      #4a5b8c
p = pants-shadow     #34405f
B = boot-light       #9a6a3f
b = boot-shadow      #6a4529
H = hair             #7a4a2a
V = cape-light       #8b3fa8
v = cape-shadow      #5f2a7a
---
................................................................................................................................................................
................................................................................................................................................................
.................................................OOOOO...........................OOOOO...........................OOOOO...........................OOOOO..........
....................OOOOO.......................OHHHHHO.........................OHHHHHO.........................OHHHHHO.........................OHHHHHO.........
...................OHHHHHO.....................OHHHHHHHO.......................OHHHHHHHO.......................OHHHHHHHO.......................OHHHHHHHO........
..................OHHHHHHHO....................OHHHHSSSO.......................OHHHHSSSO.......................OHHHHSSSO.......................OHHHHSSSO........
..................OHHHHSSSO....................OHHHSSOSO.......................OHHHSSOSO.......................OHHHSSOSO.......................OHHHSSOSO........
..................OHHHSSOSO....................OHHHSSSSO.......................OHHHSSSSO.......................OHHHSSSSO.......................OHHHSSSSO........
..................OHHHSSSSO....................OOHHSSSSO.......................OOHHSSSSO.......................OOHHSSSSO.......................OOHHSSSSO........
................OOOOHHSSSSO...................OOOOHSSSsO......................OOOOHSSSsO......................OOOOHSSSsO......................OOOOHSSSsO........
...........OOOOOVOOOOHSSSsO.................OOOCCCOssOO......................OOCCCOssOO......................OOCCCOssOO......................OOCCCOssOO.........
.........OOVVVVVOCCCCOssOO.OO..............OVVOCCCAOOcO......................OOCCCAOOcO.....................OVOCCCAOOcO......................OOCCCAOOcO.........
........OVVVVVVOCCCCACOO..OssO...........OOVVVOCCAAaCcO.....................OVOCCAAaCcO.....................OVOCCAAaCcO.....................OVOCCAAaCcO.........
.......OVVVVVVVOCCCAAacO.OsssO..........OVVVVVOCCAAaCcO.....................OVOCCAAaCcO....................OVVOCCAAaCcO.....................OVOCCAAaCcO.........
.....OOVVVVVvvvOCAAAaCcaOsssO..........OVVVVVvvOCAAaCcO....................OVVVOCAAaCcO...................OVVVVOCAAaCcO....................OVVVOCAAaCcO.........
....OVVVVvvvOOOOSSAaCcaasssO..........OVVVVVvOOOAAaCCcO....................OVVVOAAaCCcO..................OVVVVvOAAaCCcO....................OVVVOAAaCCcO.........
...OVVVvvOOO..OASSSCCcaassO..........OVVVVvvO..OASSCCcO...................OVVVVOASSCCcO.................OVVVVvOOASSCCcO...................OVVVVOASSCCcO.........
..OVVvvOO......OASSSCcOOaO...........OVVVvOO...OASSCCcO...................OVVVvOASSCCcO.................OVVVvO.OASSCCcO...................OVVVvOASSCCcO.........
...OvOO........OCCSSScO.O............OVVvO.....OCSSSCcO..................OVVVVvOCSSSCcO................OVVVVvO.OCSSSCcO..................OVVVVvOCSSSCcO.........
....O..........OCCCSScO.............OVVvO......OccSSccO..................OVVVvOOccSSccO................OVVVvO..OccSSccO..................OVVVvOOccSSccO.........
..............OccccccPpO............OVVvO.......OPSSpOO..................OVVVvO.OPSSpOO................OVVvO....OPSSpOO..................OVVVvO.OPSSpOO.........
...............OOpOPPPpO............OVVvO.......OPSSpOO..................OVVvO..OPSSpOO...............OVVvO.....OPSSpOO..................OVVvO..OPSSpOO.........
................OpOPPPPpO...........OVVvO.......OPPPpOpO.................OVVvO..OPPPpOpO..............OVVvO.....OPPPpOpO.................OVVvO..OPPPpOpO........
.............OOOOOpOPPPPpO.........OVVvO........OPPPpOpO.................OVVvO..OPPPpOpO..............OVVvO.....OPPPpOpO.................OVVvO..OPPPpOpO........
............OpppppppOPPPpO.........OVVvO........OPPPpOpO.................OVVvO..OPPPpOpO..............OVVvO.....OPPPpOpO................OVVvO...OPPPpOpO........
...........OppppppppOPPpO...........OvO.........OPPpOpO..................OVVvO..OPPpOpO..............OVVvO......OPPpOpO.................OVVvO...OPPpOpO.........
...........ObbppppppOPPpO............O..........OPPpOpO..................OVVvO..OPPpOpO..............OVVvO......OPPpOpO.................OVVvO...OPPpOpO.........
...........ObbbOOOOOOPPpO.......................OPPpOpO..................OVVvO..OPPpOpO...............OvO.......OPPpOpO.................OVVvO...OPPpOpO.........
............ObbbbO..OPPpO......................OPPpOpppO.................OvVvO.OPPpOpppO...............O.......OPPpOpppO................OvVvO..OPPpOpppO........
.............ObbbbO.OPPpOOO....................OPPpOpppO..................OvO..OPPpOpppO.......................OPPpOpppO.................OvO...OPPpOpppO........
..............OObbO.OPPBBBBO...................OPPpOOOpOOO.................O...OPPpOOOpOOO.....................OPPpOOOpOOO................O....OPPpOOOpOOO......
................OO..OBBBbbbO...................OBBBBBBObbbO....................OBBBBBBObbbO....................OBBBBBBObbbO....................OBBBBBBObbbO.....
....................ObbbOOO....................ObbbbbbObbbO....................ObbbbbbObbbO....................ObbbbbbObbbO....................ObbbbbbObbbO.....
.....................OOO........................OOOOOOOOOO......................OOOOOOOOOO......................OOOOOOOOOO......................OOOOOOOOOO......
```

`secondary-run-cape-hair` — the run keys from `craft/40-animation/42-walk-and-run.md` with a
trailing cape and a ponytail whose free ends bob a frame behind the hips.

```grid secondary-run-cape-hair
O = outline          #2b1d2e
S = skin-light       #f2b48a
s = skin-shadow      #c47a5a
C = tunic-light      #d9604a
c = tunic-shadow     #9c3a3c
A = sleeve-light     #e8806a
a = sleeve-shadow    #b24c47
P = pants-light      #4a5b8c
p = pants-shadow     #34405f
B = boot-light       #9a6a3f
b = boot-shadow      #6a4529
H = hair             #7a4a2a
V = cape-light       #8b3fa8
v = cape-shadow      #5f2a7a
---
................................................................................................................................
....................................................................................................................OOOOO.......
....................................................................................OOOOO..........................OHHHHHO......
....................OOOOO..........................................................OHHHHHO.......................OOHHHHHHHO.....
...................OHHHHHO..........................OOOOO.....................OOOOOHHHHHHHO...................OOOHHHHHHSSSO.....
.............OOOOOOHHHHHHHO................OOOO....OHHHHHO.................OOOHHHHHHHHHSSSO................OOOHHHHHHHHSSOSO.....
...........OOHHHHHHHHHHSSSO...............OHHHHOOOOHHHHHHHO...............OHHHHHHHHHHHSSOSO...............OHHHHHHHOHHHSSSSO.....
..........OHHHHHHHHHHHSSOSO...............OHHHHHHHHHHHHSSSO...............OHHHHOOOOHHHSSSSO...............OHHHHOOOOOHHSSSSO.....
..........OHHHOOOOOHHHSSSSO................OOOHHHHHHHHSSOSO................OOOO.OOOOHHSSSSO................OOOOOOOOOOHSSSsO.....
...........OOO..OOOOHHSSSSO...................OOOOOHHHSSSSO.................OOOOVOOOOHSSSsO..................OOVOCCCCOssOOOO....
............OOOOVOOOOHSSSsO...................OOOOOOHHSSSSO...............OOVVVVOCCCCOssOO.................OOVVOCCCCACOO.OSSO...
..........OOVVVVOCCCCOssOO.OO.............OOOOVVVOOOOHSSSsO..............OVVVVVOCCCCACOO..................OVVVVOCCCAAacOOSSSO...
.........OVVVVVOCCCCACOO..OssO.........OOOVVVVVVOCCCCOssOO...........OOOOVVVVVVOCCCAAacO.................OVVVVVOCCCCAAaOSSSO....
.....OOOOVVVVVVOCCCAAacO.OsssO.....OOOOVVVVVVVVOCCCCACOO...........OOVVVVVVVVvvOCCCAAacO.OOO...........OOVVVVVvOCCCCCAAaSSO.....
...OOVVVVVVVVvvOCAAAaCcaOsssO.....OVVVVVVVVVVVVOCCCAAacO...OO.....OVVVVVVvvvvOOOCCAAacaOOsssO........OOVVVVVvvOaCCCCCAASSSO.....
..OVVVVVVvvvvOOOSSAaCcaasssO.....OVVVVVvvvvvvvvOCCAAaCcOOOOssO...OVVVvvvvOOOO..OCCAAacaOssssO......OOVVVVvvvOO.OCCCCCcASSO......
.OVVVvvvvOOOO.OASSSCCcaassO.......OvvvvOOOOOOOOOCAAaCcaasssssO....OvvOOOO......OCASSSSOOOsOO......OVVVVvvOOO...OCCCCCcOAO.......
..OvvOOOO......OASSSCcOOaO.........OOOO........OCSSaCcasssssO......OO..........OCASSSSSSSpO......OVVVvvOO......OCCCCCcppO.......
...OO..........OCCSSScO.O......................OASSSCcassOOO...................OCCACCSSSSppO......OvvOO.......OccccccOpppO......
...............OCCCSScO........................OCASSScOaO.....................OccccccOpppppO.......OO..........OOPPPpOppppO.....
..............OccccccPpO.......................OCCCSSSOO.......................OOPPPpOppppO....................OPPPPpOppppO.....
...............OOpOPPPpO......................OcccccSSOO........................OPPPPpOppO.....................OPPPpOppppO......
................OpOPPPPpO......................OpOPPPPpO.........................OPPPpOpO....................OOOPPPpOpppO.......
.............OOOOOpOPPPPpO....................OpppOPPPpOO........................OPPPpOpO..................OOPPPPPPpOppO........
............OpppppppOPPPpO....................ObbbOPPPPpOO......................OOPPPpOOOO................OPPPPPPPpOpppO........
...........OppppppppOPPpO.....................ObbbbOPPPpOO.....................OPPPPpObbbbO..............OPPPPPpOOOpppOOO.......
...........ObbppppppOPPpO......................OObOPPPpOO.....................OPPPpOObbbbbO..............OBBPOOO..ObbbbbbO......
...........ObbbOOOOOOPPpO........................OOPPpOO.....................OPPPpO.OOOOOO...............ObBBOO...ObbbbbbO......
............ObbbbO..OPPpO........................OPPpO......................OPPpOO........................ObBBBO...OOOOOO.......
.............ObbbbO.OPPpOOO......................OPPpO......................OBBOOO.........................ObbBBO...............
..............OObbO.OPPBBBBO....................OPPpOOO.....................ObBBBBO.........................OObbO...............
................OO..OBBBbbbO....................OBBBBBBO.....................ObbbBBO..........................OO................
....................ObbbOOO.....................ObbbbbbO......................OOObbO............................................
.....................OOO.........................OOOOOO..........................OO.............................................
```

`secondary-flag-wave-6` — a 6-frame travelling wave off a fixed edge. Amplitude
grows from the pole; thickness is constant. Use for banners, long scarves, hair
sheets and tails; shorten the wavelength for small sprites.

```grid secondary-flag-wave-6
O = outline        #2b1d2e
V = cloth-light    #8b3fa8
m = cloth-mid      #7a3596
v = cloth-shadow   #5f2a7a
---
O.............O.............O.............O.............O.............O.............
O.............O.............O.............O.............O.............O.............
O.............O.............O.............O........VV...O.........VVV.O...........VV
O.VVVV.......VO...VVVV......O....VVVVV....O......VVmmV..O........VmmmVOVV........Vmm
OVmmmmV.....VmOVVVmmmmV.....O..VVmmmmmV...OV....VmmmmmV.OVVV....VmmmmmOmmVV.....Vmmm
OmmmmmmVV..VmmOmmmmmmmmV...VOVVmmmmmmmmV..OmVVVVmmmvvmmVOmmmVVVVmmvvvmOmmmmVVVVVmmvv
OmvvvvmmmVVmmvOmmmvvvvmmVVVmOmmmmvvvvvmmVVOmmmmmmvv..vmmOmmmmmmmmv...vOvvmmmmmmmmv..
Ov....vmmmmmv.Ovvv....vmmmmmOmmvv.....vmmmOvmmmmv.....vmOvvvmmmmv.....O..vvmmmmmv...
O......vvmmv..O........vmmmvOvv........vmmO.vvvv.......vO...vvvv......O....vvvvv....
O........vv...O.........vvv.O...........vvO.............O.............O.............
O.............O.............O.............O.............O.............O.............
```

## Procedure

1. Finish and approve the primary cycle first. Secondary motion on an unfinished
   body is rework.
2. Put each loose part on its own layer above or below the body as depth demands
   (cape behind, ponytail above the head layer, weapon in front).
3. Per frame, mark the anchor (pixel on the body) and 2–3 nodes for the free
   part. Place each node on the previous node's path, one frame late. Write the
   offsets down as in the tables.
4. Draw the part along those nodes with `applyBatch` `stroke` or `grid`: 3 px wide
   at the root, 2 px at the tip; cast the lower edge in the shade colour.
5. On a stop or direction change, add the overshoot and settle frames
   (amplitude 3 → 2 → 1 → 0) even if the body has no more frames.
6. `render` `onionSkin` against the previous frame to confirm the tip travels along
   a curve; `render` `filmstrip` to check the loop and the silhouette.
7. Prefer hand-keyed nodes. `tweenCels` rounds to whole
   pixels and stutters on amplitudes of 1–2 px (`craft/00-core/05-animation.md`).

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Cape looks glued on | zero lag, same offset as body | shift tip one to two frames later |
| Cape flaps wildly | no anchor, amplitude constant along the length | root fixed, amplitude grows to the tip |
| Sprite stops dead, cape too | no overshoot or settle | add 2–4 decaying frames |
| Cloth jitters | folds appear and vanish each frame | 2–3 bands, one fold line, merge clusters |
| Hair hides the face in motion | hair on the face layer | separate layer, keep face frames clean |
| Cape merges with the legs | no gap, similar value | 1 px gap or darker cape |
| Everything loops in sync | same loop length on all layers | different lengths and start frames |
| Wave looks bent or kinked | uneven step lengths | smooth run lengths, same wavelength every frame |
| Tail sticks out stiff | rigid line, no S | chain of nodes with lag |

## Review

- Free ends start later than the body and travel further than their roots.
- Roots of hair, cape, tails are pixel-identical across frames.
- After the body stops, loose parts continue and settle over 2–4 frames.
- The loose part's path is a smooth curve on `render` `onionSkin`.
- The silhouette is readable with the loose part included.
- Folds are minimal and stable; no highlights on cloth.
- Loop lengths of different parts differ; nothing pops at the loop point.

## Sources

- Richard Williams, *The Animator's Survival Kit*, overlapping action and
  follow-through pp. 226–245, 265; drag and counteraction pp. 238, 156.
- Frank Thomas & Ollie Johnston, *The Illusion of Life*, follow-through and
  overlapping action pp. 60–62.
- Preston Blair, *Advanced Animation*, tails, ears, cloth pp. 2, 30, 32.
- Eadweard Muybridge, *The Human Figure in Motion*, drapery series 59–68, carried
  loads.
- Pixel Logic, ch. 8–9 (delayed pixels, cape sub-pixel).
- Slynyrd, Pixelblog 33 (Wind Effects), 55 and 58 (top-down hair and cape),
  53 (hair in kicks) — slynyrd.com.
- Pedro Medeiros (Saint11), Fabric, Wind, characterIdle, loop tutorials —
  saint11.art.
- Celeste hair (code-driven chain); Sprite Fusion "Bowch!" archer cloak and
  grass measurements; Eliot Goldfinger, *Animal Anatomy for Artists* (tails, manes, ears).
