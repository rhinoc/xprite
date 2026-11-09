# Composition and scenes

A scene is a decision about where the eye goes. Without it an agent renders every region at equal importance: same cluster size, same contrast, same texture, no resting place, a horizon through the middle and a hero sitting on a tangent. The result is correct pixels and no picture. Decide the focal point, the value groups and the quiet zones on a thumbnail before any colour is chosen.

## Rules

1. **One sentence of purpose first.** "This image makes the viewer feel X / learn Y." Any cluster that does not serve it gets deleted. Then classify: a *gameplay* scene (platformer, shmup) wants a muted, simple background so sprites read; an *RPG / adventure* scene can afford rich scenery.
2. **Canvas from the platform.** Pick a base that integer-scales (`90-platform-styles`): 192×144 (4:3, fits inside 256×224 with a UI border, divides cleanly for pixel-perfect parallax), 256×224, 320×180. Do not resize later.
3. **Thumbnail before colour.** At 1⁄6–1⁄10 scale (32×24 for 192×144, 32×18 for 320×180) block three value masses with `applyBatch` `grid`. Look with `render`. Fix the layout here; recolouring a bad layout is repainting.
4. **Horizon at 33–45% from the top** for open land, **55–65%** when the sky is the drama. Never exactly 50%. (Three finished landscapes in the sources sit at 35–44%.)
5. **Subject on the centre line or a third line**, with at least one subject-width of calm around it. Subject height: 27–49% of canvas in a scenic piece; 10–16% of screen height for a platformer hero (`30-proportions-by-size`).
6. **One focal point.** It gets the strongest value contrast, the sharpest detail and the one accent hue, usually the complement of its surroundings (warm red mane on cool blue-green; cool blue beetle on warm orange sand). Everything else is subordinate.
7. **Three planes at most** (far / middle / near). Each starts as a flat silhouette; if the planes merge when reduced to flat shapes, texture will not separate them. Build bands first: solid horizontal colour bars fix horizon and plane order, because colour does most of the depth work.
8. **Atmospheric perspective.** Nearest plane: most saturated, strongest light/shadow contrast. Each receding plane: less saturated, lighter (daylight), hue pulled toward the sky colour. Backlit forest reverses it: near dark and blue-tinted, far warm yellow-cream. To compute a plane's colour, blend toward the haze colour by roughly 0 / 25 / 50 / 75 / 90% per plane, re-picking the nearest ramp entry (derived).
9. **Cluster scale falls with distance.** Near plane: visible blades several px tall. Next: 1–2 px clusters. Farther: no blades, flat colour. One cluster size per plane; never mix sprite scales inside a plane.
10. **Reuse palette entries across planes.** Distant shadow = a sky-band colour, far cloud tint baked into the sky. Target ≤16 colours at 192×144 (three finished scenes used 15).
11. **The interactive layer outranks the background.** Player, pickups, hazards and solid edges get more saturation, more value contrast and more ramp steps than scenery. Keep at least two value steps between a character and the background directly behind it (derived). Background contrast drops near gameplay objects before you reach for outlines.
12. **Mark the play lane first** (the ground line the player must read) and keep it calm and firm. Hazards and pickups are isolated bright accents; a decorative edge never competes with them.
13. **Design quiet zones.** Decide where nothing happens. Texture only inside planes, scaled by distance. A scene with equal detail everywhere flattens and reads as machine-made (`92-generated-art-tells`).
14. **Lines lead the eye.** Aim 2–3 physical lines (road, trunk row, shadow, ridge) and any gaze at the focal point. Curves read calm, diagonals dynamic, orthogonals still. Put the vanishing point at the focal object, not in empty sky.
15. **No accidental tangents.** A branch tip touching a head, a horizon through a neck, a foot on a tile seam: overlap clearly or leave a gap of ≥2 px.
16. **Look room.** Leave space in front of a face or direction of travel. A hero facing the edge with 8 px of space reads trapped. Left-to-right motion reads as progress; keep it constant across a sequence unless you mean a reversal.
17. **Size contrast.** Use large / medium / small of the same motif: foreground ≈3×, middle ≈1.5×, far 1× (derived), in odd counts. Two actors that interact should differ in size and shape; equal pairs are dull.
18. **Frame with dark silhouettes.** One or two edges of near, 1–2 colour shapes with no interior detail make a window of light around the subject (forest vignette: dark frame → mid ground → bright corridor).
19. **Value pair on the important actor.** The darkest-dark and brightest-light adjacent pair belongs to the more important character, never to a minor one.
20. **Plan values before palette.** Pick the key (high / mid / low) and set landmarks in the opposite value (dark figures in a high-key desert).
21. **Dither only in transition bands**: sky gradation, the shadow under the subject. Never a field.
22. **Ground contact.** A larger sprite stands lower on the ground band (greater y) than a smaller one; feet y must agree with scale or figures look giant.
23. **UI safe zones.** The bottom third and corners are often covered by HUD; dialogue boxes take roughly the bottom 25%. Keep key silhouettes out of them or leave negative space.
24. **Day to night is a remap, not a redraw.** Keep shapes; shift the whole ramp darker, cooler, lower contrast; keep at least one value step between ground and objects; keep one warm accent as the focal light.
25. **Group by function and colour.** More than ~3 elements on screen overload; group them, align them along composition lines, and give every interactable one consistent cue (value jump, accent hue or height above ground).
26. **Sequences.** Keep the focal object within about a quarter of the screen width between consecutive images, and do not mirror actors between images unless the reversal is deliberate.
27. **Conflict resolved: horizon.** Cinematic sources want a low horizon for heroic reads (at or below the feet-to-knee line) and a high one for "small, overwhelmed"; landscape sources want 33–45%. Use rule 4 for scenery and the cinematic rule only for a single-character key art.

## By size

Canvas, not sprite size: a scene has the same decisions at every canvas, but the budget shrinks. Entries marked (derived) are working defaults, not measurements.

| Canvas | Planes | Colours | Subject height | Notes |
|--------|--------|---------|----------------|-------|
| 64×64 | 2 | 6–8 (derived) | 24–32 px (derived) | one subject, one accent, sky + ground bands |
| 96×58 | 2–3 | 4–6 | n/a | corridor/first-person: vanishing point at centre, same dither every frame |
| 160×90 | 3 | 8–12 (derived) | 20–30% | horizon row near 30 or 60, not 45 |
| 192×144 | 3 | ≤16 (15 used) | 27–49% | JRPG battle: monster centre, heroes' backs along the bottom |
| 256×224 | 3 | ≤32 (derived) | per genre | leave the HUD margin |
| 320×180 | 3–4 | ≤32 (derived) | 10–16% hero | parallax: far layer slowest, all planes share a canvas size |

Parallax layers all use the same canvas size aligned at (0,0), nearest-neighbour only. A unique landmark (a sun) in a repeating 320 px plane repeats every 320 px.

## Templates

Thumbnails are layout, not finished art: transcribe with `applyBatch` `grid` onto a 32-wide sprite, judge the masses with `render`, then `resizeSprite` `nearest` the plan up.

Three-plane landscape (horizon row 9 of 20 = 45%, subject on the centre line, about 30% tall). Value ladder: sky → haze → mountains darker → mid grass → near grass darkest. The near plane is the most saturated.

```grid scene-thumb-three-plane
K = sky-top      #4aa8e8
k = sky-mid      #6fc1ee
j = sky-low      #a9e2ea
c = cloud-lit    #f4f9f5
m = far-range    #8fb3d4
h = haze         #cfe6df
g = mid-grass    #4cae4a
G = near-grass   #1f8238
A = subject-warm #e0443a
D = subject-dark #3a2438
---
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKccccKKKKKKKKKKKKKKKKK
kkkkkkkkkcccccccckkkkkkkkcckkkkk
kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk
jjjjjjmmjjjjjjjjjjjjjjjjjjjmmjjj
jjjjmmmmmmjjjjjjjjjjjjjjjmmmmmmj
jjmmmmmmmmmmjjjjjjjjjjjmmmmmmmmm
mmmmmmmmmmmmmmmjjjjjmmmmmmmmmmmm
hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
gggggggggggggggggggggggggggggggg
gggggggggggggggAAggggggggggggggg
ggggggggggggggAAAAgggggggggggggg
ggggggggggggggAAAAgggggggggggggg
gggggggggggggggAAggggggggggggggg
gggggggggggggggDDggggggggggggggg
ggGGggggggggggGDDGggggggggGGGggg
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
```

Forest vignette: dark canopy frame on the top corners and sides, a bright glow corridor behind the subject, dirt path leading to it. The darkest shapes and the brightest shape touch the subject. Use it for mystery, shelter, a quest destination.

```grid scene-thumb-forest-vignette
D = canopy-dark   #14231f
d = foliage-mid   #2c4a3a
l = glow-low      #c9d98a
L = glow-high     #fbf3c0
t = trunk         #35503f
g = ground        #4f7a3a
G = ground-near   #2c5030
P = dirt          #a8754a
S = subject       #15131c
A = scarf-accent  #d9533e
---
DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD
DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD
DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD
DDDDDDdddddtllllllllltdddDDDDDDD
DDDDDDdddddtllllllllltddddDDDDDD
DDDDDdddddltllLLLLLlltldtdDDDDDD
DDDDDddddlltlLLLLLLLltlltddDDDDD
DDDDdddddlltLLLLLLLLLtlltdddDDDD
DDDDdddddlltLLLSSLLLLtlltdddDDDD
DDDdddddllltLLLAALLLLtlltddddDDD
DDDddddddlltLLSSSSLLLtlltddddDDD
DDdddddddlltLLLSSLLLLtlltdddddDD
DDdddddddlltlLLSSLLLltlltdddddDD
gggggggggggggggSSggggggggggggggg
gggggggggggggggPPggggggggggggggg
ggggPPggggggggPPPPgggggggggggggg
gggggggggggggPPPPPPgggggggPPgggg
GGGGGGGGGGGGPPPPPPPPGGGGGGGGGGGG
GGGGGGPGGGGPPPPPPPPPPGGGGPGGGGGG
GGGGGGGGGGPPPPPPPPPPPPGGGGGGGGGG
```

JRPG battle layout at 1⁄6 of 192×144 (32×24 = 4:3): horizon at row 10 (42%), ground bands narrowing toward the horizon, a front-facing monster across the centre taking about half the height, three heroes' backs along the bottom. The bottom rows are the heroes' stage; put UI in the margins.

```grid scene-thumb-jrpg-battle
K = sky-top     #3d78c2
k = sky-mid     #5a9be0
j = sky-low     #9cc8ee
m = far-hills   #6f8fb8
h = haze        #b8d0d8
g = ground-far  #5fae56
f = ground-mid  #3f9248
G = ground-near #25703c
M = monster     #5a2d4f
E = monster-eye #ffd23f
Z = shadow      #1c3f2a
H = hero-back   #263a6b
A = hero-accent #e0a040
---
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKMKKKKMKKKKKKKKKKKKK
kkkkkkkkkkkkkMMMMMMkkkkkkkkkkkkk
kkkkkkkkkkkkMMMMMMMMkkkkkkkkkkkk
kkkkkkkkkkkkMMMMMMMMkkkkkkkkkkkk
jjjmmmmmjjjMMMEMMEMMMjjjjmmmmjjj
mmmmmmmmmmjMMMMMMMMMMjmmmmmmmmmm
mmmmmmmmmmjMMMMMMMMMMjmmmmmmmmmm
hhhhhhhhhhhMMMMEEMMMMhhhhhhhhhhh
ggggggggggggMMMMMMMMgggggggggggg
ggggggggggggMMMMMMMMgggggggggggg
ffffffffffffMMMMMMMMffffffffffff
ffffffffffffMMMffMMMffffffffffff
fffffffffffZZZZZZZZZZfffffffffff
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
GGGGGHHGGGGGGGGHHGGGGGGGGHHGGGGG
GGGGGHHGGGGGGGGHHGGGGGGGGHHGGGGG
GGGGAHHAGGGGGGAHHAGGGGGGAHHAGGGG
GGGGHHHHGGGGGGHHHHGGGGGGHHHHGGGG
GGGGHHHHGGGGGGHHHHGGGGGGHHHHGGGG
GGGGGZZGGGGGGGGZZGGGGGGGGZZGGGGG
GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG
```

Platformer lane at 1⁄10 of 320×180 (32×18): calm low-contrast background (two near-equal blues), a firm pale ground edge, a small dark hero with look-room to the right, one bright pickup and one red hazard isolated against quiet space, HUD reserve in the top-left. The only high-contrast shapes are the ones the player acts on.

```grid scene-thumb-platformer-lane
B = sky        #8fb4d0
b = hills-far  #86abc8
h = hills-near #7aa0bd
E = ground-top #e8dcab
e = ground     #8a6a48
u = underside  #3d2c2a
U = hud        #22223a
H = hero       #1d2236
P = pickup     #ffd23f
Z = hazard     #d23a3a
---
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
BUUUUUUUUUBBBBBBBBBBBBBBBBBBBBBB
BUUUUUUUUUBBBBBBBBBBBBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
bbbbbbbbbbbbbbbbbbbbbbhbbbbbbbbb
bbbbbbhbbbbbbbbbhhhhhhhhhhhhhbbb
bhhhhhhhhhhhbbhhhhhhPPhhhhhhhhhb
hhhhhHHhhhhhhhhhhhhhPPhhhhhhhhhh
hhhhHHHHhhhhhhhhhhhhhhhhhhhhhhhh
bbbbHHHHbbbbbbbbbbbbbbbbbbbbZbbb
bbbbbHHbbbbbbbbbbbbbbbbbbbbZZZbb
EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu
uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu
```

## Procedure

1. Write the purpose sentence and the scene class (gameplay / scenery). `createDocument` at the canvas from rule 2, one layer per plane: sky, far, middle, near, subject, effects. Separate layers let you fix one plane without touching the others (`06-layers-and-rigging`).
2. Thumbnail: a 32-wide scratch sprite, `applyBatch` `grid` with the nearest template above. `render`; judge the masses before anything else.
3. Palette: `palette` op `set`, ≤16 entries for 192×144, ramps from `palette` op `ramp`. Assign plane colours by rule 8 (blend toward the haze), reusing entries across planes.
4. Bands: fill sky and ground bands with `applyBatch` ops `rect` / `gradient` (steps only, `dither` only at band edges). Mountains and clouds as flat silhouettes.
5. Subject block-in on its own layer; ground-contact y by rule 22; accent hue by rule 6.
6. Texture per plane (rule 9), then dither at transitions, then small accents.
7. Checks: `render` (1× read, look away, look back); `effect` `hue-saturation` on a **copy** layer for the grey test (focal object must remain the highest-contrast thing against its surroundings); a dark-field and light-field check of the subject; HUD zones clear.
8. `validate` with `checks: ["palette","strays","banding"]`. Fix banding notes by letting the band edge wander or dithering one short section.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Hero vanishes in the scene | Background as contrasty as the sprite | Lower BG contrast near the lane; give the hero the strongest value pair |
| Flat, wallpaper-like scene | Same cluster size and saturation in every plane | Scale clusters by plane; saturate near, wash far |
| Eye lands on an unimportant prop | Highest contrast on the wrong object | Move the max-contrast edge to the subject, demote the prop |
| Horizon cuts the picture in half | Horizon at 50% | Move to 33–45% or 55–65% |
| Planes merge | Same value, differing only in hue | Separate by value first; check the silhouette stage |
| Sprite stands in front of a tangent | Branch, hill or roof edge touches the head | Shift one element ≥2 px or overlap clearly |
| Scene feels busy everywhere | Confetti and texture across every plane | Remove detail outside the focal region; leave quiet zones |
| Night scene unreadable | Everything darkened equally | Keep one value step ground-to-object, one warm accent |
| Looks sharp in the editor, mushy in game | Reviewed at 400–800% | Judge at 1× and at game scale |

## Review

- A purpose sentence exists and the focal point is identifiable at 1×.
- Horizon is not at 50%; subject on a centre line or a third; calm space around it.
- ≤3 planes, each a distinct silhouette; saturation and contrast fall with distance.
- The interactive layer is the highest-contrast, highest-saturation content.
- No tangents, no accidental overlaps; look room ahead of faces.
- Quiet zones exist; dither only in transitions; no confetti.
- Colours ≤16 at 192×144 with entries reused between planes.
- Desaturated copy: the focal object is still the strongest read.
- HUD and dialogue zones are clear of key silhouettes.

## Sources

- Slynyrd Pixelblog 62 (landscape backgrounds: 192×144, 15-colour scenes, band measurements, atmospheric rules), 46 (parallax rates, plane distinction by dropped colours), 14 (cityscape light and depth).
- SpriteKitchen "depth in pixel-art backgrounds"; gamineai "10 pixel-art composition rules"; FrameSprite outline-on-background guide; FreeGameSprites silhouette test.
- Derek Yu, "Pixel Art Tutorial" part 2 (naive vs reworked scene); Dawe, *Make Your Own Pixel Art* (thumbnails, p. 79; outline weight by distance, p. 100); Silber, *Pixel Art for Game Developers* (interactive layer vs background, pp. 113–114, 131, 180).
- Mateu-Mestre, *Framed Ink* (purpose before pixels, thirds, tangents, look room, negative space, value masses, axis line); Robertson, *How to Draw* (horizon on a third, overlapping planes); Solarski, *Drawing Basics and Video Game Art* (grouping, composition lines, key and landmark value).
- Arne and Tsugumo via the Pixel Joint corpus (backgrounds calmer than characters); Hampton and Hultgren (eye-path, lines of action).
