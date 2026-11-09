# Skies and atmosphere

A sky drawn as one flat blue fill with white blobs kills the scene's depth, and a cloud drawn as a grey-shaded outlined cotton ball reads as clip-art. The same mistake repeats at every distance: far layers painted with near-layer contrast, so the world looks like a collage. Sky, clouds, time of day and the *distance rules* that every background layer obeys live here. Mountains are in `61-landscapes-and-terrain`, layer scrolling in `62-parallax-backgrounds`.

## Rules

**Sky**

1. Never fill a sky flat. Build a ramp of at least 4 entries that rotates hue as well as value: deep blue-violet at the zenith → mid blue → light blue → pale warm cyan at the horizon. The horizon is lighter and less saturated because you look through more air. A value-only ramp is the machine-made tell (`20-color-for-pixel-art`).
2. Cut the gradient into hard bands, thinner toward the top and never equal (equal bands read as stripes). Slynyrd's measured valley sky is 13/17/10/7/16 rows: exact heights are not sacred, uneven is.
3. Dither only the band boundaries, with a 2–4 row checker transition (checker first, then 25/75 rows on tall skies). Dither belongs to sky gradients, fog and light falloff, never to every surface (`13-dithering-and-texture`). At 32 px of sky or less use 3–4 hard bands and no dither; at ≤48 px, 2 dithered boundaries; at 64–96 px, 3.
4. If the sun is in frame the gradient gets a second axis: lighter and yellower toward the sun, darker and more violet away from it. Halo = at most 3 concentric dither rings of the sun hue, lightest next to the core, each one step dimmer. Never a soft alpha glow.
5. Time of day is a **palette** change, not a repaint. Keep the index map and swap the ramps (dawn / noon / dusk / night). Re-ramp the sky end colours and every layer follows.
6. Sunset sky, bottom to top: deep red-orange → orange → yellow-peach → pale pink → violet-grey → deep blue. Lit objects take a warm gold ramp; their shadows go blue-violet (hue 240–260°). That warm/cool split is the signature. Low clouds are warmer and darker than high ones; undersides turn magenta late. Ground silhouettes lose interior detail.
7. Night is near-black indigo, never `#000000`; keep shapes, darken detail. Overcast = flat light grey with horizontal streaks and no light direction; storm = blue-grey clouds with 1-px diagonal rain (`82-particles-and-weather`); after-storm = gold bands, one lit cloud edge, dark ground.

**Clouds**

8. A cloud is a clump of overlapping spheres sharing **one flat base**: bumpy top, flat bottom. Light each lobe separately from the upper left, keep the cluster count low, hue-shift the shadows, keep contrast low.
9. Build clouds from tints of the sky, not from white and grey. Measured saint11 cumulus: body slightly lighter than the sky, shade *bluer* and within one ramp step of the sky value, highlight less saturated. Sources disagree on whether the belly is lighter or darker than the sky; the decidable rule is "within one step either way", so the underside dissolves instead of forming a grey slab. On a sunset sky the belly warms and darkens.
10. Rim light: 1–2 px arcs on the upper-left of each lobe, interior left as one large flat body tone. Where a front lobe crosses a back lobe, its rim shows as a thin lighter crescent on the back lobe's body. No concentric pillow rings. A *bright outline all round* is only correct when the sun is behind the cloud.
11. Distance applies to clouds: far banks are 1–2 tones inside the sky's value range and may be baked into the sky as dithered horizontal streaks; near clouds get full contrast and rim light. Paint back to front.
12. One recipe per type, not one cloud everywhere: cumulus (puffy, flat base), stratus (flat grey, featureless), stratocumulus (dark thick patches), altocumulus (rows of round heaps), cirrus (1–2 px thin wisps), cumulonimbus (tall anvil, dark flat base).
13. Cloud shadows on ground: shift the ground ramp −2 value steps and −5…−10° toward blue-violet, match the cloud's size, and soften the edge with a 3–5 px dither strip.

**Atmospheric perspective** (applies to every receding layer, not only clouds)

14. With distance, colour loses chroma and contrast and drifts toward the sky colour *behind it*. Define a fog colour F = the sky at that layer's height. Blend each layer toward F by about 0 / 25 / 50 / 75 / 90 % for layers 0 (nearest) to 4 (derived).
15. Do the blend in **ramp space**: give distance its own ramp and re-pick the nearest entry per layer. Do not lay a translucent overlay. Per step drop saturation 20–40 % and compress the value range; the farthest layer ends as 1–2 flat entries with no internal darks.
16. Conflict: saint11's far mountains are *darker* than the sky; runevision and Slynyrd paint far = paler. Both obey one rule: a far plane is closer to the sky behind it than a near plane is, in hue **and** value. Whether that is lighter or darker depends on the sky's value. It always gets cooler, except rule 17.
17. Exceptions: distant white objects (snow caps, lighthouse) keep their lightest entry longest and warm up at sunset. At sunset and sunrise the far ramp is the *warmest, most saturated dark* (magenta-orange) and near layers are the cooler neutrals. In a backlit forest the near greens go dark blue-teal and the far trunks warm cream.
18. Fog: one ramp of 3–4 desaturated entries; each fog layer maps everything behind it up one entry; max difference from the sky ≤2 entries; only the nearest object keeps ≥3 entries. A haze band along the foot of the mountains blends them into the ground.
19. Do not fake distance with anti-aliasing or blur. Lower contrast, drop interior detail and remove pure darks; keep near edges crisp.

**Stars, sun, moon**

20. Stars are a library: 1-px dim dot, 3-px plus, 2-px pair, rare 5-px sparkle; 2–3 colour variants, irregular spacing, a few bright points for rhythm. Twinkle = 2–3 frames of one star (dot → plus → larger plus), only some stars animating, out of phase.
21. Moon: a 3×3 white disc when tiny; larger, a crescent is one disc minus a second. Background moons and planets get low contrast (`14-readability-and-scale`). A rainbow is translucent: 6–7 stacked 1-px bands as a 50 % checker over the sky, never stronger over dark ground than over sky.

## By size

| Canvas | Sky | Cloud | Stars / sun / moon |
|--------|-----|-------|--------------------|
| 8 px | 1–2 flat colours | 5×2 one tone (derived) | 1-px dots; sun is a 3×3 disc |
| 16 px | 2–3 hard bands | 8×3 slab, 2 tones, no rim (rows `..BBB...` / `BBBBBBB.` / `.SSSSSS.`) | 1-px dots, no twinkle |
| 32 px | 3–4 hard bands, no dither | 12×4 two tones, or 20×8 three tones | dot + plus; sun 5×5 with 1 ring |
| 64 px | 4–5 bands, 2–3 dithered edges | 20×8 with 2–3 lobes, 3–4 tones | full star kit; sun ≤9 px, ≤3 rings |
| 128 px+ | bands of ≥2 rows, 4-row dither | 36×13 → 90×38, lobes 8–30 px, rim + base | crescent moon, twinkle frames |

## Templates

Clouds are drawn on their own layer (transparent around them) and recoloured from the sky ramp.

Full cumulus, 3 lobes, rim + body + shade + flat base. Use from 64 px up.

```grid sky-cloud-cumulus-36
H = cloud-rim      #f7fcff
B = cloud-body     #dcefff
S = cloud-shade    #a9cbf0
T = cloud-base     #8eb2e6
---
..............HHHHHHHH..............
.............HBBBBBBBBB.............
............HBBBBBBBBBBB............
............HBBBBBBBBBBB..HHHHH.....
......HHH...HBBBBBBBBBBBHHBBBBBBB...
....HHBBBHHHBBBBBBBBBBBBBBBBBBBBS...
...HBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB..
...HBBBBBBBBBBBBBBBBBBBBBBBBBBBBBS..
.HHBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
.SSSSSSSSBBBBSSSSSSSSSSSBBBBSSSSSSSS
SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
..TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT..
```

Small two-lobe cloud for 48–64 px scenes.

```grid sky-cloud-small-20
H = cloud-rim      #f7fcff
B = cloud-body     #dcefff
S = cloud-shade    #a9cbf0
T = cloud-base     #8eb2e6
---
..........HHHH......
....HHHH.HBBBBB.....
...HBBBBHBBBBBB.HH..
...HBBBBBBBBBBBHBBB.
.BBBBBBBSSSBBBBBSSSB
.SSSSSSSSSSSSSSSSSSS
.TTTTTTTTTTTTTTTTTTT
...TTTTTTTTTTTTTTT..
```

32 px canvas cloud, two tones. At 16 px keep only its silhouette as an 8×3 slab.

```grid sky-cloud-tiny-12
B = cloud-body     #dcefff
S = cloud-shade    #a9cbf0
---
...BBBB.....
.BBBBBBBBB..
BBBBBBBBBBB.
.SSSSSSSSSS.
```

Low stratocumulus bank, wide and flat; stack it near the horizon with lower contrast.

```grid sky-cloud-bank-40
H = cloud-rim      #f7fcff
B = cloud-body     #dcefff
S = cloud-shade    #a9cbf0
T = cloud-base     #8eb2e6
---
......HHH...HHH.HHHHH.HHHHH.HHHHH.HHH...
..HHHHBBBH.HBBBHBBBBBHBBBBBHBBBBBHBBBH..
.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBS.
.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.
.TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.
...TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT...
```

Cirrus wisps: three thin rows, no shade, no base.

```grid sky-cirrus-32
H = cloud-rim      #f7fcff
B = cloud-body     #dcefff
---
............................HHB.
.......HHHHHHHHHHHHHHHHHHHHBBB..
.BBBBBBBBBBBBBBBB....BBBBBB.....
```

Day sky tile column (repeat horizontally): taller bands toward the horizon, 2-row checker joins.

```grid sky-bands-day-8
a = sky-zenith     #3c70c9
b = sky-upper      #5aa0e6
c = sky-lower      #8ccaf0
d = sky-horizon    #c6e8f2
---
aaaaaaaa
aaaaaaaa
abababab
babababa
bbbbbbbb
bbbbbbbb
bbbbbbbb
bcbcbcbc
cbcbcbcb
cccccccc
cccccccc
cccccccc
cdcdcdcd
dcdcdcdc
dddddddd
dddddddd
dddddddd
dddddddd
```

Sunset with sun, one dither halo ring and a ground silhouette.

```grid sky-sunset-24
a = sky-top        #2f3a85
b = sky-violet     #6e5aa3
c = sky-pink       #e58fa6
d = sky-peach      #f7c58a
e = sky-orange     #f08a45
f = sky-horizon    #d9503a
u = sun-core       #fff0b8
h = sun-halo       #ffd48a
k = ground-sil     #2a1f3d
---
aaaaaaaaaaaaaaaaaaaaaaaa
aaaaaaaaaaaaaaaaaaaaaaaa
abababababababababababab
bbbbbbbbbbbbbbbbbbbbbbbb
bbbbbbbbbbbbbbbbbbbbbbbb
bcbcbcbcbcbcbcbcbcbcbcbc
cccccccccccccccccccccccc
cccccccccccccccccccccccc
cdcdcdcdcdcdcdcdcdcdcdcd
dddddddddddddddddddddddd
ddddddddddhdhddddddddddd
ededededehehehehedededed
eeeeeeeehuuuuuueheeeeeee
fefefefhuuuuuuuufhfefefe
kkffffhfuuuuuuuuhfffffkk
kkkkfffuuuuuuuuuuhffkkkk
kkkkkkkkkkkkkkkkkkkkkkkk
kkkkkkkkkkkkkkkkkkkkkkkk
kkkkkkkkkkkkkkkkkkkkkkkk
kkkkkkkkkkkkkkkkkkkkkkkk
kkkkkkkkkkkkkkkkkkkkkkkk
```

Night: two indigo bands with a dithered join, dim dots, bright dots, one plus star, one pair.

```grid sky-night-32
n = sky-night-top  #141a3d
m = sky-night-low  #232f66
s = star-dim       #5566a8
t = star-bright    #d6e0ff
q = star-arm       #8fa3e0
---
nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn
nnnnnnnnnnnsnnnnnnnntnnnnnnnnnnn
nnnsnnnnnnnnnqnnnnnnnnnnsnnnnntn
nnnnnnnnnnnnqtqnnnnnnnnnnnnnnnnn
nnnnnnnnntnnnqnnnsnnnnnnnnnnnsnn
nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn
nmnmnmnmnmnmnmnmnmnmnmnmnmnmnmnm
mnmnmnmnmnmnmnmnmnmnmnmnmnmnmnmn
mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
mmmmmmmsmmmmmmmmmmmmmsmmmmmmmmmm
mmmmmmmmmmmmmmmmsmmmmmmttmmmmmmm
mmmmmtmmmmmmmmmmmmmmmmmmmmsmmmmm
mmsmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm
```

Crescent moon, lit from the left: disc r 5 minus a disc r 4.4 shifted 2.6 px right (derived), tips 3 px, body 4 px, two 2-px craters.

```grid sky-moon-crescent-11
M = moon-light     #f4efd0
m = moon-crater    #cfc9a0
---
....MMM....
..MMMM.....
.MMMM......
.MMM.......
MMMM.......
MmmM.......
MMMM.......
.MMM.......
.MmmM......
..MMMM.....
....MMM....
```

Star twinkle loop: dot → plus → large plus, 3 frames side by side.

```grid sky-star-twinkle-17
t = star-bright    #d6e0ff
s = star-arm       #8fa3e0
---
..............s..
........s.....s..
..t....sts..sstss
........s.....s..
..............s..
```

## Procedure

1. Fix before drawing: time of day, light side, horizon row (`91-composition-and-scenes`) and canvas height of the sky. `getContext` first.
2. Build the sky ramp with `palette` op `set` (4–5 entries: zenith → horizon), plus a separate distance ramp for layers. Load them before drawing, then `palette` op `snap` the art onto them.
3. On a `Sky` layer: `applyBatch` `gradient` (direction vertical, `steps` = band count, `dither` true) or hand-set each band with `fillRect`, then `dither` (pattern `checker`) on the 2–4 boundary rows. Vary band heights.
4. On a `Clouds` layer stamp a template with `applyBatch` `grid` (`transparent: "skip"`), then map its roles onto sky-ramp tints. Add far banks first and near clouds last.
5. Sun / moon / stars on their own layer so they can stay fixed when the clouds scroll.
6. Distance layers: apply the distance ramp with `applyBatch` `replaceColor` per layer, or `adjustHsl` and `effect` `hue-saturation` on that layer's region, then `palette` `analyze` then `effect` `hue-saturation`.
7. Time-of-day variants: duplicate the file, `palette` op `set` on the sky, cloud and distance entries only, `adjustHsl` for quick previews. Do not repaint.
8. `render` at 1×. Squint: the sky must be lightest at the horizon (day), the clouds must sit *in* the sky not on it. `effect` `hue-saturation` on a copy to check value order. `validate` checks `banding` and `antialiasing`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Cloud looks like a dirty grey ball | Shade is neutral grey | Shade = bluer tint within one step of the sky |
| Cloud is a sticker with a black outline | Outline treated as shading | Drop the outline; use rim light; outline only for UI icons |
| Concentric rings inside the cloud | Pillow shading | Light each lobe once: rim arc + flat body + base |
| Sky reads as stripes | Equal band heights, no dither | Uneven heights, checker on the joins |
| Distant hills as dark and crisp as near ones | No distance ramp | Blend toward the sky colour behind, ~25 % per layer |
| Pure black night with identical stars | No ramp, one star type | Indigo ramp, three star shapes, uneven spacing |
| Glow around the sun is a soft blur | Alpha / anti-aliasing | ≤3 dither rings |
| Sun repeats on a looping sky | Sun baked into the layer | Own sprite, fixed (`62-parallax-backgrounds`) |

## Review

- Sky has ≥4 entries, lightest at the horizon by day, banding uneven, dither only on joins.
- Clouds: flat base, bumpy top, one light direction, no outline, no pillow rings, shade bluer than body.
- Every receding plane is closer to the sky colour than the one in front of it; the farthest is 1–2
  flat entries.
- Distance is made by colour and detail, not by blur or alpha.
- No `#000000` night, no pure-white clouds on a pale sky, no semi-transparent pixels.
- Time-of-day variants share the same pixels.

## Sources

- Gurney, *Color and Light*: sky gradient pp. 174–175, aerial perspective pp. 176–179, sunsets pp. 180–183,
  fog pp. 184–185, rainbows pp. 186–187, cloud shadows p. 194.
- Silber, *Pixel Art for Game Developers*: atmospheric perspective pp. 78–80, sky bands and strips pp. 168–171.
- Solarski, *Drawing Basics and Video Game Art*: Atmospheric Perspective.
- Slynyrd Pixelblog PB11 (cumulus steps, sky moods), PB12 (starscape), PB18 (cloud types), PB62 (sky band heights).
- saint11 tutorials: Clouds, Stars, Parallax (`saint11.art/img/pixel-tutorials/`); runevision's atmospheric perspective notes;
  Rapapaing and YamsDev cloud tutorials.
