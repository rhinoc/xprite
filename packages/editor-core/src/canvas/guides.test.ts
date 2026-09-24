import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-guides", () => {
  it("editor-guides behavior", async () => {
    const bundle = await build({
      entryPoints: [new URL("./guides.ts", import.meta.url).pathname],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { celCanvasMeasurements, getAutoCelGuides } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    let checks = 0;
    const check = (name, run) => {
      run();
      checks++;
      console.log(`PASS ${name}`);
    };
    const canvas = { x: 0, y: 0, width: 20, height: 20 };
    check("equal cel/canvas bounds have no redundant margins", () =>
      assert.deepEqual(celCanvasMeasurements(canvas, canvas), []),
    );
    check("inset margins measure image pixels", () =>
      assert.deepEqual(
        celCanvasMeasurements({ x: 2, y: 3, width: 10, height: 12 }, canvas).map((v) => v.distance),
        [2, 8, 3, 5],
      ),
    );
    check("separated cel measures nearest gaps with dotted extensions", () => {
      const guides = celCanvasMeasurements({ x: 25, y: 24, width: 2, height: 2 }, canvas);
      assert.deepEqual(
        guides.map((v) => v.distance),
        [5, 4],
      );
      assert.deepEqual(
        guides.map((v) => v.extension),
        [
          { from: { x: 20, y: 20 }, to: { x: 20, y: 26 } },
          { from: { x: 20, y: 20 }, to: { x: 27, y: 20 } },
        ],
      );
    });
    const document = {
      width: 20,
      height: 20,
      layer: {
        x: 2,
        y: 3,
        visible: true,
        pixels: { width: 1, height: 1, data: Uint8ClampedArray.from([255, 0, 0, 255]) },
      },
    };
    const input = { enabled: true, tool: "move", modifierActive: true, pointer: { x: 2, y: 3 } };
    check("opaque self hover shows bounds without self measurement", () =>
      assert.deepEqual(getAutoCelGuides(document, input), { showBounds: true, measurements: [] }),
    );
    check("transparent canvas hover measures against canvas", () =>
      assert.equal(
        getAutoCelGuides(document, { ...input, pointer: { x: 0, y: 0 } }).measurements.length,
        4,
      ),
    );
    check("guide modifier is required", () =>
      assert.equal(
        getAutoCelGuides(document, { ...input, modifierActive: false }).showBounds,
        false,
      ),
    );
    check("Move tool is required", () =>
      assert.equal(getAutoCelGuides(document, { ...input, tool: "pencil" }).showBounds, false),
    );
    check("drawing state suppresses guides", () =>
      assert.equal(
        getAutoCelGuides(document, { ...input, allowLayerEdges: false }).showBounds,
        false,
      ),
    );
    check("disabled guides and absent pointer produce no guides", () => {
      assert.deepEqual(getAutoCelGuides(document, { ...input, enabled: false }), {
        showBounds: false,
        measurements: [],
      });
      assert.deepEqual(getAutoCelGuides(document, { ...input, pointer: null }), {
        showBounds: false,
        measurements: [],
      });
    });
    // editor.cpp uses `scrCelBounds.x + scrCelBounds.w / 2` (C++ integer division).
    check("odd centers truncate projected pixels, not sprite coordinates", () => {
      const cel = { x: 2, y: 3, width: 3, height: 5 };
      for (const scale of [0.5, 1, 1.5, 2, 3, 8]) {
        const guides = celCanvasMeasurements(cel, canvas, scale);
        assert.equal(guides[0].position, 3 + Math.trunc(Math.trunc(5 * scale) / 2) / scale);
        assert.equal(guides[2].position, 2 + Math.trunc(Math.trunc(3 * scale) / 2) / scale);
      }
      assert.equal(celCanvasMeasurements(cel, canvas, 2)[0].position, 5.5);
      assert.equal(celCanvasMeasurements(cel, canvas, 1)[0].position, 5);
    });
    check("negative origins preserve truncation of width before origin addition", () => {
      const guides = celCanvasMeasurements({ x: -5, y: -7, width: 3, height: 3 }, canvas);
      assert.equal(guides[0].position, -6);
      assert.equal(guides[1].position, -4);
    });
    console.log(
      `${checks} guide behavior and projection checks pass. GUI screenshot parity is a separate gate.`,
    );
  }, 60_000);
});
