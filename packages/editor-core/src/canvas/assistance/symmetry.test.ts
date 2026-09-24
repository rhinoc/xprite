import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("symmetry-handles [feature-7-12]", () => {
  it("symmetry-handles behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/canvas/assistance/symmetry.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { symmetryHandles } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    // StandbyState::Decorator::getSymmetryHandles subtracts integer partwidth/2
    // before int(PointF). A5GUI-pixel handle uses2, not2.5.
    let h = symmetryHandles(
      { enabled: true, mode: 1, x: 8, y: 8 },
      { x: 417, y: 160 },
      1,
      { x: 0, y: 0, width: 16, height: 16 },
      { width: 850, height: 336 },
    );
    assert.deepEqual(h, [
      { axis: "x", bounds: { x: 423, y: 155, width: 5, height: 5 } },
      { axis: "x", bounds: { x: 423, y: 176, width: 5, height: 5 } },
    ]);
    h = symmetryHandles(
      { enabled: true, mode: 2, x: 8, y: 8 },
      { x: 417, y: 160 },
      1,
      { x: 0, y: 0, width: 16, height: 16 },
      { width: 850, height: 336 },
    );
    assert.deepEqual(h, [
      { axis: "y", bounds: { x: 412, y: 166, width: 5, height: 5 } },
      { axis: "y", bounds: { x: 433, y: 166, width: 5, height: 5 } },
    ]);
    for (const mode of [1, 2, 3, 4, 8, 12, 15])
      for (const zoom of [1 / 3, 0.5, 1, 2, 8])
        for (const axis of [7.5, 8]) {
          const origin = { x: 21, y: 19 },
            out = symmetryHandles(
              { enabled: true, mode, x: axis, y: axis },
              origin,
              zoom,
              { x: -16, y: -12, width: 48, height: 36 },
              { width: 100, height: 80 },
            );
          for (const handle of out) {
            if (handle.axis === "x")
              assert.equal(handle.bounds.x, Math.trunc(origin.x + axis * zoom - 2));
            else assert.equal(handle.bounds.y, Math.trunc(origin.y + axis * zoom - 2));
            assert.equal(handle.bounds.width, 5);
            assert.equal(handle.bounds.height, 5);
          }
        }
    console.log(
      "Aseprite symmetry handle integer-centering regression passes: axis flags, half positions, fractional zoom and tiled canvas.",
    );
  }, 60_000);
});
