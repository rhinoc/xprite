import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  initialNormalMapFrameScope,
  NORMAL_FRAME_TAG_PREFIX,
  NormalMapFrameScope,
  pickNormalMapPreviewFrame,
  resolveNormalMapFrames,
  runNormalMapBatch,
} from "$/managers/normal-maps/normal-map-batch";
import { NormalMapPreferences } from "$/managers/normal-maps/normal-map-preferences";
import { createJsonStorage } from "@xprite/bedrock/browser/json-storage";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  defaultLightMaskOptions,
  defaultNormalMapOptions,
} from "@xprite/editor-core/image-editing";

const pixel = (rgba: number[]): PixelBuffer => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(rgba),
});

function memoryStorage() {
  const values = new Map<string, string>();
  return createJsonStorage({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
}

describe("normal map batch frame resolution", () => {
  it("picks initial scope from frame count, timeline selection, and remembered preference", () => {
    assert.equal(
      initialNormalMapFrameScope(1, [], NormalMapFrameScope.All),
      NormalMapFrameScope.Current,
    );
    assert.equal(
      initialNormalMapFrameScope(6, [1, 2, 3], NormalMapFrameScope.Current),
      NormalMapFrameScope.Selected,
    );
    assert.equal(
      initialNormalMapFrameScope(6, [2], NormalMapFrameScope.All),
      NormalMapFrameScope.All,
    );
    assert.equal(
      initialNormalMapFrameScope(6, [], NormalMapFrameScope.Current),
      NormalMapFrameScope.Current,
    );
  });

  it("resolves all, selected, current, and tag frame ranges safely", () => {
    const tags = [{ name: "Walk", from: 1, to: 3 }];
    assert.deepEqual(resolveNormalMapFrames(NormalMapFrameScope.All, 4, 2, [], tags), [0, 1, 2, 3]);
    assert.deepEqual(
      resolveNormalMapFrames(NormalMapFrameScope.Selected, 4, 2, [3, 1, 1, 9], tags),
      [1, 3],
    );
    assert.deepEqual(resolveNormalMapFrames(NormalMapFrameScope.Current, 4, 2, [0, 1], tags), [2]);
    assert.deepEqual(
      resolveNormalMapFrames(`${NORMAL_FRAME_TAG_PREFIX}Walk`, 4, 0, [], tags),
      [1, 2, 3],
    );
    assert.deepEqual(
      resolveNormalMapFrames(`${NORMAL_FRAME_TAG_PREFIX}Missing`, 4, 2, [], tags),
      [2],
    );
  });

  it("keeps the preview frame inside the target range", () => {
    assert.equal(pickNormalMapPreviewFrame([1, 2, 3], 2, 0), 2);
    assert.equal(pickNormalMapPreviewFrame([1, 2, 3], 0, 3), 3);
    assert.equal(pickNormalMapPreviewFrame([1, 2, 3], 0, 0), 1);
  });
});

describe("normal map batch execution", () => {
  it("reuses cached preview, deduplicates identical frames, skips transparent frames, and reports progress", async () => {
    const a = pixel([200, 100, 50, 255]);
    const aCopy = pixel([200, 100, 50, 255]);
    const b = pixel([40, 80, 120, 255]);
    const empty = pixel([0, 0, 0, 0]);
    const cachedNormal = pixel([128, 128, 255, 255]);
    const computedNormal = pixel([200, 128, 255, 255]);
    const sources = [a, aCopy, empty, b, pixel([40, 80, 120, 255])];
    const processed: PixelBuffer[] = [];
    const progress: Array<[number, number]> = [];
    const controller = new AbortController();

    const results = await runNormalMapBatch({
      frames: [0, 1, 2, 3, 4],
      renderFrame: (frame) => ({ source: sources[frame], shading: null }),
      cachedPreview: { source: a, shading: null, output: cachedNormal },
      processFrame: async (source) => {
        processed.push(source);
        return computedNormal;
      },
      signal: controller.signal,
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    assert.equal(processed.length, 1);
    assert.equal(processed[0], b);
    assert.deepEqual(
      results.map((item) => item.pixels),
      [cachedNormal, cachedNormal, null, computedNormal, computedNormal],
    );
    assert.deepEqual(progress, [
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
  });

  it("aborts cleanly mid-batch without processing remaining frames", async () => {
    const controller = new AbortController();
    const calls: number[] = [];
    await assert.rejects(
      runNormalMapBatch({
        frames: [0, 1, 2],
        renderFrame: (frame) => ({ source: pixel([frame + 1, 0, 0, 255]), shading: null }),
        processFrame: async (source) => {
          calls.push(source.data[0]);
          if (calls.length === 1) controller.abort();
          return pixel([128, 128, 255, 255]);
        },
        signal: controller.signal,
      }),
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
    assert.deepEqual(calls, [1]);
  });
});

describe("normal map preferences", () => {
  it("remembers frame scope and light mask options across instances without overwriting on transient scopes", () => {
    const storage = memoryStorage();
    const prefs = new NormalMapPreferences(storage);
    assert.equal(prefs.frameScope, NormalMapFrameScope.All);

    prefs.accepted(defaultNormalMapOptions(), false, NormalMapFrameScope.Current);
    assert.equal(prefs.frameScope, NormalMapFrameScope.Current);

    // Transient scopes (selected frames / tag / single-frame undefined) preserve the remembered preference.
    prefs.acceptedMask(
      { ...defaultLightMaskOptions(), strength: 72 },
      NormalMapFrameScope.Selected,
    );
    prefs.acceptedMask(
      { ...defaultLightMaskOptions(), strength: 72 },
      `${NORMAL_FRAME_TAG_PREFIX}Walk`,
    );
    prefs.acceptedMask({ ...defaultLightMaskOptions(), strength: 72 });
    assert.equal(prefs.frameScope, NormalMapFrameScope.Current);
    assert.equal(prefs.maskOptions.strength, 72);

    const restored = new NormalMapPreferences(storage);
    assert.equal(restored.frameScope, NormalMapFrameScope.Current);
    assert.equal(restored.maskOptions.strength, 72);

    restored.reset();
    assert.equal(restored.frameScope, NormalMapFrameScope.All);
    assert.deepEqual(restored.maskOptions, defaultLightMaskOptions());
  });
});
