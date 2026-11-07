# Bitmap fonts

Text is the most precise pixel art in a game and the least forgiving: a 1 px baseline slip,
a filled counter or an `O` that reads as `0` is visible at 1×. Agents fail by inventing
glyphs on the spot, by outlining small fonts into blobs, and by asking the shipped font
for characters it does not have. This file gives the metrics of the shipped font, a
3×5 font to stamp from, and the rules for spacing, contrast and titles. Text on panels is
in `craft/80-effects-ui/83-ui-and-icons.md`, lettering as an effect in `craft/80-effects-ui/81-impacts-and-game-feel.md`.

## Rules

1. **Pick the grid by the job.** 3×5 (cell 4×6) for score, timers and tiny labels — the
   legible minimum, caps only, few symbols. 5×7 for menus, body text and dialogue.
   8×8 and up for titles and headings. At 3 px wide `M`, `N`, `W`, `K`, `X`, `Y` are
   compromises, which is why 3×5 stays caps-only and numeric.
2. **Use what ships.** `knowledge/fonts/pixel5x7.json` (CC0) is the only bundled font;
   `applyBatch` `text` takes `font`, `anchor`, `letterSpacing`, `lineSpacing`, `bold`,
   `outlineColor`, `shadowColor`/`shadowOffset`, `scale` and `measureOnly`. Use the font
   instead of drawing letters by hand. For 3×5, stamp glyphs from the sheets below
   (`applyBatch` `grid` or `blit`); never improvise a glyph.
3. **Strokes: 1 px, uniform, no anti-aliasing, no italics, no hairlines.** Round shapes get
   no intermediate colour. Bigger fonts use 2 px stems (IBM-style 8×8).
4. **One baseline, one height.** Caps and digits share a top row and a bottom row;
   punctuation sits low (period on the baseline, comma tail one row below). A 1 px slip is
   visible. Judge at 1× only.
5. **Disambiguate the look-alikes.** `O`/`0` (3×5: diamond `O`, boxed `0`; 5×7: the `0` has
   an inner diagonal), `I`/`1`/`l` (serifed `I`, flagged `1`, footed `l`), `S`/`5`, `B`/`8`,
   `Z`/`2`. When a new glyph is needed, draw `H`, `O`, `N`, `E` first and derive the rest.
6. **Keep the counters.** The hole in `e`, `a`, `o`, `8`, `B` stays open; at 3 px wide it is
   one pixel and any outline or bold fills it.
7. **Spacing.** Gap between glyphs is 1 px (`letterSpacing` default 1). Shipped 5×7 is
   proportional: advance = glyph width, so `I`, `l`, `i`, `!`, `.`, `:`, `;`, `'` are 1–3 wide;
   digits are all 5 wide, so counters never jitter. Fix an awkward pair (`VA`, `To`) by
   splitting the string into two ops and placing the second with `measureOnly` bounds.
8. **Case.** 3×5 is caps-only (type lowercase as caps). At 5×7 use caps for labels and HUD,
   mixed case for dialogue — its x-height is 5 of 6, which reads well.
9. **Measured metrics of `pixel5x7`** (the notes' "caps rows 0–6" is wrong; the file shows
   blank row 6 under caps): caps and digits 5×6 on rows 0–5; `baseline: 6` means the
   baseline row is row 5, and `baseline` anchors align there; lowercase x-height 5 (rows
   1–5), ascenders (`b d f h k l t`) reach row 0; only `g j p q y` and the comma use row 6;
   space is 4 px. Cell is 7 tall, line pitch is 7 + `lineSpacing`.
10. **No fallback glyphs.** A character not in the font renders as a blank 4 px gap. Accented
    or Cyrillic text needs a new font file; report that gap instead of faking letters.
11. **Contrast and colour.** Text fill ≥ 3 value steps from its panel; two palette colours
    (fill + outline or shadow) are enough. Light text on a dark outline. Do not pile outline
    and shadow on body text.
12. **Outline and shadow interact.** Outline is 1 grid cell (so `scale` px) in 8 directions,
    drawn over the shadow; a shadow offset of 1 vanishes under it. Use `shadowOffset` ≥
    outline thickness + 1 (2 at scale 1, 3 at scale 2) or switch `outlineDiagonals` off.
    Never outline 3×5 text: every counter fills. Use a shadow or a box behind it.
13. **Bold grows ink rightwards by `bold` cells** and does not change the advance, so set
    `letterSpacing` ≥ 1 + `bold` or neighbouring glyphs fuse.
14. **Titles are another craft.** Integer `scale` (up to 8), a 1 px outline, a drop shadow of
    1–2 px, optionally a light-to-dark vertical gradient or a 1 px highlight on the top edge.
    Impact beats legibility, but keep every counter open.
15. **Centre by ink.** `measureOnly` returns ink bounds; anchors resolve against ink, so an
    outline never shifts a label. Use `baseline_*` anchors to put several labels on one line.

## By size

| Font | Glyph | Advance | Caps / x-height | Use |
|------|-------|---------|-----------------|-----|
| 3×5 (sheets below) | 3×5 | 4 | 5 / caps only | scores, timers, tiny labels |
| `pixel5x7` (shipped) | up to 5×6 + descender | width + 1, avg ≈ 6 | 6 / 5 | menus, body, dialogue |
| 8×8 IBM-style (not shipped) | 7×7 ink in 8 cell | 8 | 7 / 5, 2 px stems | titles at ≥ 64 px canvases |

| Canvas | Text that fits |
|--------|----------------|
| 8 px | none; a single 3×5 digit at most |
| 16 px | 3×5 numerals, 3–4 chars across |
| 32 px | 5×7 label of 4–5 chars, or 3×5 label of 7 |
| 64 px | 5×7 line of ~10 chars; 2× title of 4–5 chars |

A 128 px-wide screen holds 32 chars of 3×5 per line (PICO-8) or about 21 of proportional 5×7.

## Templates

**5×7 HUD line (58×6).** `applyBatch` `text` `SCORE 0420`, `pixel5x7`, defaults. Digits are
tabular, so the score never jitters while it counts.

```grid font-5x7-hud
t = text-fill #2b1d2e
---
.tttt..tttt..ttt..tttt..ttttt.......ttt.....t...ttt...ttt.
t.....t.....t...t.t...t.t..........t...t...tt..t...t.t...t
.ttt..t.....t...t.tttt..tttt.......t..tt..t.t......t.t..tt
....t.t.....t...t.t.t...t..........t.t.t.t..t.....t..t.t.t
....t.t.....t...t.t..t..t..........tt..t.ttttt...t...tt..t
tttt...tttt..ttt..t...t.ttttt.......ttt.....t..ttttt..ttt.
```

**5×7 mixed case with descenders (71×7).** Shows x-height 5, the cap `J` on rows 0–5, and
`p y q` tails on row 6.

```grid font-5x7-mixed
t = text-fill #2b1d2e
---
..ttt.........................................t..............ttt...ttt.
...t..t..t.tt.tt.tttt..t...t.......tttt.t..t.....ttttt......t...t.t...t
...t..t..t.t.t.t.t...t.t...t......t...t.t..t..t.....t.......t..tt.t...t
...t..t..t.t.t.t.t...t.t...t......t...t.t..t..t....t........t.t.t..tttt
t..t..t..t.t.t.t.tttt...tttt.......tttt.t..t..t...t.........tt..t....t.
.tt....ttt.t.t.t.t.........t..........t..ttt..t..ttttt.......ttt...tt..
.................t......ttt...........t................................
```

**Outlined title (16×9).** `GO!` with outline + shadow at scale 1, shadow offset 2. The
outline shrinks the `O` counter to a 1×2 hole — acceptable at 5×7, fatal at 3×5.

```grid font-5x7-outline
t = text-fill    #fbf236
o = text-outline #3f2832
s = text-shadow  #8f563b
---
.oooooooooooooo.
oottttootttooto.
otoooootooototo.
otoooooto.ototos
ototttotosototos
otooototoootooos
oottttootttootos
.oooooooooooooo.
....ssss..sss..s
```

**3×5 sheets.** Each glyph 3 px wide (punctuation 1–3), 1 px gap. Copy one glyph out with
`applyBatch` `blit` (`from` = its 3×5 box); never retype it.

```grid font-3x5-a-m
t = text-fill #2b1d2e
---
.t..tt...tt.tt..ttt.ttt..tt.t.t.ttt...t.t.t.t...t.t
t.t.t.t.t...t.t.t...t...t...t.t..t....t.t.t.t...ttt
ttt.tt..t...t.t.tt..tt..t.t.ttt..t....t.tt..t...ttt
t.t.t.t.t...t.t.t...t...t.t.t.t..t..t.t.t.t.t...t.t
t.t.tt...tt.tt..ttt.t....tt.t.t.ttt..t..t.t.ttt.t.t
```

```grid font-3x5-n-z
t = text-fill #2b1d2e
---
tt...t..tt...t..tt...tt.ttt.t.t.t.t.t.t.t.t.t.t.ttt
t.t.t.t.t.t.t.t.t.t.t....t..t.t.t.t.t.t.t.t.t.t...t
t.t.t.t.tt..t.t.tt...t...t..t.t.t.t.ttt..t...t...t.
t.t.t.t.t...ttt.t.t...t..t..t.t.t.t.ttt.t.t..t..t..
t.t..t..t.....t.t.t.tt...t..ttt..t..t.t.t.t..t..ttt
```

```grid font-3x5-digits
t = text-fill #2b1d2e
---
ttt..t..ttt.ttt.t.t.ttt.ttt.ttt.ttt.ttt
t.t.tt....t...t.t.t.t...t.....t.t.t.t.t
t.t..t..ttt.ttt.ttt.ttt.ttt..t..ttt.ttt
t.t..t..t.....t...t...t.t.t..t..t.t...t
ttt.ttt.ttt.ttt...t.ttt.ttt..t..ttt.ttt
```

```grid font-3x5-punct
t = text-fill #2b1d2e
---
t........t.ttt...............t..t.t..t.t
t......t.t...t......t..ttt...t.t...t...t
t...........tt.ttt.ttt......t..t...t..t.
.....t.t............t..ttt.t...t...t.t..
t.t.t.......t..............t....t.t..t.t
```

**3×5 line (38×5).** `SCORE 0420`: glyphs spaced 1 px, space 2 px. This is the pattern for
any 3×5 string.

```grid font-3x5-score
t = text-fill #2b1d2e
---
.tt..tt..t..tt..ttt....ttt.t.t.ttt.ttt
t...t...t.t.t.t.t......t.t.t.t...t.t.t
.t..t...t.t.tt..tt.....t.t.ttt.ttt.t.t
..t.t...t.t.t.t.t......t.t...t.t...t.t
tt...tt..t..t.t.ttt....ttt...t.ttt.ttt
```

## Procedure

1. Choose the font from rule 1 and the contrast pair from rule 11 (`palette` op `get`).
2. `applyBatch` `text` with `measureOnly: true` to get ink bounds; compute the anchor so the
   label is centred or right-aligned, then draw it for real in the same batch.
3. Add `outlineColor` or `shadowColor` only after reading rule 12; on 3×5, put a
   panel or a 1 px box behind the text instead.
4. `render` at 1×; `readPixels` `format:"grid"` to check the baseline row of every glyph.
5. For a new font: write `knowledge/fonts/<name>.json` with `name`, `license`, `cellWidth`,
   `cellHeight`, `baseline` (rows down to and including the baseline row), `spaceWidth`,
   and `glyphs` mapping each character to rows of `#` and `.` (optional `advance` per
   character). Draw `HONE` first, then the alphabet, digits, punctuation; test with a
   pangram and `0123456789` at 1×.
6. Run `validate`; text legitimately triggers orphan-pixel flags on `i`, `j`, `.` and `:`.

## Mistakes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Letters look jittery | A glyph off the baseline by 1 px | Re-align on one top and bottom row |
| `O` reads as `0` | Same shape | Diamond `O` / diagonal or boxed `0` |
| Outlined text is a blob | Outline on 3×5 or tiny counters | Shadow or panel behind; outline only 5×7 and up |
| Shadow missing | Offset 1 under an 8-way outline | Offset ≥ outline + 1 |
| Bold text fused | `bold` without more spacing | `letterSpacing` ≥ 1 + `bold` |
| Blank gaps in a string | Character not in the font | Report the gap; add a font |
| Smeared title | Non-integer scaling or anti-aliasing | Integer `scale`, no intermediate colours |

## Review

- [ ] Every glyph sits on one baseline and top row at 1×.
- [ ] Counters of `e a o 8 B` are open; `O`/`0`, `I`/`1`/`l` are distinguishable.
- [ ] Text contrast against its panel is ≥ 3 value steps.
- [ ] Outlined text is 5×7 or larger; 3×5 text has a shadow or box, never an outline.
- [ ] No unsupported characters in the string.
- [ ] Labels are centred by ink bounds, not by cell.

## Sources

- Public-domain Adafruit/IBM 8×8 font data for the measured metrics; `knowledge/fonts/pixel5x7.json` (CC0).
- PICO-8 font description (3×5 glyph in a 4×6 cell); "bited" and pixel-type tutorials for spacing and trade-offs.
- Saint11 caption lettering as a visual reference only.
- Metrics, outline/shadow behaviour and the 3×5 redraw measured or drawn by us from the repo's `src/lib/text.ts`.
