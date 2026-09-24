import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  TimelineCelMovement,
  canMoveTimelineLayer,
  isLayerInCelMovementRange,
} from "$/timeline/operations/cel-movement";
import { LAYER_BACKGROUND, LAYER_REFERENCE, LAYER_LOCK_MOVE } from "$/timeline/timeline";
import type { SpriteTimeline, TimelineCel, TimelineLayer } from "$/timeline/types";

function layer(id: string, patch: Partial<TimelineLayer> = {}): TimelineLayer {
  return {
    id,
    name: id,
    kind: "image",
    visible: true,
    locked: false,
    flags: 3,
    opacity: 255,
    ...patch,
  };
}

function cel(x = 0): TimelineCel {
  return {
    x,
    y: 1,
    pixels: { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) },
    opacity: 255,
    zIndex: 0,
  };
}

function fixture(): SpriteTimeline {
  const linked = cel(2);
  return {
    activeLayer: 0,
    activeFrame: 0,
    layers: [
      layer("group", { kind: "group" }),
      layer("a", { parentId: "group" }),
      layer("hidden", { parentId: "group", visible: false }),
      layer("locked", { parentId: "group", locked: true }),
      layer("background", { flags: 3 | LAYER_BACKGROUND }),
      layer("fixed", { flags: 3 | LAYER_LOCK_MOVE }),
    ],
    frames: [
      { duration: 100, cels: [null, linked, cel(4), cel(6), cel(8), cel(10)] },
      { duration: 100, cels: [null, cel(3), null, null, null, null] },
      { duration: 100, cels: [null, { ...linked }, null, null, null, null] },
    ],
    range: { kind: "cels", frames: [0, 1], layers: [0] },
  };
}

describe("Move-tool cel collection", () => {
  it("moves group descendants and linked aliases once, including aliases outside the range", () => {
    const original = fixture();
    assert(canMoveTimelineLayer(original, 0));
    assert(isLayerInCelMovementRange(original, 2));
    const movement = TimelineCelMovement.create(original)!;
    const moved = movement.render({ x: 3, y: -2 });
    assert.equal(moved.frames[0].cels[1]!.x, 5);
    assert.equal(moved.frames[1].cels[1]!.x, 6);
    assert.equal(moved.frames[2].cels[1]!.x, 5);
    assert.equal(moved.frames[0].cels[2]!.x, 7);
    assert.equal(moved.frames[0].cels[3], original.frames[0].cels[3]);
    assert.equal(moved.frames[0].cels[4], original.frames[0].cels[4]);
    assert.equal(moved.frames[0].cels[5], original.frames[0].cels[5]);
    assert.equal(original.frames[0].cels[1]!.x, 2);
    assert.equal(moved.frames[0].cels[1]!.pixels, moved.frames[2].cels[1]!.pixels);
    assert.equal(movement.render({ x: 0, y: 0 }), original);
    assert.equal(movement.render({ x: 0.25, y: -0.25 }), original);
  });

  it("ignores ranges when the timeline is hidden but expands the active group", () => {
    const original = fixture();
    const moved = TimelineCelMovement.create(original, false)!.render({ x: 1, y: 0 });
    assert.equal(moved.frames[0].cels[1]!.x, 3);
    assert.equal(moved.frames[1].cels[1], original.frames[1].cels[1]);
    assert.equal(moved.frames[2].cels[1]!.x, 3);
    assert(!isLayerInCelMovementRange(original, 1, false));
  });

  it("expands frame and layer ranges with different scopes and rejects locked ancestors", () => {
    const original = fixture();
    original.activeLayer = 1;
    original.range = { kind: "layers", frames: [0], layers: [1] };
    assert.equal(
      TimelineCelMovement.create(original)!.render({ x: 2, y: 0 }).frames[1].cels[1]!.x,
      5,
    );
    original.range = { kind: "frames", frames: [0], layers: [1] };
    const moved = TimelineCelMovement.create(original)!.render({ x: 2, y: 0 });
    assert.equal(moved.frames[0].cels[2]!.x, 6);
    assert.equal(moved.frames[0].cels[4], original.frames[0].cels[4]);
    assert.equal(moved.frames[0].cels[5], original.frames[0].cels[5]);
    original.layers = original.layers.map((item, index) =>
      index === 0 ? { ...item, locked: true } : item,
    );
    assert.equal(TimelineCelMovement.create(original), null);
  });

  it("keeps reference subpixels, rounds image deltas, and moves a visible mask at commit", () => {
    const original = fixture();
    original.layers = [...original.layers, layer("reference", { flags: 3 | LAYER_REFERENCE })];
    original.frames = original.frames.map((frame, index) => ({
      ...frame,
      cels: [
        ...frame.cels,
        index === 0
          ? { ...cel(), preciseBounds: { x: 0.2, y: 0.3, width: 2.5, height: 3.5 } }
          : null,
      ],
    }));
    original.range = { kind: "frames", frames: [0], layers: [0] };
    const movement = TimelineCelMovement.create(original)!;
    const moved = movement.render({ x: 1.25, y: -1.75 });
    assert.equal(moved.frames[0].cels[1]!.x, 3);
    assert.equal(moved.frames[0].cels[6]!.x, 1.25);
    assert.equal(moved.frames[0].cels[6]!.preciseBounds!.x, 1.45);
    assert.equal(moved.frames[0].cels[6]!.preciseBounds!.width, 2.5);
    const mask = { x: 2, y: 3, width: 1, height: 1, data: new Uint8Array([1]) };
    assert.deepEqual(movement.moveSelection(mask), { ...mask, x: 3, y: 1 });
    assert.equal(movement.moveSelection(null), null);
  });
});
