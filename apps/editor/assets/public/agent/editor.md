# Xprite editor interface for browser agents

The open editor tab provides `window.xpriteAgent`, a JavaScript interface to its
live documents. These calls run inside this browser tab. Fetching this document
or the website from a different browser does not give access to those documents.

After the editor finishes loading, call `window.xpriteAgent.describe()` to read
the current tool descriptions and JSON Schemas. Call
`await window.xpriteAgent.getContext()` to inspect open documents, their current
revisions, layers, frames, palettes, selection bounds and editing limits.
If the interface is not available yet, wait for the editor to finish loading.

All operations return `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`. The interface exposes:

- `getContext()` — inspect current documents and supported operations.
- `createDocument({ width, height, name?, background? })` — open a new RGBA
  document without replacing existing documents. Background defaults to
  `transparent`; `white` and `black` are also available.
- `applyBatch({ documentId, expectedRevision, label, operations })` — submit
  an atomic drawing or layer/frame edit as one undo step. Read its JSON Schema
  from `describe()` for the available operations and their arguments.
- `render({ documentId, frameIndex?, rect? })` — get a visible composite as an
  sRGB PNG `dataUrl`, independent of the canvas zoom and pan.
  `filmstrip: { frames?, layout?, scale? }` instead composites every listed
  zero-based frame (default all) into one PNG, horizontally (`"strip"`) or in
  a near-square `"grid"`, and returns `frameRects` mapping each region back to
  a `frameIndex`. `onionSkin: { prev?, next?, alpha?, layerId? }` renders the
  target frame at full alpha over ghosted neighboring frames, oldest first.
- `readPixels({ documentId, frameIndex?, layerId?, rect })` — get working-space
  RGBA bytes and the current selection mask for a region. Pass
  `format: "grid"` to get a character `legend` plus one `rows` string per
  sprite row instead of flat bytes; `.` is transparent. Omit `layerId` for the
  visible composite. `mode: "diff"` instead compares the same `rect` between
  two endpoints `from`/`to` (`{ documentId?, frameIndex?, layerId? }`,
  defaulting to the top-level values) and returns `changedPixels`,
  `changedBounds`, the resolved endpoints, and with `detail: true` a
  `{ legend, rows }` map where `.` is unchanged, `-` erased, and other
  characters the new colour. `mode: "stats"` returns a `colors` count, a
  descending `histogram` (up to 64 colors), the non-transparent `bounds`,
  and `offPalette` colors not in the document palette.
- `validate({ documentId, checks?, strict?, expect? })` — lint the document
  against pixel-art rules and return `passed`, a `score` 0-100, `findings`
  with `check`, `severity` (`error`/`warning`/`note`), `message` and optional
  `layerId`, `frameIndex`, `at` and `count`, plus a `summary`. `checks` limits
  the run to a subset of `palette`, `strays`, `outline`, `banding`,
  `antialiasing`, `layers`, `animation`, `export_readiness` (omit for all).
  `strict` treats warnings as failures. `expect.layerFrames` maps a `layerId`
  to zero-based `[from,to]` ranges that must hold ink; `expect.mustNotOverlap`
  lists `[layerId, layerId]` pairs whose opaque pixels must never intersect on
  a frame. Hidden layers are skipped by per-pixel checks.
- `undo({ documentId, expectedRevision })` and
  `redo({ documentId, expectedRevision })` — traverse normal document history.
- `exportDocument({ documentId, format, frameIndex?, frameRange?, tag?,
  scale?, layout? })` — return file bytes as `base64`, with `filename`,
  `mimeType` and `byteLength`. `png` exports one frame in sRGB; `aseprite`
  exports the complete project. `gif` encodes all frames, `frameRange`
  `[from, to]`, or the named `tag`'s range as an animated GIF with per-frame
  durations; `scale` is an integer enlargement. `spritesheet` packs the same
  selection as a `"strip"` (default) or `"grid"` PNG and adds `frameRects`
  (`x, y, width, height, frameIndex`). `format: "tag"` exports that tag's
  range as GIF when it spans more than one frame, PNG otherwise. Export does
  not download or mark the document saved.
- `palette({ documentId, op, ... })` — read and shape the document palette.
  `op:"get"` returns `colors: [{index, hex, pixels}]` with usage counts across
  every frame's visible composite. `op:"set"` writes `colors` at `startIndex`,
  or replaces the palette with `replace: true`; `remapArt` is unsupported.
  `op:"ramp"` returns `{ramp: [hex]}`, a hue-shifted ramp around `base`
  (`steps` colors, `spread` reach; shadows toward blue, highlights toward
  orange) — it does not apply, call `set` to append it. `op:"analyze"`
  returns `size`, `unusedIndices`, `nearDuplicates` (ΔE < 3),
  `offPaletteColors`, `lowestContrastPair` and `verdict`. `op:"extract"`
  quantizes the visible composite across all frames to `maxColors` and
  replaces the palette. Palette writes are one history entry.
- `importImage({ documentId, expectedRevision, bytes, format?, layerId?,
  frameIndex?, position?, newLayer?, name? })` — decode base64 PNG or GIF
  bytes and paint them as one undo step. `format` defaults to `"auto"` byte
  sniffing; a multi-frame GIF writes successive frames, appending new frames
  only past the timeline end. Without `layerId` a new layer is created above
  the active one (`newLayer: false` paints the active layer); with `layerId`
  the image composites into that layer's cel at `frameIndex` plus `position`
  (sprite coordinates, clipped to the canvas; default `{x:0,y:0}`). Returns
  the target `layerId`, `frameIndex`, `rect`, `imageWidth`, `imageHeight`,
  `frames` and the new `revision`.
- `manageDocument({ op, documentId, name?, force? })` — `save` runs the
  editor save workflow and marks the tab saved, returning `{ saved, name }`;
  `close` closes the tab and rejects with unsaved changes unless
  `force: true` discards them; `duplicate` opens a copy as a new unsaved tab
  and returns its context. `open` is not supported.

Drawing coordinates are integer sprite pixels, not screen coordinates. Frame
indices are zero-based. Pixel edits explicitly target a `layerId` and
`frameIndex`; they honor the current selection and require a visible, unlocked
RGBA image layer. Colors are working-space hex strings or four RGBA bytes.
Linked cels remain linked. Tool, color, zoom and pan controls are not changed.

`applyBatch` needs the latest content revision. On `revision_conflict`, read
context again before deciding how to proceed. A `busy` result means a user edit
or document operation is still pending. A rejected batch does not leave partial
edits. Undo uses the same history as human edits, so check the current revision
before undoing.

For example, create a separate small document and draw a square:

```js
const api = window.xpriteAgent;
const created = await api.createDocument({ width: 16, height: 16, name: "Square" });
if (!created.ok) throw new Error(created.error.message);
const doc = created.data;
const result = await api.applyBatch({
  documentId: doc.id,
  expectedRevision: doc.revision,
  label: "Draw square",
  operations: [
    {
      type: "fillRect",
      layerId: doc.activeLayerId,
      frameIndex: doc.activeFrameIndex,
      rect: { x: 4, y: 4, width: 8, height: 8 },
      color: "#FF004D",
    },
  ],
});
if (!result.ok) throw new Error(result.error.message);
const preview = await api.render({ documentId: doc.id });
```

A `grid` batch operation writes the same representation back to a layer:

```js
await api.applyBatch({
  documentId: doc.id,
  expectedRevision: result.data.revision,
  label: "Patch pixels",
  operations: [
    {
      type: "grid",
      layerId: doc.activeLayerId,
      frameIndex: doc.activeFrameIndex,
      rect: { x: 4, y: 4, width: 8, height: 2 },
      legend: { K: "#292431", S: "#777386" },
      rows: ["..KK....", ".KSSK..."],
      transparent: "erase",
    },
  ],
});
```

Structural operations in the same batch include `addLayer`, `renameLayer`,
`setLayerVisibility`, `moveLayer`, `addFrame`, `setFrameDuration`,
`linkCels`/`unlinkCels` (`{ layerId, frameIndices }`), and the animation tag
operations `addTag` (`{ name, from, to, direction?, repeat?, color? }`),
`updateTag` (`{ tagIndex, ... }`), `removeTag` (`{ tagIndex }`). Context lists
each document's `tags` in order; `tagIndex` follows that order.

Compatible WebMCP browsers also expose these operations as `xprite_*` tools.
The JavaScript interface works when the browser tool can evaluate JavaScript in
the page. Screenshots and pointer input remain available for ordinary UI use.

## Drawing well

This document covers the interface; `/agent/craft/README.md` is a short
opinionated handbook on drawing *well* with it — the inspect → draw → look →
fix loop, palette ramps, hue-shifted shading, silhouette-first blocking,
outline styles, animation timing and a pre-flight review checklist. Read
`craft/00-core-principles.md` before any non-trivial drawing task.
