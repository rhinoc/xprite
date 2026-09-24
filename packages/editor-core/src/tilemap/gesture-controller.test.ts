import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { PixelMask } from "$/base/primitives";
import type { ClipboardImage } from "$/clipboard/types";
import { layerAtPoint } from "$/document/document";
import { EyedropperSample } from "$/drawing/types";
import type { AsepriteTileset } from "$/import-export/aseprite/model";
import {
  TilemapGestureController,
  type TilemapGesturePort,
  type TilemapSelectionSource,
} from "$/tilemap/gesture-controller";
import { LAYER_REFERENCE } from "$/timeline";
import type { SpriteTimeline } from "$/timeline/types";

function createTimeline(): SpriteTimeline {
  const tileset: AsepriteTileset = {
    id: 7,
    name: "Tiles",
    flags: 0,
    baseIndex: 0,
    tileWidth: 2,
    tileHeight: 2,
    tileCount: 2,
    pixels: new Uint8Array(2 * 2 * 2 * 4),
  };
  const pixels = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
  return {
    activeFrame: 0,
    activeLayer: 0,
    layers: [
      {
        id: "tilemap-1",
        name: "Tilemap",
        kind: "tilemap",
        tilesetId: tileset.id,
        visible: true,
        locked: false,
        opacity: 255,
        flags: 3,
      },
    ],
    frames: [
      {
        duration: 100,
        cels: [
          {
            pixels,
            tilemap: { width: 2, height: 2, tiles: new Uint32Array(4) },
            x: 0,
            y: 0,
            opacity: 255,
            zIndex: 0,
          },
        ],
      },
    ],
    tilesets: [tileset],
  };
}

function createController(tool: string = "pencil") {
  let timeline = createTimeline();
  let selection: PixelMask | null = null;
  let selectionSource: TilemapSelectionSource | null = null;
  const settings = {
    tool,
    selectedTile: 1,
    backgroundTile: 0,
    pixelPerfect: false,
    symmetryEnabled: false,
    brush: { shape: "circle" as const, size: 1, angle: 0 },
    brushAngleStatic: true,
    discardBrushOnEyedropper: true,
    eyedropperSample: EyedropperSample.CurrentLayer,
  };
  const history = { begins: 0, commits: 0, cancels: 0 };
  const selected = { foreground: 0, background: 0 };
  const brushDiscard = { count: 0 };
  const publications: boolean[] = [];
  const pasteCalls: { image: ClipboardImage; origin: { x: number; y: number } }[] = [];
  const statuses: string[] = [];
  const port: TilemapGesturePort = {
    getTimeline: () => timeline,
    getLayerAtPoint: (point) =>
      layerAtPoint(
        {
          format: "aseprite",
          name: "Tiles",
          width: 4,
          height: 4,
          layer: {
            name: "Layer",
            pixels: timeline.frames[0].cels[timeline.activeLayer]!.pixels,
            x: 0,
            y: 0,
            visible: true,
            locked: false,
          },
          selection: null,
          timeline,
        },
        point.x,
        point.y,
      ),
    getSelectionSource: () => selectionSource,
    getBrushContext: () => ({ width: 4, height: 4, selection }),
    getSettings: () => settings,
    getSymmetry: () => ({ mode: 0, x: 2, y: 2 }),
    isEditable: () => true,
    supportsPixelPerfect: () => false,
    beginTransaction: () => {
      const before = timeline;
      const beforeSelection = selection;
      history.begins++;
      return {
        setTimeline: (next) => {
          timeline = next;
        },
        setSelection: (next) => {
          selection = next;
        },
        pasteTilemap: (image, origin) => pasteCalls.push({ image, origin }),
        commit: () => {
          history.commits++;
        },
        cancel: () => {
          timeline = before;
          selection = beforeSelection;
          history.cancels++;
        },
      };
    },
    discardImageBrush: () => {
      brushDiscard.count++;
    },
    setSelectedTile: (tile) => {
      selected.foreground = tile;
      settings.selectedTile = tile;
    },
    setBackgroundTile: (tile) => {
      selected.background = tile;
      settings.backgroundTile = tile;
    },
    setPointer: () => {},
    setStatus: (message) => statuses.push(message),
    publish: (pixelsChanged) => publications.push(pixelsChanged),
  };
  return {
    controller: new TilemapGestureController(port),
    history,
    publications,
    selected,
    settings,
    brushDiscard,
    pasteCalls,
    statuses,
    setSelectionSource(value: TilemapSelectionSource) {
      selectionSource = value;
      selection = value.selection;
    },
    replaceTimeline() {
      timeline = createTimeline();
    },
    get selection() {
      return selection;
    },
    get timeline() {
      return timeline;
    },
  };
}

describe("tilemap-gesture-controller", () => {
  it("samples held foreground/background tiles with their packed orientation and no edits", () => {
    for (const button of [0, 2]) {
      const test = createController("eyedropper");
      const timeline = test.timeline;
      const tiles = timeline.frames[0].cels[0]!.tilemap!.tiles;
      tiles[0] = 0x80000001;
      tiles[1] = 0x40000001;
      const target = button === 2 ? "background" : "foreground";
      test.controller.beginGesture({ x: 0, y: 0, button });
      assert.equal(test.selected[target], 0x80000001);
      assert.equal(test.controller.isGestureActive(), true);
      assert.equal(test.controller.hasPendingDocumentEdit(), false);
      test.controller.updateGesture({ x: 2, y: 0, button: -1 });
      assert.equal(test.selected[target], 0x40000001);
      test.controller.endGesture({ x: 0, y: 0, button });
      test.controller.updateGesture({ x: 0, y: 0 });
      assert.equal(test.selected[target], 0x40000001);
      assert.equal(test.timeline, timeline);
      assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
      assert.equal(test.brushDiscard.count, 2);
      assert(test.publications.every((pixelsChanged) => !pixelsChanged));
    }
  });

  it("ends held tile sampling on cancellation, reset, and timeline replacement", () => {
    for (const finish of ["cancel", "reset", "replace"] as const) {
      const test = createController("eyedropper");
      test.timeline.frames[0].cels[0]!.tilemap!.tiles[0] = 1;
      test.controller.beginGesture({ x: 0, y: 0 });
      if (finish === "cancel") test.controller.cancelGesture();
      else if (finish === "reset") test.controller.reset();
      else test.replaceTimeline();
      test.controller.updateGesture({ x: 2, y: 0 });
      assert.equal(test.selected.foreground, 1);
      assert.equal(test.controller.isGestureActive(), false);
      assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
    }
  });

  it("supports direct Option tile picking and respects semantic shortcut overrides", () => {
    const picking = createController();
    picking.timeline.frames[0].cels[0]!.tilemap!.tiles[0] = 1;
    picking.controller.beginGesture({ x: 0, y: 0, alt: true });
    picking.controller.updateGesture({ x: 2, y: 0, alt: true });
    assert.equal(picking.selected.foreground, 0);
    assert.equal(picking.history.begins, 0);
    picking.controller.cancelGesture();
    const drawing = createController();
    drawing.controller.beginGesture({ x: 0, y: 0, alt: true, actionModifiers: {} });
    drawing.controller.endGesture();
    assert.equal(drawing.timeline.frames[0].cels[0]!.tilemap!.tiles[0], 1);
    assert.equal(drawing.history.commits, 1);
  });

  it("samples overlapping visible tile layers and skips hidden or transparent pixels", () => {
    const test = createController("eyedropper");
    const timeline = test.timeline;
    const bottom = timeline.frames[0].cels[0]!;
    bottom.tilemap!.tiles.fill(0x80000001);
    bottom.pixels.data.fill(255);
    const topPixels = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
    topPixels.data.fill(255);
    timeline.layers.push({ ...timeline.layers[0], id: "top", name: "Top" });
    timeline.frames[0].cels.push({
      ...bottom,
      pixels: topPixels,
      tilemap: { width: 2, height: 2, tiles: new Uint32Array(4).fill(0x40000001) },
    });
    test.settings.eyedropperSample = EyedropperSample.AllLayers;
    test.controller.beginGesture({ x: 0, y: 0 });
    assert.equal(test.selected.foreground, 0x40000001);
    timeline.layers[1].visible = false;
    test.controller.updateGesture({ x: 1, y: 0 });
    assert.equal(test.selected.foreground, 0x80000001);
    timeline.layers[1].visible = true;
    topPixels.data[3] = 0;
    test.controller.updateGesture({ x: 0, y: 0 });
    assert.equal(test.selected.foreground, 0x80000001);
    assert.equal(test.timeline, timeline);
    assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
  });

  it("samples raw nontransparent tile pixels despite zero layer, cel, and ancestor opacity", () => {
    const test = createController("eyedropper");
    const timeline = test.timeline;
    const tileLayer = timeline.layers[0];
    const tileCel = timeline.frames[0].cels[0]!;
    tileLayer.opacity = 0;
    tileCel.opacity = 0;
    tileCel.tilemap!.tiles.fill(0x80000001);
    tileCel.pixels.data.fill(255);
    tileLayer.parentId = "group";
    timeline.layers.unshift({
      id: "group",
      name: "Group",
      kind: "group",
      visible: true,
      locked: false,
      flags: 3,
      opacity: 0,
    });
    timeline.frames[0].cels.unshift(null);
    timeline.activeLayer = 1;
    timeline.composeGroups = true;
    test.settings.eyedropperSample = EyedropperSample.AllLayers;
    test.controller.beginGesture({ x: 0, y: 0 });
    assert.equal(test.selected.foreground, 0x80000001);
    assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
  });

  it("returns no tile for a covering raster layer and reads hidden active tiles in Current Layer", () => {
    const test = createController("eyedropper");
    const timeline = test.timeline;
    const bottom = timeline.frames[0].cels[0]!;
    bottom.tilemap!.tiles.fill(0x80000001);
    bottom.pixels.data.fill(255);
    timeline.layers.push({
      ...timeline.layers[0],
      id: "raster",
      name: "Raster",
      kind: "image",
      tilesetId: undefined,
    });
    timeline.frames[0].cels.push({
      ...bottom,
      pixels: { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4).fill(255) },
      tilemap: undefined,
    });
    test.settings.eyedropperSample = EyedropperSample.AllLayers;
    test.controller.beginGesture({ x: 0, y: 0 });
    assert.equal(test.selected.foreground, 0);
    test.settings.eyedropperSample = EyedropperSample.CurrentLayer;
    timeline.layers[0].visible = false;
    test.controller.updateGesture({ x: 1, y: 0 });
    assert.equal(test.selected.foreground, 0x80000001);
    bottom.pixels.data.fill(0);
    test.controller.updateGesture({ x: 0, y: 0 });
    assert.equal(
      test.selected.foreground,
      0x80000001,
      "Current Layer retains tiles with transparent image pixels",
    );
    assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
  });

  it("returns no tile for Reference Layer and falls back to composition when references are hidden", () => {
    const test = createController("eyedropper");
    const timeline = test.timeline;
    const bottom = timeline.frames[0].cels[0]!;
    bottom.tilemap!.tiles.fill(0x80000001);
    bottom.pixels.data.fill(255);
    timeline.layers.push({
      ...timeline.layers[0],
      id: "reference",
      name: "Reference",
      kind: "image",
      tilesetId: undefined,
      flags: 3 | LAYER_REFERENCE,
    });
    timeline.frames[0].cels.push({
      ...bottom,
      pixels: { width: 1, height: 1, data: Uint8ClampedArray.of(255, 0, 0, 255) },
      x: 3,
      y: 3,
      tilemap: undefined,
    });
    test.settings.eyedropperSample = EyedropperSample.ReferenceLayer;
    test.controller.beginGesture({ x: 0, y: 0 });
    assert.equal(
      test.selected.foreground,
      0,
      "a visible reference anywhere suppresses the tile result",
    );
    timeline.layers[1].visible = false;
    test.controller.updateGesture({ x: 1, y: 0 });
    assert.equal(test.selected.foreground, 0x80000001);
    assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
  });

  it("paints a tile gesture and commits it once", () => {
    const test = createController();
    assert.equal(test.controller.beginGesture({ x: 0, y: 0, button: 0 }), true);
    assert.equal(test.timeline.frames[0].cels[0]?.tilemap?.tiles[0], 1);
    test.controller.updateGesture({ x: 2, y: 0, button: 0 });
    test.controller.endGesture();

    assert.equal(test.timeline.frames[0].cels[0]?.tilemap?.tiles[1], 1);
    assert.deepEqual(test.history, { begins: 1, commits: 1, cancels: 0 });
    assert.equal(test.controller.isGestureActive(), false);
    assert.equal(test.controller.getSnapshot().preview, null);
  });

  it("cancels a tile gesture and restores its starting timeline", () => {
    const test = createController();
    const before = test.timeline;
    test.controller.beginGesture({ x: 0, y: 0, button: 0 });
    assert.equal(test.timeline.frames[0].cels[0]?.tilemap?.tiles[0], 1);
    test.controller.cancelGesture();

    assert.equal(test.timeline, before);
    assert.deepEqual(test.history, { begins: 1, commits: 0, cancels: 1 });
    assert.equal(test.controller.getSnapshot().preview, null);
  });

  it("uses the background tile for right-button tile sampling", () => {
    const test = createController("eyedropper");
    const timeline = test.timeline;
    timeline.frames[0].cels[0]!.tilemap!.tiles[0] = 1;
    assert.equal(test.controller.beginGesture({ x: 0, y: 0, button: 2 }), true);
    assert.equal(test.selected.background, 1);
    assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
  });

  it("leaves selection tools for the editor's other gesture controller", () => {
    const test = createController("marquee");
    assert.equal(test.controller.beginGesture({ x: 0, y: 0, button: 0 }), false);
    assert.deepEqual(test.history, { begins: 0, commits: 0, cancels: 0 });
  });

  it("transforms tilemap selections through the tilemap transaction port", () => {
    const test = createController();
    const selection = {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      data: new Uint8Array(16).fill(255),
    };
    const image: ClipboardImage = {
      pixels: { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) },
      mask: selection,
      tilemap: {
        map: { width: 2, height: 2, tiles: Uint32Array.from([1, 0, 0, 0]) },
        selected: Uint8Array.from([255, 0, 0, 0]),
        tileset: test.timeline.tilesets![0],
      },
    };
    test.setSelectionSource({ timeline: test.timeline, image, selection });

    assert.equal(test.controller.beginSelectionTransform("move", { x: 0, y: 0 }), true);
    test.controller.updateSelectionTransform({ x: 2, y: 0 });
    test.controller.endSelectionTransform();

    assert.equal(test.pasteCalls.length, 1, test.statuses.join("; "));
    assert.deepEqual(test.pasteCalls[0].origin, { x: 2, y: 0 });
    assert.deepEqual(test.history, { begins: 1, commits: 1, cancels: 0 });
    assert.equal(test.controller.getSnapshot().preview, null);
  });

  it("rolls back a tilemap selection transform on cancellation", () => {
    const test = createController();
    const timeline = test.timeline;
    const selection = {
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      data: new Uint8Array(16).fill(255),
    };
    const image: ClipboardImage = {
      pixels: { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) },
      mask: selection,
      tilemap: {
        map: { width: 2, height: 2, tiles: Uint32Array.from([1, 0, 0, 0]) },
        selected: Uint8Array.from([255, 0, 0, 0]),
        tileset: timeline.tilesets![0],
      },
    };
    test.setSelectionSource({ timeline, image, selection });

    test.controller.beginSelectionTransform("move", { x: 0, y: 0 }, true);
    test.controller.updateSelectionTransform({ x: 2, y: 0 });
    test.controller.cancelSelectionTransform();

    assert.equal(test.timeline, timeline);
    assert.equal(test.selection, selection);
    assert.deepEqual(test.history, { begins: 1, commits: 0, cancels: 1 });
  });
});
