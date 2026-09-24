import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { getAutoCelGuides } from "$/canvas/guides";
import { documentAutoGuideGeometry } from "$/canvas/overlay-geometry";
import type { EditorDocument } from "$/document/types";

function document(): EditorDocument {
  const pixels = { width: 1, height: 1, data: Uint8ClampedArray.from([255, 0, 0, 255]) };
  return {
    name: "guides",
    width: 20,
    height: 20,
    selection: null,
    layer: { name: "Active", x: 2, y: 3, visible: true, locked: false, pixels },
    timeline: {
      activeLayer: 0,
      activeFrame: 0,
      layers: [
        { id: "active", name: "Active", visible: true, locked: false, opacity: 255, flags: 3 },
        { id: "other", name: "Other", visible: true, locked: false, opacity: 255, flags: 3 },
      ],
      frames: [
        {
          duration: 100,
          cels: [
            { x: 2, y: 3, pixels, opacity: 255, zIndex: 0 },
            { x: 12, y: 9, pixels, opacity: 255, zIndex: 0 },
          ],
        },
      ],
    },
  };
}

const input = {
  enabled: true,
  tool: "move" as const,
  modifierActive: true,
  pointer: { x: 12, y: 9 },
};

describe("multi-layer auto guides", () => {
  it("measures against the visible hovered cel without changing layer selection", () => {
    const doc = document();
    const timeline = doc.timeline;
    const result = getAutoCelGuides(doc, input);
    assert.deepEqual(result.comparisonBounds, { x: 12, y: 9, width: 1, height: 1 });
    assert.deepEqual(
      result.measurements.map((guide) => guide.distance),
      [9, 5],
    );
    assert.equal(doc.timeline, timeline);
    assert.equal(doc.timeline!.activeLayer, 0);
  });

  it("falls back to canvas margins for hidden and transparent cels", () => {
    const doc = document();
    doc.timeline = {
      ...doc.timeline!,
      layers: doc.timeline!.layers.map((layer, i) => ({ ...layer, visible: i === 0 })),
    };
    const hidden = getAutoCelGuides(doc, input);
    assert.equal(hidden.comparisonBounds, undefined);
    assert.equal(hidden.measurements.length, 4);
    doc.timeline = {
      ...doc.timeline,
      layers: doc.timeline.layers.map((layer) => ({ ...layer, visible: true, opacity: 0 })),
    };
    assert.deepEqual(getAutoCelGuides(doc, input).comparisonBounds, {
      x: 12,
      y: 9,
      width: 1,
      height: 1,
    });
    const fresh = document();
    fresh.timeline = {
      ...fresh.timeline!,
      frames: [
        {
          ...fresh.timeline!.frames[0],
          cels: fresh.timeline!.frames[0].cels.map((cel) => cel && { ...cel, opacity: 0 }),
        },
      ],
    };
    assert.deepEqual(getAutoCelGuides(fresh, input).comparisonBounds, {
      x: 12,
      y: 9,
      width: 1,
      height: 1,
    });
  });

  it("shows only the active outline over its own pixels and suppresses empty cels", () => {
    const doc = document();
    assert.deepEqual(getAutoCelGuides(doc, { ...input, pointer: { x: 2, y: 3 } }), {
      showBounds: true,
      measurements: [],
    });
    doc.layer.emptyCel = true;
    assert.deepEqual(getAutoCelGuides(doc, input), { showBounds: false, measurements: [] });
  });

  it("projects dotted extensions onto the hovered cel's right edge", () => {
    const doc = document();
    doc.layer.x = 16;
    doc.timeline = {
      ...doc.timeline!,
      frames: [
        {
          ...doc.timeline!.frames[0],
          cels: [{ ...doc.timeline!.frames[0].cels[0]!, x: 16 }, doc.timeline!.frames[0].cels[1]],
        },
      ],
    };
    const guide = getAutoCelGuides(doc, input).measurements.find(
      (value) => value.axis === "horizontal",
    )!;
    assert.ok(guide.extension);
    const projected = documentAutoGuideGeometry(guide, { x: 0, y: 0 }, 2, doc);
    assert.equal(projected.extension!.x, (12 + 1) * 2 - 1);
  });
});
