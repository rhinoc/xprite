import assert from "node:assert/strict";

import { build } from "esbuild";
import { beforeAll, describe, it } from "vitest";

import type { SelectionTransform } from "$/selection/types";

describe("selection handle crossing", () => {
  let api: typeof import("$/selection/transform") &
    typeof import("$/import-export/aseprite/profile-clipboard") &
    Pick<typeof import("$/selection/types"), "SelectionRotationAlgorithm">;
  beforeAll(async () => {
    const output = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/selection/transform.ts"; export * from "./packages/editor-core/src/import-export/aseprite/profile-clipboard.ts"; export { SelectionRotationAlgorithm } from "./packages/editor-core/src/selection/types.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    api = await import(
      `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`
    );
  });

  const fixture = (): SelectionTransform => ({
    source: {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255]),
    },
    mask: { x: 0, y: 0, width: 2, height: 2, data: new Uint8Array([255, 0, 255, 255]) },
    bounds: { x: 0, y: 0, width: 2, height: 2 },
    angle: 0,
    copy: false,
  });
  const channels = (transform: SelectionTransform) => {
    const { pixels } = api.rasterizeSelectionTransform(transform);
    return Array.from(
      { length: pixels.width * pixels.height },
      (_, index) => pixels.data[index * 4],
    );
  };
  const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8);

  it("reverses pixels and sparse masks while retaining the opposite edge", () => {
    const initial = fixture();
    const before = structuredClone(initial);
    const flipped = api.dragSelectionTransform(initial, "e", { x: 2, y: 1 }, { x: -2, y: 1 });
    assert.deepEqual(flipped.bounds, { x: 0, y: 0, width: -2, height: 2 });
    assert.deepEqual(channels(flipped), [0, 1, 4, 3]);
    assert.deepEqual([...api.rasterizeSelectionTransform(flipped).mask.data], [0, 255, 255, 255]);
    assert.deepEqual(initial, before);
    const repeated = api.dragSelectionTransform(flipped, "e", { x: -2, y: 1 }, { x: 2, y: 1 });
    assert.deepEqual(repeated.bounds, initial.bounds);
    assert.deepEqual(channels(repeated), [1, 0, 3, 4]);
  });

  it("allows corner handles to reverse either or both axes", () => {
    const initial = fixture();
    const horizontal = api.dragSelectionTransform(initial, "se", { x: 2, y: 2 }, { x: -2, y: 2 });
    const vertical = api.dragSelectionTransform(initial, "se", { x: 2, y: 2 }, { x: 2, y: -2 });
    const both = api.dragSelectionTransform(initial, "se", { x: 2, y: 2 }, { x: -2, y: -2 });
    assert.deepEqual(channels(horizontal), [0, 1, 4, 3]);
    assert.deepEqual(channels(vertical), [3, 4, 1, 0]);
    assert.deepEqual(channels(both), [4, 3, 0, 1]);
  });

  it("preserves aspect ratio on the negative drag ray", () => {
    const initial = fixture();
    const flipped = api.dragSelectionTransform(
      initial,
      "se",
      { x: 2, y: 2 },
      { x: -4, y: -2 },
      true,
    );
    assert.deepEqual(flipped.bounds, { x: 0, y: 0, width: -3, height: -3 });
  });

  it("scales from a custom pivot through that pivot without moving it", () => {
    const initial = { ...fixture(), pivotPosition: { x: 0.25, y: 0.75 } };
    const pivot = api.selectionTransformPivotPoint(initial);
    const flipped = api.dragSelectionTransform(
      initial,
      "e",
      { x: 2, y: 1 },
      { x: -1, y: 1 },
      false,
      true,
    );
    assert.deepEqual(flipped.bounds, { x: 1, y: 0, width: -2, height: 2 });
    assert.deepEqual(api.selectionTransformPivotPoint(flipped), pivot);
    assert.deepEqual(flipped.pivotPosition, initial.pivotPosition);
  });

  it("reverses a rotated selection around its fixed opposite edge", () => {
    const initial = { ...fixture(), angle: Math.PI / 2 };
    const flipped = api.dragSelectionTransform(initial, "e", { x: 1, y: 2 }, { x: 1, y: -2 });
    close(flipped.bounds.width, -2);
    close(flipped.bounds.height, 2);
    const corners = api.transformCorners(flipped.bounds, flipped.angle);
    close(corners[0].x, 2);
    close(corners[0].y, 0);
    close(corners[1].x, 2);
    close(corners[1].y, -2);
    assert.deepEqual(channels(flipped), [4, 0, 3, 1]);
  });

  it("crosses zero without a minimum-size stop and can resize again after dropping there", () => {
    const initial = fixture();
    const collapsed = api.dragSelectionTransform(initial, "e", { x: 2, y: 1 }, { x: 0, y: 1 });
    assert.equal(collapsed.bounds.width, 0);
    assert.ok(api.rasterizeSelectionTransform(collapsed).mask.data.every((value) => value === 0));
    assert.ok(Object.values(collapsed.pivotPosition!).every(Number.isFinite));
    const restored = api.dragSelectionTransform(collapsed, "e", { x: 0, y: 1 }, { x: -2, y: 1 });
    assert.equal(restored.bounds.width, -2);
    assert.deepEqual(channels(restored), [0, 1, 4, 3]);
  });

  it("retains fractional signed dimensions only in fine control mode", () => {
    const initial = fixture();
    const ordinary = api.dragSelectionTransform(initial, "e", { x: 2, y: 1 }, { x: -0.25, y: 1 });
    const fine = api.dragSelectionTransform(
      initial,
      "e",
      { x: 2, y: 1 },
      { x: -0.25, y: 1 },
      false,
      false,
      false,
      true,
    );
    assert.equal(ordinary.bounds.width, 0);
    assert.equal(fine.bounds.width, -0.25);
  });

  it("reverses indexed and grayscale samples exactly and returns transparent samples at zero", () => {
    const initial = fixture();
    const flipped = { ...initial, bounds: { x: 2, y: 2, width: -2, height: -2 } };
    const indexed = { depth: 8 as const, width: 2, height: 2, data: new Uint8Array([2, 2, 7, 9]) };
    const grayscale = {
      depth: 16 as const,
      width: 2,
      height: 2,
      data: new Uint8Array([1, 255, 2, 255, 3, 128, 4, 255]),
    };
    assert.deepEqual(
      [...api.transformClipboardAsepriteSamples(indexed, flipped)!.data],
      [9, 7, 0, 2],
    );
    assert.deepEqual(
      [...api.transformClipboardAsepriteSamples(grayscale, flipped)!.data],
      [4, 255, 3, 128, 0, 0, 1, 255],
    );
    const collapsed = { ...initial, bounds: { ...initial.bounds, width: 0 } };
    assert.ok(
      api
        .transformClipboardAsepriteSamples(indexed, collapsed, 5)!
        .data.every((value) => value === 5),
    );
  });

  it("keeps cardinal flips exact when RotSprite is selected", () => {
    const initial = fixture();
    const flipped = {
      ...initial,
      bounds: { x: 2, y: 2, width: -2, height: -2 },
      rotationAlgorithm: api.SelectionRotationAlgorithm.RotSprite,
    };
    assert.equal(api.canKeepSelectionAsepriteSamples(flipped), true);
    assert.deepEqual(channels(flipped), [4, 3, 0, 1]);
  });
});
