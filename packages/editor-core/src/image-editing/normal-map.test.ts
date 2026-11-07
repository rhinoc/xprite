import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { createLightMaskGenerator } from "$/image-editing/light-mask";
import {
  LightingMapRegionMode,
  segmentLightingMapSource,
} from "$/image-editing/lighting-map-source";
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
  it("groups close colors but stops at contrast edges, alpha steps, and transparent gaps", () => {
    const source = image(
      6,
      [
        96, 96, 96, 255, 100, 100, 100, 255, 116, 116, 116, 255, 116, 116, 116, 180, 116, 116, 116,
        0, 116, 116, 116, 180,
      ],
    );
    const { labels, clusters } = segmentLightingMapSource(source, LightingMapRegionMode.Perceptual);
    assert.deepEqual([...labels], [0, 0, 1, 2, -1, 3]);
    assert.ok(Math.abs(clusters[0].value - 98 / 255) < 1e-6);
    assert.deepEqual([...segmentLightingMapSource(source).labels], [0, 1, 2, 2, -1, 3]);
  });

  it("limits region growth across a ramp of individually weak edges", () => {
    const ramp = [96, 104, 112, 120, 128, 136];
    const source = image(
      ramp.length,
      ramp.flatMap((value) => [value, value, value, 255]),
    );
    const { labels } = segmentLightingMapSource(source, LightingMapRegionMode.Perceptual);
    assert.equal(labels[0], labels[1]);
    assert.notEqual(labels[0], labels[ramp.length - 1]);
  });

  it("splits a small sprite into facets independently of its transparent padding", () => {
    const size = 8;
    const source = image(
      size,
      Array.from({ length: size * size }, () => [100, 100, 100, 255]).flat(),
    );
    const options = { shapeStrength: 200, smoothing: 0, mergeOutlines: false };
    const flat = generateNormalMap(source, { ...options, facets: 0 });
    const faceted = generateNormalMap(source, { ...options, facets: 100 });
    assert.notDeepEqual(faceted.data, flat.data);

    const padding = 12;
    const width = size + 2 * padding;
    const padded = { width, height: width, data: new Uint8ClampedArray(width * width * 4) };
    for (let y = 0; y < size; y++) {
      const row = source.data.subarray(y * size * 4, (y + 1) * size * 4);
      padded.data.set(row, ((y + padding) * width + padding) * 4);
    }
    const paddedFacets = generateNormalMap(padded, { ...options, facets: 100 });
    for (let y = 0; y < size; y++) {
      const start = ((y + padding) * width + padding) * 4;
      assert.deepEqual(
        paddedFacets.data.subarray(start, start + size * 4),
        faceted.data.subarray(y * size * 4, (y + 1) * size * 4),
      );
    }
  });

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

describe("light mask generation", () => {
  it("darkens an enclosed shade while preserving source coverage", () => {
    const source = image(
      3,
      Array.from({ length: 9 }, (_, i) =>
        i === 4 ? [32, 32, 32, 128] : [200, 200, 200, 255],
      ).flat(),
    );
    const generator = createLightMaskGenerator(source);
    const mask = generator.generate();
    assert.deepEqual([...mask.data.subarray(16, 20)], [13, 13, 13, 128]);
    assert.deepEqual([...mask.data.subarray(0, 4)], [255, 255, 255, 255]);
    assert.deepEqual(
      [...generator.generate({ cavity: 0 }).data.subarray(16, 20)],
      [20, 20, 20, 128],
    );
  });
});

describe("normal lighting", () => {
  it("masks direct light while preserving ambient light and albedo alpha", () => {
    const albedo = image(1, [128, 64, 32, 128]);
    const normal = image(1, [128, 128, 255, 255]);
    const light = { ...defaultNormalMapLightOptions(1, 1), position: { x: 0, y: 0 }, height: 1 };
    const black = image(1, [0, 0, 0, 255]);
    const transparent = image(1, [0, 0, 0, 0]);
    const fullLight = renderNormalMapLighting(albedo, normal, light);
    const masked = renderNormalMapLighting(albedo, normal, light, black);
    const partial = renderNormalMapLighting(albedo, normal, { ...light, maskStrength: 50 }, black);
    assert.deepEqual(
      masked.data,
      renderNormalMapLighting(albedo, normal, { ...light, brightness: 0 }).data,
    );
    assert.equal(masked.data[3], 128);
    assert.ok(masked.data[0] < partial.data[0] && partial.data[0] < fullLight.data[0]);
    assert.deepEqual(
      fullLight.data,
      renderNormalMapLighting(albedo, normal, { ...light, maskStrength: 0 }, black).data,
    );
    assert.deepEqual(
      fullLight.data,
      renderNormalMapLighting(albedo, normal, light, transparent).data,
    );
  });
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
