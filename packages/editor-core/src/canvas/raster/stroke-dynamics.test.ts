import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("ink-dynamics", () => {
  it("ink-dynamics behavior", async () => {
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
    const { RasterEditor } = await moduleAt("packages/editor-core/src/index.ts");
    const { inkBlend, normalBlend } = await moduleAt(
      "packages/editor-core/src/canvas/raster/index.ts",
    );
    const { StrokeDynamics, sensorThreshold } = await moduleAt(
      "packages/editor-core/src/canvas/raster/stroke-dynamics.ts",
    );
    const { defaultDynamicsSettings } = await moduleAt(
      "apps/editor/src/managers/preferences/dynamics-state.ts",
    );
    const b = [10, 20, 30, 80],
      c = [200, 100, 50, 128];
    assert.deepEqual(inkBlend(b, c, 90, undefined), normalBlend(b, c, 90));
    assert.deepEqual(inkBlend(b, c, 90, "simple"), normalBlend(b, c, 255));
    assert.deepEqual(inkBlend(b, c, 90, "alpha-compositing"), normalBlend(b, c, 90));
    assert.deepEqual(inkBlend(b, c, 0, "copy-color"), c);
    assert.deepEqual(inkBlend(b, [0, 0, 0, 0], 255, "simple"), [0, 0, 0, 0]);
    assert.deepEqual(inkBlend(b, c, 90, "lock-alpha"), [...normalBlend(b, c, 90).slice(0, 3), 80]);
    const brush = { shape: "line", size: 9, angle: 90 },
      settings = {
        ...defaultDynamicsSettings,
        size: "pressure",
        angle: "pressure",
        minSize: 1,
        minAngle: 0,
      };
    assert.deepEqual(
      new StrokeDynamics({ x: 0, y: 0, pointerType: "pen", pressure: 0.5 }, settings).brush(brush),
      { shape: "line", size: 5, angle: 45 },
    );
    assert.deepEqual(
      new StrokeDynamics({ x: 0, y: 0, pointerType: "mouse", pressure: 0.5 }, settings).brush(
        brush,
      ),
      brush,
    );
    assert.equal(sensorThreshold(0.5, 0.5, 0.5), 1);
    const velocity = new StrokeDynamics(
      { x: 0, y: 0, screen: { x: 0, y: 0 }, timeStamp: 0 },
      { ...settings, size: "velocity", angle: "static" },
    );
    velocity.update({ x: 1, y: 0, screen: { x: 32, y: 0 }, timeStamp: 50 });
    assert.equal(velocity.brush(brush).size, 1, "initial motion initializes velocity origin");
    velocity.update({ x: 2, y: 0, screen: { x: 64, y: 0 }, timeStamp: 100 });
    assert.deepEqual(velocity.brush(brush), brush);
    const stabilizer = new StrokeDynamics(
      { x: 0, y: 0 },
      { ...settings, stabilizer: true, stabilizerFactor: 4 },
    );
    assert.deepEqual(stabilizer.update({ x: 8, y: 0 }), { x: 2, y: 0 });
    assert.deepEqual(
      stabilizer.update({ x: 8, y: 0, shift: true }),
      { x: 3, y: 0 },
      "Shift introduced mid-stroke does not disable Aseprite stabilizer",
    );
    stabilizer.disableStabilizer();
    assert.deepEqual(stabilizer.update({ x: 8, y: 0 }), { x: 8, y: 0 });
    const image = () => ({ width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) });
    const e = new RasterEditor(image());
    e.drawing.settings.setSettings({
      brush: { shape: "square", size: 9, angle: 0 },
      foreground: [255, 0, 0, 255],
      background: [0, 0, 255, 255],
      dynamics: settings,
      ink: "simple",
    });
    e.pointerDown({ x: 16, y: 16, pointerType: "pen", pressure: 0, button: 2 });
    e.pointerUp();
    const at = (x, y) => {
      const l = e.getSnapshot().document.layer;
      return Array.from(
        l.pixels.data.slice(
          ((y - l.y) * l.pixels.width + x - l.x) * 4,
          ((y - l.y) * l.pixels.width + x - l.x) * 4 + 4,
        ),
      );
    };
    let data = e.getSnapshot().document.layer.pixels.data;
    assert.equal([...data].filter((v, i) => i % 4 === 3 && v).length, 1);
    assert.equal(at(16, 16)[2], 255);
    e.history.undo();
    assert.ok(e.getSnapshot().document.layer.pixels.data.every((v) => v === 0));
    e.history.redo();
    assert.equal(at(16, 16)[3], 255);
    e.pointerDown({ x: 8, y: 8, pointerType: "pen", pressure: 1 });
    e.cancelPointerGesture();
    assert.equal(
      [...e.getSnapshot().document.layer.pixels.data].filter((v, i) => i % 4 === 3 && v).length,
      1,
    );
    console.log(
      "Ink/dynamics checks pass: Aseprite modes, thresholds, pen-only pressure, screen velocity, stabilizer, right-button painting, undo/redo and cancellation.",
    );

    const layers = new RasterEditor(image());
    let revision = layers.getSnapshot().persistenceRevision;
    layers.timeline.setLayerProperties({ blendMode: 99 });
    assert.equal(layers.getSnapshot().persistenceRevision, revision);
    layers.timeline.setLayerProperties({ blendMode: 2 });
    assert.equal(layers.getSnapshot().document.timeline.layers[0].blendMode, 2);
    layers.history.undo();
    assert.equal(layers.getSnapshot().document.timeline.layers[0].blendMode ?? 0, 0);
    layers.history.redo();
    assert.equal(layers.getSnapshot().document.timeline.layers[0].blendMode, 2);
    layers.timeline.addLayer();
    layers.timeline.setLayerProperties({ blendMode: 3 }, 0);
    assert.equal(layers.getSnapshot().document.timeline.layers[0].blendMode, 3);
    assert.equal(layers.getSnapshot().document.timeline.activeLayer, 1);
    const { supportsPixelPerfect } = await moduleAt(
      "packages/editor-core/src/canvas/raster/pixel-perfect-stroke.ts",
    );
    assert.equal(
      supportsPixelPerfect({
        tool: "contour",
        brush: { shape: "square", size: 1, angle: 0 },
        dynamics: settings,
      }),
      true,
    );
    const stationary = new RasterEditor(image());
    stationary.drawing.settings.setSettings({
      brush: { shape: "square", size: 9, angle: 0 },
      foreground: [255, 0, 0, 255],
      dynamics: { ...settings, angle: "static" },
    });
    stationary.pointerDown({ x: 16, y: 16, pointerType: "pen", pressure: 0 });
    stationary.pointerMove({ x: 16, y: 16, pointerType: "pen", pressure: 1 });
    stationary.pointerUp({ x: 16, y: 16, pointerType: "pen", pressure: 0 });
    assert.equal(
      [...stationary.getSnapshot().document.layer.pixels.data].filter((v, i) => i % 4 === 3 && v)
        .length,
      81,
    );
    const release = new RasterEditor(image());
    release.drawing.settings.setSettings({
      brush: { shape: "square", size: 9, angle: 0 },
      foreground: [255, 0, 0, 255],
      dynamics: { ...settings, angle: "static" },
    });
    release.pointerDown({ x: 8, y: 16, pointerType: "pen", pressure: 1 });
    release.pointerUp({ x: 20, y: 16, pointerType: "pen", pressure: 0 });
    const l = release.getSnapshot().document.layer;
    assert.equal(
      l.pixels.data[((12 - l.y) * l.pixels.width + 20 - l.x) * 4 + 3],
      255,
      "release preserves last contact brush width",
    );
    console.log(
      "Review regressions pass: contour pixel-perfect, stationary pressure expansion, no zero-pressure release taper.",
    );
  }, 60_000);
});
