import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

import { build } from "esbuild";
// Byte container only: this test makes no browser Canvas/readback/layout claim.
globalThis.ImageData = class {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
};
const bundled = await build({
  stdin: {
    contents: 'export {CanvasRenderer,DEFAULT_SURFACE_VIEWPORT} from "@xprite/ui/canvas";',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { CanvasRenderer, DEFAULT_SURFACE_VIEWPORT } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const dprs = [0.75, 1, 1.25, 2, 3];
const floorRatio = (numerator, denominator) => {
  const n = BigInt(numerator),
    d = BigInt(denominator),
    q = n / d,
    r = n % d;
  return Number(q - (r < 0n ? 1n : 0n));
};
const ceilRatio = (n, d) => -floorRatio(-n, d);
function layoutFor(bounds, viewport) {
  const left = floorRatio(bounds.x * viewport.width, viewport.sceneWidth),
    top = floorRatio(bounds.y * viewport.height, viewport.sceneHeight);
  return {
    left,
    top,
    width: ceilRatio((bounds.x + bounds.width) * viewport.width, viewport.sceneWidth) - left,
    height: ceilRatio((bounds.y + bounds.height) * viewport.height, viewport.sceneHeight) - top,
  };
}
// Independent rational pixel-center oracle. No implementation sampling tables,
// surfaceLayout, legacy bilinear sampler, or browser interpolation used.
function nearestOracle(source, bounds, viewport, dx = 1, dy = dx) {
  const layout = layoutFor(bounds, viewport),
    width = Math.max(1, Math.round(layout.width * dx)),
    height = Math.max(1, Math.round(layout.height * dy));
  const output = new ImageData(width, height);
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const sx =
        floorRatio(
          (2 * width * layout.left + (2 * px + 1) * layout.width) * viewport.sceneWidth,
          2 * width * viewport.width,
        ) - bounds.x;
      const sy =
        floorRatio(
          (2 * height * layout.top + (2 * py + 1) * layout.height) * viewport.sceneHeight,
          2 * height * viewport.height,
        ) - bounds.y;
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
      for (let channel = 0; channel < 4; channel++)
        output.data[(py * width + px) * 4 + channel] =
          source.data[(sy * source.width + sx) * 4 + channel];
    }
  return output;
}
const palette = [
  [17, 53, 89, 255],
  [231, 101, 47, 255],
  [72, 121, 183, 128],
  [9, 27, 81, 0],
  [255, 255, 255, 255],
];
let seed = 98;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed >>> 24;
};
function image(width, height) {
  const result = new ImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      result.data.set(palette[(x + 3 * y + random()) % palette.length], (y * width + x) * 4);
  return result;
}
const paletteSet = new Set([...palette.map((color) => color.join(",")), "0,0,0,0"]);
function assertPalette(data) {
  for (let i = 0; i < data.length; i += 4)
    assert.ok(
      paletteSet.has(Array.from(data.subarray(i, i + 4)).join(",")),
      "Nearest presentation introduced an interpolated RGBA color.",
    );
}
let cases = 0,
  mutations = 0;
const fixtures = [
  {
    bounds: { x: 0, y: 0, width: 64, height: 49 },
    viewport: { sceneWidth: 64, sceneHeight: 49, width: 43, height: 31 },
  },
  {
    bounds: { x: 7, y: 9, width: 32, height: 21 },
    viewport: { sceneWidth: 64, sceneHeight: 49, width: 43, height: 31 },
  },
  {
    bounds: { x: -3, y: -2, width: 11, height: 13 },
    viewport: { sceneWidth: 64, sceneHeight: 49, width: 43, height: 31 },
  },
  {
    bounds: { x: 63, y: 48, width: 1, height: 1 },
    viewport: { sceneWidth: 64, sceneHeight: 49, width: 43, height: 31 },
  },
  {
    bounds: { x: 2, y: 3, width: 9, height: 8 },
    viewport: { sceneWidth: 10, sceneHeight: 10, width: 33, height: 27 },
  },
  { bounds: { x: 166, y: 98, width: 38, height: 32 }, viewport: DEFAULT_SURFACE_VIEWPORT },
];
for (let i = 0; i < 35; i++)
  fixtures.push({
    bounds: {
      x: (random() % 14) - 4,
      y: (random() % 12) - 3,
      width: 1 + (random() % 40),
      height: 1 + (random() % 35),
    },
    viewport: {
      sceneWidth: 25 + (random() % 30),
      sceneHeight: 20 + (random() % 25),
      width: 10 + (random() % 70),
      height: 10 + (random() % 65),
    },
  });
for (const { bounds, viewport } of fixtures) {
  const renderer = new CanvasRenderer(bounds, viewport),
    source = image(bounds.width, bounds.height);
  assert.deepEqual(
    renderer.layout,
    layoutFor(bounds, viewport),
    "CSS layout must enclose exact global source bounds.",
  );
  for (const ratio of dprs) {
    renderer.setPixelRatio(ratio);
    const actual = renderer.render(source),
      expected = nearestOracle(source, bounds, viewport, ratio);
    assert.equal(actual.width, expected.width);
    assert.equal(actual.height, expected.height);
    assert.deepEqual(
      actual.data,
      expected.data,
      `pixel-center sample ${JSON.stringify({ bounds, viewport, ratio })}`,
    );
    assertPalette(actual.data);
    cases++;
    assert.equal(
      renderer.render(source),
      actual,
      "unchanged output buffer reused regardless of opaque hint",
    );
    // Mutate the same object in place, including corners. No object-identity cache can hide updates.
    for (const pixel of [
      0,
      bounds.width * bounds.height - 1,
      Math.floor((bounds.width * bounds.height) / 2),
    ]) {
      source.data.set(palette[(pixel + 1) % palette.length], pixel * 4);
      assert.equal(renderer.render(source), actual, "localized updates reuse output allocation");
      assert.deepEqual(actual.data, nearestOracle(source, bounds, viewport, ratio).data);
      mutations++;
    }
    // Valid RGBA views need not be Uint32-aligned. Switch back to aligned data afterwards.
    const storage = new Uint8ClampedArray(source.data.length + 1),
      unaligned = { width: source.width, height: source.height, data: storage.subarray(1) };
    unaligned.data.set(source.data);
    unaligned.data.set(palette[2], 0);
    assert.equal(renderer.render(unaligned), actual);
    assert.deepEqual(actual.data, nearestOracle(unaligned, bounds, viewport, ratio).data);
    assert.equal(renderer.render(source), actual);
    assert.deepEqual(actual.data, nearestOracle(source, bounds, viewport, ratio).data);
  }
  // External layout transforms may scale x and y differently.
  renderer.setPixelRatio(1.25, 0.75);
  assert.deepEqual(
    renderer.render(source).data,
    nearestOracle(source, bounds, viewport, 1.25, 0.75).data,
  );
  cases++;
  renderer.setPixelRatio(0, NaN);
  assert.deepEqual(renderer.render(source).data, nearestOracle(source, bounds, viewport).data);
}
// Dimensions change reallocates once, not once per frame; same rounded dimensions retain storage.
{
  const bounds = { x: 0, y: 0, width: 16, height: 16 },
    viewport = { sceneWidth: 16, sceneHeight: 16, width: 16, height: 16 },
    renderer = new CanvasRenderer(bounds, viewport),
    input = image(16, 16);
  const initial = renderer.render(input);
  renderer.setPixelRatio(2);
  const doubled = renderer.render(input);
  assert.notEqual(initial, doubled);
  assert.equal(doubled.width, 32);
  renderer.setPixelRatio(2.001);
  assert.equal(renderer.render(input), doubled);
  renderer.setPixelRatio(1);
  assert.notEqual(renderer.render(input), doubled);
}
const bounds = { x: 166, y: 98, width: 1700, height: 672 },
  input = image(bounds.width, bounds.height);
const benchmarks = [];
for (const ratio of dprs) {
  const renderer = new CanvasRenderer(bounds);
  renderer.setPixelRatio(ratio);
  for (const mode of ["full RGB change", "localized 16x16 change", "unchanged frame"]) {
    const times = [];
    for (let frame = 0; frame < 9; frame++) {
      if (mode === "full RGB change")
        for (let i = 0; i < input.data.length; i += 4) input.data[i] ^= 255;
      if (mode === "localized 16x16 change")
        for (let y = 250; y < 266; y++)
          for (let x = 500; x < 516; x++) input.data[(y * bounds.width + x) * 4 + 1] ^= 255;
      const started = performance.now();
      renderer.render(input);
      if (frame > 2) times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    benchmarks.push({
      ratio,
      mode,
      backing: [renderer.pixelWidth, renderer.pixelHeight],
      medianMs: +((times[2] + times[3]) / 2).toFixed(3),
      maxMs: +times.at(-1).toFixed(3),
    });
  }
}
const sourceHashes = Object.fromEntries(
  [
    "packages/ui/src/base/components/canvas/canvas-renderer.ts",
    "packages/ui/src/components/canvas-surface/geometry.ts",
    "scripts/e2e/aseprite-compatibility/verify-canvas-renderer.mjs",
  ].map((path) => [path, crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex")]),
);
console.log(
  JSON.stringify(
    {
      passed: true,
      generatedAt: new Date().toISOString(),
      sourceHashes,
      sampler: "nearest-neighbor exact rational pixel-center oracle",
      dprs,
      cases,
      mutations,
      palettePreserved: true,
      alignedAndUnaligned: true,
      bufferReuse: true,
      benchmarks,
      scope:
        "Node typed-array presentation only. Excludes mutation setup, DOM, native Canvas readback/presentation and browser frame scheduling. Legacy bilinear reference is deliberately not the runtime oracle.",
    },
    null,
    2,
  ),
);
