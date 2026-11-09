# Xprite editor interface for browser agents

The open editor tab provides `window.xpriteAgent`, a JavaScript interface to
its live documents. These calls run inside this browser tab; fetching this
document or the site from another browser does not give access.

After the editor loads, call `window.xpriteAgent.describe()` for the tool
descriptions and JSON Schemas — that response is the authoritative contract.
Then `await window.xpriteAgent.getContext()` to inspect open documents,
revisions, layers, frames, selection and editing limits. Palette entries and
ink bounds are opt-in (`includePalette`, `includeInkBounds`).

All operations return `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`. The tools:

- `getContext({ documentId?, includePalette?, includeInkBounds? })` — detailed
  `activeDocument` plus a compact document inventory. With `documentId`, returns
  just the requested document as `data.document`. Optional detail flags default
  to false.
- `createDocument({ width, height, name?, background? })` — open a new RGBA
  document.
- `applyBatch({ documentId, expectedRevision, label, operations })` — atomic
  drawing/structural/color/transform ops as one undo step; the op list lives
  in `describe()`.
- `render({ documentId, frameIndex?, rect?, scale?, background?, labels?,
  compareNative?, filmstrip?, onionSkin?, animation?, tag?, frameRange?, output? })`
  — PNG review or timed GIF playback. Choose one of filmstrip, onionSkin, or
  animation. Backgrounds are `transparent`, `checkerboard`, or `#RRGGBB`.
  Enlargements use nearest-neighbor; comparison adds a native-size view.
  Labels show zero-based frame numbers and durations outside the artwork.
  `filmstrip` accepts optional `frames`, `layout`, `scale`, and `labels`.
  `output:"url"` returns a browser-local file URL; the default is `"dataUrl"`.
- `readPixels({ documentId, frameIndex?, layerId?, rect, format?, mode?,
  detail?, from?, to? })` — row-major RGBA, a character grid (`format:"grid"`),
  a diff between two endpoints (`mode:"diff"`), or colour stats
  (`mode:"stats"`).
- `validate({ documentId, checks?, strict?, expect?, animationIntent? })` —
  technical checks with `passed`, `checksRun`, `counts`, `findings`, and a
  summary. Findings distinguish `technical` from `visual_review`; isolated
  pixels and edge heuristics are review suggestions. `visualReviewRequired` is
  always true: passing is not a visual
  quality judgment. Intent is `unspecified` (default), `character`, `ambient`,
  or `mechanical`; only character cycles receive expressive-timing advice.
- `undo` / `redo({ documentId, expectedRevision })` — normal document history.
- `exportDocument({ documentId, format, frameIndex?, frameRange?, tag?,
  scale?, layout?, output? })` — `png`/`aseprite`/`gif`/`spritesheet`/`tag`.
  Output defaults to `base64`; `output:"url"` avoids sending bytes in tool text.
- `releaseArtifact({ url })` — releases a file URL returned by render/export.
  URLs work in the originating browser until released or the editor interface
  shuts down. They are not uploaded or automatically downloaded. Up to 32
  files / 64 MiB can be retained; release files after reading/downloading them.
- `palette({ documentId, op, ... })` — `get`/`set`/`ramp`/`analyze`/`extract`/
  `snap` (nearest-palette repaint, the palette-lock repair).
- `importImage({ documentId, expectedRevision, bytes, ... })` — decode PNG/GIF
  into a cel; `pixelate` runs a photo→pixel-art pass first.
- `manageDocument({ op, documentId, name?, force? })` — `save` / `close` /
  `duplicate`.
- `writePreview({ documentId, frameIndex?, rect?, filename? })` — render into
  the user's connected preview directory.
- `listDocs()` — list the pixel-art handbook as `{id, title}` pairs.
- `readDoc({ id? })` — read one handbook page. Omit `id` (or `"index"`) for
  the README index; otherwise a document id like `"00-core-principles"` or
  `"42-walk-and-run"`.

Drawing coordinates are integer sprite pixels; frame indices are zero-based.
Pixel ops need a visible editable RGBA image layer; tilemap layers take
`stampTiles`/`paintTiles`/`convertToTilemap` instead. `expectedRevision` must
match the latest content revision — on `revision_conflict`, re-read context.

```js
const api = window.xpriteAgent;
const created = await api.createDocument({ width: 16, height: 16 });
const doc = created.data;
const result = await api.applyBatch({
  documentId: doc.id,
  expectedRevision: doc.revision,
  label: "Draw square",
  operations: [{
    type: "fillRect",
    layerId: doc.activeLayerId,
    frameIndex: doc.activeFrameIndex,
    rect: { x: 4, y: 4, width: 8, height: 8 },
    color: "#FF004D",
  }],
});
const preview = await api.render({
  documentId: doc.id,
  scale: 4,
  compareNative: true,
  background: "checkerboard",
  labels: true,
});
```

For perspective faces and other closed shapes, use `fillPolygon` with at least
three integer `{x,y}` points, a fill `color`, and optional one-pixel
`outlineColor`. `polygon` draws a closed outline with optional brush `size`.
Both honor selection clipping, locked layers and atomic undo like other paint
operations. Repeating the first point at the end is unnecessary.

Compatible WebMCP browsers expose the same calls as `xprite_*` tools.

## Drawing well

`listDocs` indexes the pixel-art craft handbook — the
inspect→draw→look→fix loop, palette ramps, hue-shifted shading, silhouette
blocking, outlines, animation timing, review checklist — grouped into band
directories. Read doc `00-core-principles` before any non-trivial
drawing task; `listDocs` + `readDoc` cover the same pages without a fetch.
