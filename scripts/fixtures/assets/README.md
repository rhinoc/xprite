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
