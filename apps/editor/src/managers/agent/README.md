# Editor agent interface

The ready editor publishes `window.xpriteAgent`. `describe()` returns tool names,
descriptions and JSON Schemas. When the browser provides
`document.modelContext.registerTool`, the same operations are registered as
`xprite_getContext`, `xprite_render`, `xprite_readPixels`,
`xprite_validate`, `xprite_createDocument`, `xprite_applyBatch`, `xprite_undo`,
`xprite_redo`, `xprite_importImage`, `xprite_manageDocument` and
`xprite_exportDocument`, plus `xprite_palette`. No additional server is required. A browser or agent
must be connected to this live editor tab; fetching the website URL cannot read
another browser's document memory.

The editor HTML advertises `/agent/editor.md` with a `rel="describedby"`
Markdown link in its head. The document is shipped as a static editor asset and
explains how to discover the current schemas through `describe()`. The editor's outer accessible name recommends `window.xpriteAgent`
for browser drawing and editing, gives the `describe()` call and the documentation
URL in the current UI language. Semantic snapshots can surface these without
inspecting the head.

The interface is available after workspace recovery completes and is removed
when the editor unmounts. Calls return `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`. Inputs are validated for both entry
points. The browser's WebMCP support and the agent's ability to call it are
separate requirements. Registration failures emit the
`xprite-agent-registration-error` browser event with the tool name and message;
the page JS interface remains available.

## Draw in the current document

```js
const api = window.xpriteAgent;
const context = await api.getContext();
if (!context.ok) throw new Error(context.error.message);
const document = context.data.activeDocument;
if (!document) throw new Error("Open or create a document first");

const result = await api.applyBatch({
  documentId: document.id,
  expectedRevision: document.revision,
  label: "Draw a red square",
  operations: [
    {
      type: "fillRect",
      layerId: document.activeLayerId,
      frameIndex: document.activeFrameIndex,
      rect: { x: 0, y: 0, width: 4, height: 4 },
      color: "#FF004D",
    },
  ],
});
if (!result.ok) throw new Error(result.error.message);
const preview = await api.render({ documentId: document.id });
// preview.data.dataUrl is an sRGB PNG.
const undone = await api.undo({
  documentId: document.id,
  expectedRevision: result.data.revision,
});
```

Use a rectangle that fits the sprite. `createDocument({ width, height, name?,
background? })` creates an RGBA document and returns its context. Background is
`transparent` by default, or `white` / `black`. Existing documents remain open.
Do not retain document IDs across reloads or close/reopen cycles.

## Read and export

- `getContext({})` returns open documents and the active document, content
  revisions, layers, zero-based frame indices and durations, selection bounds,
  working palette, tilesets (`id`, `name`, `tileWidth`, `tileHeight`,
  `tileCount`, `baseIndex`), busy state, supported operations and limits. A document ID
  identifies shared content across linked views; `viewId` identifies its tab.
- `render({ documentId, frameIndex?, rect? })` returns a visible composite PNG
  data URL with the frame, rectangle and sampled revision. It ignores zoom and
  pan. The default is the active frame and full sprite.
- `readPixels({ documentId, frameIndex?, layerId?, rect })` returns row-major
  working-space RGBA bytes. `format: "grid"` returns the same region as a
  single-character `legend` plus one `rows` string per sprite row; `.` is
  transparent and identical RGBA colors reuse the same character. Omit
  `layerId` for the visible composite. A missing image cel reads transparent.
  `selectionMask` is null without a selection, otherwise a row-major 0/1 mask
  for the returned region. Pixel writes honor this mask, which may be
  irregular.
  `mode: "diff"` instead compares the same `rect` between two endpoints:
  `from` and `to` are `{ documentId?, frameIndex?, layerId? }` objects whose
  omitted fields default to the top-level values, so cross-document, cross-frame
  and layer-vs-composite comparisons are all expressible. It returns
  `changedPixels`, `changedBounds` (sprite coordinates, `null` when unchanged),
  the resolved `from`/`to` endpoints with their sampled revisions, and with
  `detail: true` a `detail` map of `{ legend, rows }` over the region where `.`
  is unchanged, `-` is erased to transparent, and any other character is the
  new color at that pixel.
- `exportDocument({ documentId, format, frameIndex?, frameRange?, tag?,
  scale?, layout? })` returns filename, MIME type, byte length and base64
  bytes. `png` exports the specified or active frame in sRGB; `aseprite`
  exports the whole project with its color profile. `gif` encodes every frame,
  `frameRange` `[from, to]`, or the named `tag`'s range as an animated GIF with
  per-frame durations; `scale` is an integer enlargement. `spritesheet` packs
  the same selection as a horizontal `"strip"` (default) or near-square
  `"grid"` PNG and adds `frameRects` (`x, y, width, height, frameIndex`).
  `format: "tag"` is a shorthand that exports the named tag's range as a GIF
  when it spans more than one frame, PNG otherwise. Export does not download,
  mark saved or update export preferences. File data belongs to the returned
  revision even if the user edits during encoding.
- `palette({ documentId, op, colors?, startIndex?, replace?, remapArt?, base?,
  steps?, spread?, maxColors? })` reads and shapes the working palette.
  `get` returns `{colors: [{index, hex, pixels}]}` with usage counts across
  every frame's visible composite. `set` writes `colors` at `startIndex`, or
  replaces the palette wholesale with `replace: true`; `remapArt` is rejected
  as `unsupported` (no history-aware palette remap — repaint with applyBatch).
  `ramp` returns `{ramp: [hex]}`, a hue-shifted ramp around `base` of `steps`
  colors and `spread` reach — shadows rotate toward blue, highlights toward
  orange; it does not apply itself, call `set` to append it. `analyze`
  returns `size`, `unusedIndices`, `nearDuplicates` (ΔE < 3),
  `offPaletteColors`, `lowestContrastPair` and a `verdict`. `extract`
  quantizes the visible composite across all frames to `maxColors` and
  replaces the palette. Palette writes are one history entry.
  `snap` repaints every image cel's off-palette pixels to the nearest palette
  color in CIELAB, preserving alpha — the palette-lock repair. It replays one
  `pixels` op per changed cel as a single undoable batch and returns
  `snappedPixels` (cel count) and `changedRegions`; `expectedRevision` is
  optional, `label` names the history entry.
- `validate({ documentId, checks?, strict?, expect? })` lints the document
  against pixel-art rules and returns `passed`, a `score` 0-100, located
  `findings` (`check`, `severity`, `message`, optional `layerId`, `frameIndex`,
  `at`, `count`) and a `summary`. Omit `checks` to run everything; `expect`
  adds per-layer frame ranges and layer pairs that must not overlap.
- `writePreview({ documentId, frameIndex?, rect?, filename? })` renders like
  `render` but writes the PNG into the user-connected preview directory and
  returns its `filename`. The user connects the directory once under
  Preferences > Files > Agent Preview; until then the call fails with
  `preview_directory_permission_required`. `filename` defaults to a unique
  `preview-<doc>-f<frame>-r<revision>.png` and must be a plain `*.png` name.
- `importImage({ documentId, expectedRevision, bytes, format?, layerId?,
  frameIndex?, position?, newLayer?, name?, pixelate? })` decodes base64 PNG or GIF bytes
  and paints them as one undo step. `format` defaults to `"auto"` sniffing; a
  multi-frame GIF writes successive frames, appending new frames only past the
  timeline end. Without `layerId` a new layer is created above the active one
  (`newLayer: false` paints the active layer); with `layerId` the image
  composites into that layer's cel at `frameIndex` plus `position`, clipped to
  the canvas. `pixelate` is an optional object that runs each decoded frame
  through the pixelation worker first, converting a photo or render to pixel
  art: `{ method?, colorPicker?, targetWidth?, targetHeight?,
  outlineStrength?, removeNoise? }` — `method` is the per-cell resample rule
  (`nearest`, `box`, `most-frequent`, `dominant`, `structure`, `two-stage`;
  `nearest` is crispest), `colorPicker` picks each cell colour when a grid is
  recovered (`most-common`, `average`, `median`, `k-means`, `contrast`,
  `nearest`, `structure`, `two-stage`, `dual-rt-two-stage`),
  `targetWidth`/`targetHeight` fix the pixelated size (defaults keep the image
  aspect), `outlineStrength` 0-1 darkens edges, `removeNoise` smooths similar
  colours. Returns `layerId`, `frameIndex`, `rect`, `imageWidth`,
  `imageHeight`, `frames` and `revision`.
- `manageDocument({ op, documentId, name?, force? })` — `save` runs the editor
  save workflow and marks the tab saved; `close` closes the tab and rejects
  with unsaved changes unless `force: true` discards them; `duplicate` opens a
  copy as a new unsaved tab and returns its context. `open` is not supported.

Read previews can include an in-progress raster gesture; context's `busy` flag
distinguishes it from a committed state. Export and edits reject pending drawing,
paste, selection transforms, text, filter/import previews and session operations.

## Batch operations

Painting explicitly targets `layerId` and `frameIndex`. Coordinates are integer
sprite pixels within the canvas, independent of UI scale. Frame indices are
zero-based and interpreted against the state at that operation: inserting a
frame shifts subsequent indices. Always reread context after a structural edit.

- `stroke`: `points`, `color`, optional `size`.
- `line`: `start`, `end`, `color`, optional `size`.
- `rectangle`, `fillRect`, `ellipse`, `fillEllipse`: `rect`, `color`, optional
  `size`. Size applies to line/rectangle/stroke brushes; ellipses have a one-pixel
  outline and fills cover the specified area.
- `fill`: `point`, `color`; contiguous fill with zero tolerance.
- `pixels`: `rect`, `rgba`; exactly four bytes per pixel, including transparent
  pixels.
- `grid`: `rect`, `legend`, `rows`; `.` means transparent. `transparent` is
  `erase` by default and clears the covered pixels; `skip` leaves existing
  pixels under `.` unchanged. Other characters map to working-space colors in
  `legend`.
- `addLayer`: caller-selected unique `layerId`, `name`, optional `afterLayerId`.
  Uses the editor's insertion rules, including insertion into an active group.
  Later operations in the batch can paint the new layer by its ID.
- `renameLayer`: `layerId`, `name`.
- `setLayerVisibility`: `layerId`, `visible`.
- `moveLayer`: `layerId`, `targetLayerId`; uses the editor's move-to-target
  order and preserves layer subtrees/background constraints.
- `addFrame`: `afterFrameIndex`, optional `duplicate` (default true) and
  `duration` in milliseconds. Continuous cels stay linked; other duplicated
  cels receive independent images.
- `setFrameDuration`: `frameIndex`, `duration` in milliseconds. Or pass
  `durations`, one entry per frame in timeline order, to set every frame's
  duration in one op.
- `addTag`: `name`, `from`, `to` (zero-based closed frame range), optional
  `direction` (default `forward`), `repeat`, `color` ([r,g,b] or [r,g,b,a]).
  `updateTag`: `tagIndex` plus any of the same fields to patch.
  `removeTag`: `tagIndex`. Indices follow the order `getContext` returns.
- `linkCels`: `layerId`, `frameIndices`; the first populated frame's cel
  becomes the shared source for the rest of the list. `unlinkCels`: `layerId`,
  `frameIndices`; each listed cel receives its own copy of the shared image.

**Region edits** also take `layerId` and `frameIndex`, plus an optional `rect`
clipping the effect to part of the cel.

- `clear`: erase the region (or whole cel) to transparent.
- `clearCel`: erase the whole cel.
- `copyCel`: `toFrameIndex`; duplicate the cel image onto another frame.
- `blit`: `src: { documentId?, layerId, frameIndex, rect }`,
  `dest: { x, y }`; copy a region from any open document's cel.
- `setCel`: optional `position`, `opacity`; move a cel's placement and alpha.
- `flip`: `direction: "horizontal" | "vertical"`.
- `rotate90`: `angle: 90 | 180 | 270`.
- `translate`: `dx`, `dy` sprite-pixel shifts; pixels leaving the region are
  cleared.
- `resizeCanvas`: `width`, `height`, optional `anchor` (default `center`);
  changes every layer's canvas, cropping or padding with transparency.
- `resizeSprite`: `width`, `height`, optional `method` `nearest` (default) /
  `bilinear` / `rotsprite`; resamples every cel to the new sprite size. Use
  `resizeCanvas` to crop or pad without scaling pixels.
- `cropToContent`: optional `layerId`; shrink the canvas to the opaque bounds.
- `convertToTilemap`: `layerId` (transparent image layer), `tileWidth`,
  `tileHeight`, optional `name`, `tilesetName`, `baseIndex`, `matchFlags`;
  repacks the layer's cels into a deduplicated tileset and turns the layer
  into a tilemap. The tile-atlas `pack` equivalent.
- `stampTiles`: `layerId` (tilemap), `frameIndex`, `cells` listing
  `{x, y, tile}` grid placements. `tile` must exist in the layer's tileset —
  grow it first with `paintTiles` or `convertToTilemap`.
- `paintTiles`: `layerId` (tilemap), `frameIndex`, `rect`, `rgba`; paints
  pixels into the cel's rasterized tilemap at `rect`, then re-packs it —
  splitting into tile-sized blocks, deduplicating new tiles into the tileset
  and stamping the cells. Draw-on-tilemap editing; growing the atlas happens
  automatically when a block has no match.

**Color and effects**

- `replaceColor`: `from`, `to`, optional `frameRange` (rejected across
  multiple frames — send one op per frame).
- `outline`: `color`, optional `position: "outside" | "inside"`, `size` 1-16.
- `adjustHsl`: optional `hue` ±360, `saturation` ±100, `lightness` ±100
  (additive HSL).
- `effect`: `effect` object; the editor's own effects pipeline. One of:
  `{ kind: "brightness-contrast", brightness?, contrast? }` (±100),
  `{ kind: "invert" }`,
  `{ kind: "median-blur", width?, height? }` (1-100, default 3),
  `{ kind: "convolution-matrix", preset }` (`identity`, `box-blur`,
  `gaussian-blur`, `sharpen`, `edge-detect`, `emboss`, `horizontal-edges`,
  `vertical-edges`),
  `{ kind: "color-curve", points: [{x, y}] }` (1-256 byte curve points),
  `{ kind: "hue-saturation", mode?, hue?, saturation?, lightness?, alpha? }`
  (`hsv-mul`/`hsl-mul`/`hsv-add`/`hsl-add`, multiplicative or additive).
- `gradient`: `from`, `to`, optional `direction`
  (`horizontal`/`vertical`/`radial`), `dither` (`none`/`bayer2`/`bayer4`/`bayer8`).
- `dither`: `colorA`, `colorB`, `pattern`
  (`bayer2`/`bayer4`/`bayer8`/`checker`/`noise`), optional `ratio` 0-1.
- `select`: `op` (`all`/`none`/`rect`/`ellipse`/`color`), optional `rect`,
  `color`, `mode` (`replace`/`add`/`subtract`/`intersect`), `grow`, `shrink`.
  A selection masks later pixel writes in the same batch.

**Structure**

- `deleteFrame`: `frameIndex`. `reorderFrame`: `frameIndex`, `toIndex`.
- `copyFrame`: `frameIndex`, `to: [frameIndex]`; copy one frame's cels to
  other frame indices.
- `deleteLayer`: `layerId`.
- `setLayer`: `layerId` plus any of `opacity`, `blendMode`, `visible`, `name`,
  `editable`.
- `duplicateLayer`: `layerId`, optional `name`, `toDocumentId` (copies into
  another open document).
- `mergeLayer`: `layerId`, optional `targetLayerId` (default the layer below).
- `groupLayer`: `layerIds`, optional `name`. `ungroupLayer`: `layerId`.

**Animation**

- `tweenCels`: `layerId`, `fromFrame`, `toFrame`, `property`
  (`position`/`opacity`/`scale`), `from`, `to` (number or `{x, y}` point),
  optional `ease` (`linear`/`in`/`out`/`inOut`/`pingpong`); generates
  in-between cels.

Colors are working-space `#RRGGBB`, `#RRGGBBAA`, or `[r, g, b, a]` bytes.
Drawing uses replacement ink, honors the current selection, and requires a
visible, editable RGBA image layer. Background layers require opaque colors.
Indexed/grayscale documents, reference layers, groups and tilemap layers are
not pixel-write targets — tilemaps take `stampTiles`/`paintTiles` instead.
They remain available to context, composite rendering
and export. Brush/color UI settings are not changed. Existing active layer and
frame are preserved; frame insertion adjusts the active index to keep the same
frame selected. Painting a linked cel updates every cel sharing that image.

`applyBatch` requires a content `expectedRevision`, not the general UI revision.
Pointer hover, zoom and pan do not invalidate it. A valid batch is one normal
history entry and participates in recovery. Rejected batches leave no partial
pixels or layer/frame changes; equal pixels do not consume an undo entry.
`undo` and `redo` require the current revision and traverse normal history,
including human edits. They return `{ changed, document }`; do not automatically
undo a user edit when an earlier AI result has become stale.

Limits: 128 operations per batch, 4096 stroke points, brush size 1–64, 4,194,304
allocated pixels per batch/render, 65,536 pixels per `readPixels`, 2048 per side
for new documents, and 1–65,535 ms for frame duration. Composite reads require
a sprite within the render pixel limit; larger documents can use region reads
with an image `layerId`. The core's existing project limits also apply.

Errors include `invalid_input`, `revision_conflict`, `busy`, `not_found`,
`not_editable`, `unsupported`, and `operation_failed`. On a revision conflict,
read context and reconsider the edit. `describe()` provides current schemas.

## Design sources

Aseprite's local `tests/scripts/tools.lua` and `app_transaction.lua` demonstrate
explicit drawing targets and grouping multiple operations into one undo step.
Their headers and `src/doc/LICENSE.txt` identify MIT licensing. The interface uses the repository’s raster and history implementations.
WebMCP registration follows the current imperative `document.modelContext`
interface; browsers without it still expose the page JS interface.

## Craft rules

`assets/public/agent/craft/` is a handbook of pixel-art craft rules for agents,
grouped into band directories (`00-core`, `10-technique`, … `90-style`) with
`README.md` as the index — the inspect→draw→look→fix loop, palette ramps,
hue-shifted shading, silhouette-first blocking, outline styles, animation
timing and a review checklist — shipped alongside `editor.md` so a connected
agent can fetch it.
