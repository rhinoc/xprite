# Editor agent interface

The ready editor publishes `window.xpriteAgent`. `describe()` returns tool names,
descriptions and JSON Schemas. When the browser provides
`document.modelContext.registerTool`, the same operations are registered as
`xprite_getContext`, `xprite_render`, `xprite_readPixels`,
`xprite_createDocument`, `xprite_applyBatch`, `xprite_undo`, `xprite_redo` and
`xprite_exportDocument`. No additional server is required. A browser or agent
must be connected to this live editor tab; fetching the website URL cannot read
another browser's document memory.

The editor HTML advertises `/agent/editor.md` with a `rel="describedby"`
Markdown link in its head. The document is shipped as a static editor asset and
explains how to discover the current schemas through `describe()`. This adds no
visible control. The editor's outer accessible name recommends `window.xpriteAgent`
for browser drawing and editing, gives the `describe()` call and the documentation
URL in the current UI language. Semantic snapshots can surface these without
inspecting the head. Screen-reader users can hear this additional description.
Screenshots alone do not expose either metadata entry.

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
  operations: [{
    type: "fillRect",
    layerId: document.activeLayerId,
    frameIndex: document.activeFrameIndex,
    rect: { x: 0, y: 0, width: 4, height: 4 },
    color: "#FF004D"
  }]
});
if (!result.ok) throw new Error(result.error.message);
const preview = await api.render({ documentId: document.id });
// preview.data.dataUrl is an sRGB PNG.
const undone = await api.undo({
  documentId: document.id,
  expectedRevision: result.data.revision
});
```

Use a rectangle that fits the sprite. `createDocument({ width, height, name?,
background? })` creates an RGBA document and returns its context. Background is
`transparent` by default, or `white` / `black`. Existing documents remain open.
Do not retain document IDs across reloads or close/reopen cycles.

## Read and export

- `getContext({})` returns open documents and the active document, content
  revisions, layers, zero-based frame indices and durations, selection bounds,
  working palette, busy state, supported operations and limits. A document ID
  identifies shared content across linked views; `viewId` identifies its tab.
- `render({ documentId, frameIndex?, rect? })` returns a visible composite PNG
  data URL with the frame, rectangle and sampled revision. It ignores zoom and
  pan. The default is the active frame and full sprite.
- `readPixels({ documentId, frameIndex?, layerId?, rect })` returns row-major
  working-space RGBA bytes. Omit `layerId` for the visible composite. A missing
  image cel reads transparent. `selectionMask` is null without a selection,
  otherwise a row-major 0/1 mask for the returned region. Pixel writes honor
  this mask, which may be irregular.
- `exportDocument({ documentId, format, frameIndex? })` returns filename, MIME
  type, byte length and base64 bytes. `png` exports the specified or active
  frame in sRGB; `aseprite` exports the whole project with its color profile.
  Export does not download, mark saved or update export preferences. File data
  belongs to the returned revision even if the user edits during encoding.

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
- `setFrameDuration`: `frameIndex`, `duration` in milliseconds.

Colors are working-space `#RRGGBB`, `#RRGGBBAA`, or `[r, g, b, a]` bytes.
Drawing uses replacement ink, honors the current selection, and requires a
visible, editable RGBA image layer. Background layers require opaque colors.
Indexed/grayscale documents, reference layers, groups and tilemap layers are
not pixel-write targets. They remain available to context, composite rendering
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
Their headers and `src/doc/LICENSE.txt` identify MIT licensing. This interface
uses the repository's existing raster and history implementations; it does not
embed Aseprite Lua or copy the reference scripting implementation. Historical
`.docs/` notes were reviewed as context, not treated as current API contracts.
WebMCP registration follows the current imperative `document.modelContext`
interface; browsers without it still expose the page JS interface.
