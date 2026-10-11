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

The Macintosh skin uses Fusion Pixel for Chinese text. ChiKareGo2 pairs with the
12px face: `size-adjust: 75%` turns the theme's 16px CSS size into a 12px request.
FindersKeepers pairs with the 10px face: `size-adjust: 62.5%` turns that same 16px
CSS size into a 10px request. The files stay in `assets/fonts/fusion-pixel/`.
The Aseprite text tool uses the 12px face, and a 7px line's missing glyphs use the 8px face.
