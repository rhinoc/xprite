# Hard materials: metal, gold, glass, gems, stone, wood, bone

Hard materials fail in two ways: everything gets the same grey-brown ramp, or every material gets a highlight. A material is mostly its *highlight behaviour* and *ramp contrast* — how many pixels shine, how hard the band edges are — not a special colour. Soft materials are in `23-materials-soft`; light colour in `24-lighting-scenarios`; ramp theory in `20-color-for-pixel-art`.

## Rules

1. **Order for any hard material** (every source agrees): silhouette → base light + base shadow → backlight / secondary shadow → highlight or specular → reflection / refraction → clean-up (orphans, cracks, scratches). No texture before the form works.
2. **Gloss decides the highlight.** Matte (stone, wood, bone): none or very soft, low contrast, slow transitions. Glossy (glazed, plastic, wet): a 1–3 px specular, *no* long ramp. Metal and chrome: longer ramp, hard-edged bands, high contrast. Glass: transparency plus sudden white speculars. Wet surfaces: more speculars, details pop.
3. **Mirror rule.** A reflective surface is ordinary form-lighting *plus* a reflection layer painted on top. At ≤ 32 px draw 3–4 hard-edged bands in the scene's real colours (sky colour on top, a dark horizon band, ground colour below, one specular) — never a smooth ramp. The more reflective, the more saturated and contrasty the reflected world.
4. **Metal: lights colder and less saturated, darks warmer and more saturated.** Hue travel is tiny (steel ≈ +3°, S 7–24); the warmth comes from a *different* dark entry (violet/plum), not from rotating the whole ramp. Expect a strong rim or back light. Scratches, dents and wear tell the object's story. Metal is stiff: parts move individually, never stretch; animate the reflection by angle, not the shape.
5. **Specular placement.** 1–2 px at the top of the ramp, hue = light colour mixed ≈ 70/30 with the local colour; never `#ffffff` unless the object is a mirror or emitter. On a round object it may be a ring or crescent. It need not sit on the lit edge: a highlight on the *far* edge instead of a bevel makes a form feel solid, stone-like.
6. **Gold is not orange.** Dark entries are desaturated orange-brown (H 22–27, S 75, V ≈ 44), body yellow-orange (H 37–45, S 65–75, V 55–70), specular pale yellow. Reflections add a slightly paler or bluer band. If the palette has no true golden yellow (Resurrect 64's `#f9c22b` leans orange) switch ramp: Endesga 64 `#edab50 #ffc825 #ffeb57` or AAP-64 `#bb7547 #dba463 #f4d29c #ffd541 #fffc40`.
7. **Glass: show the world through it.** The cheapest read of "see-through" is a border-only container; add 2–3 tiny slightly curved highlights, one tinted lighter band, shade *away* from the highlight, and let the background show. Never fill it opaque. The shadow of glass has a bright core streak (focused light).
8. **Gems are flat facets, each one value.** Anatomy: table, crown, girdle, pavilion; cuts brilliant, cushion, cabochon (smooth dome — a ramp, no facets). Light a facet *whole*. The shadow side takes a "refraction" step: warmer or more saturated, one step, not darker. One point highlight (1 px) and one dark facet opposite it.
9. **Gem shine animation:** each facet flashes whole; the middle frames cover the largest area, eased; on cabochons a rounded spot travels with the same easing. 3–4 frames. A coin or flat metal: the spec travels along the *edge*, not across the face; a goblet gets two specs — move the edge one, hold the centre one.
10. **Stone: plane grouping.** Reduce the rock to four plane classes — top (lightest), side in half-light, front in dark half-tone, shadowed side — and give each plane *one* ramp entry (≤ 32 px). Chromatic greys: warm lit planes, cool shadows. Texture is ≤ 2-entry variation in the half-tone band only; keep highlight and core flat. Five clean colours beat a noisy texture.
11. **Stone families decide shape and shine.** Igneous: rounded, gas holes, porous, very soft highlights (granite speckled grey, basalt dark blue-grey, obsidian near-black glossy). Sedimentary: layered, softest, crumbles, big soft highlights (limestone tan, bauxite red-brown). Metamorphic: breaks in large chunks, strong highlights, big clean areas (marble white with veins, slate dark flat). Rock colour must suit the geology of the scene: grey stone in a red canyon looks wrong.
12. **Cracks:** thin cracks end in a *lighter* pixel, deeper cracks in a darker one (line weight applied to cracks). Moss goes in crevices. A 2–3 px bevel on a block: light edge top-left, 1 px dark edge bottom-right.
13. **Wood: hue-shift the shadows toward crimson,** slow transitions, don't overdo the highlight, no pillow shading. Planks: big shapes and bevels first, grain after, raise contrast at joins; grain lines are broken, never full length. Bark: individual scales *lit as one shape*. End grain: rings fade with distance from the cut face. Details: knots, nails, cracks, moss.
14. **Bone is cream, not white.** Hue 44–50, S ≤ 30; shadows go warm taupe → violet-brown. Matte: no specular. Skeleton icons keep the eye sockets as 2×2 dark blocks and drop everything else at ≤ 9 px.
15. **Ice and snow** (brief): six tones, snow only on up-facing faces, reflection glint crossing the ice planes; sunset snow takes pink lights and blue-violet shadows. Soft-matter snow detail in `23-materials-soft`.

## Material recipes (dark → light)

| material | ramp (hex) | hue / saturation behaviour | the one trick |
|---|---|---|---|
| steel | `#181425 #262b44 #3a4466 #5a6988 #8b9bb4 #c0cbdc` + `#ffffff` (Endesga 32); alt AAP `#333941 #4a5462 #6d758d #8b93af #b3b9d1 #dae0ea` | S 7–46, travel ≤ 10°; darkest entry warmer (H ≈ 254) | 3–4 hard bands; strong rim |
| gold (derived from measured ranges) | `#3b1f14 #703c19 #a8723a #b38936 #ebcc6a #fffad1` | H 17→54, S 66→18 | orange-brown darks, pale-yellow spec |
| glass | edge `#6aa0b3`, tint `#a3d1db` (H 191, S 26, V 86), rim `#cdeef0`, shade `#3f6f82` | low S, cool; one tinted band | border only; bg shows through |
| ruby (measured, 7 tones) | `#3f2832 #7b2056 #9e284b #e43b44 #ff596a #ff97b1 #ffffff` | refraction `#7b2056` / teal `#21503d` accent | whole-facet values |
| stone (derived) | `#2a2633 #454257 #6a687b #948d8a #c4bdb0` | warm lit, cool shadow, S 3–25 | one entry per plane |
| wood (derived) | `#422127 #6b3f30 #996740 #c2966b #e0bb8b` | H 349 → 34, 10–15°/step, S 38–58 | crimson shadows |
| night wood | `#1d1524 #422b42` | near-black violet → plum | one colour on dark bg |
| bone (derived) | `#422e37 #705159 #a38c72 #d6cbab #f7f3df` | H 335 → 50, S 10–30 | cream light, violet-brown core |
| ice (measured, 6) | `#0a3059 #004da0 #1f74a4 #40949a #c0cbdc #ffffff` | deep blue → glow teal → snow | reflection glint cycles planes |

Other gem hues (derived): emerald and sapphire use the green and blue 5-step ramps from `20-color-for-pixel-art`, with the refraction step moved 25–40° off the shadow hue.

## By size

| material | 8 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|
| metal | dark + mid + 1 spec px | outline + base + shadow edge + 1 white spec (+ 1 px rim) | 4–5 hard bands, 2–3 px scratches | 6 tones, reflection layer, dents |
| gold | 2 tones + spec px | 3 bands + pale spec | + horizon band, engraved marks inside the shading | + reflected colours |
| glass | ring + 1 px highlight | lighter ring + 2 px curved highlight; skip translucent blend | + tint band, caustic in shadow | + refraction, bubbles |
| gem | 2 bands + 1 point | outline, 3 facet bands, 1 white point, 1 dark facet | + refraction step, 6–7 tones | full 7-tone ramp, shine frames |
| stone | 2 planes | 3 planes + 1 crack | 4 planes, bevel, moss | + strata, crumbling edge |
| wood | 2 tones | 3 tones + 1–2 grain strokes | + bark scales, rings | + knots, cracks |
| bone | 2 tones | light / mid / shadow + outline | + knuckle shading | + texture pits |

## Templates

Light upper-left. Chrome and gold share one band layout so the colour decides the material.

```grid mat-metal-sphere-12
O = outline      #181425
D = horizon-dark #4a3340
G = ground-refl  #8d7a88
M = sky-mid      #8b9bb4
L = sky-light    #c0cbdc
W = specular     #ffffff
---
....OOOO....
..OOLLLLOO..
.OLWWLLLLLO.
.OLWMMLLLLO.
OMMMMMMMMMMO
OMMMMMMMMMMO
OMMMMMMMMMMO
ODDDDDDDDDDO
.ODDGGGGDDO.
.OGGGGGGGGO.
..OOGGGGOO..
....OOOO....
```

Steel ball: sky-light, sky-mid, dark horizon band, warm ground reflection, 3-px L-shaped spec at the top-left. Roles map to the scene's own sky and ground.

```grid mat-gold-sphere-12
O = outline        #3b1f14
D = horizon-shadow #703c19
G = ground-refl    #a8723a
M = body           #b38936
L = sky-refl-light #ebcc6a
W = specular       #fffad1
---
....OOOO....
..OOLLLLOO..
.OLWWLLLLLO.
.OLWMMLLLLO.
OMMMMMMMMMMO
OMMMMMMMMMMO
OMMMMMMMMMMO
ODDDDDDDDDDO
.ODDGGGGDDO.
.OGGGGGGGGO.
..OOGGGGOO..
....OOOO....
```

Gold ball: same bands, warm ramp. The horizon shadow is orange-brown, the sky reflection pale yellow, the spec near-white yellow.

```grid mat-glass-orb-12
B = rim-light   #cdeef0
T = glass-edge  #6aa0b3
S = glass-shade #3f6f82
H = highlight   #dff3f4
W = specular    #ffffff
C = caustic     #c9f2f0
F = tint        #8fc3d1
---
....BBBB....
..BB....TT..
.B..HH....T.
.B.W......T.
B..H.......S
B..........S
B.........FS
B........FFS
.T......CFS.
.T.....CFFS.
..TT....SS..
....SSSS....
```

Glass orb: only the contour exists — bright upper-left rim, mid tint, darker lower-right rim; two curved highlights, a tint patch and a bright caustic where light focuses. The interior stays transparent.

```grid mat-gem-cut-12
O = outline-deep      #3f2832
P = highlight-refl    #ff97b1
W = point-highlight   #ffffff
L = highlight         #ff596a
M = midtone           #e43b44
S = shadow            #9e284b
F = shadow-refraction #7b2056
---
..OOOOOOOO..
.OPPLLLLMMO.
OPWLLLLLMMSO
OOOOOOOOOOOO
.OPPLLMMSSO.
.OPLLMMMSFO.
..OPLMMSFO..
...OLMSFO...
....OLFO....
.....OO.....
```

Brilliant-cut ruby, front view: crown facets over a 1 px girdle, pavilion converging to a point. Highlight reflection and point highlight upper-left, refraction step lower-right, deep colour only in the contour.

```grid mat-stone-boulder-12
O = outline           #2a2633
T = top-plane-lit     #c4bdb0
M = front-plane       #948d8a
S = side-plane-shadow #6a687b
D = core-shadow       #454257
C = crack             #2a2633
K = crack-lip         #d9d3c6
---
....OOOO....
..OOTTTTOO..
.OTTTTTTTMMO
OTTTTTTMMMSO
OMMMMMMMSSSO
OMMCMMMMSSSO
OMMMCMMMSSDO
OMMMMKMSSDDO
.ODDDDDDDDO.
..OOOOOOOO..
```

Boulder as four planes: lit top, mid front, shadowed side, dark base. The crack runs 3 px and ends in a lighter chip.

```grid mat-wood-log-end-12
O = bark-outline #422127
B = bark         #6b3f30
W = wood-light   #e0bb8b
R = ring         #996740
P = pith         #6b3f30
---
....OOOO....
..OOBBBBOO..
.OBBWWWWBBO.
.OBWRRRRWBO.
OBWRWWWWRWBO
OBWRWPPWRWBO
OBWRWPPWRWBO
OBWRWWWWRWBO
.OBWRRRRWBO.
.OBBWWWWBBO.
..OOBBBBOO..
....OOOO....
```

End grain: bark ring, light wood, two growth rings, pith. Flat face, so no ramp across it — the rings carry the form.

```grid mat-wood-plank-14
O = outline     #422127
L = bevel-light #e0bb8b
M = body        #c2966b
G = grain       #996740
S = shade       #6b3f30
N = nail        #e0bb8b
---
OOOOOOOOOOOOOO
OLLLLLLLLLLLLO
OMNMGGGGMMMMMO
OMMMMMMGGGGMMO
OMMGGGMMMMMMMO
OSSSSSSSSSSSSO
OOOOOOOOOOOOOO
```

Plank: 1 px bevel light on top, shade row at the bottom, three broken grain strokes at different lengths, one nail.

```grid mat-bone-femur-16
O = outline #422e37
L = light   #f7f3df
M = mid     #d6cbab
S = shadow  #a38c72
---
.OOO........OOO.
OLLLOOOOOOOOLLLO
OLLLLLLLLLLLLLLO
OMMMMMMMMMMMMMMO
OSSSMMMMMMMMSSSO
OSSSOOOOOOOOSSSO
.OOO........OOO.
```

Femur: two-lobed knobs, a shaft lit from above (light / mid / shadow rows), warm taupe shadow, no specular.

## Procedure

1. Pick the gloss class (rule 2) and the ramp from the table; load or write it with `palette` op `set`.
2. Block in the silhouette with the mid entry; `render` — the shape must read before any band is drawn.
3. Draw base light and base shadow as planes or crescents (`applyBatch` ops `ellipse`, `stroke`, `fill`, or `grid` from a template above).
4. Add the material layer: bands for metal/gold, border + highlights for glass, facet values for gems, plane entries for stone, grain and bevels for wood.
5. Place the specular last (1–2 px) with `applyBatch` `pixels`; skip it on matte materials.
6. Add one story detail only: scratch, crack, knot, chip. `readPixels` `format:"grid"` to confirm no orphan pixels and no 2×1 doubles.
7. For shine or sparkle animation: duplicate frames with `copyFrame`, move only the spec/facet highlight, `setFrameDuration` `durations` (3–4 frames, eased), check with `render` `filmstrip`.
8. `validate`.

## Mistakes

| symptom | cause | fix |
|---|---|---|
| Chrome looks like a grey ball | smooth gradient ramp | 3–4 hard bands in sky/horizon/ground colours (rule 3) |
| Steel looks like cardboard | one hue, no warm dark | add a plum-warm darkest entry; keep lights cool, S ≤ 24 |
| Gold looks orange or mustard | ramp rotated toward red, no pale top | pale yellow spec, orange-*brown* darks, true golden mid |
| Glass looks like a blue plastic ball | opaque fill | border-only + highlights, background visible |
| Gem looks like a shiny pebble | smooth gradient on facets | one value per facet, point highlight, refraction step |
| Stone looks noisy | per-pixel texture, > 5 colours, orphans | plane entries; texture only in the half-tone band |
| Wood looks like a striped pillow | pillow shading, full-length grain | shade from the light, break grain strokes |
| Bone looks like paper | pure white, no shadow hue | cream light `#f7f3df`, violet-brown core |
| Everything is shiny | highlight copied across materials | matte = none; gloss = 1–3 px; metal = bands |
| Two speculars on a flat coin | treated as a sphere | one spec travelling along the edge |

## Review

- The material is identifiable in a one-colour blob test *and* in colour: gloss class matches the highlight count and band hardness.
- Metal/gold use hard bands, not a smooth ramp; glass shows the background; gems are flat facets.
- Specular ≤ 2 px (≤ 4 px at 32+), not pure white unless mirror/emitter; none on stone, wood, bone.
- Stone uses one entry per plane; cracks end in a lighter or darker pixel; no orphan pixels.
- Shadows hue-shifted (wood toward crimson, stone cool, bone violet-brown), none are black.
- Light direction identical to the rest of the sprite.

## Sources

- Saint11 (Pedro Medeiros) tutorials: Metal, Gems, Rock, Ice, Wood, Shine; Slynyrd Pixelblog PB13 "Rocks"; Rappenem, "Pixel Art Tutorial – Gold"; imonk's 24×24 health-potion tutorial; GameDevAcademy metallic pixel-art tutorial.
- Arne's painting tutorial (gold, gloss, glass), ENDESGA highlight notes; Pixel Logic (Ch. 3; pp. 167–172, 194: crack weight, metal edge rounding); Silber, *Pixel Art for Game Developers* (glass, brick, mug, stone wall, pp. 154–156, 196–197, 214–215).
- Gurney, *Color and Light* (mirror and glass rules, caustics, plane grouping, pp. 46, 160–165); Dawe, *Make Your Own Pixel Art* (damage by material, pp. 157–159).
- Measured ramps: Endesga 32/64, AAP-64, Resurrect 64, Lospec JSON; gold/gem samples read from the Saint11 sheets (noted as approximate).
