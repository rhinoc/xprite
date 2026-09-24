import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("tilemap-finish", () => {
  it("tilemap-finish behavior", async () => {
    async function load(entry) {
      const result = await build({
        entryPoints: [entry],
        bundle: true,
        format: "esm",
        platform: "neutral",
        write: false,
        logLevel: "silent",
      });
      return import(
        `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
      );
    }
    const { tileNumberLabels } = await load("packages/editor-core/src/tilemap/number-overlay.ts");
    const { resolveShortcut } = await load("packages/editor-core/src/editor/commands/shortcuts.ts");
    const { moveTilesetTiles, remapTilesetReferencesByContent } = await load(
      "packages/editor-core/src/tilemap/model.ts",
    );
    const map = { width: 3, height: 2, tiles: Uint32Array.from([0, 1, 0xe0000002, 3, 0, 4]) };
    assert.deepEqual(
      tileNumberLabels(map, 5, 8, -4, 8, 8, { x: 0, y: -8, width: 40, height: 20 }),
      [
        { x: 16, y: -4, number: "5", flags: "" },
        { x: 24, y: -4, number: "6", flags: "XYD" },
        { x: 8, y: 4, number: "7", flags: "" },
        { x: 24, y: 4, number: "8", flags: "" },
      ],
    );
    assert.deepEqual(tileNumberLabels(map, 5, 8, -4, 8, 8, { x: 24, y: -4, width: 8, height: 8 }), [
      { x: 24, y: -4, number: "6", flags: "XYD" },
    ]);
    for (const [key, type, mode] of [
      ["n", "new-tilemap-layer"],
      ["Tab", "toggle-tiles-mode"],
      ["1", "tileset-mode", "manual"],
      ["2", "tileset-mode", "auto"],
      ["3", "tileset-mode", "stack"],
    ]) {
      const action = resolveShortcut({ key, space: true });
      assert.equal(action?.type, type);
      if (mode) assert.equal(action.mode, mode);
    }
    for (const [key, transform] of [
      ["h", "flip-x"],
      ["x", "flip-x"],
      ["v", "flip-y"],
      ["y", "flip-y"],
      ["d", "flip-d"],
      ["r", "rotate-cw"],
    ])
      assert.equal(resolveShortcut({ key, space: true })?.transform, transform);
    assert.equal(resolveShortcut({ key: "Tab", space: true, editingText: true }), null);
    assert.equal(resolveShortcut({ key: "n", space: true, ctrl: true })?.type, "new");
    const set = {
      id: 0,
      flags: 6,
      name: "Set",
      tileWidth: 1,
      tileHeight: 1,
      tileCount: 4,
      baseIndex: 1,
      pixels: Uint8Array.from([0, 0, 0, 0, 10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255]),
    };
    const cel = {
      x: 0,
      y: 0,
      opacity: 255,
      zIndex: 0,
      tilemap: { width: 3, height: 1, tiles: Uint32Array.of(1, 2, 3) },
      pixels: { width: 3, height: 1, data: new Uint8ClampedArray(12) },
    };
    const timeline = {
      colorDepth: 32,
      tilesets: [set],
      activeFrame: 0,
      activeLayer: 0,
      layers: [
        {
          id: "map",
          kind: "tilemap",
          tilesetId: 0,
          name: "Map",
          visible: true,
          locked: false,
          opacity: 255,
          flags: 3,
        },
      ],
      frames: [{ duration: 100, cels: [cel] }],
    };
    const moved = moveTilesetTiles(timeline, 0, [1, 3], 3);
    assert.deepEqual(
      Array.from(moved.tilesets[0].pixels.filter((_, i) => i % 4 === 0)),
      [0, 20, 10, 30],
    );
    assert.deepEqual(
      [...moved.frames[0].cels[0].tilemap.tiles],
      [1, 2, 3],
      "Aseprite Color Bar move retains tile indices",
    );
    const restored = remapTilesetReferencesByContent(moved, 0, set);
    assert.deepEqual(
      [...restored.frames[0].cels[0].tilemap.tiles],
      [2, 1, 3],
      "Remap Tiles restores references by content",
    );
    const copied = moveTilesetTiles(timeline, 0, [1, 2], 2, true);
    assert.deepEqual(
      Array.from(copied.tilesets[0].pixels.filter((_, i) => i % 4 === 0)),
      [0, 10, 10, 20, 20, 30],
    );
    assert.deepEqual(
      [...copied.frames[0].cels[0].tilemap.tiles],
      [1, 2, 3],
      "Aseprite Color Bar copy retains tile indices",
    );
    console.log(
      "Tilemap finish verified: labels, Aseprite Space shortcuts, and Color Bar slot move/copy semantics.",
    );
  }, 60_000);
});
