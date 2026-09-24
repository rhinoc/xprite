import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("responsive-overlays", () => {
  it("responsive-overlays behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/ui/src/components/canvas-surface/geometry.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { sceneViewport, UI_SCALE_X, UI_SCALE_Y } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    // A scene's layout dimensions can change independently of its CSS transform.
    globalThis.HTMLElement = class {
      constructor(width, height, scale) {
        Object.assign(this, { width, height, scale });
      }
      getBoundingClientRect() {
        return { width: this.width * this.scale, height: this.height * this.scale };
      }
    };
    globalThis.getComputedStyle = (element) => ({
      width: `${element.width}px`,
      height: `${element.height}px`,
      boxSizing: "border-box",
      transform:
        element.scale === 1 ? "none" : `matrix(${element.scale}, 0, 0, ${element.scale}, 0, 0)`,
    });
    for (const [width, height] of [
      [320, 360],
      [390, 844],
      [844, 390],
      [1024, 768],
      [1405, 768],
      [1920, 1080],
    ]) {
      for (const scale of [1, 0.5, 1.25]) {
        const viewport = sceneViewport(new HTMLElement(width, height, scale));
        assert.ok(
          Math.abs(viewport.width / viewport.sceneWidth - UI_SCALE_X * scale) < 1e-12,
          "Control width must retain scene scale",
        );
        assert.ok(
          Math.abs(viewport.height / viewport.sceneHeight - UI_SCALE_Y * scale) < 1e-12,
          "Control height must retain scene scale",
        );
        assert.equal(viewport.sceneWidth, Math.floor(width / UI_SCALE_X));
        assert.equal(viewport.sceneHeight, Math.floor(height / UI_SCALE_Y));
        assert.ok(
          viewport.width <= width * scale + 1e-9 && viewport.height <= height * scale + 1e-9,
          "Workarea stays inside scene",
        );
      }
    }
    // A plain measured box has no presentation transform and must not infer fit-to-width.
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
      [960, 525],
    ]) {
      const viewport = sceneViewport({ width, height });
      assert.equal(viewport.sceneWidth, width / UI_SCALE_X);
      assert.equal(viewport.sceneHeight, height / UI_SCALE_Y);
    }
    console.log("Responsive overlay workarea: six scene sizes × three presentation scales passed.");
  }, 60_000);
});
