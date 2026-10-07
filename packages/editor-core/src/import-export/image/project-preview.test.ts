import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { EditorProject } from "$/document/project";
import { projectPngImage } from "$/import-export/image/project-preview";
import { LAYER_REFERENCE } from "$/timeline/timeline";

function project(): EditorProject {
  const pixels = (red: number) => ({
    width: 1,
    height: 1,
    data: Uint8ClampedArray.of(red, 7, 9, 255),
  });
  const cel = (red: number) => ({ pixels: pixels(red), x: 0, y: 0, opacity: 255, zIndex: 0 });
  return {
    image: pixels(250),
    timeline: {
      activeFrame: 0,
      activeLayer: 0,
      layers: [
        { id: "ink", name: "Ink", visible: true, locked: false, opacity: 255, flags: 0 },
        {
          id: "reference",
          name: "Reference",
          visible: true,
          locked: false,
          opacity: 255,
          flags: LAYER_REFERENCE,
        },
      ],
      frames: [
        { duration: 100, cels: [cel(5), cel(250)] },
        { duration: 200, cels: [cel(31), cel(250)] },
      ],
    },
  };
}

describe("deferred project PNG preview", () => {
  it("renders the saved frame without reference pixels and keeps owned sources unchanged", () => {
    const saved = project();
    const png = projectPngImage(saved);
    assert.deepEqual([...png.data], [5, 7, 9, 255]);
    png.data.fill(0);
    assert.equal(saved.timeline.frames[0].cels[0]!.pixels.data[0], 5);
    assert.equal(saved.image.data[0], 250);
    const selected = { ...saved, timeline: { ...saved.timeline, activeFrame: 1 } };
    assert.deepEqual([...projectPngImage(selected).data], [31, 7, 9, 255]);
  });

  it("uses an isolated staged projection without recomposing its stale timeline", () => {
    const saved = project();
    const pngImage = { width: 1, height: 1, data: Uint8ClampedArray.of(77, 13, 21, 255) };
    assert.equal(projectPngImage({ ...saved, pngImage }), pngImage);
    assert.equal(saved.timeline.frames[0].cels[0]!.pixels.data[0], 5);
  });
});
