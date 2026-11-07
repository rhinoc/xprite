# Platform styles

An era look is not a filter. NES, Game Boy, SNES, Genesis and PICO-8 look the way they do because of a few hardware numbers: screen size, visible colours per sprite, tile grid and sprite-per-line limits. Without them an agent writes "8-bit" on a 40-colour smooth-shaded sprite, dithers where the hardware never would, and outlines what the era left bare. This file turns each platform into numbers and policies that `palette`, `validate` and `readPixels` can check.

## Rules

1. **Declare the contract in one line before drawing.** STRICT = obey the real palette, tile and colour-clash rules. INSPIRED = use the era's colour count and shading vocabulary, ignore tile/attribute clash. Default INSPIRED; STRICT only when the user says "authentic", "hardware-accurate" or names an engine limit. State which, in the reply. Never blend them silently.
2. **A platform is four numbers and three policies.** Numbers: canvas, visible colours per sprite, tile grid (8×8 almost everywhere), per-scanline sprite cap. Policies: outline, dither, anti-aliasing. Write all seven before the first pixel.
3. **Visible colours = slots − 1.** Index 0 is transparent on NES, GB/GBC, GBA, SNES, Genesis and (by default) PICO-8. "4 colours" means 3 you can see.
4. **Load the palette first.** Build the palette first with `palette` op `set` — presets `pico8`, `gameboy`, `gameboy-pocket`, `cga`, `1bit`; anything else comes from `palette` op `extract` on a reference image. Hex lists live in `craft/20-color/21-limited-and-platform-palettes.md`. Stay on the palette after that.
5. **Sizes are multiples of 8.** Sprites are assemblies of 8×8 tiles; make characters 16/24/32 tall and pad with transparency. Genesis tooling rejects other sizes.
6. **NES.** 256×240 (224 often visible). Sprite = 3 colours + transparent, one palette per sprite object; more colours means overlaying a second sprite, which spends the 8-sprites-per-scanline cap. Background palette is chosen per **16×16 cell**, not per 8×8 tile: a cell holds at most 3 colours + the shared backdrop, and neighbouring palettes share their brightest colour so the seam vanishes. Whole screen ≈ 25 colours. Look: flat fills, no AA, no dither on sprites, cool-leaning palette (warm shades are scarce).
7. **NES outline vs slot.** A hard 1 px dark outline helps a sprite survive busy backgrounds, but it costs one of the 3 slots. Decide: outline + 2 fills, or 3 fills and no outline. When the 3 slots are needed for material, drop the outline and separate by value.
8. **Game Boy (DMG).** 160×144, 4 shades total, sprite = 3 + transparent. Contrast is the whole trick: keep the darkest and lightest far apart and let the two mid-tones do all the shading. Sprites sit dark on light backgrounds; background rock/trees use the lighter shades and skip the darkest so characters pop. Dither only as sparse hand-placed checker; error-diffusion speckle turns 4 shades to mud. No two mid-tones meeting in a 1 px border (it vanishes on the LCD — derived).
9. **Game Boy Color.** Same 160×144 and 8×8 tiles; NES discipline (3 + transparent per sprite, 8 sprite palettes, 8 background palettes, ≤56 colours on screen) but saturated or pastel hues are free. Keep the darkest tone clearly above black (LCD washes out — derived).
10. **Game Boy Advance.** 240×160, sprites 8×8 to 64×64. Up to 15 visible colours per 4-bpp sprite (from memory of Tonc, not re-checked — verify before promising). Look: SNES-grade colour in chunkier sprites, 16–32 px characters, strong dark outline, bright mid-values, avoid very dark shadow ramps (screen was unlit — derived).
11. **SNES.** 256×224, 15 visible colours per palette group. Real sprites use 9–15 (SMW-class) against NES's 3: the jump is **ramps** (2–3 tones per material, hue-shifted: cool blue shadows, warm yellow highlights), not detail. Dark outline, often coloured. Muted jewel mids, quiet distant planes, little visible dither. Firmest edges on ground, brightest isolated on pickups, softest and palest on far hills.
12. **Genesis / Mega Drive.** 320×224 wide mode, 9-bit colour (8 levels per channel, 512 colours), 4 palette lines × 16 = 61 usable, 15 visible per sprite. Hardware-true palettes snap each channel to 8 levels, step ≈36 (derived from 255/7). Look: short ramps (near-black shadow, saturated mid, bright edge), one shared dark across materials, hard outlines, **visible checker dither** for water, smoke, skin and shadow, the single brightest colour reserved for what the player must read. A tendency, not a law — Sonic is bright.
13. **PICO-8.** 128×128, fixed 16 colours (`craft/20-color/21-limited-and-platform-palettes.md`), no true grey ramp and no hue-shifted ramps, so build 3-colour ramps from neighbours across families (dark blue → purple → pink → peach) and accept the 30–60° hue jumps. Each material 2–3 entries. Dither is native (2-colour 4×4 fill patterns). Confetti from photo converters is a tell: keep every colour in a purposeful place.
14. **Hi-bit (beyond hardware).** Pick a canvas that integer-scales: 320×180 (×6 = 1080p), 640×360 (×3 = 1080p), 192×144 for scenes. One pixel size for every world sprite; UI, world and map may differ only in strict quarantine. No hardware limit means you impose one: a shared palette (≤16 per scene at 192×144, ≤32 across a character set), reuse colours before adding new ones. Bloom or lighting applies to the screen canvas, never baked into a sprite. Hi-bit is not licence for soft rendering; edges stay hard (`craft/90-style/92-generated-art-tells.md`).
15. **One era per image.** A 3-colour NES hero on a 40-colour SNES backdrop reads as collage. Same pixel pitch, same colour budget, same outline policy across every element of the image.
16. **Old art assumed a soft CRT.** For sharp displays draw cleaner, harsher clusters; do not imitate the blur with AA. If a CRT look is wanted, filter an **exported copy** at ×4 so scanlines stay thick; never filter the source.
17. **Bend, keep the look.** Modern retro studies add a few extra frames or colours on purpose. Fine, but say what you bent ("4 colours instead of 3 on the cloak") so the user can object.

| Platform | Screen | Colour model | Per sprite (visible) | Per screen | Tile / cap |
|----------|--------|--------------|----------------------|------------|------------|
| NES | 256×240 | 64 master, ≈54 usable | 3 | ≈25 | 8×8; 64 sprites, 8 per line; BG palette per 16×16 |
| GB | 160×144 | 4 shades | 3 | 4 | 8×8; 40 sprites, 10 per line |
| GBC | 160×144 | 15-bit | 3 | ≤56 | 8×8; 10 per line |
| GBA | 240×160 | 15-bit | ≤15 (4 bpp) | 256+256 | 8×8; sprites to 64×64 |
| SNES | 256×224 | 15-bit, 256 entries | ≤15 | ≤256 | 8×8; 128 sprites |
| Genesis | 320×224 | 9-bit | 15 | 61 | 8×8; sizes multiple of 8 |
| PICO-8 | 128×128 | fixed 16 | by choice | 16 | 8×8 sprites |

## By size

Visible colours per sprite and the outline call at each canvas size. Entries marked (derived) are budgets inferred from the hardware counts.

| Platform | 8 px | 16 px | 32 px | 64 px |
|----------|------|-------|-------|-------|
| NES | 3, no outline | 3 incl. outline-or-fill choice | 2×4 tiles; one palette of 3 per sprite object, overlay for more | boss from background tiles or many objects; 8 per line (derived) |
| GB / GBC | 3 | 3 | 3, interior detail by value only | 3; detail by clusters, not colours |
| GBA | ≤6 (derived) | 8–12 (derived) | ≤15, dark outline | ≤15 |
| SNES | ≤6 (derived) | 9–15 | 12–15, 3-tone ramps | ≤15 per palette group; assemble from several sprites |
| Genesis | ≤6 (derived) | 6–12 (derived) | ≤15, visible dither | ≤15 |
| PICO-8 | 2–3 | 4–5 | ≤7 | whole 16 shared |
| Hi-bit | 3–5 | 6–12 | 12–20 | 16–32 shared |

At 8 px a platform is mostly its palette and hue choice; at 16 px the policies (outline, dither) show; at 32+ the ramp structure is what separates SNES from NES.

## Templates

`platform-nes-hero-16`, `platform-snes-hero-16` and `platform-gb-mage-16` show the same discipline at three budgets. Transcribe with `applyBatch` `grid`, then map roles onto your loaded palette.

NES sprite: three colours + transparent, no outline. Dark is hair, boots and eye; cloth is the tunic; skin is face and hands.

```grid platform-nes-hero-16
D = dark   #2a1a2e
R = cloth  #b53121
S = skin   #e8a860
---
................
.....DDDDD......
....DDDDDDD.....
....DDDDSSSS....
....DDDSSDSS....
....DDDSSSSS....
.....DDSSSS.....
.....RRRRR......
....RRRRRRR.....
....RRRRRRRS....
....SRRRRRR.....
....RRRRRRR.....
.....DDDDD......
.....DD.DD......
....DD...DD.....
...DDD...DDD....
```

SNES-class version of the same figure: 9 colours, short hue-shifted ramps (shadow cooler and redder, light warmer), coloured outline, light from upper left. Same silhouette, more form.

```grid platform-snes-hero-16
O = outline        #2d1e3a
h = hair-shadow    #5c3326
H = hair-light     #9a5d38
s = skin-shadow    #c47c5c
S = skin-light     #f2bc90
r = cloth-shadow   #8a2a3e
R = cloth-mid      #c9453f
P = cloth-light    #ee7d52
B = leather        #5a4256
---
................
.....OOOOO......
....OHHHHhO.....
....OHHHhhhO....
....OHHhSSSs....
....OHhSSOSs....
.....OhSSSSs....
.....OPPRRrO....
....OPPRRRrrO...
....OPRRRRrrSs..
....sPRRRRrrO...
....OORRRrrOO...
.....OBBBBBO....
.....OBB.BBO....
....OBB...BBO...
...OBBB...BBBO..
```

Game Boy sprite: three shades + transparent (the fourth, lightest, belongs to the background). Front-facing mage whose hat tip leans right so the pose is not a statue.

```grid platform-gb-mage-16
D = darkest   #0f380f
M = dark-mid  #306230
L = light-mid #8bac0f
---
........DD......
.......DMD......
......DMMMD.....
.....DMMMMMD....
....DMMMMMMMD...
..DDDDDDDDDDDD..
....DLLLLLLD....
....DLDLLDLD....
....DLLLLLLD....
.....DLLLLD.....
....DMMMMMMD....
...DMMMMMMMMD...
..DMLMMMMMMLMD..
..DMMMMMMMMMMD..
..DMMMMMMMMMMD..
..DDDDDDDDDDDD..
```

Game Boy background tile: only the three lighter shades, so a dark sprite stands out against it. Tiles seamlessly in both directions.

```grid platform-gb-stone-tile-16
B = lightest   #9bbc0f
L = light-mid  #8bac0f
M = dark-mid   #306230
---
BBBBBMBBBBBBBBBM
BBBBBMBBBBBBBBBM
BBBBBMBBBBBBBBBM
BBBBBMBBBBBBBBBM
LBLBLMBLBLBLBLBM
LLLLLMLLLLLLLLLM
LLLLLMLLLLLLLLLM
MMMMMMMMMMMMMMMM
BBMBBBBBBBMBBBBB
BBMBBBBBBBMBBBBB
BBMBBBBBBBMBBBBB
BBMBBBBBBBMBBBBB
LBMLBLBLBLMBLBLB
LLMLLLLLLLMLLLLL
LLMLLLLLLLMLLLLL
MMMMMMMMMMMMMMMM
```

NES background cell: one 16×16 attribute cell, three colours with the mortar doubling as the shared backdrop. A fourth colour inside this cell would be a clash. Tiles in both directions.

```grid platform-nes-brick-cell-16
D = backdrop/mortar #2a1a2e
M = brick-shade     #8c2f1c
L = brick-light     #d4623a
---
DDDDDDDDDDDDDDDD
LLLLLLLDLLLLLLLD
LLLLLLMDLLLLLLMD
MMMMMMMDMMMMMMMD
DDDDDDDDDDDDDDDD
LLLDLLLLLLLDLLLL
LLMDLLLLLLMDLLLL
MMMDMMMMMMMDMMMM
DDDDDDDDDDDDDDDD
LLLLLLLDLLLLLLLD
LLLLLLMDLLLLLLMD
MMMMMMMDMMMMMMMD
DDDDDDDDDDDDDDDD
LLLDLLLLLLLDLLLL
LLMDLLLLLLMDLLLL
MMMDMMMMMMMDMMMM
```

Genesis dither band: three 8-level-snapped blues; each transition is a two-row checker crossed in two pixels. Use for water, shadow, smoke; never as an entire surface.

```grid platform-genesis-dither-band-16
L = light  #6db6ff
M = mid    #246ddb
D = deep   #00246d
---
LLLLLLLLLLLLLLLL
LLLLLLLLLLLLLLLL
LLLLLLLLLLLLLLLL
LMLMLMLMLMLMLMLM
MLMLMLMLMLMLMLML
MMMMMMMMMMMMMMMM
MMMMMMMMMMMMMMMM
MDMDMDMDMDMDMDMD
DMDMDMDMDMDMDMDM
DDDDDDDDDDDDDDDD
DDDDDDDDDDDDDDDD
DDDDDDDDDDDDDDDD
```

PICO-8 item at 8×8: three palette entries from the fixed 16 (dark blue, red, cream) plus transparent.

```grid platform-pico8-mushroom-8
O = outline #1d2b53
R = cap     #ff004d
W = spots   #fff1e8
---
..OOOO..
.ORWRRO.
ORRRRWRO
ORWRRRRO
.OOOOOO.
..OWWO..
..OWWO..
..OOOO..
```

## Procedure

1. Read the request for platform words ("NES", "Game Boy", "16-bit", "retro"). Pick a platform and a contract (rule 1); write the seven numbers back to the user in one line.
2. `createDocument` at a multiple-of-8 canvas. Strict contracts: an indexed sprite makes the palette limit physical.
3. `palette` op `set` (rule 4). `palette` op `get` and confirm the visible colour count matches the budget.
4. Block in the silhouette with `applyBatch` `grid`, adapting the nearest template. `render` is the real-size read; `exportDocument` `scale` enlargement (or a scratch `resizeSprite`) is for checking clusters.
5. Shade with the platform's ramp length (3 colours NES/GB, 2–3 tones per material SNES/Genesis). Light from the upper left. `adjustHsl` for steps, never a hand-picked darker hex.
6. Strict background: for each 16×16 cell run `readPixels` with `rect` `{x,y,width:16,height:16}` and count distinct colours; ≤4 including the shared backdrop.
7. `validate` with `checks: ["palette","strays","antialiasing"]` and `strict: true`. Expect 0 off-palette, 0 semi-transparent pixels, ≤1 stray per object.
8. Report the contract and anything bent (rule 17).

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "NES" sprite with 8 colours and a gradient hat | Era named, numbers ignored | Cut to 3 visible; spend shading on value steps, not hues |
| GB sprite muddy | Four shades used inside the sprite, or mid-to-mid borders | Dark/mid/light only; darkest far from lightest; fill shapes, dither sparingly |
| NES background looks random | A 4th colour inside one 16×16 cell, palettes with different brightest colours | Re-cell; share the brightest colour between neighbours |
| SNES hero is flat | NES-style 3-flat-colour fills | Add a 2–3 tone ramp per material, hue-shifted, coloured outline |
| Genesis water is a smooth blend | Gradient op or noise dither | Two-row checker transitions between flat bands |
| PICO-8 art has green and yellow specks | Photo-to-palette conversion | Rebuild each material from 2–3 entries, delete confetti |
| Hi-bit scene has sprites at two pixel sizes | Scaled sprite dropped in | Redraw at the world pitch (`craft/90-style/92-generated-art-tells.md`) |
| Era look drifts across the cast | Outline and dither policy not fixed | Re-apply the seven numbers to every sprite |

## Review

- The contract (STRICT / INSPIRED) and the numbers are stated in the reply.
- Visible colours per sprite are within the platform budget (`palette` op `get`, count used entries).
- Outline policy is the same on every sprite in the image.
- Dither appears only where the era used it and only at transitions.
- No AA on NES, GB, PICO-8; light manual AA at 32 px+ only on SNES/GBA/Genesis.
- Sprite and tile sizes are multiples of 8; background cells (strict) hold ≤4 colours.
- Nothing from another era: one pixel pitch, one budget.
- `validate` is clean on palette, strays, antialiasing.

## Sources

- NES: Mega Cat Studios "Creating NES graphics"; NESdev wiki "PPU palettes"; EmulationOnline NES backgrounds and sprites.
- Game Boy / GBC: Pan Docs (Specifications, OAM, Tile Data); 8bitize "pixel art styles"; GBC art note (gameboy.mongenel.com).
- GBA: Tonc video chapter (gbadev.net). SNES: SNESdev palettes; Super Famicom wiki sprites; PixelArt-Shop SNES depth and colour.
- Genesis: Ohsat "Creating graphics for Mega Drive"; Hugues Johnson Genesis palettes; PixelArt-Shop "Mega Drive graphics".
- PICO-8: Lexaloffle manual, pico8wiki palette. Hi-bit: D-Pad Studio "Entering the Hi-Bit Era"; Saint11 "Consistency" (2023).
- Slynyrd Pixelblog 36 (8-bit adventure), 37 (Castlevania study), 38 (Metroid study), 39 (Phantasy Star 4 study), 59 (Tiny sci-fi pixels), 62 (CRT filter).
- Tsugumo and Arne tutorials via the Pixel Joint corpus (GB background/sprite split); Silber, *Pixel Art for Game Developers* (Chasm authenticity, p. 219); Pixel Logic ch. 1–3 (style = outline, AA, dither, palette).
