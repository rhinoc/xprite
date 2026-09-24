import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

async function loadEditController() {
  const { outputFiles } = await build({
    entryPoints: [
      "packages/editor-core/src/selection/edit-controller.ts",
      "packages/editor-core/src/image-editing/transform.ts",
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: "unused",
    write: false,
  });
  const modules = await Promise.all(
    outputFiles.map(
      (file) =>
        import(`data:text/javascript;base64,${Buffer.from(file.contents).toString("base64")}`),
    ),
  );
  return Object.assign({}, ...modules);
}

function createPort(document, projection) {
  const labels = [];
  const transaction = {
    expandCel() {},
    captureHistory() {},
    activeLayerClearColor() {
      return [0, 0, 0, 0];
    },
  };
  return {
    labels,
    readProjection: () => projection,
    resolvePendingCel: () => true,
    mutateDocument(label, mutate) {
      labels.push(label);
      mutate(document, transaction);
    },
    setStatus() {},
    setAllocationError() {},
    publish() {},
    setTool() {},
    beginSelectionTransform: () => false,
    readTransformSession: () => ({ transform: null, floating: null, mask: null }),
    transformFloatingAsepriteSamples() {},
    updateTransformSession() {},
    finishSelectionBoundsNudge: () => false,
    flipTilemapSelection() {},
    deleteSelectedSlices() {},
  };
}

function projection(selection, timelinePresent = false) {
  return {
    selection,
    editable: true,
    emptyCel: false,
    timelinePresent,
    activeLayer: {
      visible: true,
      editable: true,
      reference: false,
      group: false,
      tilemap: false,
      celExists: true,
    },
    tilemapMode: "pixels",
    selectedTile: 0,
    tool: "pencil",
    pointer: null,
    foreground: [0, 0, 255, 255],
    background: [255, 255, 255, 255],
    palette: undefined,
  };
}

describe("selection-edit-controller", () => {
  it("checks selection edit capabilities from a narrow projection", async () => {
    const { SelectionEditController } = await loadEditController();
    const selected = { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([255]) };
    const state = projection(selected, true);
    const port = createPort({} as never, state);
    const controller = new SelectionEditController(port as never);
    assert.equal(controller.canRotateSelection(), true);
    assert.equal(controller.canShiftSelectionContents(), true);
    state.activeLayer.tilemap = true;
    assert.equal(controller.canShiftSelectionContents(), false);
    state.tilemapMode = "tiles";
    assert.equal(controller.canRotateSelection(), false);
  });

  it("fills and flips selected RGBA pixels through document transactions", async () => {
    const { FlipOrientation, SelectionEditController } = await loadEditController();
    const selection = { x: 0, y: 0, width: 2, height: 1, data: new Uint8Array([255, 255]) };
    const document = {
      width: 2,
      height: 1,
      name: "fixture",
      layer: {
        name: "Layer 1",
        pixels: {
          width: 2,
          height: 1,
          data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
        },
        x: 0,
        y: 0,
        visible: true,
        locked: false,
      },
      selection,
    };
    const state = projection(selection);
    const port = createPort(document, state);
    const controller = new SelectionEditController(port as never);
    assert.equal(controller.fillSelection(), true);
    assert.deepEqual(Array.from(document.layer.pixels.data), [0, 0, 255, 255, 0, 0, 255, 255]);
    controller.flipSelection(FlipOrientation.Horizontal);
    assert.deepEqual(Array.from(document.layer.pixels.data), [0, 0, 255, 255, 0, 0, 255, 255]);
    assert.deepEqual(port.labels, ["Fill Selection", "Flip Selection"]);
  });

  it("wraps indexed cel samples with the selected pixels", async () => {
    const { SelectionEditController } = await loadEditController();
    const palette = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ];
    const pixels = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]),
    };
    const asepriteSamples = { depth: 8, width: 3, height: 1, data: new Uint8Array([1, 2, 3]) };
    const selection = { x: 0, y: 0, width: 2, height: 1, data: new Uint8Array([255, 255]) };
    const document = {
      width: 3,
      height: 1,
      name: "indexed fixture",
      palette,
      layer: { name: "Layer 1", pixels, x: 0, y: 0, visible: true, locked: false },
      selection,
      timeline: {
        composeGroups: false,
        activeLayer: 0,
        activeFrame: 0,
        colorDepth: 8,
        transparentIndex: 0,
        layers: [{ id: "layer-1", name: "Layer 1", visible: true, locked: false, flags: 3 }],
        frames: [
          {
            duration: 100,
            palette,
            cels: [{ pixels, asepriteSamples, x: 0, y: 0, opacity: 255, zIndex: 0 }],
          },
        ],
      },
    };
    const state = projection(selection, true);
    state.palette = palette;
    const port = createPort(document, state);
    const controller = new SelectionEditController(port as never);
    assert.equal(controller.shiftSelectionContents(1, 0), true);
    const cel = document.timeline.frames[0].cels[0];
    assert.deepEqual(Array.from(cel.asepriteSamples.data), [2, 1, 3]);
    assert.deepEqual(Array.from(cel.pixels.data), [0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
    assert.deepEqual(port.labels, ["Shift Selection Content"]);
  });

  it("keeps the explicitly chosen indexed color when filling a selection", async () => {
    const { SelectionEditController } = await loadEditController();
    const palette = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
    ];
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const asepriteSamples = { depth: 8, width: 1, height: 1, data: new Uint8Array([1]) };
    const selection = { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([255]) };
    const document = {
      width: 1,
      height: 1,
      name: "indexed fill fixture",
      palette,
      layer: { name: "Layer 1", pixels, x: 0, y: 0, visible: true, locked: false },
      selection,
      timeline: {
        composeGroups: false,
        activeLayer: 0,
        activeFrame: 0,
        colorDepth: 8,
        transparentIndex: 0,
        layers: [{ id: "layer-1", name: "Layer 1", visible: true, locked: false, flags: 3 }],
        frames: [
          {
            duration: 100,
            palette,
            cels: [{ pixels, asepriteSamples, x: 0, y: 0, opacity: 255, zIndex: 0 }],
          },
        ],
      },
    };
    const state = projection(selection, true);
    state.palette = palette;
    state.foregroundIndex = 2;
    const port = createPort(document, state);
    const controller = new SelectionEditController(port as never);
    assert.equal(controller.fillSelection(), true);
    assert.equal(document.timeline.frames[0].cels[0].asepriteSamples.data[0], 2);
  });
});
