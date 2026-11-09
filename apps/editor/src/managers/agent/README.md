# Editor agent interface

The ready editor publishes `window.xpriteAgent`; `describe()` returns tool
names, descriptions and JSON Schemas (the authoritative contract — this file
summarizes it, `agent-tool-definitions.ts` owns the details). When the browser
provides `document.modelContext.registerTool`, the same operations are
registered as `xprite_getContext`, `xprite_render`, `xprite_readPixels`,
`xprite_validate`, `xprite_createDocument`, `xprite_applyBatch`,
`xprite_undo`, `xprite_redo`, `xprite_importImage`, `xprite_manageDocument`,
`xprite_exportDocument`, `xprite_palette`, `xprite_listDocs`, `xprite_readDoc`
and `xprite_releaseArtifact`. No additional server is required;
an agent must be connected to this live editor tab — fetching the website URL
cannot read another browser's document memory.

The editor HTML advertises `/agent/editor.md` with a `rel="describedby"`
Markdown link in its head; the document is shipped as a static editor asset.
The interface is available after workspace recovery completes and is removed
when the editor unmounts. Calls return `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`. Registration failures emit the
`xprite-agent-registration-error` browser event; the page JS interface remains
available regardless.

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

Use a rectangle that fits the sprite. `createDocument` caps new canvases at
2048 px per side.

## Reads

- `getContext`: full active document plus compact open-document summaries.
  `documentId` returns only `data.document`. Layers, frame timing, tags,
  selection, tilesets and busy flags are included; `includePalette` and
  `includeInkBounds` opt into heavier details.
  Read previews can include an in-progress raster gesture; `busy` marks an
  uncommitted gesture.
- `render`: sRGB PNG data URL, independent of zoom/pan. `filmstrip` composes
  listed frames into one image and returns `frameRects`; `onionSkin` ghosts
  neighbouring frames. `scale`, `background` (transparent/checkerboard/hex),
  `compareNative`, and `labels` compose a review without editing source pixels.
  Captions and native rectangles are outside the enlarged image; `frameRects`
  includes durations. `animation:true` returns a GIF with frame timing.
  Includes in-progress raster gestures in still previews.
- `readPixels`: `format:"grid"` returns a one-char-per-color legend plus row
  strings (`.` = transparent); `mode:"diff"` compares two endpoints and with
  `detail:true` returns the changed map; `mode:"stats"` returns color
  histogram, bounds and off-palette colors. Omit `layerId` for the visible
  composite. Cap: 65,536 px per read; larger sprites need region reads.
- `validate`: mechanical lint (`palette`, `strays`, `outline`, `banding`,
  `antialiasing`, `layers`, `animation`, `export_readiness`); `strict`
  promotes warnings; `expect.layerFrames`/`mustNotOverlap` assert invariants.
  Results report checks and error/warning/note counts, never an art-quality
  score. Findings distinguish technical issues from visual-review heuristics;
  isolated particles are warnings, not certain errors. Visual review is always
  required. `animationIntent` gates character
  timing advice; ambient/mechanical loops may correctly use uniform timing.
- `exportDocument`: `png` (one frame, sRGB), `aseprite` (whole project),
  `gif` (all frames / `frameRange` / `tag`, honoring durations, `scale`
  integer), `spritesheet` (`layout` `strip`|`grid`, returns `frameRects`),
  `tag` shorthand. Never downloads or marks saved. `output:"url"` on export
  or render returns a same-browser Blob URL instead of base64/data URLs.
  The manager bounds retained artifacts to 32 files / 64 MiB, rejects further
  allocations at capacity, and revokes them on teardown. `releaseArtifact`
  releases only URLs owned by this interface. The browser adapter owns Blob IO.
- `importImage`: base64 PNG/GIF → cel (multi-frame GIF appends frames);
  optional `pixelate` worker pass `{ method?, colorPicker?, targetWidth?,
  targetHeight?, outlineStrength?, removeNoise? }` — `method` is the per-cell
  resample (`nearest` crispest), `colorPicker` picks the cell color.
- `manageDocument`: `save` / `close` (`force` discards unsaved) / `duplicate`
  (new unsaved tab). `open` unsupported.
- `writePreview`: PNG into the user's connected preview directory; fails with
  `preview_directory_permission_required` until connected in preferences.

## Batch operations

Ops explicitly target `layerId` + `frameIndex`; region edits add an optional
`rect`. Frame indices evaluate against batch state — inserting a frame shifts
later indices. Reread context after structural edits.

- **Paint**: `stroke` (`points`, `size?`), `line` (`start`,`end`),
  `polygon` (`points`, `size?`), `fillPolygon` (`points`, `outlineColor?`),
  `rectangle`/`fillRect`/`ellipse`/`fillEllipse` (`rect`), `fill` (`point`),
  `pixels` (`rect`,`rgba` 4 bytes/px), `grid` (`rect`,`legend`,`rows`;
  `transparent` `erase`|`skip`). Polygons close automatically and require
  at least three vertices. Filled polygon borders are one pixel wide.
  Raw pixels/grids supply their own colors; brush size applies to strokes
  and outlines, not fills.
- **Structure**: `addLayer` (`layerId`, `name`, `afterLayerId?`),
  `renameLayer`, `setLayerVisibility`, `moveLayer` (`targetLayerId`),
  `setLayer` (`opacity`/`blendMode`/`visible`/`name`/`editable`),
  `duplicateLayer` (`toDocumentId?` for cross-document), `mergeLayer`,
  `groupLayer`/`ungroupLayer`, `deleteLayer`; `addFrame` (`afterFrameIndex`,
  `duplicate?`, `duration?`), `copyFrame` (`to:[idx]`), `deleteFrame`,
  `reorderFrame`, `deleteLayer`.
- **Cel**: `clear`, `clearCel`, `copyCel` (`toFrameIndex`),
  `blit` (`src:{documentId?,layerId,frameIndex,rect}`, `dest:{x,y}`),
  `setCel` (`position`/`opacity`), `linkCels`/`unlinkCels`
  (`layerId`,`frameIndices`).
- **Transform**: `flip` (`direction`), `rotate90` (`angle`),
  `translate` (`dx`,`dy`), `resizeCanvas` (`width`,`height`,`anchor`),
  `resizeSprite` (`width`,`height`,`method` `nearest`/`bilinear`/`rotsprite`),
  `cropToContent`.
- **Tilemap** (tilemap layers only): `convertToTilemap` (image layer +
  `tileWidth`/`tileHeight` → deduplicated tileset), `stampTiles`
  (`cells:[{x,y,tile}]`, index must exist), `paintTiles` (`rect`+`rgba`,
  re-packs the cel and grows the atlas on no-match blocks).
- **Color & effects**: `replaceColor` (`from`,`to`,`frameRange?`),
  `outline` (`color`,`position`,`size`), `adjustHsl` (additive HSL),
  `effect` (`brightness-contrast`/`invert`/`median-blur`/
  `convolution-matrix`/`color-curve`/`hue-saturation`), `gradient`
  (`from`,`to`,`direction`,`dither`), `dither` (`colorA`,`colorB`,`pattern`,
  `ratio`), `select` (masks later writes in the batch).
- **Animation**: `tweenCels` (`layerId`,`fromFrame`,`toFrame`,`property`
  `position`/`opacity`/`scale`, `from`, `to`, `ease`
  `linear`/`in`/`out`/`inOut`/`pingpong`).

## Semantics

Colors are `#RRGGBB`/`#RRGGBBAA` or `[r,g,b,a]` bytes; replacement ink; writes
honor the active selection. Background layers require opaque colors.
Indexed/grayscale documents, reference layers and groups are not pixel-write
targets; linked cels update together. A batch is one history entry; rejected
batches leave no partial edits; no-op edits consume no undo entry.

Limits: 128 ops/batch, 4096 stroke points, brush 1–64, 4,194,304 px
allocated per batch/render, 65,536 px per `readPixels`, 2048 px per side for
new documents, frame duration 1–65535 ms.

Errors: `invalid_input`, `revision_conflict`, `busy`, `not_found`,
`not_editable`, `unsupported`, `operation_failed`. `describe()` provides
current schemas.

## Design sources

Aseprite's `tests/scripts/tools.lua` and `app_transaction.lua` (MIT) informed
explicit drawing targets and one-undo-step batching. Polygon behavior reuses
Xprite's existing rasterizer; reference `src/doc/algorithm/polygon.cpp` (MIT).
Reference `src/render/bg_options.h` and `src/render/bg_type.h` (both MIT)
informed preview-only transparency/checkerboard backgrounds. Review captions,
native-size comparison and artifact delivery are agent-specific additions;
no reference implementation code was copied for them. WebMCP registration uses
`document.modelContext.registerTool`; the page JS interface remains available
without it. Registration failures emit `xprite-agent-registration-error`.

## Craft rules

`assets/public/agent/craft/` is a handbook of pixel-art craft rules for agents,
grouped into band directories (`00-core`, `10-technique`, … `90-style`) with
`README.md` as the index — shipped alongside `editor.md` for connected agents,
and readable through the `listDocs`/`readDoc` tools (`id` like
`"42-walk-and-run"`, `"index"` alias; the leading digit selects the band) so
tool-loop agents need no page fetch.
