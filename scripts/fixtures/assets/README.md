# UI asset generation

Runtime raster assets use lossless WebP. Keep upstream PNG files as extraction
inputs; preserve the original source hashes in provenance records.

Theme extraction and atlas verification require `cwebp` and `dwebp` from
[libwebp](https://developers.google.com/speed/webp/download). Font extraction
requires Pillow with WebP support, plus the dependencies listed in each script.

Encode with `cwebp -lossless -z 9 -exact input.png -o output.webp`. The `-exact`
option preserves RGB values beneath transparent pixels. Pillow generators use
`lossless=True, exact=True, method=6` for the same reason.

Keep favicon and application installation icons in ICO/PNG/SVG. Visual audit
screenshots and test fixtures remain PNG.

## Apple Mac OS 8.0 icons

`pnpm assets:macos8-icons --disk "/path/to/Mac OS 8.0 HD.dsk"` decodes eight original
32×32 `icl8`/`ICN#` and 16×16 `ics8`/`ics#` icon pairs. Platinum folder, document
and application icons are read from Appearance Extension rather than the older
resources retained in System. It writes PNG extraction inputs,
lossless/exact WebP runtime assets and source hashes to the UI package. Use the
release image URL recorded in `packages/ui/assets/icons/desktop/macos8/provenance.json`.
The decoder requires Pillow, machfs 1.3 and macresources 1.2. The input image stays
in `.refs/`; source programs and disk images are not shipped with the package.
The standard indexed-color palette was checked against libicns 0.8.1. Assets
retain Apple copyright; see the UI package's separate notice.
