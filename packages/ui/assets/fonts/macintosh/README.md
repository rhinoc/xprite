# Macintosh fonts

ChiKareGo2 and FindersKeepers by Giles Booth are the fonts named by Brian Levy's
Classic Macintosh UI Kit. The author's BitFontMaker2 pages license both fonts
under Creative Commons Attribution (the pages do not specify a license version):

- ChiKareGo2: https://www.pentacom.jp/pentacom/bitfontmaker2/gallery/?id=3780
- FindersKeepers: https://www.pentacom.jp/pentacom/bitfontmaker2/gallery/?id=3809

Downloaded from the original pages on 2026-10-05. These WOFF2 files preserve the supplied TTF outlines. Vertical font metrics were
adjusted to integer browser baselines; no glyph outlines were edited.
`src/base/theme/themes/macintosh/font-metrics.json` records the original advances
at 16 CSS pixels (1024 font units per em). Both use 12px line boxes at 16px font size, matching the kit's 16/12 styles.
The control baseline is 10px and the compact text baseline is 9px.

The font CSS is imported by the Macintosh skin. Aseprite retains its own font.
