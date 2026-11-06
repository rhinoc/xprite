import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  createNormalMapGenerator,
  generateNormalMap,
  NormalMapPreset,
} from "$/image-editing/normal-map";
import {
  defaultNormalMapLightOptions,
  renderNormalMapLighting,
} from "$/image-editing/normal-map-lighting";

const image = (width: number, data: number[]): PixelBuffer => ({
  width,
  height: data.length / 4 / width,
  data: new Uint8ClampedArray(data),
});

describe("pixel-art normal generation", () => {
  it("keeps a source snapshot while cached intensity changes remain reversible", () => {
    const source = image(
      3,
      Array.from({ length: 9 }, (_, i) => [i * 25, i * 15, i * 10, 255]).flat(),
    );
    const generator = createNormalMapGenerator(source);
    const options = { preset: NormalMapPreset.Architecture, mergeOutlines: false, smoothing: 0 };
    const original = generator.generate(options);
    source.data.fill(0);
    const flat = generator.generate({ ...options, normalStrength: 0 });
    for (let i = 0; i < flat.data.length; i += 4)
      assert.deepEqual([...flat.data.subarray(i, i + 4)], [128, 128, 255, 255]);
    assert.notDeepEqual(original.data, flat.data);
    assert.deepEqual(generator.generate(options).data, original.data);
    generator.generate({ ...options, preset: NormalMapPreset.Character });
    assert.deepEqual(generator.generate(options).data, original.data);
  });

  it("keeps source/alpha intact and makes zero strength a flat normal for every preset", () => {
    const source = image(2, [32, 64, 96, 255, 220, 120, 60, 128, 80, 160, 240, 0, 0, 0, 0, 255]);
    const before = source.data.slice();
    for (const preset of Object.values(NormalMapPreset)) {
      const output = generateNormalMap(source, { preset, normalStrength: 0 });
      for (let i = 0; i < source.data.length; i += 4)
        assert.deepEqual([...output.data.subarray(i, i + 4)], [128, 128, 255, source.data[i + 3]]);
    }
    assert.deepEqual(source.data, before);
  });

  it("inverts only the encoded Y direction and keeps finite unit normals", () => {
    const source = image(
      3,
      Array.from({ length: 9 }, (_, i) => [i * 25, i * 15, i * 10, 255]).flat(),
    );
    const options = { preset: NormalMapPreset.Architecture, mergeOutlines: false, smoothing: 0 };
    const normal = generateNormalMap(source, options);
    const inverted = generateNormalMap(source, { ...options, invertY: true });
    for (let i = 0; i < source.data.length; i += 4) {
      assert.equal(normal.data[i], inverted.data[i]);
      assert.equal(normal.data[i + 2], inverted.data[i + 2]);
      assert.ok(Math.abs(normal.data[i + 1] + inverted.data[i + 1] - 255) <= 1);
      const vector = [...normal.data.subarray(i, i + 3)].map((value) => (value / 255) * 2 - 1);
      assert.ok(Math.abs(Math.hypot(...vector) - 1) < 0.015);
    }
  });
});

describe("normal lighting", () => {
  it("responds to upward-facing normals and the Y convention, preserving albedo alpha", () => {
    const albedo = image(1, [128, 64, 32, 128]);
    const normal = image(1, [128, 255, 128, 255]);
    const light = {
      ...defaultNormalMapLightOptions(1, 1),
      position: { x: 0, y: -4 },
      height: 1,
      brightness: 100,
      ambient: 0,
    };
    const above = renderNormalMapLighting(albedo, normal, light);
    const below = renderNormalMapLighting(albedo, normal, { ...light, position: { x: 0, y: 4 } });
    const flipped = renderNormalMapLighting(albedo, normal, { ...light, invertY: true });
    assert.ok(above.data[0] > below.data[0]);
    assert.deepEqual(below.data, flipped.data);
    assert.equal(above.data[3], 128);
    assert.deepEqual([...albedo.data], [128, 64, 32, 128]);
  });

  it("uses a flat surface for absent/transparent normals and rejects mismatched dimensions", () => {
    const albedo = image(1, [100, 80, 60, 255]);
    const light = defaultNormalMapLightOptions(1, 1);
    assert.deepEqual(
      renderNormalMapLighting(albedo, null, light),
      renderNormalMapLighting(albedo, image(1, [0, 0, 0, 0]), light),
    );
    assert.throws(
      () =>
        renderNormalMapLighting(albedo, image(2, [128, 128, 255, 255, 128, 128, 255, 255]), light),
      /dimensions/,
    );
  });
});
