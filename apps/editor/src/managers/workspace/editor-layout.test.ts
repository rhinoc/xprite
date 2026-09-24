import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("responsive-layout", () => {
  it("responsive-layout behavior", async () => {
    const bundle = await build({
      entryPoints: ["apps/editor/src/managers/workspace/editor-layout.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const {
      editorSceneLayout,
      editorCanvasBounds,
      measuredEditorViewport,
      setMeasuredEditorViewport,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    const canonical = editorCanvasBounds({ width: 865.5, height: 346.5 });
    assert.deepEqual(canonical, { x: 6, y: 6, width: 842, height: 323 });
    assert.deepEqual(editorSceneLayout(), { width: 0, height: 0, sceneWidth: 0, sceneHeight: 0 });
    assert.deepEqual(editorSceneLayout(960, 525), {
      width: 960,
      height: 525,
      sceneWidth: 960,
      sceneHeight: 525,
    });
    for (const [width, height] of [
      [320, 420],
      [375, 640],
      [960, 525],
      [1405, 768],
      [1920, 1080],
    ]) {
      const pane = { width: Math.max(0, width - 94.5), height: Math.max(0, height - 178.5) };
      const bounds = editorCanvasBounds(pane);
      assert.ok(bounds.width > 0 && bounds.height > 0);
      const hidden = editorCanvasBounds({ ...pane, height: pane.height + 117 });
      assert.ok(
        Math.abs(hidden.height - bounds.height - 117) <= 1,
        "Hidden timeline increases canvas once, not twice",
      );
      assert.equal(hidden.width, bounds.width);
      const bigger = editorCanvasBounds({ ...pane, width: pane.width + 100 });
      assert.ok(
        Math.abs(bigger.width - bounds.width - 100) <= 1,
        "Width increases scene canvas extent while controls retain their scale",
      );
      assert.equal(bigger.height, bounds.height);
    }
    const firstEditor = {},
      secondEditor = {};
    setMeasuredEditorViewport(firstEditor, { width: 712, height: 448 });
    assert.deepEqual(measuredEditorViewport(firstEditor, true), { width: 356, height: 224 });
    assert.deepEqual(
      measuredEditorViewport(secondEditor, true),
      { width: 0, height: 0 },
      "Independent editors do not share viewport state",
    );
    console.log(
      "Responsive dock geometry passes: canonical dimensions, narrow/short/wide clients, independent axes, one timeline extension.",
    );
  }, 60_000);
});
