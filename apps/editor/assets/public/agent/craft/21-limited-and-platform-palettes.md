# Limited and platform palettes

A palette limit is a design tool, not a handicap: it forces harmony and fast decisions. But "retro" without the real limits is
just a costume — a NES sprite with eight colours, a Game Boy sprite with a fifth shade. This file gives the numbers per platform,
the budget per sprite size, how to cut a palette without losing the read, and ready-to-load hex lists.
Era *style* (outlines, dither habits, tile conventions) is in `craft/90-platform-styles.md`; ramp theory in `craft/20-color-for-pixel-art.md`.

## Rules

1. **Choose palette and budget before the first pixel, and say them back.** Counts include transparency: a "16-colour" sprite is 15 + transparent.
2. **"8-bit" and "16-bit" name the CPU, not the palette.** NES, C64, Master System and ZX Spectrum have four different palettes. Use the table below; GIF is 256 (8 bpp).
3. **The per-tile / per-sprite limit binds harder than the total.** NES: 3 colours + transparent per sprite, and per 16×16 background cell. Game Boy and GBC sprites: 3 + transparent.
   SNES, Genesis, GBA: 15 + transparent per tile or sprite. Honour it inside every 8×8 block even when the Aseprite palette is larger.
4. **Default sizes when the user has no preference.** "Retro/8-bit" → PICO-8 (16, forgiving). "Game Boy" → 4 shades. "NES-like" → 3 colours + transparent per sprite, ≈ 25 on screen.
   "SNES/GBA/Genesis-like" → 15 per sprite from short hue-shifted ramps. Named game → `palette` `extract`.
5. **Reduction ladder (a 24-colour sprite, measured).** 24 → 20: swap greys for skin tones, drop the barely visible darkest teal. → 15: fuse skin with brown hair, share one highlight between green and teal, drop orange AA.
   → 10: reuse a skin tone for the shirt highlight, recolour the greens onto the teal ramp, fuse the darkest shades. Below ≈ 10 *that* sprite collapsed; 16 is the usual ceiling. No universal number — cut in this order, `render` after each cut.
6. **Reuse swatches across unrelated objects, never across touching ones.** Hair red = bed red = night-stand red is good; hair against a wall of the same red merges. Give touching objects different colours.
7. **4 shades (Game Boy / 4-colour):** value only. Keep darkest and lightest far apart and let the two mids do the shading. No mid-to-mid border thinner than 1 px (it vanishes on LCD ghosting, derived). Use maximum anti-aliasing: these sprites sit on pale backgrounds.
   On GBC/GBA-style LCDs keep the darkest tone clearly above black (low intensities crush). If it does not work in 4 colours, more colours will not save it.
8. **1-bit:** lines, a few solid blocks and dither; build the icon on the single most recognisable feature; outline may be black, white, or both (double line); compensate with fluid animation.
9. **Dither multiplies a palette, with discipline.** A checker between two colours adds one tone: 4 colours + dither of the 4 = ≈ 10 tones (≈ 22 with a second pattern). Never a 2×1 "wide" dither pixel; keep dithered colours adjacent in the ramp; keep pair contrast low. Details in `craft/13-dithering-and-texture.md`.
10. **Heavy dither means the palette lacks the right colours** (C64 art is often dithery for that reason): first try a different swatch, then dither.
11. **PICO-8:** 2–3 palette entries per material at 8×8, 4–5 at 16×16, rarely > 7 at 32×32. `#ff004d`, `#ffa300`, `#00e436` are 100 % saturated — accents, not areas. Photo-converter confetti (stray green/blue/yellow dots) is a generated-art tell.
12. **Walk, don't hunt.** Palettes built from hue-shifted adjacent ramps (Resurrect 64, AAP-64, Apollo, Endesga 64) are used by clicking a ramp and walking it. Tiny ones (PICO-8, Sweetie 16, DB16) are assembled across families and accept 30–60° hue jumps per step.
13. **Load, order, lock.** Load the palette first (`palette` `set` / `extract`), keep ramps adjacent in index order, paint unused slots magenta so used colours stand out, keep slot 0 transparent. Stay on the palette: ΔE > 12 means the palette has no such colour — pick another.
14. **Palette-swap by slots.** Put each ramp in fixed slots; re-ramping the ends recolours the scene (day → sunset → night). For character variants make the colours that differ identical copies on the swap palette so the shapes disappear.
15. **Hi-bit has no hardware limit, so impose one:** a shared dark and a shared highlight across materials; no new colour per sprite.

## Platform limits

| platform | palette / on screen | per sprite or tile | notes |
|---|---|---|---|
| Game Boy (DMG) | 4 shades | BG 4; sprites 3 + transparent | 160×144; 40 sprites, 10 per line; `#081820 #346856 #88c070 #e0f8d0` (BGB) or grey `#000000 #555555 #aaaaaa #ffffff` |
| Game Boy Color | 15-bit (32,768); 8 BG × 4 + 8 sprite × 3 = up to 56 on screen | 3 + transparent | washed LCD: keep darkest above black |
| NES / Famicom | ≈ 54 usable of 64; ≈ 25 on screen (1 shared backdrop + 4×3 BG + 4×3 sprite) | 3 + transparent | BG palette chosen per 16×16 cell — neighbours share their lightest colour to hide seams; 64 sprites, 8 per line |
| Master System | 64; 32 on screen | — | |
| Game Gear | 4,096; 32 on screen | — | |
| Genesis / Mega Drive | 512; 61 on screen (4 lines × 16, index 0 transparent) | 15 + transparent | visible dither; short ramps, shared dark |
| TurboGrafx-16 | 512; 482 on screen | — | |
| SNES / Super Famicom | 32,768; 256 on screen | 15 + transparent (4 bpp); 3 + transparent (2 bpp) | jewel mids, hue-shifted short ramps, little dither |
| GBA | 32,768; 256 BG + 256 OBJ | 4 bpp = 15 + transparent per 16-colour sub-palette | bright mids; 240×160 (sub-palette split from memory in the notes) |
| C64 | 16 fixed | — | muted; Colodore/Pepto variants |
| ZX Spectrum | 15 (7 colours × 2 brightness + black) | colour clash per 8×8 attribute cell | clash rule from memory in the notes |
| MSX | 15 | 2 of 16 per 8-pixel tile line | |
| CGA | 4 per mode | 4 per small chunk | `#000000 #55ffff #ff55ff #ffffff` (palette 1 high) |
| EGA | 64; 16 on screen | any of 16 anywhere | evenly spaced RGB; artists dithered pairs |
| PICO-8 | 16 fixed (+16 hidden via remap) | 128×128, transparent is a flag | native dither fill patterns |
| GIF | 256 | — | counts transparency |

Fighting-game sprites: ≤ 16 per sprite (15 + transparent) even on late arcade hardware; selective outline adds ≈ 4 (→ 19), so cap early.
The NES master palette is not bundled: rebuild it with `palette` `set` from the published hex list, do not eyeball hex.

## By size

Colours per sprite *including* outline, transparency excluded.

| | 8 px | 16 px | 32 px | 64 px |
|---|---|---|---|---|
| 1-bit | 2 (ink + paper) | 2 | 2 | 2 |
| Game Boy | 3 | 3 | 3 (+ dither sparingly) | 3 |
| NES | 3 | 3 (a 16×32 hero is also 3) | 3 per sprite object; overlaying a second sprite adds colours but costs scanline budget | — |
| PICO-8 | 2–3 | 4–5 | ≤ 7 | — |
| SNES / GBA / Genesis | 4–6 | 9–12 (Mario-class ≈ 9–12 incl. outline) | 10–15 | 15 (+ ≈ 4 selective outline) |
| free palette (hi-bit) | 4–6 | 4–8 | 8–16 | 16–24 |

Scene budgets (256-colour practice): sky 16–32 colours, every other object 3–7 (aim 3–5). A 32×64 tutorial sprite uses ≈ 16 colours in 5 ramps; an 80-tile side-view tileset fits under 50.

## Palettes (hex, published order)

```text
PICO-8 (16)        000000 1D2B53 7E2553 008751 AB5236 5F574F C2C3C7 FFF1E8 FF004D FFA300 FFEC27 00E436 29ADFF 83769C FF77A8 FFCCAA
DawnBringer 16     140c1c 442434 30346d 4e4a4e 854c30 346524 d04648 757161 597dce d27d2c 8595a1 6daa2c d2aa99 6dc2ca dad45e deeed6
Sweetie 16         1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57
Arne 16            000000 493c2b be2633 e06f8b 9d9d9d a46422 eb8931 f7e26b ffffff 1b2632 2f484e 44891a a3ce27 005784 31a2f2 b2dcef
DawnBringer 32     000000 222034 45283c 663931 8f563b df7126 d9a066 eec39a fbf236 99e550 6abe30 37946e 4b692f 524b24 323c39 3f3f74 306082 5b6ee1 639bff 5fcde4 cbdbfc ffffff 9badb7 847e87 696a6a 595652 76428a ac3232 d95763 d77bba 8f974a 8a6f30
Endesga 32         be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569
Game Boy (BGB)     081820 346856 88c070 e0f8d0
```

No preset loader — set named palettes with `palette` `set` from their hex lists; classics include `pico8`, `gameboy`, `gameboy-pocket`, `cga`, `1bit`, `grayscale-8`, plus Lospec's most-downloaded, among them `resurrect-64`, `aap-64`, `endesga-32`, `endesga-64`, `apollo`, `sweetie-16`, `dawnbringer-16`, `dawnbringer-32`, `arq4`, `aap-micro12`, `nintendo-entertainment-system`. Palettes from other sources come in through `set` (hex list) or `extract` (a `.png`).
Ramp chains that already work: PICO-8 hot `1D2B53 → 7E2553 → FF004D → FFA300 → FFEC27 → FFF1E8`, skin `AB5236 → FFCCAA` (+ `FF77A8` blush), cool `1D2B53 → 29ADFF → C2C3C7 → FFF1E8`;
Endesga 32 skin `733e39 → b86f50 → c28569 → e4a672 → e8b796 → ead4aa`, blue-grey `181425 → 262b44 → 3a4466 → 5a6988 → 8b9bb4 → c0cbdc`, green `193c3e → 265c42 → 3e8948 → 63c74d`.
Starters by task: 4 colours ARQ4 (first exercise), 12 AAP-Micro12 (small sprite), 32 DB32 (100×64 scene), 64 AAP-64 (48–64 px studies). PICO-8 has pure black but no pure white, 3 near-greys; DB16 has no pure black or white.

## Templates

One orb at each budget, light upper-left. Same form, different number of decisions.

```grid pal-orb-1bit-12
O = ink-outline #14141f
I = ink         #14141f
P = paper       #f0efe0
---
....OOOO....
..OOPPPPOO..
.OPPPPPPPPO.
.OPPPPPPIPO.
OPPPPPPIPIPO
OPPPPPIPIPIO
OPPPPIPIPIPO
OPPPIPIPIPIO
.OPIPIPIPIO.
.OIPIPIPIPO.
..OOPIPIOO..
....OOOO....
```

1-bit: paper is the lit side, a 50 % checker on one phase is the half-tone, ink the contour. Dither pixels never touch in a 2×1 pair, and none sits alone against the paper.

```grid pal-orb-gb4-12
O = shade-0-darkest  #081820
D = shade-1          #346856
L = shade-2          #88c070
H = shade-3-lightest #e0f8d0
---
....OOOO....
..OOLLLDOO..
.OLHLLLLDDO.
.OLHHLLLDDO.
OLLLLLLLDDDO
OLLLLLLDDDDO
ODLLLLLDDDDO
ODDDDDDDDDDO
.ODDDDDDDDO.
.ODDDDDDDDO.
..OODDDDOO..
....OOOO....
```

Game Boy: four shades, the two mids carry the shading, the lightest shade is the highlight only, the darkest is the contour.

```grid pal-orb-nes3-12
O = dark-outline-and-shadow #2c1810
M = mid                     #b8481c
L = light                   #f8b868
---
....OOOO....
..OOLLLMOO..
.OLLLLLLMMO.
.OLLLLLLMMO.
OLLLLLLLMMMO
OLLLLLLMMMMO
OLLLLLLMMMOO
OMMLLMMMMMOO
.OMMMMMMMOO.
.OMMMMMMOOO.
..OOOOOOOO..
....OOOO....
```

NES: three colours, the contour and the shadow are the *same* colour — that is how three colours become four values (outline, shadow, mid, light).

```grid pal-orb-pico8-12
O = pico-1d2b53 #1d2b53
S = pico-7e2553 #7e2553
M = pico-ab5236 #ab5236
L = pico-ffa300 #ffa300
W = pico-fff1e8 #fff1e8
---
....OOOO....
..OOLLMMOO..
.OLWLLLMMSO.
.OLWWLLMMMO.
OLLLLLLMMMSO
OLLLLLLMMMSO
OMLLLLMMMMSO
OMMMMMMMMSSO
.OMMMMMMSSO.
.OSMMMMSSSO.
..OOSSSSOO..
....OOOO....
```

PICO-8: five palette entries chained `1D2B53 → 7E2553 → AB5236 → FFA300 → FFF1E8`; the jump between entries is 30–60° of hue, which is the price of 16 colours.

```grid pal-dither-7tones-14
0 = shade-0 #081820
1 = shade-1 #346856
2 = shade-2 #88c070
3 = shade-3 #e0f8d0
---
00011112222333
00101121223233
00011112222333
00101121223233
```

Seven tones from four shades: solid / checker / solid …, each checker 2×2 minimum. Use between adjacent ramp entries only; at 32 px and below it reads as noise except on big flat areas.

## Procedure

1. Name the platform, per-sprite colour count, tile size, and whether dither and selective outline are allowed (`craft/90-platform-styles.md`).
2. Load the palette: `palette` `set` with a hex list from this file, or `extract` for a `.png`. Order ramps adjacent; slot 0 transparent; unused slots magenta while working.
3. Build ramps by walking the palette (rule 12); write the colours per material on one line before painting.
4. Paint with `applyBatch`; keep to the loaded palette. Count distinct colours per 8×8 block by eye with `readPixels` `format:"grid"` and compare with rule 3.
5. Over budget → apply the reduction ladder (rule 5), one cut at a time, `render` after each.
6. `palette` op `analyze` (near-duplicates, off-palette), `validate`. Export only at integer scales (`craft/14-readability-and-scale.md`).

## Mistakes

| symptom | cause | fix |
|---|---|---|
| Fifth shade on a "Game Boy" sprite | palette lock off or tool widened the palette | `replaceColor` each stray to the nearest of the 4 entries |
| NES sprite with 6 colours | counted outline separately | outline = darkest of the 3 |
| Seams between NES background cells | neighbouring palettes share no colour | share the lightest colour across cells |
| Dither speckle everywhere on a 4-shade palette | error-diffusion / random dither | hand-placed checker, big flat areas only |
| "Retro" look but wrong hues | NES/GB hex eyeballed | load the real palette |
| GB art unreadable on dark UI | darkest entry equals the background | keep contour ≥ 1 shade off the backdrop |
| Palette swap breaks shapes | variants use different slots for the shape colours | identical copies in the swap palette |
| Photo-converter confetti on PICO-8 | auto-quantised | rebuild by hand, 2–3 entries per material |

## Review

- Distinct colours per sprite ≤ the stated budget (transparency not counted); per 8×8 block ≤ per-tile limit.
- Every colour belongs to the declared palette (`validate`: no off-palette pixels).
- Touching objects use different swatches; shared swatches are on unrelated objects.
- Dither: no 2×1 pairs, only between adjacent ramp entries, none on a 16 px character.
- 4-shade art: darkest and lightest clearly apart; no mid-to-mid 1 px borders.

## Sources

- Pixel Logic (Ch. 3 "Limited palettes", pp. 80–84; Ch. 5 dithering, pp. 114–133): reduction ladder, 4-colour CGA, GIF 256.
- Mega Cat Studios NES guide; NESdev wiki (PPU palettes); Pan Docs (Game Boy / GBC specs); SNESdev palettes; Tonc / GBATEK (GBA); ohsat and Hugues Johnson (Genesis palettes); PICO-8 manual.
- Lospec palette JSON (all hex lists above); Arne's 16-colour palette notes; Slynyrd Pixelblog PB28 (SLY16), PB36–PB38 (NES studies); Saint11 tutorials (starter palettes, 1-bit); Derek Yu; Ferrari (indexed budgets); Silber, *Pixel Art for Game Developers*; Gurney, *Color and Light* (limited-palette recipes).
