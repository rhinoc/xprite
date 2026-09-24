import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("export-file", () => {
  it("export-file behavior", async () => {
    const load = async (path) => {
      const { outputFiles } = await build({
        entryPoints: [path],
        bundle: true,
        platform: "node",
        format: "esm",
        write: false,
      });
      return import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    };
    const { renderExport } = await load(
      "packages/editor-core/src/import-export/image/export-plan.ts",
    );
    const { defaultExportFileOptions } = await load(
      "apps/editor/src/managers/files/export-file-options.ts",
    );
    const pixels = (values) => ({
      width: values.length,
      height: 1,
      data: new Uint8ClampedArray(values.flatMap((v) => [v, 0, 0, 255])),
    });
    const a = pixels([10, 20]),
      b = pixels([90, 80]);
    const doc = {
      name: "source.aseprite",
      width: 2,
      height: 1,
      layer: { name: "a", pixels: a, x: 0, y: 0, visible: true, locked: false },
      selection: null,
      timeline: {
        activeLayer: 0,
        activeFrame: 0,
        layers: [
          { id: "a", name: "a", visible: true, locked: false, flags: 1, opacity: 255 },
          { id: "b", name: "b", visible: false, locked: false, flags: 0, opacity: 255 },
        ],
        frames: [
          {
            duration: 100,
            cels: [
              { pixels: a, x: 0, y: 0, opacity: 255, zIndex: 0 },
              { pixels: b, x: 0, y: 0, opacity: 255, zIndex: 0 },
            ],
          },
          { duration: 100, cels: [{ pixels: b, x: 0, y: 0, opacity: 255, zIndex: 0 }, null] },
        ],
      },
    };
    const options = {
      name: "result.png",
      scalePercent: 100,
      area: "canvas",
      layers: "visible",
      frame: 0,
    };
    const original = structuredClone(doc);
    assert.deepEqual([...renderExport(doc, options).data], [...a.data]);
    assert.deepEqual(doc, original);
    const scaled = renderExport(doc, { ...options, scalePercent: 200 });
    assert.equal(scaled.width, 4);
    assert.equal(scaled.height, 2);
    assert.deepEqual(
      Array.from(scaled.data.filter((_, i) => i % 4 === 0)),
      [10, 10, 20, 20, 10, 10, 20, 20],
    );
    assert.deepEqual([...renderExport(doc, { ...options, frame: 1 }).data], [...b.data]);
    const selected = {
      ...doc,
      timeline: { ...doc.timeline, range: { kind: "layers", layers: [1], frames: [0] } },
    };
    assert.deepEqual(
      [...renderExport(selected, { ...options, layers: "selected" }).data],
      [...b.data],
    );
    assert.equal(doc.timeline.layers[1].visible, false);
    // Selecting a hidden child reveals only its ancestors, preserving group opacity.
    const groupDoc = {
      ...doc,
      timeline: {
        ...doc.timeline,
        composeGroups: true,
        activeLayer: 1,
        layers: [
          {
            id: "group",
            kind: "group",
            name: "group",
            visible: false,
            locked: false,
            flags: 0,
            opacity: 128,
          },
          { ...doc.timeline.layers[0], parentId: "group" },
          { ...doc.timeline.layers[1], visible: true },
        ],
        frames: [
          {
            duration: 100,
            cels: [null, doc.timeline.frames[0].cels[0], doc.timeline.frames[0].cels[1]],
          },
        ],
      },
    };
    const groupOriginal = structuredClone(groupDoc);
    assert.deepEqual(
      [...renderExport(groupDoc, { ...options, layers: "selected" }).data],
      [10, 0, 0, 128, 20, 0, 0, 128],
    );
    assert.deepEqual(groupDoc, groupOriginal);
    assert.deepEqual(
      [
        ...renderExport(
          { ...groupDoc, timeline: { ...groupDoc.timeline, composeGroups: false } },
          { ...options, layers: "selected" },
        ).data,
      ],
      [...a.data],
      "pass-through groups do not apply group opacity",
    );
    // Aseprite selection export crops its bounds and deliberately does not mask holes.
    const cropped = renderExport(
      { ...doc, selection: { x: 1, y: 0, width: 1, height: 1, data: new Uint8Array([0]) } },
      { ...options, area: "selection" },
    );
    assert.deepEqual([...cropped.data], [20, 0, 0, 255]);
    assert.throws(() => renderExport(doc, { ...options, area: "selection" }));
    // JPEG composites straight alpha over the chosen opaque matte, including
    // pixels outside the canvas after selection cropping and nearest resize.
    const translucentPixels = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([200, 20, 0, 128, 123, 45, 67, 0]),
    };
    const jpegSource = {
      name: "translucent.aseprite",
      width: 2,
      height: 1,
      selection: null,
      layer: { name: "base", pixels: translucentPixels, x: 0, y: 0, visible: true, locked: false },
    };
    const jpegOriginal = structuredClone(jpegSource);
    const jpegOptions = { ...options, name: "result.jpg", frames: "current", jpegMatte: "#204060" };
    assert.deepEqual(
      [...renderExport(jpegSource, jpegOptions).data],
      [116, 42, 48, 255, 32, 64, 96, 255],
    );
    assert.deepEqual(
      [...renderExport(jpegSource, { ...jpegOptions, jpegMatte: undefined }).data],
      [227, 137, 127, 255, 255, 255, 255, 255],
    );
    assert.deepEqual(
      jpegSource,
      jpegOriginal,
      "JPEG export never flattens source pixels or creates source timeline state",
    );
    const croppedJpegSource = {
      ...jpegSource,
      selection: { x: -1, y: 0, width: 4, height: 1, data: new Uint8Array(4).fill(255) },
    };
    const croppedJpegOriginal = structuredClone(croppedJpegSource);
    const croppedJpeg = renderExport(croppedJpegSource, {
      ...jpegOptions,
      area: "selection",
      scalePercent: 200,
    });
    const expectedJpegRow = [
      [32, 64, 96, 255],
      [32, 64, 96, 255],
      [116, 42, 48, 255],
      [116, 42, 48, 255],
      [32, 64, 96, 255],
      [32, 64, 96, 255],
      [32, 64, 96, 255],
      [32, 64, 96, 255],
    ].flat();
    assert.deepEqual([croppedJpeg.width, croppedJpeg.height], [8, 2]);
    assert.deepEqual([...croppedJpeg.data], [...expectedJpegRow, ...expectedJpegRow]);
    assert.deepEqual(croppedJpegSource, croppedJpegOriginal);
    assert.deepEqual(
      [...renderExport(jpegSource, { ...jpegOptions, name: "result.webp" }).data],
      [...translucentPixels.data],
      "WebP retains alpha and never applies JPEG matting",
    );
    for (const name of ["result.jpg", "result.jpeg"])
      for (const frames of ["all", "selected", "tag:walk"])
        assert.throws(() => renderExport(doc, { ...options, name, frames }), /current frame/);
    assert.doesNotThrow(() =>
      renderExport(doc, { ...options, name: "result.webp", frames: "all" }),
    );
    for (const imageQualityPercent of [-1, 101, NaN])
      assert.throws(
        () => renderExport(jpegSource, { ...jpegOptions, imageQualityPercent }),
        /quality/,
      );
    assert.throws(
      () => renderExport(jpegSource, { ...jpegOptions, jpegMatte: "#bad" }),
      /background/,
    );

    assert.deepEqual(
      [...renderExport(doc, { ...options, name: "animation.gif" }).data],
      [...a.data],
      "shared render plan accepts animation output formats",
    );
    assert.throws(() => renderExport(doc, { ...options, scalePercent: 1e9 }));
    assert.throws(() => renderExport(doc, { ...options, frame: 99 }));
    assert.equal(defaultExportFileOptions(doc).name, "source.gif");
    assert.equal(
      defaultExportFileOptions({ ...doc, name: "different.aseprite" }).name,
      "different.gif",
      "Animation sources start with GIF by default",
    );
    assert.equal(
      defaultExportFileOptions({
        ...doc,
        name: "already.png",
        timeline: { ...doc.timeline, frames: [doc.timeline.frames[0]] },
      }).name,
      "already-export.png",
      "Default export appends -export when the source extension matches",
    );
    assert.equal(
      defaultExportFileOptions({ ...doc, name: "already.gif" }).name,
      "already-export.gif",
    );
    assert.deepEqual(doc, original);
    for (const scalePercent of [25, 50, 100, 137, 200, 325])
      for (const bounds of [
        { x: 0, y: 0, width: 5, height: 3 },
        { x: -2, y: -1, width: 8, height: 5 },
        { x: 1, y: 1, width: 3, height: 2 },
      ]) {
        const pixels = {
          width: 5,
          height: 3,
          data: Uint8ClampedArray.from({ length: 60 }, (_, i) => (i * 19) % 256),
        };
        const fixture = {
          name: "scaled",
          width: 5,
          height: 3,
          selection: { ...bounds, data: new Uint8Array(bounds.width * bounds.height).fill(255) },
          layer: { name: "base", pixels, x: 0, y: 0, visible: true, locked: false },
        };
        const result = renderExport(fixture, { ...options, scalePercent, area: "selection" }),
          expected = new Uint8ClampedArray(result.data.length);
        for (let y = 0; y < result.height; y++)
          for (let x = 0; x < result.width; x++) {
            const sx = bounds.x + Math.floor((x * bounds.width) / result.width),
              sy = bounds.y + Math.floor((y * bounds.height) / result.height);
            if (sx >= 0 && sy >= 0 && sx < 5 && sy < 3)
              expected.set(
                pixels.data.subarray((sy * 5 + sx) * 4, (sy * 5 + sx) * 4 + 4),
                (y * result.width + x) * 4,
              );
          }
        assert.deepEqual(result.data, expected);
        assert.notEqual(result.data, pixels.data, "export always owns its output");
      }
    console.log(
      "Export resampling matches generic nearest sampling for fractional scales and out-of-canvas crops.",
    );
  }, 60_000);
});
