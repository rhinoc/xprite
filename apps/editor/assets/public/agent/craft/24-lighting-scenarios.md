# Lighting scenarios

Without a stated light, pixel art shades every form from its own outline inward: concentric bands, pillow shading, shadows that are just "darker".
This file fixes the vocabulary of a lit form, then gives numbers for the common set-ups — sun, overcast, window, fire, night, rim, back-light,
two sources, light from below — and the shadow rules that go with them. General ramp theory is in `craft/20-color-for-pixel-art.md`, the
basic shading order in `craft/02-shading-and-light.md`, flame and glow *effects* in `craft/80-vfx-fire-smoke-magic.md`.

## Rules

1. **Fix the light before the first pixel and never move it.** Direction (default upper-left, from above and a little in front; ¾ top-side is the best single set-up), hardness (hard = 1-px terminator and a crisp cast shadow; soft = few bands, wide dither or a one-step-lighter shadow), colour, and the scene's lighting ratio. A flipped (`applyBatch` `flip`) sprite silently reverses its light: for sprites that will be mirrored, light from top-centre, nudged forward, or hand-fix the flip.
2. **One key dominates.** Lit and shadowed area must be unequal, ≈ 60/40 to 70/30. Never a 50/50 split, never two equal lights from opposite sides, never light from all sides (it erases form). Everything else is a weaker fill.
3. **Vocabulary of a lit round form,** lit → shadow: highlight (specular), light, half-tone, **terminator** (keep it sharp in pixel art), dark half-tone, **core**, **reflected light**, contact occlusion, and the cast shadow. Reflected light is never as bright as the half-tone (nothing in shadow is as light as anything in light). Flat planes get *one* colour per face; only round forms get a ramp, and it follows the curvature only.
4. **The core sits inside, not on the contour.** The darkest entry lies 1–2 px in from the terminator and 1–2 px in from the shadow-side edge; the last 1 px row at that edge steps *one entry lighter* (reflected light, tinted 15–30° toward the sender's hue). Exceptions: where the form touches the ground. Never bounce a colour onto a face that does not face its sender.
5. **Bands are not even rings.** Equal-width concentric bands read as a target. Vary widths; make the terminator band the narrowest.
6. **Sunlit day has three lights:** sun (warm, hard), sky (blue, soft, fills shadows), ground bounce. Recipe: key side hue −10° toward yellow from local colour; shadow side +20…+40° toward blue-violet, S −10…−25, V −30…−45; bounce entry V between shadow and half-tone, hue of the ground (warm for sand, green for grass). Up-facing shadowed planes lean sky-blue, down-facing lean warm.
7. **Shadows borrow the colour of the *other* lights, never black.** With two lights, the shadow of A takes the colour of B. Each material then needs three entries: lit-by-A, lit-by-B, lit-by-both (lightest, desaturated). Where two coloured lights overlap use the pale mix, never a muddy mid; additive mixing (red + green → brighter yellow), not pigment mixing.
8. **Overcast:** compressed value range (e.g. V 40 → 78 instead of 15 → 95), hue shift between light and shadow only ±5–10° (sun: ±20–40°), saturation often *higher* than in sun, no terminator or core. Sort planes by facing (up = lightest, pale cool grey-blue; down = warm grey), not by distance to a light.
9. **Rim light:** 1 px at 16–32 px, 1–2 px at 64 px, on the contour that turns away from the viewer toward the back light; colour = the lightest entry of the local ramp or the light's colour, not `#ffffff`. Break it where a surface faces the viewer; widest on broad planes (shoulder, forehead). It needs a darker background behind it. A rim opposite the key must differ in colour (cool rim vs warm key) and stay ≤ 1 px; a same-colour rim goes on the key's side.
10. **Back-light / contre-jour:** body in 2–3 very dark, low-contrast entries (V span ≤ 15), a 1 px bright contour — dithered along the lower arcs — and the brightest part of the background directly behind the subject. Internal detail is lost; warm light wraps the edge. Backlit foliage and thin cloth glow *more* saturated than front-lit (S 80–95, V 65–90).
11. **Two sources:** one cool (window, sky, moon) and one warm (lamp, fire), one on each side; each form shows a warm side, a cool side, a visible terminator and a shared dark core between them. Double speculars on glossy objects prove two sources.
12. **Fire and candle:** ramp of 4–5 steps — deep red-brown → orange → yellow-orange → pale yellow. Falloff in *steps*: at radius r use entry k, at 2r entry k−2 (≈ ¼ brightness), at 3r entry k−3 or the darkest. A 1–2 px dithered halo of the lightest warm tone around the flame. Shadow sides stay in the same hue family (dark red-brown) — cool only if a second source exists. Flicker = 2–3 frames of halo size and ramp step (derived).
13. **Light from below** (fire, footlights, glowing gem) is unnatural and draws the eye: invert the ramp — brightest on chin, lower lip, under the nose, lower edge of the brow; darkest on the forehead and above the eye sockets; combine a warm key with a cool top shadow.
14. **Night:** shadows deep blue-violet (V 8–25); moonlit planes desaturated blue-green or blue-grey (V 35–60, S 25–45, max V ≈ 70); *only* warm artificial lights are saturated and bright (V 75–100, S 55–90, hue 25–50°). Reds fall to near black-brown while greens/blues stay mid (Purkinje shift). Kill detail: only lit-window edges and roof lines keep crisp contrast; lose edges elsewhere; keep the silhouette against the sky. Day → night: all colours darker, desaturated with distance from the light, simpler palette.
15. **Glow / emissive:** a core of near-white tinted with the light colour, 3 ring steps each ≈ 1 step dimmer (and slightly more saturated), the outermost ring dithered, lightening the background by 1–2 steps; the nearest surfaces take a faint tint of the glow hue. At most 3 rings. In a tiny palette use a saturated medium-light warm entry surrounded by desaturated darks, not the palette's brightest colour.
16. **Cast shadow:** one value darker than the core, drawn with the *receiving surface's* shadow entry, never a black overlay. Find its shape by drawing lines from the light past the silhouette's extreme points. Darkest and sharpest at contact, lighter and softer with distance (1 px hard edge at contact; at 32–64 px a 1 px dither band or half-tone strip ≥ 8 px away; at ≤ 16 px hard edges only). It bends over steps. A ground shadow under a sprite is justified for anchoring; a large cast shadow across the focal character hides its form — keep it off.
17. **Occlusion pass (last):** the darkest ramp entry (not black) along ground-contact lines, armpits, creases, between touching limbs, under hair and brims. 16 px: feet contact and chin only. 32 px: + armpits and between the legs. 64 px: + fold junctions.
18. **Heads.** ¾ top-side light at 45° on one side; the nose shadow may join the cheek shadow into a lit triangle under the shadow-side eye: 2×2–3×3 px at 32–64 px, omitted at 16 px (light the cheek, keep only the nose-side shadow). Frontal light flattens: 2–3 steps, shadows only under chin, nose, hair, brim. Never equal light on both sides.
19. **Shafts and dapples:** a god-ray is a lighter translucent diagonal band (+1 / +2 ramp steps of what it crosses), dithered at the edges, widening away from the source, fading by added dither; it changes the ground only where it lands. Dappled light = scattered round or oval 2×2–3×3 px lit patches, never square clusters.
20. **Mood is colour plus shadow quality:** cheerful = saturated, bright; cold = pale blue, blue shadows; calm = grey-green, low contrast; dramatic = near-black ground, one hard rim, one deep accent. Soft shadow = dither or one lighter step; hard = a dark solid shape.

## Scenario table

| scenario | key (lit) | shadow | numbers |
|---|---|---|---|
| sun, clear | hue −10° toward yellow | +20…+40° toward blue-violet | S −10…−25, V −30…−45; ratio ≈ 3 steps |
| overcast | pale cool grey-blue on up faces | warm grey on down faces | hue ±5–10°, V 40 → 78, S often higher |
| north window | cool blue, floor near the window blue-cast | warm lamp on the other side | one cool ramp + one warm ramp |
| candle / fire | deep red-brown → pale yellow | same hue family, dark red-brown | falloff k → k−2 at 2r, k−3 at 3r |
| moon / night | desaturated blue-green, V 35–60 | blue-violet V 8–25 | max V ≈ 70; warm lamps V 75–100 |
| neon / TV | highlight toward the light's colour (cyan, pink, pale blue) | deeper, may warm | complementary colours = strong contrast |
| under-light | brightest on chin, lower lip | darkest on forehead | warm key, cool top shadow |
| spotlight | defined pool, dark outside | colour of the ambient light | the pool edge is a shape, not a gradient |

## By size

| | 8 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|
| form planes | 1 lit + 1 shadow | lit, shadow, 1-row cast shadow | + terminator, 1 px bounce row, feet/chin contact | + distinct core and reflected, armpits, fold junctions |
| rim / back light | none | 1 px, only on a dark background | 1 px on the lit contour | 1–2 px, widest on broad planes |
| head light | none | light the cheek, nose-side shadow | lit triangle 2×2–3×3 | + secondary light on the shadow cheek |
| cast shadow | hard shape | hard, 1 row | crisp at contact, 1 px dither far away | half-tone strip, wraps over steps |
| glow / halo | 1 ring or none | 1–2 rings | ≤ 3 dithered rings | ≤ 3 rings + tint on neighbours |

## Templates

One clay-coloured sphere under each set-up (head templates for rim and two sources). Roles map onto your own ramps.

```grid light-sphere-key-12
O = outline     #2e1228
H = highlight   #f5d687
A = light       #de9e4b
B = mid         #bd6a2f
C = shadow      #8c402b
R = bounce      #7a3426
K = cast-shadow #4a3a52
---
....OOOO........
..OOAABBOO......
.OAHAAABBCO.....
.OAHHAABBCO.....
OAAAAAABBCCO....
OBAAAABBBCCO....
OBBAABBBBCCO....
OBBBBBBBCCCO....
.OBBBBBCCCO.....
.OCCCCCCCRO.....
..OOCCCCOO......
....OOOOKKKK....
...KKKKKKKKKKK..
......KKKKKK....
```

Key light upper-left with cast shadow: highlight, light, mid, shadow, core one pixel inside, bounce row on the lower-right contour; the ground shadow falls right and slightly down, slightly wider than the ball.

```grid light-sphere-rim-12
O = outline   #2e1228
H = highlight #f5d687
A = light     #de9e4b
B = mid       #bd6a2f
C = shadow    #8c402b
R = bounce    #7a3426
W = rim-light #7fd6e6
---
....OOOO....
..OOAABWOO..
.OAHAAABWWO.
.OAHHAABBWO.
OAAAAAABBCWO
OBAAAABBBCWO
OBBAABBBBCWO
OBBBBBBBCCWO
.OBBBBBCCWO.
.OCCCCCCCRO.
..OOCCCCOO..
....OOOO....
```

Key + rim: the lit side is unchanged; a 1 px cool rim (back light, behind-right) runs inside the dark contour from the upper right down the right side and stops where the surface faces the viewer.

```grid light-sphere-contrejour-12
O = outline       #1b1128
N = body-dark     #2f2144
M = body-mid      #43305a
V = contour-fade  #a8785c
W = contour-light #ffd9a0
---
....WWWW....
..WWMVMNOO..
.WVMMMMMNNO.
.WMMMMMMNNO.
WMMMMMMMMNNO
WVMMMMMMMNNO
WMMMMMMMNNNO
ONMMMMMMNNNO
.ONMMMNNNNO.
.ONNNNNNNNO.
..OONNNNOO..
....OOOO....
```

Contre-jour: body in two dark entries, a 1 px warm contour on the upper-left (the light side), dithered inner pixels fading into the dark body, a dark contour elsewhere.

```grid light-sphere-two-source-12
O = outline        #251538
H = warm-highlight #fbe0a0
W = warm-light     #e69a52
X = warm-mid       #b8643a
K = shared-core    #4a2a48
Y = cool-mid       #4a68b0
Q = cool-light     #7fb6e8
---
....OOOO....
..OOWWXKOO..
.OWHWWXXKKO.
.OHHWWWXKKO.
OWWWWWWXXKKO
OXWWWWXXKKYO
OXXWWXXXKYYO
OKXXXXXKKYQO
.OKKKKKKKYO.
.OKKKKKKKYO.
..OOKKKKOO..
....OOOO....
```

Two sources: warm key from the upper left (highlight, light, mid), a shared dark core in the middle, a cool fill on the lower right edge (mid, light). Terminators of both lights are visible.

```grid light-sphere-underlit-12
O = outline         #1e1228
H = flame-highlight #ffe9a0
A = flame-light     #f7a733
B = flame-mid       #c4532a
C = flame-shadow    #6e2a3a
---
....OOOO....
..OOCCCCOO..
.OCCBBBBCCO.
.OCBBBBBBBO.
OCBBBBBBBBCO
OBBBBAAABBBO
OBBBAAAAABBO
OBBAAAAAABBO
.OBAAAHHAAO.
.OBAAHHHABO.
..OOAAAAOO..
....OOOO....
```

Lit from below by flame: flame highlight, light, mid and shadow rise from the bottom; the top is a cool dark core. Compare the inverted ramp with the key sphere.

```grid light-head-rim-16
O = outline   #3a2030
A = light     #f0b88a
B = mid       #d08a5e
C = shadow    #8d4a4e
D = core      #5d3040
W = rim-light #8fe0f0
E = eye       #2b1d2e
M = mouth     #7a3a42
---
.....OOOOOO.....
...OOBBBBCWOO...
..OBBBBBBBBWWO..
.OBBBBBBBBBBCWO.
.OAAAAABBBBBCWO.
OAAAAAAABBBBBCWO
OAAAAAAABBBBBCWO
OAAAAAAABBBBBCWO
OAAAAEAABBEBBCWO
OAAAAEAABBEBBCWO
OBAAAAAABBBBBCWO
.OBAAABBBDBBBWO.
.OBBBBBBBBBBCWO.
..OBBBBBBBBCCO..
..OBBBBMMBBCCO..
...OBBBBBCCCO...
....OOCCCCOO....
......OOOO......
```

Head lit by a dim key from the left and a strong back light from the right: only the left cheek is lit, the face is mid-tone to shadow, a 1 px cool rim marks the right contour from the temple to the jaw, the eyes are 1 × 2 dark bars.

```grid light-head-two-source-16
O = outline        #3a2038
H = warm-highlight #fbe0a8
W = warm-light     #f0b078
X = warm-mid       #c8704a
K = shared-core    #5a3050
Y = cool-mid       #6a78b8
Q = cool-light     #a4b8ea
E = eye            #2b1d2e
M = mouth          #8a3a46
---
.....OOOOOO.....
...OOWXXXKKOO...
..OWWWWWXXKKKO..
.OWWHHWWWXXKKKO.
.OWWHHWWWXXXKKO.
OWWWWWWWWWXXKKKO
OWWWWWWWWWXXYYYO
OWWWWWWWWWXXYYYO
OWWWWEWWWXEXYYYO
OWWWWEWWWXEXYYQO
OXWWWWWWXXXXYQQO
.OXWWWWXXKXYYQO.
.OXXXXXXXXXYYQO.
..OXXXXXXXKYYO..
..OXXXXMMKKYYO..
...OKKKKKKKKO...
....OOKKKKOO....
......OOOO......
```

Head with warm key from the upper left and a cool fill on the right: the warm side holds highlight, light, mid; a shared violet-brown core; the cool side holds mid and light. The nose shadow (1 px) falls away from the key.

## Procedure

1. Write the light plan: key direction, hardness, colour, temperature; second source and its colour; value of the background behind the lit side; lighting ratio.
2. Set the ramps with `palette` op `set` — one warm and one cool when two sources are used (rule 7); leave room for lit-by-both.
3. Block planes by facing, not by outline: light / half / shadow masks at 60/40–70/30; `render`.
4. Place the terminator (sharp), the core 1–2 px in, the reflected row (rule 4). Round forms ramp with the curve; flat faces take one colour.
5. Add the cast shadow with `applyBatch` ops `stroke` + `fill` using the receiver's shadow entry; edge per By size. Add contact occlusion last (rule 17).
6. Add extra sources: rim (1 px) on the lit contour, back-light contour, second ramp, halo via `applyBatch` `gradient` (`direction` `radial`, `dither` `bayer4`) in the light's colours. Ensure the background is darker behind rims.
7. Check: `effect` `hue-saturation` on a copy — lit/shadow split must still read and not be 50/50; for animated light use `render` `filmstrip` (flicker = 2–3 frames); for flipped sprites compare the mirror.
8. `validate`.

## Mistakes

| symptom | cause | fix |
|---|---|---|
| Sphere looks like a target | equal-width concentric bands | vary band widths, narrow terminator (rule 5) |
| Shadows are muddy black | black overlay or same hue darker | borrow the other lights' colour; hue-shift (rules 6–7) |
| Form looks flat | light frontal, or 50/50 split, or equal lights | one dominant key, 60/40–70/30 |
| Form looks hollow | darkest entry on the contour | core 1–2 px in, bounce row on the edge |
| Rim looks like an outline glow | white rim all around, no dark background | 1 px, lit side only, lightest *ramp* entry, darker background |
| Backlit sprite keeps all its detail | contre-jour drawn as front light | 2–3 dark entries, V span ≤ 15, lose interior |
| Fire-lit object has blue shadows | sun rule applied to a fire | same warm hue family; cool only with a second source |
| Night looks like the day with blue on top | uniform blue tint | desaturate lit planes, deep violet shadows, warm lamps only saturated |
| Bounce tints a face that cannot see its sender | colour spill ignored geometry | only on faces turned toward the sender |
| Mirrored sprite looks wrong | light reversed by the flip | top-centre light or hand-fix |
| Glow looks pasted on | too many rings, brightest palette colour | ≤ 3 rings, 1 step each, dithered outer ring |
| Cast shadow covers the character's face | shadow chosen for drama | keep large shadows off the focal form |

## Review

- One declared light direction, identical on every sprite, tile and frame; lit/shadow areas unequal (never 50/50).
- Terminator sharp; darkest entry inside the form (not on the contour) except at ground contact; bounce row lighter than the core and darker than the half-tone.
- No black shadows; shadow hue matches the other lights; cast shadow is one step darker than the core with a sharper edge at contact.
- Rim / back-light: 1 px, lightest ramp entry or light colour, on a darker background, broken where the surface faces the viewer.
- Night / fire / overcast follow their numbers (table); in fire light no cool shadow without a second source.
- Halo ≤ 3 rings; glow core not the palette's whitest colour unless the palette is large.
- Desaturated copy still shows form; mirrored sprites checked.

## Sources

- Gurney, *Color and Light* (sunlit day, overcast, window, fire, night, hidden sources, light colour mixing, rim/back/front light, bounce, cast and occlusion shadows, transmitted light, halos, pp. 28–71, 114–115, 152–167, 190–199); Loomis, *Figure Drawing for All It's Worth* (four value classes, head lighting set-ups, pp. 68, 78–83).
- Slynyrd Pixelblog PB6 "Light and Shadow", PB42 (night street-level colour); Saint11 (Pedro Medeiros) tutorials: Shading, Illumination Techniques, Darkness, Indoors.
- Solarski, *Drawing Basics and Video Game Art* (core shadow, cast shadow, bloom); Silber, *Pixel Art for Game Developers* (angle to light, cast shadows, pp. 71–77); Dawe, *Make Your Own Pixel Art* (glow rings p. 151, night p. 94); Tsugumo ch. 13 (flip-safe light, limb rule); Ferrari (pools of light, time-of-day recolour); Pixel Logic (light set first, p. 185).
- Mateu-Mestre, *Framed Ink* (hidden and rim light as staging, pp. 42, 51, 65); Thomas & Johnston, *The Illusion of Life* (shadow and rim as mood devices).
