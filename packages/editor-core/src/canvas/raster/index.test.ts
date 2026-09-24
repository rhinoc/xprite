import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("packed-fill", () => {
  it("packed-fill behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/canvas/raster/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { floodFill, pixelWriter } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    for (let trial = 0; trial < 180; trial++) {
      const width = 17,
        height = 13,
        bytes = width * height * 4,
        a = { width, height, data: new Uint8ClampedArray(bytes) },
        b = { width, height, data: new Uint8ClampedArray(new ArrayBuffer(bytes + 1), 1, bytes) };
      for (let i = 0; i < bytes; i++)
        a.data[i] = i % 4 === 3 ? (trial % 3 === 0 ? 0 : 255) : (i >> 2) % 11 === 0 ? 99 : 20;
      b.data.set(a.data);
      const captures = [[], []],
        clip = trial % 2 ? { x: 1.5, y: 2, width: 13.2, height: 9 } : undefined,
        selection =
          trial % 5 === 0
            ? {
                x: 0,
                y: 0,
                width,
                height,
                data: Uint8Array.from({ length: width * height }, (_, i) => (i % 7 ? 255 : 0)),
              }
            : undefined;
      const options = {
        color: [99, 21, 37, 255],
        opacity: 255,
        ink: "simple",
        brush: { size: 1, shape: "square", angle: 0 },
        clip,
        selection,
        tolerance: trial % 4 ? 0 : 10,
        contiguous: trial % 3 !== 0,
      };
      const results = [a, b].map((image, index) => {
        const opts = { ...options, beforeWrite: (r) => captures[index].push(r) };
        if (trial % 2) return floodFill(image, { x: 5, y: 5 }, opts);
        const w = pixelWriter(image, opts);
        for (let y = -1; y <= height; y++) w.writeSolidSpan(-2, y, width + 1, options.color);
        return w.result();
      });
      assert.deepEqual(a.data, b.data);
      assert.deepEqual(results[0], results[1]);
      assert.deepEqual(captures[0], captures[1]);
    }
    console.log(
      "Packed fill matches unaligned generic path: pixels, history capture rectangles and dirty bounds across 180 clipping/mask/alpha/tolerance cases.",
    );
  }, 60_000);
});

describe("indexed-raster-writer [feature-7-12]", () => {
  it("indexed-raster-writer behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `export * from './packages/editor-core/src/canvas/raster/index.ts';export * from './packages/editor-core/src/canvas/raster/pixel-perfect-stroke.ts';export * from './packages/editor-core/src/canvas/raster/dynamic-paint-stroke.ts';export * from './packages/editor-core/src/canvas/raster/stroke-dynamics.ts';export * from './apps/editor/src/managers/preferences/dynamics-state.ts';`,
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      pixelWriter,
      PixelPerfectStroke,
      DynamicPaintStroke,
      StrokeDynamics,
      defaultDynamicsSettings,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const color = [22, 33, 44, 255],
      image = () => ({
        width: 8,
        height: 8,
        data: Uint8ClampedArray.from(Array.from({ length: 64 }, () => color).flat()),
      });
    function fixture() {
      const im = image(),
        indices = new Uint8Array(64),
        writes = [],
        captures = [];
      const indexedPixelWriter = {
        read: (x, y) => indices[y * 8 + x],
        write: (x, y, c, index = 1) => {
          writes.push({ x, y, index });
          const at = y * 8 + x;
          if (indices[at] === index) return false;
          indices[at] = index;
          return true;
        },
      };
      return {
        im,
        indices,
        writes,
        captures,
        options: {
          color,
          brush: { shape: "square", size: 1, angle: 0 },
          indexedPixelWriter,
          beforeWrite: (r) => captures.push(r),
        },
      };
    }
    const f = fixture(),
      writer = pixelWriter(f.im, f.options);
    writer.write(2, 3, color);
    assert.equal(f.indices[26], 1);
    assert.equal(f.captures.length, 1, "index-only write captures history");
    assert.deepEqual(writer.result().dirty, { x: 2, y: 3, width: 1, height: 1 });
    assert.deepEqual(Array.from(f.im.data.slice(26 * 4, 27 * 4)), color);
    writer.write(2, 3, color);
    assert.equal(f.captures.length, 1, "same index and RGBA is a no-op");
    const masked = fixture(),
      mask = new Uint8Array(64);
    mask[18] = 1;
    const maskedWriter = pixelWriter(masked.im, {
      ...masked.options,
      selection: { x: 0, y: 0, width: 8, height: 8, data: mask },
    });
    maskedWriter.write(1, 1, color);
    assert.equal(masked.writes.length, 0, "rejected mask does not mutate palette index");
    maskedWriter.writeSolidSpan(-3, 2, 10, color);
    assert.equal(masked.indices[18], 1);
    assert.equal(masked.writes.length, 1);
    assert.deepEqual(maskedWriter.result().dirty, { x: 2, y: 2, width: 1, height: 1 });
    const span = fixture(),
      spanWriter = pixelWriter(span.im, span.options);
    spanWriter.writeSolidSpan(1, 4, 5, color);
    assert.equal(
      span.captures.length,
      5,
      "indexed solid span uses per-pixel write even when packed RGBA is identical",
    );
    assert.deepEqual(spanWriter.result().dirty, { x: 1, y: 4, width: 5, height: 1 });
    assert.deepEqual(Array.from(span.indices.slice(33, 38)), [1, 1, 1, 1, 1]);
    const ordinary = image(),
      plain = pixelWriter(ordinary, { color, brush: { shape: "square", size: 1, angle: 0 } });
    plain.writeSolidSpan(0, 0, 7, color);
    assert.equal(plain.result().dirty, null);
    plain.writeSolidSpan(2, 1, 4, [255, 0, 0, 255]);
    assert.deepEqual(plain.result().dirty, { x: 2, y: 1, width: 3, height: 1 });
    const perfect = fixture(),
      stroke = new PixelPerfectStroke();
    stroke.paint(perfect.im, [{ x: 1, y: 1 }], perfect.options);
    stroke.paint(
      perfect.im,
      [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      perfect.options,
    );
    assert.equal(perfect.indices[10], 1);
    stroke.paint(
      perfect.im,
      [
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ],
      perfect.options,
    );
    assert.equal(
      perfect.indices[10],
      0,
      "pixel-perfect restores old duplicate-color palette index",
    );
    assert.equal(perfect.indices[18], 1);
    assert(perfect.writes.some((w) => w.x === 2 && w.y === 1 && w.index === 0));
    const dynamic = fixture(),
      paint = new DynamicPaintStroke(),
      dynamics = new StrokeDynamics(
        { x: 1, y: 1, pointerType: "pen", pressure: 1 },
        { ...defaultDynamicsSettings, gradient: "pressure" },
      );
    paint.paint(
      dynamic.im,
      [{ x: 1, y: 1 }],
      dynamic.options,
      dynamics,
      color,
      "pencil",
      dynamic.options.brush,
      true,
    );
    dynamics.update({ x: 2, y: 1, pointerType: "pen", pressure: 1 });
    paint.paint(
      dynamic.im,
      [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      dynamic.options,
      dynamics,
      color,
      "pencil",
      dynamic.options.brush,
      true,
    );
    assert.equal(dynamic.indices[10], 1);
    dynamics.update({ x: 2, y: 2, pointerType: "pen", pressure: 1 });
    paint.paint(
      dynamic.im,
      [
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ],
      dynamic.options,
      dynamics,
      color,
      "pencil",
      dynamic.options.brush,
      true,
    );
    assert.equal(
      dynamic.indices[10],
      0,
      "dynamic pixel-perfect restores palette index instead of preferred current index",
    );
    assert.equal(dynamic.indices[18], 1);
    const quantized = fixture();
    let resolved = 0;
    const quantizedOptions = {
      ...quantized.options,
      indexedPixelWriter: {
        ...quantized.options.indexedPixelWriter,
        resolve: (_x, _y, c) => {
          resolved++;
          assert.deepEqual(c, [23, 34, 45, 255]);
          return color;
        },
        write: (x, y, c, index) => {
          assert.deepEqual(c, color, "palette index receives resolved palette color");
          return quantized.options.indexedPixelWriter.write(x, y, c, index);
        },
      },
    };
    const quantizedWriter = pixelWriter(quantized.im, quantizedOptions);
    quantizedWriter.write(-1, 0, [23, 34, 45, 255]);
    assert.equal(resolved, 0, "clip rejects before palette lookup");
    quantizedWriter.write(4, 4, [23, 34, 45, 255]);
    assert.equal(resolved, 1);
    assert.equal(quantized.indices[36], 1);
    assert.deepEqual(
      Array.from(quantized.im.data.slice(36 * 4, 37 * 4)),
      color,
      "display pixels show palette color immediately",
    );
    assert.deepEqual(quantizedWriter.result().dirty, { x: 4, y: 4, width: 1, height: 1 });
    // Indexed shading resolves from raw source indices, deliberately ignoring the
    // incoming RGBA. Corner restoration must bypass that paint-only resolver.
    for (const dynamicMode of [false, true]) {
      const im = image(),
        indices = new Uint8Array(64).fill(1),
        dark = [1, 2, 3, 255];
      let resolves = 0;
      const options = {
        color,
        brush: { shape: "square", size: 1, angle: 0 },
        ink: "shading",
        shade: [dark, color],
        indexedPixelWriter: {
          read: (x, y) => indices[y * 8 + x],
          resolve: () => {
            resolves++;
            return dark;
          },
          write: (x, y, c, index = 0) => {
            const at = y * 8 + x,
              changed = indices[at] !== index;
            indices[at] = index;
            return changed;
          },
        },
      };
      const stroke = dynamicMode ? new DynamicPaintStroke() : new PixelPerfectStroke(),
        dynamics = new StrokeDynamics(
          { x: 1, y: 1, pointerType: "pen", pressure: 1 },
          { ...defaultDynamicsSettings, gradient: "pressure" },
        );
      const paint = (points) => {
        if (dynamicMode) {
          const last = points[points.length - 1];
          dynamics.update({ ...last, pointerType: "pen", pressure: 1 });
          stroke.paint(im, points, options, dynamics, color, "pencil", options.brush, true);
        } else stroke.paint(im, points, options);
      };
      paint([{ x: 1, y: 1 }]);
      paint([
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ]);
      paint([
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ]);
      assert.equal(indices[10], 1, "indexed shading restores original raw corner index");
      assert.deepEqual(
        Array.from(im.data.slice(40, 44)),
        color,
        "indexed shading does not re-shade saved corner RGBA",
      );
      assert.equal(resolves, 3, "restore bypasses paint-only index resolver");
      assert.equal(indices[18], 0);
    }
    console.log(
      "PASS indexed raster writer: duplicate-RGBA index dirty/history, no-op/mask/solid spans, static+dynamic pixel-perfect exact index restoration; RGBA path preserved",
    );
  }, 60_000);
});
