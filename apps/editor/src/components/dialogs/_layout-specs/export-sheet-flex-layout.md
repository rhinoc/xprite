# Export / Sprite Sheet flex layout spec (Xprite-only)

Derived from current Xprite dialog field lists and show/hide rules in
`export-file-dialog` and `sprite-sheet-dialog`. Implementation uses FormDialog
`layoutMode="flow"` + FlowForm CSS flex/grid (no absolute FormLayout x/y tables).

## Export File

- Fields (order): output (filename), format (select; omitted when embedded — parent
  Export shell owns Format), webpCompression (select, webp only), resize + area
  (same row), layers, frames, loopCount (gif/apng/webp-animation), anidir,
  playSubtags (conditional), pixelRatio (conditional), forTwitter, adjustResize
  (twitter helper button), ignoreEmpty.
- Actions: Export, Cancel.
- Wide: label column ~176px, 8px row gap, resize|area shared row, actions
  right-aligned 120×34.
- Narrow: default FlowForm stack/wrap (same path Xprite already used when the
  dialog could not fit).

## GIF Options

- Fields: section “General Options:”, interlaced, loop, palette, dontShow.
- Actions: OK, Cancel.
- Wide/narrow: vertical checkbox stack, actions right-aligned.

## Export Sprite Sheet (priority)

- Chrome: tabs Layout | Sprite | Borders | Output; header action expand/collapse.
- Layout tab: sheet type, constraints (+ width/height when set), flags row
  (mergeDuplicates, ignoreEmpty, powerOfTwo).
- Sprite tab: source, layers|splitLayers, frames|splitTags.
- Borders tab: paddings, trim checks, extrude.
- Output tab: image/json toggles + names, data meta checks, filename/tag formats.
- Footer row: openGenerated, preview; actions Export, Cancel.
- Wide and narrow both use flex (tabs no longer force absolute FormDialog path).

## Import Sprite Sheet

- Fields: Select File (button, when provided), layout type, Tiles section,
  origin x|y, size width|height, columns|rows, paddingEnabled,
  horizontal|vertical padding (when enabled), partialTiles.
- Actions: Import, Cancel.

## Usability gate (no clipped controls)

Compact density must never shrink peer-row controls or checkbox rows below a
usable size. Peer label+control fields (Resize|Area) use content-sized captions
and a ~200px field floor; checkbox peers size to `max-content` and wrap.
Prefer wrap over horizontal/vertical clip. Dialog height follows FlowForm
content via `onHeightChange`.
