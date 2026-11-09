# Colour for pixel art

Colour is where machine-made pixel art gives itself away: ramps that only get darker, one saturation for every swatch, pure black outlines, a rainbow where three hues would do. This file fixes ramp structure, hue travel, saturation and value in numbers. Palette *size* and hardware limits live in `21-limited-and-platform-palettes`; per-material ramps in `22-materials-hard` and `23-materials-soft`; coloured light in `24-lighting-scenarios`.

## Rules

1. **Value first, hue second.** Block in and judge the form in greys (`effect` `hue-saturation` on a copy, or squint at `render`), then add hue. Value carries the read; hue carries mood. If the greyscale copy mushes, no hue fixes it.
2. **Write ramps as H/S/V, not as "darker hex".** Hue 0–360°, saturation and value 0–100. Picking by sliders makes the three axes independent; picking by eye ties them together and gives plastic ramps.
3. **Ramp length by size.** 8 px: 2–3 steps. 16 px: 3–4. 32 px: 4–5. 64 px: 5–6 plus one accent ramp. Seven or more only for big surfaces (boss, sky, 128 px+ portrait) where banding and pillow shading creep in. Two steps closer than ~10 V (or ΔE < 3, see `01-palette-and-color`) are one colour to a viewer — delete one.
4. **Hue direction: toward the nearest bright/dark hue, not up and down the wheel.** Lightening a warm ramp → toward yellow (40–70°). Darkening a warm ramp → toward crimson/magenta (320–355°). Darkening a green → teal (150–185°). Darkening a blue → indigo (225–260°). Cool ramps (blue, teal, violet) lighten toward cyan (160–205°), *not* yellow. Skin and wood shadows go red/purple; a blue skin shadow looks frostbitten.
5. **Hue travel budget (measured on 25 ramps from Resurrect 64, AAP-64, Endesga 32/64, Apollo, MagicPixel):**

   | ramp family | steps | total travel | per step | direction as it lightens |
   |---|---|---|---|---|
   | warm (red→orange→yellow) | 5–8 | +40…+80° | +9…+14° (max one step ≈ +28°) | toward yellow |
   | skin, light | 5–7 | +35…+60° | +6…+11° | toward yellow-peach |
   | skin, deep | 8 | ≈ +18° | ≈ +2.5° | almost none — value does the work |
   | green | 5–7 | −75…−100° | −15…−25° | teal → yellow-green (hue *falls*) |
   | blue | 5–7 | −35…−60° | −4…−15° | indigo → cyan |
   | steel / neutral | 5–6 | ≈ +3° | ≈ 0 | none; saturation 7–24 |

   *Conflict resolved:* Slynyrd builds +20°/step and calls it his ceiling; measured shipped ramps average 9–14°.    Use the measured numbers. Cap any single step at 20°; cap total travel at 30–50° for a 3-tone ramp, ≤ 100° for 7–9    steps. 15–20°/step is for foliage, slime, crystal, magic; 10–15° for skin, wood, anything familiar; > 25° only on purpose.
6. **Saturation is a hump, not a line.** Lowest at both ends, peak at the middle, never 0 or 100. For a 5-step ramp (resampled from 23 shipped ramps): V ≈ 34 / 56 / 74 / 86 / 94; S ≈ 0.84 / 0.91 / 0.94 / 0.86 / 0.61 × the ramp's peak. Peak S: 65–85 saturated materials, 45–60 skin, 7–24 steel. Where the peak sits depends on hue: yellow in the top third of the ramp, blue in the bottom third, red/green in the middle (a colour is most vivid at a different lightness per hue). **Never max S and max V on one swatch** — it burns the eye. Value steps shrink toward the light end (≈ 23 / 19 / 15 / 10).
7. **Ramp ends carry their own hue.** Darkest ≈ V 12–18 tinted with the ramp's hue (not `#000000`); lightest ≈ V 96–100 with S ≈ 15 (cream, mint, lilac — not `#ffffff`). Mixing pure black/white into a hue muddies the middle. Outlines use the darkest ramp entry.
8. **Tinted darks, chromatic greys.** Pure black is allowed once, for contact accents. A pure grey (S = 0) at most once per palette. Neutrals: S ≤ 12, V 25–80, three or four leaning warm, three or four leaning cool. Dark seeds below.
9. **Temperature is a second value.** Tag every ramp warm or cool; touching regions should differ in temperature *and* value. At 16 px temperature contrast is cheaper than an extra value. Light and shadow oppose each other only slightly (≈ 20–40° apart in sun, ±5–10° overcast) — never literally red against blue.
10. **Value comes from the scene's light, not the material's name.** A white tunic in forest shade sits at V 45–55; only sunlit white gets the top one or two entries. Keep V 100 and V 0 for speculars and contact accents, never for large areas.
11. **Chroma budget.** ≤ 15 % of pixels above S 70, the rest S ≤ 40; a 16-colour palette holds ≤ 3 high-chroma entries. One accent hue per sprite or screen, ≤ 5–8 % of pixels, on the focal feature (eyes, gem, flame, cursor). Raise S by 10–20 for 1–2 px details — small patches read greyer than the same hue in a large fill.
12. **Make light read as glowing** by surrounding a saturated medium-light warm entry with desaturated darks, not by using the palette's brightest colour.
13. **Share structure.** Ramps share ends: branch from one dark, re-converge on one light; reuse a swatch as the mid of another ramp. Big palettes: build one ramp, rotate it in equal hue steps (Mondo: 8 ramps × 9 swatches, +45° each), then add a desaturated copy for neutrals.
14. **Pick a scheme and leave the rest out.** Monochrome (still drift the hue), analogous (calm), complementary (main + small complementary accent), triad (three hue families × 3–4 steps ≈ 10–12 colours + 3–4 neutrals + 1 accent = a 16-colour palette). No fourth saturated hue unless it is *the* accent.
15. **Foliage is never one green.** Three families: yellow-green (lit), mid green, blue-green (shade), plus one desaturated red-brown or magenta-grey in the darkest shade. Cap dark-to-mid S at 60–65; only sunlit tips exceed S 75 (see `63-trees-and-foliage`).
16. **Key before palette.** High-key: most pixels in the top 2–3 ramp steps. Mid-key: balanced. Low-key: most pixels in the bottom 2–3 with light accents on the focal area. Per-scene lighting ratio (lit body → shadow body): hard noon ≈ 3 steps, soft dusk 1–2, theatrical 4+; reuse it for every sprite in the scene.
17. **Judge a colour at 1× against its neighbours,** never in the swatch: it shifts toward the complement of its surround. Do not over-correct — a detail that looks grey next to a loud neighbour tempts you to raise it, and everything ends over-saturated.
18. **Distance and time of day are palette moves.** Far = less saturated, dimmer, hue toward the sky colour; night = darker, desaturated with distance from the light. Bake it into a duplicate ramp per depth plane, never a semi-transparent overlay (`60-skies-and-atmosphere`).

## Ramp recipes (HSV → hex)

Build any ramp from these shapes; `palette` op `set` writes the hex.

| ramp | H | S | V | hex, dark → light |
|---|---|---|---|---|
| warm 5 (base H 25, peak S 75) | 1 / 13 / 25 / 34 / 43 | 64 / 69 / 75 / 66 / 45 | 32 / 55 / 74 / 87 / 96 | `#521e1d #8c402b #bd6a2f #de9e4b #f5d687` |
| green 5 | 170 / 150 / 120 / 95 / 75 | 60 / 72 / 70 / 58 / 50 | 32 / 50 / 68 / 84 / 95 | `#215249 #248052 #34ad34 #8ed65a #d4f279` |
| blue 5 | 235 / 222 / 210 / 200 / 190 | 45 / 60 / 70 / 55 / 35 | 30 / 52 / 72 / 90 / 99 | `#2a2d4d #354d85 #3777b8 #67bbe6 #a4eefc` |
| violet 5 (derived) | 255 / 266 / 276 / 290 / 310 | 50 / 55 / 52 / 38 / 22 | 24 / 42 / 62 / 80 / 94 | `#261f3d #4a306b #7d4c9e #bf7ecc #f0bbe7` |
| steel 6 (AAP-64) | 214–228 | 7–24 | 25 → 92 | `#333941 #4a5462 #6d758d #8b93af #b3b9d1 #dae0ea` |
| warm grey 4 (derived) | 34–40 | 8–10 | 42–78 | `#6b6763 #8a857f #a8a399 #c7c0b3` |
| cool grey 4 (derived) | 220–240 | 10–14 | 38–78 | `#535361 #707280 #9196a3 #b3bac7` |
| tinted darks (derived, V 14–20) | plum 300 · brown 18 · teal 190 · green 130 · indigo 255 · wine 345 | 34–45 | 14–20 | `#2e1e2e #2b201b #182629 #152418 #1b1629 #331c22` |

Seeds: `#543a54` (84, 58, 84) — one favourite dark purple that seeds many ramps. Mondo (Slynyrd): every ramp's darkest swatch is a near-black tinted with its hue (V ≈ 15), its lightest a near-white tinted cream/mint/lilac (S ≈ 15); its 9-step teal reads H 100→260 (+20°/step), S 20/40/60/70/75/60/45/30/15, V 15/30/45/60/70/80/90/95/100.

**Tool note (derived from `src/lib/color.ts`).** `palette` op `ramp` rotates hue by only ±25° × `spread` at the two ends (≈ ±14° at the default 0.55, ±25° at 1.0) and always in the same direction: shadows +hue, highlights −hue. That matches the rules above for green, cyan and blue bases but runs the *wrong way* for red–orange–yellow bases (shadows drift toward yellow, highlights toward magenta). `adjustHsl` moves ≈ 3.75° per 0.15 step. For warm materials write the ramp from the table and `palette` op `set` it; use `palette` `ramp`/`adjustHsl` only for cool bases or for small nudges.

## By size

| | 8 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|
| ramp steps per material | 2–3 | 3–4 | 4–5 | 5–6 (+ accent ramp) |
| colours per sprite (incl. outline) | 3–4 | 4–6 (≤ 8) | 8–16 | 16–24 |
| hue travel per ramp | ≤ 30° | 30–50° | 40–60° | 50–80° |
| highlight | 1 px or none | 1 px | 2–4 px cluster | 1–2 clusters + rim |
| what survives | temperature + value | + hue-shifted shadow | + reflected light, accent | + saturation hump, neutrals |

Reference counts: NES Mario-class 3 colours + transparent; Celeste's Madeline 12 entries incl. transparency; SNES-class sprite 9–15; a 32×64 tutorial sprite ≈ 16 colours in 5 ramps.

## Templates

Spheres are the colour test bench: if the ramp cannot model a sphere it cannot model anything else. Light is upper-left. Map roles onto your own ramp; the hex only makes the grid renderable.

```grid color-sphere-16-zones
O = outline     #3a1520
H = highlight   #f5d687
A = light       #de9e4b
B = half-light  #bd6a2f
C = shadow      #8c402b
D = shadow-core #521e1d
R = reflected   #7a3426
---
.....OOOOOO.....
...OOAAABBCOO...
..OAAAAAABBCCO..
.OAAHHAAABBBCCO.
.OAHHHAAAABBCCO.
OAAAHHAAAABBCCRO
OAAAAAAAABBBCCRO
OBAAAAAAABBBCCRO
OBBAAAAABBBBCCRO
OBBBBBBBBBBCCDRO
OCBBBBBBBBCCCDRO
.OCCBBBBCCCCDRO.
.OCCCCCCCCCDDRO.
..OCCCCCCDDRRO..
...OORRRRRROO...
.....OOOOOO.....
```

The full anatomy at 16 px: highlight → light → half-light → shadow → shadow core 1–2 px *inside* the contour → reflected light as a 1 px row on the contour. Use for orbs, big props, boss parts. Never put the darkest entry on the outer contour of the shadow side unless the form touches the ground there.

```grid color-sphere-12-4tone
O = outline   #3a1520
H = highlight #f5d687
A = light     #de9e4b
B = mid       #bd6a2f
C = shadow    #8c402b
---
....OOOO....
..OOAABBOO..
.OAHAAABBCO.
.OAHHAABBBO.
OAAAAAABBBCO
OBAAAABBBBCO
OBBAABBBBBCO
OBBBBBBBBCCO
.OBBBBBBCCO.
.OCBBBBCCCO.
..OOCCCCOO..
....OOOO....
```

Four tones + outline: the working budget for a 12–16 px prop. The reflected row is dropped; the shadow entry doubles as core.

```grid color-sphere-8-3tone
O = outline #3a1520
L = light   #de9e4b
M = mid     #bd6a2f
S = shadow  #8c402b
---
..OOOO..
.OLLLMO.
OLLLLMMO
OLLLLMMO
OLLLMMMO
OMMMMMMO
.OMMMSO.
..OOOO..
```

Three tones + outline at 8 px: no highlight pixel, the light step is the highlight.

```grid color-sphere-pair-flat-vs-shifted
O = outline        #3a1520
a = flat-light     #d8924a
b = flat-mid       #a8683a
c = flat-shadow    #774526
A = shifted-light  #f2c46a
B = shifted-mid    #cf7a35
C = shifted-shadow #7e3346
---
...OOOO.......OOOO...
.OOaabbOO...OOAABBOO.
.OaaaabbO...OAAAABBO.
OaaaaabbcO.OAAAAABBCO
OaaaaabbcO.OAAAAABBCO
ObaabbbbcO.OBAABBBBCO
ObbbbbbccO.OBBBBBBCCO
.OcbbcccO...OCBBCCCO.
.OOccccOO...OOCCCCOO.
...OOOO.......OOOO...
```

Same sphere, same value structure. Left: one hue, only value moves — reads as plastic. Right: light toward yellow, shadow toward crimson (here ≈ 60° total, deliberately strong). Use as a checklist image.

```grid color-sphere-12-value-only
O = outline  #101010
H = value-92 #ebebeb
A = value-72 #b8b8b8
B = value-52 #848484
C = value-32 #525252
---
....OOOO....
..OOAABBOO..
.OAHAAABBCO.
.OAHHAABBBO.
OAAAAAABBBCO
OBAAAABBBBCO
OBBAABBBBBCO
OBBBBBBBBCCO
.OBBBBBBCCO.
.OCBBBBCCCO.
..OOCCCCOO..
....OOOO....
```

Value-structure pass (rule 1): four greys must already model the form. Map each grey to one ramp step, then add hue.

## Procedure

1. State key (high/mid/low), light direction, temperature of light and of shadow, and the scene's lighting ratio — in writing, before the first pixel.
2. `palette` op `get`, then op `analyze`: note existing ramps, near-duplicates (ΔE < 3) and any off-palette art colours. A fixed palette beats a new one: walk its ramps (rule 13).
3. For a new palette: write each ramp as H/S/V from the table, set it with `palette` op `set`; keep ramps adjacent in index order so shading walks them. Check the tool note above for warm bases.
4. Block in flat colours using each ramp's *mid* step. `render`; run `effect` `hue-saturation` on a copy and confirm the shapes read.
5. Add one shadow step, then one light step, then (only if the budget allows) core, reflected row, highlight — see `02-shading-and-light` and `24-lighting-scenarios`.
6. Set outlines to each region's darkest ramp entry (`04-outlines-and-edges`); spend the accent hue last on the focal feature.
7. `palette` op `analyze` again (near-duplicates, unused entries), then `validate`. Fix any "colour moved a long way" (ΔE > 12) by choosing another colour, not by switching palette lock off.

## Mistakes

| symptom | cause | fix |
|---|---|---|
| Plastic, flat, "gradient slider" look | value-only ramp, or the same S on every swatch | hue travel per rule 5, S hump per rule 6 |
| Muddy middles | ramp ends built from pure black/white | tinted dark (V 12–18) and tinted light (S ≈ 15) |
| Eye-burn, shiny pink instead of red | S ≈ 100 with V ≈ 100; over-highlighted | cap the highlight at S ≤ 60; use shadows for volume |
| One colour "jumps out" of its ramp | punch-through: off-hue or too saturated | pull it back to the neighbouring ramp's hue family |
| Seasick, over-coloured ramp | > 25° per step or total travel > 100° | cap steps at 20°, shorten the ramp |
| Dead, frostbitten skin | blue shadow | shift the shadow toward red/violet (rule 4) |
| Everything loud, nothing focal | no neutrals, accent budget ignored | rules 8 and 11 |
| Garish foliage | one tube-green | rule 15 |
| Light source does not glow | uses the palette's whitest colour | rule 12 |
| Shading invisible when squinted | adjacent steps too close in V | ≥ 10 V apart; raise contrast of the dominant ramp (yellow is a frequent offender) |

## Review

- No `#000000` / `#ffffff` unless it is a contact accent or speculars; darkest entry is tinted.
- Each ramp's hue moves monotonically and toward the correct side; no step > 20°; total travel inside the by-size budget.
- Saturation peaks mid-ramp; no swatch has both S and V near 100.
- At most one accent hue, ≤ 8 % of pixels; at most one pure grey.
- Desaturated copy: silhouette and light/shadow split still read; adjacent steps visibly different at 1×.
- Light and shadow differ in temperature; shadows are not blue on skin, not black anywhere.
- Outlines are ramp-dark entries, not black.

## Sources

- Slynyrd Pixelblog PB1 "Color Palettes" (Mondo ramp, S/V curves, 128-colour construction); PB6 "Light and Shadow".
- Saint11 (Pedro Medeiros): "Basic Color Theory" article and the Shading tutorial; Derek Yu, *Pixel Art Tutorial* parts 1–2; Arne's pixel and painting tutorials; Cure (Logan Tanner), "The Pixel Art Tutorial"; FinalBossBlues; Purloux; the-pixel.art "Hue shifting pixel art shading" (secondary blog).
- *Pixel Logic* (Ch. 3 "Colour", pp. 60–85; Ch. 5 dithering, pp. 114–133): hue shifting, saturation recipes, tinted blacks, greys.
- Gurney, *Color and Light* (hue/chroma/value, greys, limited palettes, gamut, perception, pp. 46–151); Silber, *Pixel Art for Game Developers* (ramps, saturation, contrast).
- Measured ramps: Resurrect 64, AAP-64, Endesga 32/64, Apollo, MagicPixel (Lospec JSON), as tabulated in the notes.
