# Xprite editor interface for browser agents

The open editor tab provides `window.xpriteAgent`, a JavaScript interface to
its live documents. These calls run inside this browser tab; fetching this
document or the site from another browser does not give access.

After the editor loads, call `window.xpriteAgent.describe()` for the tool
descriptions and JSON Schemas — that response is the authoritative contract.
Then `await window.xpriteAgent.getContext()` to inspect open documents,
revisions, layers, frames, palette, selection and editing limits.

All operations return `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`. The tools:

- `getContext()` — documents, layers, frames, palette, tilesets, limits.
- `createDocument({ width, height, name?, background? })` — open a new RGBA
  document.
- `applyBatch({ documentId, expectedRevision, label, operations })` — atomic
  drawing/structural/color/transform ops as one undo step; the op list lives
  in `describe()`.
- `render({ documentId, frameIndex?, rect?, filmstrip?, onionSkin? })` —
  composite PNG for a frame, a frame strip, or an onion-skin ghost.
- `readPixels({ documentId, frameIndex?, layerId?, rect, format?, mode?,
  detail?, from?, to? })` — row-major RGBA, a character grid (`format:"grid"`),
  a diff between two endpoints (`mode:"diff"`), or colour stats
  (`mode:"stats"`).
- `validate({ documentId, checks?, strict?, expect? })` — pixel-art lint:
  palette/strays/outline/banding/antialiasing/layers/animation.
- `undo` / `redo({ documentId, expectedRevision })` — normal document history.
- `exportDocument({ documentId, format, frameIndex?, frameRange?, tag?,
  scale?, layout? })` — `png`/`aseprite`/`gif`/`spritesheet`/`tag` bytes.
- `palette({ documentId, op, ... })` — `get`/`set`/`ramp`/`analyze`/`extract`/
  `snap` (nearest-palette repaint, the palette-lock repair).
- `importImage({ documentId, expectedRevision, bytes, ... })` — decode PNG/GIF
  into a cel; `pixelate` runs a photo→pixel-art pass first.
- `manageDocument({ op, documentId, name?, force? })` — `save` / `close` /
  `duplicate`.
- `writePreview({ documentId, frameIndex?, rect?, filename? })` — render into
  the user's connected preview directory.

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
const preview = await api.render({ documentId: doc.id });
```

Compatible WebMCP browsers expose the same calls as `xprite_*` tools.

## Drawing well

`/agent/craft/README.md` indexes the pixel-art craft handbook — the
inspect→draw→look→fix loop, palette ramps, hue-shifted shading, silhouette
blocking, outlines, animation timing, review checklist — grouped into band
directories. Read `craft/00-core/00-core-principles.md` before any non-trivial
drawing task.
