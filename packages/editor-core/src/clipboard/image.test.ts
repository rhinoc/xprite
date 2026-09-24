import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("clipboard [feature-1-6]", () => {
  it("clipboard behavior", async () => {
    async function moduleAt(path) {
      const { outputFiles } = await build({
        entryPoints: [path],
        bundle: true,
        platform: "node",
        format: "esm",
        write: false,
      });
      return import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    }
    const {
      copyDocumentSelection,
      cloneClipboardImage,
      clipboardPasteMask,
      clipboardPastePosition,
    } = await moduleAt("packages/editor-core/src/clipboard/image.ts");
    const { copyTimelineSelection, pasteTimelineClipboard } = await moduleAt(
      "packages/editor-core/src/clipboard/timeline.ts",
    );
    const { ImageClipboard, createClipboardActions } = await moduleAt(
      "apps/editor/src/managers/clipboard/index.ts",
    );
    const pixel = (color) => ({ width: 1, height: 1, data: new Uint8ClampedArray(color) });
    const red = pixel([255, 0, 0, 255]);
    const layer = (id, extra = {}) => ({
      id,
      name: id,
      flags: 3,
      opacity: 255,
      visible: true,
      locked: false,
      ...extra,
    });
    const cel = (pixels = red, x = 0, y = 0) => ({ pixels, x, y, opacity: 255, zIndex: 0 });
    const doc = {
      name: "source",
      width: 8,
      height: 8,
      layer: { ...layer("one"), pixels: red, x: 3, y: 2 },
      selection: { x: 2, y: 2, width: 3, height: 1, data: new Uint8Array([0, 255, 0]) },
      palette: [[1, 2, 3, 255]],
    };
    assert.equal(copyDocumentSelection({ ...doc, selection: null }), null);
    const copy = copyDocumentSelection(doc);
    assert.deepEqual([...copy.pixels.data], [0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0]);
    assert.notEqual(copy.pixels.data, red.data);
    assert.notEqual(copy.mask.data, doc.selection.data);
    assert.notEqual(copy.palette[0], doc.palette[0]);
    const owned = cloneClipboardImage(copy);
    owned.pixels.data[4] = 0;
    assert.equal(copy.pixels.data[4], 255);
    assert.deepEqual(clipboardPasteMask(copy, { x: 5, y: 6 }), {
      x: 5,
      y: 6,
      width: 3,
      height: 1,
      data: new Uint8Array([0, 255, 0]),
    });
    assert.deepEqual(
      clipboardPastePosition(copy, doc, { width: 8, height: 8 }, { zoom: 1, pan: { x: 0, y: 0 } }),
      { x: 2, y: 2 },
    );
    assert.deepEqual(
      clipboardPastePosition(
        { ...copy, mask: null },
        doc,
        { width: 8, height: 8 },
        { zoom: 1, pan: { x: 0, y: 0 } },
      ),
      { x: 3, y: 4 },
    );
    assert.throws(
      () => cloneClipboardImage({ ...copy, pixels: { ...copy.pixels, width: 50000 } }),
      /dimensions/,
    );
    const timeline = {
      layers: [layer("bottom"), layer("top")],
      frames: [
        { duration: 100, cels: [cel(), null] },
        { duration: 200, cels: [cel(), cel(pixel([0, 0, 255, 255]))] },
      ],
      activeFrame: 0,
      activeLayer: 1,
      range: { kind: "cels", frames: [0, 1], layers: [0, 1] },
    };
    const range = copyTimelineSelection(timeline);
    assert.equal(range.frames[0].cels[0].pixels, range.frames[1].cels[0].pixels);
    assert.notEqual(range.frames[0].cels[0].pixels, red);
    const pasted = pasteTimelineClipboard({ ...timeline, activeFrame: 1 }, range);
    assert.equal(pasted.frames.length, 3);
    assert.equal(pasted.frames[1].cels[1], null);
    assert.equal(pasted.frames[2].cels[1].pixels.data[2], 255);
    assert.equal(pasted.frames[1].cels[0].pixels, pasted.frames[2].cels[0].pixels);
    assert.notEqual(pasted.frames[1].cels[0].pixels, range.frames[0].cels[0].pixels);
    const locked = { ...timeline, layers: [layer("bottom"), layer("top", { locked: true })] };
    assert.equal(pasteTimelineClipboard(locked, range), locked);
    const frames = copyTimelineSelection(timeline, { kind: "frames", frames: [1], layers: [0] });
    const before = pasteTimelineClipboard(timeline, frames);
    assert.equal(before.frames.length, 3);
    assert.equal(before.frames[0].duration, 200);
    assert.equal(before.frames[1].duration, 100);
    const grouped = {
      ...timeline,
      layers: [layer("group", { kind: "group" }), layer("child", { parentId: "group" })],
    };
    const group = copyTimelineSelection(grouped, { kind: "layers", frames: [0], layers: [0] });
    assert.equal(group.layers.length, 2);
    const groupPaste = pasteTimelineClipboard(timeline, group);
    assert.equal(groupPaste.layers.length, 4);
    assert.equal(groupPaste.layers[3].parentId, groupPaste.layers[2].id);
    assert.equal(groupPaste.layers[2].parentId, null);
    const mergedDoc = {
      ...doc,
      selection: { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([255]) },
      layer: { ...doc.layer, x: 0, y: 0 },
      timeline,
    };
    assert.equal(copyDocumentSelection(mergedDoc, true).pixels.data[0], 255);
    const referenceDoc = {
      ...mergedDoc,
      timeline: {
        ...timeline,
        activeLayer: 0,
        layers: [layer("bottom"), layer("reference", { flags: 67 })],
        frames: [{ duration: 100, cels: [cel(), cel(pixel([0, 0, 255, 255]))] }],
      },
    };
    assert.deepEqual(
      [...copyDocumentSelection(referenceDoc, true).pixels.data],
      [255, 0, 0, 255],
      "Copy Merged excludes reference layer pixels",
    );

    // Permission denial retains exact local payload and guarantees copy completion.
    const local = new ImageClipboard({
      read: async () => {
        throw Error("denied");
      },
      write: async () => {
        throw Error("denied");
      },
    });
    assert.equal(await local.copy(copy), true);
    assert.deepEqual(await local.read(), copy);
    let active,
      cleared = 0,
      staged = 0,
      created = 0,
      resolveWrite;
    const state = {
      document: { ...doc, id: 1 },
      revision: 1,
      view: { zoom: 1, pan: { x: 0, y: 0 } },
    };
    const mock = {
      getSnapshot: () => state,
      clipboard: {
        copySelection: () => copy,
        copyTimelineSelection: () => null,
        pasteTimelineClipboard: () => false,
        beginImagePaste: () => {
          staged++;
          return true;
        },
      },
      clearSelectionPixels: () => cleared++,
    };
    active = mock;
    const delayed = new ImageClipboard({
      read: async () => null,
      write: () => new Promise((resolve) => (resolveWrite = resolve)),
    });
    const actions = createClipboardActions({
      getCore: () => active,
      createDocument: () => created++,
      clipboard: delayed,
    });
    const pending = actions.cut();
    state.revision++;
    resolveWrite();
    assert.equal(await pending, false);
    assert.equal(cleared, 0);
    await delayed.copyTimeline(range);
    active = {
      ...mock,
      clipboard: {
        ...mock.clipboard,
        pasteTimelineClipboard: (data) => data.kind === "cels",
      },
    };
    assert.equal(await actions.paste(), true);
    const localActions = createClipboardActions({
      getCore: () => mock,
      createDocument: () => created++,
      clipboard: local,
    });
    assert.equal(await localActions.paste(), true);
    assert.equal(staged, 1);
    assert.equal(await localActions.pasteNewSprite(), true);
    assert.equal(created, 1);
    // Decode adapter boundary: equivalent OS bitmap preserves owned selection metadata;
    // a different external bitmap supersedes both internal image and timeline payloads.
    const oldBitmap = globalThis.createImageBitmap,
      oldCanvas = globalThis.OffscreenCanvas;
    globalThis.createImageBitmap = async (blob) => ({
      ...JSON.parse(await blob.text()),
      close() {},
    });
    globalThis.OffscreenCanvas = class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        let bitmap;
        return {
          drawImage(value) {
            bitmap = value;
          },
          getImageData() {
            return { data: new Uint8ClampedArray(bitmap.data) };
          },
        };
      }
    };
    const blob = (pixels) =>
      new Blob([JSON.stringify({ ...pixels, data: [...pixels.data] })], { type: "image/png" });
    assert.deepEqual(await local.read(blob(copy.pixels)), copy);
    const outside = pixel([10, 20, 30, 255]);
    local.copyTimeline(range);
    assert.deepEqual((await local.read(blob(outside))).pixels, outside);
    assert.equal(local.getTimeline(), null);
    assert.equal(local.getImage().mask, null);
    const translucent = {
      pixels: pixel([127, 0, 0, 2]),
      mask: { x: 7, y: 9, width: 1, height: 1, data: new Uint8Array([255]) },
    };
    await local.copy(translucent);
    assert.deepEqual(
      await local.read(blob(pixel([128, 0, 0, 2]))),
      cloneClipboardImage(translucent),
    );
    let osBlob = null,
      clears = 0;
    const system = new ImageClipboard({
      read: async () => osBlob,
      write: async () => {},
      clear: async () => {
        osBlob = null;
        clears++;
      },
    });
    await system.copyTimeline(range);
    assert.equal(clears, 1);
    assert.equal(await system.read(), null);
    assert.equal(system.getTimeline().kind, "cels");
    osBlob = blob(outside);
    assert.deepEqual((await system.read()).pixels, outside);
    assert.equal(system.getTimeline(), null);
    // Browser-native keyboard paste already provides authorized event data. It must
    // not call navigator.clipboard.read, and one event can only stage one paste.
    let eventReads = 0,
      eventPastes = 0;
    const eventClipboard = new ImageClipboard({
      read: async () => {
        eventReads++;
        return blob(outside);
      },
      write: async () => {},
    });
    const eventCore = {
      ...mock,
      clipboard: {
        ...mock.clipboard,
        beginImagePaste: () => {
          eventPastes++;
          return true;
        },
      },
    };
    const eventActions = createClipboardActions({
      getCore: () => eventCore,
      createDocument: () => {},
      clipboard: eventClipboard,
    });
    const pasteEvent = (imageBlob) => ({
      target: null,
      defaultPrevented: false,
      clipboardData: {
        items: imageBlob ? [{ type: "image/png", getAsFile: () => imageBlob }] : [],
      },
      preventDefault() {
        this.defaultPrevented = true;
      },
    });
    const externalEvent = pasteEvent(blob(outside));
    assert.equal(await eventActions.handlePasteEvent(externalEvent), true);
    assert.equal(eventReads, 0);
    assert.equal(eventPastes, 1);
    assert.equal(externalEvent.defaultPrevented, true);
    assert.equal(await eventActions.handlePasteEvent(externalEvent), false);
    assert.equal(eventPastes, 1);
    assert.equal(await eventActions.handlePasteEvent(pasteEvent()), true);
    assert.equal(eventReads, 0);
    assert.equal(eventPastes, 2);
    await eventActions.paste();
    assert.equal(eventReads, 1, "menu paste explicitly reads OS clipboard");
    assert.equal(eventPastes, 3);
    const emptyEventClipboard = new ImageClipboard({
      read: async () => {
        throw Error("native event must never read OS");
      },
      write: async () => {},
    });
    const emptyEventActions = createClipboardActions({
      getCore: () => eventCore,
      createDocument: () => {},
      clipboard: emptyEventClipboard,
    });
    const emptyEvent = pasteEvent();
    assert.equal(await emptyEventActions.handlePasteEvent(emptyEvent), false);
    assert.equal(emptyEvent.defaultPrevented, false);
    await emptyEventClipboard.copyTimeline(range);
    let eventTimelinePastes = 0;
    // Preserve a stable core identity across the asynchronous helper.
    const stableTimelineCore = {
      ...eventCore,
      clipboard: {
        ...eventCore.clipboard,
        pasteTimelineClipboard: () => {
          eventTimelinePastes++;
          return true;
        },
      },
    };
    const stableTimelineActions = createClipboardActions({
      getCore: () => stableTimelineCore,
      createDocument: () => {},
      clipboard: emptyEventClipboard,
    });
    assert.equal(await stableTimelineActions.handlePasteEvent(pasteEvent()), true);
    assert.equal(eventTimelinePastes, 1);
    globalThis.createImageBitmap = oldBitmap;
    globalThis.OffscreenCanvas = oldCanvas;
    // Aseprite Timeline::onCanCut/onCut return false: a range copy is available,
    // but Ctrl+X with no pixel mask must not delete layers, cels, or frames.
    let rangeCleared = 0;
    const noMaskState = { ...state, document: { ...doc, selection: null, timeline } };
    const noMaskCore = {
      ...mock,
      getSnapshot: () => noMaskState,
      clipboard: {
        ...mock.clipboard,
        copySelection: () => null,
        copyTimelineSelection: () => range,
      },
      clearTimelineRange: () => rangeCleared++,
    };
    const rangeActions = createClipboardActions({
      getCore: () => noMaskCore,
      createDocument: () => {},
      clipboard: new ImageClipboard({ read: async () => null, write: async () => {} }),
    });
    assert.equal(rangeActions.getCapabilities().canCopy, true);
    assert.equal(rangeActions.getCapabilities().canCopyMerged, false);
    assert.equal(rangeActions.getCapabilities().canCut, false);
    assert.equal(await rangeActions.cut(), false);
    assert.equal(rangeCleared, 0);
    const focusClipboard = new ImageClipboard({ read: async () => null, write: async () => {} });
    const focusActions = createClipboardActions({
      getCore: () => ({
        ...mock,
        clipboard: { ...mock.clipboard, copyTimelineSelection: () => range },
      }),
      createDocument: () => {},
      clipboard: focusClipboard,
      preferTimeline: () => true,
    });
    let notices = 0;
    const stop = focusActions.subscribe(() => notices++);
    const version = focusActions.getVersion();
    assert.equal(await focusActions.copy(), true);
    assert.equal(focusClipboard.hasTimeline, true);
    assert.ok(focusActions.getVersion() > version);
    assert.equal(notices, 1);
    stop();
    const homeActions = createClipboardActions({
      getCore: () => mock,
      createDocument: () => {},
      clipboard: local,
      isDocumentActive: () => false,
    });

    const hiddenState = { ...state, document: { ...doc, layer: { ...doc.layer, visible: false } } };
    const hiddenActions = createClipboardActions({
      getCore: () => ({ ...mock, getSnapshot: () => hiddenState }),
      createDocument: () => {},
      clipboard: local,
    });
    assert.equal(hiddenActions.getCapabilities().canCopy, false);
    assert.equal(hiddenActions.getCapabilities().canCut, false);
    assert.equal(hiddenActions.getCapabilities().canPaste, false);
    assert.equal(hiddenActions.getCapabilities().canCopyMerged, true);
    assert.equal(homeActions.getCapabilities().canCopy, false);
    assert.equal(homeActions.getCapabilities().canCut, false);
    assert.equal(homeActions.getCapabilities().canPaste, false);
    assert.equal(homeActions.getCapabilities().canPasteNewSprite, true);
    const { RasterEditor } = await moduleAt("packages/editor-core/src/editor/RasterEditor.ts");
    const e = new RasterEditor(pixel([0, 0, 255, 255]));
    if (typeof e.clipboard.beginImagePaste === "function") {
      const initial = [...e.canvas.composite().data];
      assert.equal(e.clipboard.beginImagePaste({ pixels: red, mask: null }, { x: 0, y: 0 }), true);
      assert.equal(e.getSnapshot().dirty, false);
      assert.ok(e.getSnapshot().selectionTransform);
      e.clipboard.cancelFloatingPaste();
      assert.deepEqual([...e.canvas.composite().data], initial);
      assert.equal(e.getSnapshot().document.selection, null);
      e.clipboard.beginImagePaste({ pixels: red, mask: null }, { x: 0, y: 0 });
      e.clipboard.commitFloatingPaste();
      assert.deepEqual([...e.canvas.composite().data], [255, 0, 0, 255]);
      e.history.undo();
      assert.deepEqual([...e.canvas.composite().data], initial);
      e.history.redo();
      assert.deepEqual([...e.canvas.composite().data], [255, 0, 0, 255]);
      const timelineEditor = new RasterEditor(pixel([1, 2, 3, 255]));
      timelineEditor.timeline.addFrame(true);
      timelineEditor.timeline.setTimelineRange({ kind: "frames", frames: [0], layers: [0] });
      assert.equal(
        typeof timelineEditor.clipboard.copyTimelineSelection,
        "function",
        "timeline clipboard copy integrated",
      );
      assert.equal(
        typeof timelineEditor.clipboard.pasteTimelineClipboard,
        "function",
        "timeline clipboard paste integrated",
      );
      const copiedFrames = timelineEditor.clipboard.copyTimelineSelection();
      assert.equal(timelineEditor.clipboard.pasteTimelineClipboard(copiedFrames), true);
      assert.equal(timelineEditor.getSnapshot().document.timeline.frames.length, 3);
      timelineEditor.history.undo();
      assert.equal(timelineEditor.getSnapshot().document.timeline.frames.length, 2);
    } else throw Error("RasterEditor clipboard integration missing");
    console.log(
      "Clipboard checks pass: source masks/placement, independent buffers/palette, merged frame, timeline range insertion/groups/links, permission fallback, async cut guard, paste cancel/commit/undo/redo.",
    );
  }, 60_000);
});
