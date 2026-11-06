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
- `readPixels({ documentId, frameIndex?, layerId?, rect })` — get working-space
  RGBA bytes and the current selection mask for a region. Pass
  `format: "grid"` to get a character `legend` plus one `rows` string per
  sprite row instead of flat bytes; `.` is transparent. Omit `layerId` for the
  visible composite. `mode: "diff"` instead compares the same `rect` between
  two endpoints `from`/`to` (`{ documentId?, frameIndex?, layerId? }`,
  defaulting to the top-level values) and returns `changedPixels`,
  `changedBounds`, the resolved endpoints, and with `detail: true` a
  `{ legend, rows }` map where `.` is unchanged, `-` erased, and other
  characters the new colour.
- `undo({ documentId, expectedRevision })` and
  `redo({ documentId, expectedRevision })` — traverse normal document history.
- `exportDocument({ documentId, format, frameIndex? })` — return PNG or
  Aseprite file bytes as `base64`, with `filename`, `mimeType` and `byteLength`.
  Export does not download or mark the document saved. PNG is one frame;
  Aseprite includes the complete project.

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
