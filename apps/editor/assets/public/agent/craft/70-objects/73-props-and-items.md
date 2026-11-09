# Props and items: weapons, potions, chests, keys, shields

Props expose every error in a scene because their geometry is exact: a chest whose lid and body use two different cameras, a sword in white, a potion with no glass. Items are also read at a glance and at 1×, so silhouette and one clear material cue matter more than detail. Forms underneath: `72-3d-forms`. Materials: `22-materials-hard`.

## Rules

1. **Silhouette first.** Fill the item with one flat colour; it must still name itself at 1×. Reduce to an iconic outline and about six colours before any detail.
2. **Size is dictated by the world.** A 16 px tile means 16×16 items; a big prop (large chest) may half-fill 32×32. Break tall things into tile-sized pieces. Colour budget: 8×8 item 3–4 colours, 16×16 ≤ 6 (simple item 3–4), 32×32 5–9.
3. **One projection and one light across the whole set.** Side view or tilted 3/4, not both; a cabbage drawn straight-on among tilted vegetables is the classic break (`70-perspective`).
4. **Fit the icon square.** Long objects (swords, keys, tools) are tilted 30–45° to fill it, or kept upright when the set is upright. Keep a 1 px margin at 16 px (art 14×14), 8–10% on larger icons. No text.
5. **Chibify.** Fat hilt, big bulb, oversized key bow, short neck: proportions that survive scaling beat real ones.
6. **Ramp length:** 3 tones per material at 16 px, 5 by default, 7+ only on big surfaces. Share swatches between materials so a small palette feels bigger (`20-color-for-pixel-art`).
7. **Metal is grey or blue-grey, never white.** A small specular pixel, two faces on a blade (lit and dark), lights cooler and less saturated, darks warmer. Selective outline: brighter where the light hits. Shine sits anywhere along the blade, small relative to it.
8. **Sword anatomy:** pommel, grip, cross-guard, blade (edge, centre ridge or fuller, point). Hilt has three colour zones (pommel, grip, guard). Shade the grip as a cylinder (columns, `72-3d-forms`). A 1 px shadow between grip and guard separates them and makes the guard read thicker. The same template gives an axe (thicker blade), dagger (short), staff (recolour). Claymore quatrefoil ends vanish below ~48 px.
9. **Potion: four things** (liquid, glass, plug, reflection). Show glass first as a border only, then a few short curved highlights on bulb and neck; shade away from the highlight. A half-empty bottle has a lighter circular liquid surface with a wavy edge. Bubbles last. Translucency by blending glass and liquid colour, only in bright areas, and not below 16 px (use a lighter ring plus a 2 px curved highlight).
10. **Chest, barrel, crate, pot:** outline → single flat base → split into volumes (lid vs body, rim, bevel) → 2–3 shading steps → details (bands, lock, bolts). Round tops are ellipses; metal bands are contrasting lines that follow the form. Sit them on a ground patch with a short cast shadow; bake the shadow in only when it stays inside the frame.
11. **Shield:** a field, a rim and one big simple emblem (cross, chevron, boss). The shape is symmetric, so break symmetry with light: rim light on the top and lit side, a shade value on the far half. Heater, round, kite shapes carry different personalities.
12. **Key:** bow (ring), shaft, bit (teeth). The bow is the readable part: a D=7 circle with a small hole. Leave a gap between teeth so the outline shows a notch.
13. **Firearms:** learn the pistol (rear and front sight, slide, trigger, grip, magazine); a rifle is a big pistol plus extras. Invent by exaggerating one part (huge slide, many screws, scope) or by function: muzzle, magazine, grip placed on a random silhouette. Bows: grip, arrow rest, limbs, string; arrows: nock, fletching, shaft, point.
14. **Gems are flat facets:** table, crown, girdle, pavilion. 16 px: outline, 3 facet value bands, 1 white point, 1 dark facet opposite; 8 px: 2 bands + 1 point. A cabochon (dome) uses a ramp instead. Shine lights each facet as a whole, the middle frames covering the largest area.
15. **Food and organic props:** dark outline keeps them cartoony; limit colours and reuse them across the set; unlimited colour without outline looks like a shrunken photo.
16. **Tech props:** panel divisions with screws, repeating patterns, hazard stripes, antennas as connected verticals, cables organic and segmented; right angles only in chip texture.
17. **Idle conventions, one system per game:** ground items bounce, floating items bob, currency shines, shine is wrong on food, complex items never rotate (a coin may). A shine on a flat disc travels along its edge, not across the face. Pickup feedback: currency plays in place, stat items play on the character, one radial flash style for all.
18. **Props echo their owner:** a faction emblem repeats the faction's shapes. Show damage as states of the same silhouette. Light-emitting props get concentric glow rings (`80-vfx-fire-smoke-magic`).
19. **Held items:** dark line between hand and grip, the item crosses the hand in front, its mass leaves the silhouette on a different axis than the arm (`34-hands-and-feet`).

## By size

| Size | Sword | Potion | Chest | Shield | Key |
|------|-------|--------|-------|--------|-----|
| 8 | 1 px blade, 2 px guard, 3 colours | 5 px bulb + 1 px cork | box + 1 band, 3 colours | 6×7 field + 1 emblem px | 3 px bow + shaft |
| 16 | the 8×16 below (blade 2 px + outline) | 12×13 below | 16×13 below | 14×15 below | 8×16 below |
| 32 | blade 4 px, fuller, bevel highlight, wrapped grip | + liquid wave, bubbles | + planks, rivets, keyhole | + rivets, bevelled rim | + engraved bow, 3 teeth |
| 64 | + engraving, scratches, material story | + cork grain, label | + wood grain, lock plate | + quartered heraldry | + filigree |

The 16 px column is the shipped templates; the 8, 32 and 64 px cells are derived.

## Templates

**props-sword-8x16** — upright sword: tapered tip, two-tone blade, gold guard with shade, wrapped grip, pommel. Retint for axe/dagger/staff by changing the blade rows.

```grid props-sword-8x16
K = outline        #2b2433
W = blade-light    #e4eaf2
S = blade-shade    #8d9db5
G = guard-light    #f2c14e
g = guard-shade    #b8862e
B = grip-light     #9a5c3e
b = grip-shade     #5e3526
---
...KK...
..KWSK..
..KWSK..
..KWSK..
..KWSK..
..KWSK..
..KWSK..
..KWSK..
KKKKKKKK
KGGGGggK
.KKKKKK.
...KBK..
...KbK..
...KBK..
..KGgK..
...KK...
```

**props-potion-12x13** — round flask: cork, glass border, curved glint, liquid surface line, shade on the far side. Swap liquid roles for mana, poison, antidote.

```grid props-potion-12x13
K = outline        #2a1f3a
C = cork-light     #c28a55
c = cork-shade     #8f5d3a
G = glass          #bfe3ee
W = glint          #ffffff
l = liquid-surface #ff7b8a
L = liquid         #e0384f
D = liquid-shade   #9a2349
---
....KKKK....
....KCCK....
....KCcK....
....KGGK....
...KGWGGK...
..KGWlllGK..
.KGWLLLLLGK.
.KGLLLLLLDK.
.KGLLLLLLDK.
.KGLLLLLDDK.
.KGGLLLDDDK.
..KGDDDDDK..
...KKKKKK...
```

**props-chest-16x13** — lid/body split, vertical gold bands, rim strip, lock plate with keyhole, dark underside row.

```grid props-chest-16x13
K = outline        #2b1d2e
L = wood-light     #c0884f
M = wood-mid       #96623a
D = wood-shade     #6a4030
G = band-light     #f2c14e
g = band-shade     #b8862e
Y = lock           #ffe58a
---
..KKKKKKKKKKKK..
.KLLLLLLLLLLLLK.
KLLLLLLLLLLLLLLK
KLLGgLLLLLLGgLLK
KMMGgMMMMMMGgMMK
KMMGgMMMMMMGgMMK
KGGGGGGYYGGGGGGK
KMMGgMMYYMMGgMMK
KMMGgMMYKMMGgMMK
KMMGgMMMMMMGgMMK
KDDGgDDDDDDGgDDK
KDDDDDDDDDDDDDDK
.KKKKKKKKKKKKKK.
```

**props-shield-14** — heater shield: metal rim lit on the left, red field split light/shade, gold cross emblem split the same way.

```grid props-shield-14
K = outline        #2b1d2e
W = rim-light      #e2e8f0
w = rim-shade      #8c9bb5
R = field-light    #c8372d
r = field-shade    #8f2540
Y = emblem-light   #f5c84a
y = emblem-shade   #c08a2e
---
.KKKKKKKKKKKK.
KWWWWWWwwwwwwK
KWRRRRYyrrrrwK
KWRRRRYyrrrrwK
KWRYYYYyyyyrwK
KWRYYYYyyyyrwK
KWRRRRYyrrrrwK
KWRRRRYyrrrrwK
.KWRRRYyrrrwK.
.KWRRRYyrrrwK.
..KWRRYyrrwK..
...KWRYyrwK...
....KWRrwK....
.....KWwK.....
......KK......
```

**props-key-8x16** — bow with plus-shaped hole, 1 px shaft, two teeth with a notch between.

```grid props-key-8x16
K = outline        #2b1d2e
Y = gold-light     #f5c84a
y = gold-shade     #b9822c
---
..KKK...
.KYYyK..
KYY.yyK.
KY...yK.
KYY.yyK.
.KYYyK..
..KYK...
..KYK...
..KYK...
..KYyKKK
..KYyyyK
..KYyKKK
..KYK...
..KYyKKK
..KYyyyK
..KKKKKK
```

**props-sword-diag-19x20** — the same sword at 45°, tip up-right, drawn on 1:1 bands: every row shifts one pixel, so the blade (3 interior px: two light, one shade), both outline edges and the 5-step guard are perfect 1:1 diagonals with no doubled pixels. Light blade face on the upper-left, shade on the lower-right; guard is a 1:1 line crossing the blade at right angles. Rule: pick the band direction first, then fill each row as `outline, light, light, shade, outline` moved one column per row.

```grid props-sword-diag-19x20
K = outline        #2b2433
W = blade-light    #e4eaf2
S = blade-shade    #8d9db5
G = guard-light    #f2c14e
g = guard-shade    #b8862e
B = grip-light     #9a5c3e
b = grip-shade     #5e3526
---
..................K.
................KKSK
..............KKWSK.
.............KWWSK..
............KWWSK...
...........KWWSK....
..........KWWSK.....
...K.....KWWSK......
..KGK...KWWSK.......
..KgGK.KWWSK........
...KgGKWWSK.........
....KgGWSK..........
.....KgGK...........
....KKKgGK..........
...KBbKKgGK.........
..KBbK..KgGK........
.KBbK....KgGK.......
KGGK......KK........
KggK................
.KK.................
```

**props-barrel-16** — side-on barrel: bulged outline (rows 10, 12, 14 wide), light rim on top, stave seams every 4 px, two metal hoops (light row over dark row) at the widest rows, light on the left and core shade on the right. Same layout gives a keg, a pot or a water butt.

```grid props-barrel-16
K = outline        #2b1d2e
R = rim-light      #d8a066
L = wood-light     #c58a50
M = wood-mid       #a96e3d
s = stave-seam     #7d4c2e
N = wood-dim       #8e5733
D = wood-shade     #5c3624
H = hoop-light     #c4cddb
h = hoop-shade     #6f7a91
---
...KKKKKKKKKK...
..KRRRRRRRRRRK..
.KLMMsMMMsNNNDK.
.KLMMsMMMsNNNDK.
KHHHHHHHHHHHHHHK
KhhhhhhhhhhhhhhK
KLLMMsMMMsNNNDDK
KLLMMsMMMsNNNDDK
KLLMMsMMMsNNNDDK
KLLMMsMMMsNNNDDK
KHHHHHHHHHHHHHHK
KhhhhhhhhhhhhhhK
.KLMMsMMMsNNNDK.
.KLMMsMMMsNNNDK.
..KMMsMMMsNNNK..
...KKKKKKKKKK...
```

## Procedure

1. Pick size from the world's tile; choose projection and light; write the colour budget.
2. `applyBatch` `grid` the silhouette in one colour; `render` at 1×. Fix shape now.
3. Split into volumes/materials (blade vs hilt, lid vs body, glass vs liquid) with flat roles.
4. Build one ramp per material with `palette` op `ramp`; add 2–3 steps per material in light order; add the one specular/glint pixel last.
5. Add details only where they name a part (band, rivet, keyhole); one cast shadow layer.
6. Outline selectively (`04-outlines-and-edges`); `readPixels` `format:"grid"` for orphans; `validate`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sword looks like a white stick | Blade drawn in white | Blue-grey two-tone blade, 1 px spec |
| Guard fuses with grip | No separation | 1 px shadow under the guard, darker grip |
| Potion reads as a red ball | Glass missing | Border and curved glint, cork on top |
| Chest looks flat | One value for lid and body | Split volumes, shade the underside |
| Item clipped by the icon edge | No margin | Art 14×14 inside 16×16 |
| Set looks mismatched | Mixed projection, outline or light | One style sheet, one light |
| Gem is a coloured blob | Gradient facets | Flat facets, one white point |

## Review

- Single-colour silhouette identifies the item at 1×.
- Anatomy named: guard/grip/pommel; liquid/glass/cork; lid/body/bands; field/rim/emblem.
- Metal not white; two faces shown; one specular at most.
- One projection and one light shared with the rest of the set.
- Colour count within budget; margin kept; no orphan pixels.
- Idle/pickup conventions consistent with sibling items.

## Sources

- Slynyrd, Pixelblog 16, 21, 24, 30, 34 (weapons, top-down objects, items, food, farm).
- Imonk itch.io tutorials (swords, health potion); Pixnote sword guide.
- Saint11, Swords, FirearmDesign, Bows, Gems, Metal, Tech tutorials.
- Pixel Logic (props, barrel fix); Solarski (props echo their owners).
