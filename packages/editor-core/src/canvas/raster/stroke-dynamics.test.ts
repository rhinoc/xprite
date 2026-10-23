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
    const { StrokeDynamics, usesDynamicBrush } = await moduleAt(
      "packages/editor-core/src/canvas/raster/stroke-dynamics.ts",
    );
    const mypaint = await moduleAt("packages/editor-core/src/canvas/raster/mypaint.ts");
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

    const close = (actual, expected, message) =>
      assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
    const curve = {
      input: 0,
      points: [
        [0, 2],
        [1, 10],
      ],
    };
    close(mypaint.mypaintMappingCalculate(1, [curve], [0.25]), 5, "base plus linear curve");
    close(mypaint.mypaintMappingCalculate(0, [curve], [2]), 18, "two-point curves extrapolate");
    const steps = {
      input: 1,
      points: [
        [0, 0],
        [1, 4],
        [2, 4],
        [3, 0],
      ],
    };
    close(mypaint.mypaintMappingCalculate(0, [steps], [0, 1.5]), 4, "flat segment");
    close(mypaint.mypaintMappingCalculate(0, [steps], [0, 2.5]), 2, "later segment");
    close(
      mypaint.mypaintMappingCalculate(0, [curve, steps], [0.5, 0.5]),
      8,
      "curves of several inputs are summed",
    );
    const speed = mypaint.mypaintSpeedMapping();
    close(mypaint.mypaintSpeedInput(speed, 45), 0.5, "speed fix point");
    const slope = (mypaint.mypaintSpeedInput(speed, 45 + 1e-6) - 0.5) / 1e-6;
    assert.ok(Math.abs(slope - 0.015) < 1e-6, `speed fix slope: ${slope}`);
    assert.equal(mypaint.mypaintExpDecay(0.001, 1), 0, "tiny time constants decay at once");
    close(mypaint.mypaintExpDecay(2, 2), Math.exp(-1), "exp decay");
    close(mypaint.mypaintSlowTracking(0, 10, 1, 0.01), 10 * (1 - Math.exp(-1)), "slow tracking");
    close(mypaint.mypaintPressureInput(0.25, Math.log(2)), 0.5, "pressure gain");

    assert.equal(usesDynamicBrush(defaultDynamicsSettings), false);
    assert.equal(defaultDynamicsSettings.slowTracking, 0, "libmypaint leaves tracking off");
    const brush = { shape: "line", size: 9, angle: 90 },
      settings = {
        ...defaultDynamicsSettings,
        sizeInput: "pressure",
        angleInput: "pressure",
        sizeLow: 1,
        angleLow: 0,
      };
    assert.equal(usesDynamicBrush(settings), true);
    assert.deepEqual(
      new StrokeDynamics({ x: 0, y: 0, pointerType: "pen", pressure: 0.5 }, settings).brush(brush),
      { shape: "line", size: 5, angle: 45 },
    );
    assert.deepEqual(
      new StrokeDynamics(
        { x: 0, y: 0, pointerType: "pen", pressure: 0.25 },
        { ...settings, pressureGain: Math.log(2) },
      ).brush(brush),
      { shape: "line", size: 5, angle: 45 },
      "pressure gain scales tablet pressure",
    );
    assert.deepEqual(
      new StrokeDynamics(
        { x: 0, y: 0, pointerType: "pen", pressure: 1 },
        { ...settings, pressureGain: Math.log(4) },
      ).brush(brush),
      brush,
      "amplified pressure stops at the brush value",
    );
    assert.deepEqual(
      new StrokeDynamics(
        { x: 0, y: 0, pointerType: "mouse", pressure: 0.5 },
        { ...settings, pressureGain: -1 },
      ).brush(brush),
      brush,
      "devices without pressure keep the brush value",
    );
    const gradient = new StrokeDynamics(
      { x: 0, y: 0, pointerType: "pen", pressure: 0.25 },
      { ...defaultDynamicsSettings, colorInput: "pressure" },
    );
    close(gradient.gradient(), 0.25, "gradient follows pressure");
    assert.equal(new StrokeDynamics({ x: 0, y: 0 }, defaultDynamicsSettings).gradient(), 0);

    const bySpeed = { ...settings, sizeInput: "speed", angleInput: "none" };
    const slow = new StrokeDynamics({ x: 0, y: 0, screen: { x: 0, y: 0 }, timeStamp: 0 }, bySpeed);
    slow.update({ x: 0, y: 0, screen: { x: 0, y: 0 }, timeStamp: 16 });
    assert.equal(slow.brush(brush).size, 1, "a resting pointer reports low speed");
    const fast = new StrokeDynamics({ x: 0, y: 0, screen: { x: 0, y: 0 }, timeStamp: 0 }, bySpeed);
    for (let i = 1; i <= 20; i++)
      fast.update({ x: i, y: 0, screen: { x: i * 40, y: 0 }, timeStamp: i * 16 });
    assert.equal(fast.brush(brush).size, 9, "2500 px/s exceeds the speed input range");
    const medium = new StrokeDynamics(
      { x: 0, y: 0, screen: { x: 0, y: 0 }, timeStamp: 0 },
      bySpeed,
    );
    for (let i = 1; i <= 20; i++)
      medium.update({ x: i, y: 0, screen: { x: i * 2, y: 0 }, timeStamp: i * 16 });
    const mediumSize = medium.brush(brush).size;
    assert.ok(mediumSize > 1 && mediumSize < 9, `125 px/s maps inside the range: ${mediumSize}`);

    const tracking = { ...settings, slowTracking: 1 };
    const tracked = new StrokeDynamics({ x: 0, y: 0, timeStamp: 0 }, tracking);
    assert.deepEqual(tracked.update({ x: 10, y: 0, timeStamp: 10 }), { x: 6, y: 0 });
    assert.deepEqual(
      tracked.update({ x: 10, y: 0, timeStamp: 20, shift: true }),
      { x: 9, y: 0 },
      "Shift introduced mid-stroke keeps tracking",
    );
    tracked.disableTracking();
    assert.deepEqual(tracked.update({ x: 4, y: 0, timeStamp: 30 }), { x: 4, y: 0 });
    assert.deepEqual(
      new StrokeDynamics({ x: 0, y: 0, timeStamp: 0, shift: true }, tracking).update({
        x: 10,
        y: 0,
        timeStamp: 10,
      }),
      { x: 10, y: 0 },
      "Shift at stroke start disables tracking",
    );

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
      "Ink/dynamics checks pass: ink modes, libmypaint mapping, speed input, pressure gain, slow tracking, right-button painting, undo/redo and cancellation.",
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
      dynamics: { ...settings, angleInput: "none" },
      // Regular freehand; pixel-perfect would drop the stationary repeat.
      pixelPerfect: false,
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
      dynamics: { ...settings, angleInput: "none" },
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
