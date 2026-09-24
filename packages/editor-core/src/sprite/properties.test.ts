import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("sprite-properties", () => {
  it("sprite-properties behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const core = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const palette = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ];
    const asepriteSamples = { depth: 8, width: 2, height: 1, data: new Uint8Array([0, 1]) };
    const projected = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 0, 0, 255, 0, 255]),
    };
    const timeline = {
      colorDepth: 8,
      transparentIndex: 0,
      pixelRatio: [1, 1],
      useLayerUuids: false,
      activeLayer: 0,
      activeFrame: 0,
      layers: [
        { id: "layer-1", name: "Layer 1", visible: true, locked: false, opacity: 255, flags: 3 },
      ],
      frames: [50, 200].map((duration) => ({
        duration,
        palette,
        cels: [{ pixels: projected, asepriteSamples, x: 0, y: 0, opacity: 255, zIndex: 0 }],
      })),
    };
    const editor = new core.RasterEditor();
    editor.document.loadTimeline(timeline, 2, 1, "Properties.aseprite", palette);
    editor.sprite.setProperties({
      transparentIndex: 1,
      pixelRatio: [2, 1],
      useLayerUuids: true,
      userData: { text: "Sprite metadata" },
      colorProfile: { type: "srgb" },
      convertColorProfile: true,
    });
    let document = editor.getSnapshot().document;
    assert.deepEqual(document.timeline.pixelRatio, [2, 1]);
    assert.equal(document.timeline.transparentIndex, 1);
    assert.equal(document.timeline.useLayerUuids, true);
    assert.equal(document.timeline.layers[0].source.uuid.byteLength, 16);
    assert.equal(document.timeline.userData.text, "Sprite metadata");
    assert.equal(document.timeline.colorProfile.type, "srgb");
    assert.deepEqual(
      [...document.timeline.frames[0].cels[0].pixels.data],
      [255, 0, 0, 255, 0, 0, 0, 0],
      "new transparent index reprojects indexed cels",
    );

    const sprite = core.asepriteFromProject(core.projectFromDocument(document));
    assert.equal(sprite.header.pixelWidth, 2);
    assert.equal(sprite.header.pixelHeight, 1);
    assert.equal(sprite.header.transparentIndex, 1);
    assert.ok(sprite.flags & 4, "layer UUID header flag is enabled");
    assert.equal(sprite.layers[0].uuid.byteLength, 16);
    assert.equal(sprite.userData.text, "Sprite metadata");
    assert.equal(sprite.colorProfile.type, "srgb");
    const decoded = core.decodeAsepriteSync(core.encodeAsepriteSync(sprite));
    const reopened = core.projectFromAseprite(decoded);
    assert.deepEqual(reopened.timeline.pixelRatio, [2, 1]);
    assert.equal(reopened.timeline.transparentIndex, 1);
    assert.equal(reopened.timeline.useLayerUuids, true);
    assert.equal(reopened.timeline.layers[0].source.uuid.byteLength, 16);
    assert.equal(reopened.timeline.userData.text, "Sprite metadata");
    assert.equal(reopened.timeline.colorProfile.type, "srgb");
    assert.deepEqual(
      [...reopened.timeline.frames[0].cels[0].pixels.data],
      [255, 0, 0, 255, 0, 0, 0, 0],
    );

    editor.timeline.setFrameDuration(75, true);
    assert.deepEqual(
      editor.getSnapshot().document.timeline.frames.map((frame) => frame.duration),
      [75, 75],
      "Constant Frame Rate applies the first frame duration to all frames",
    );
    editor.history.undo();
    assert.deepEqual(
      editor.getSnapshot().document.timeline.frames.map((frame) => frame.duration),
      [50, 200],
    );
    editor.history.undo();
    document = editor.getSnapshot().document;
    assert.deepEqual(document.timeline.pixelRatio, [1, 1]);
    assert.equal(document.timeline.transparentIndex, 0);
    assert.equal(document.timeline.useLayerUuids, false);
    assert.equal(document.timeline.userData, undefined);
    assert.equal(document.timeline.layers[0].source?.uuid, undefined);
    const displayP3 = {
      type: "icc",
      data: new Uint8Array(await readFile("/System/Library/ColorSync/Profiles/Display P3.icc")),
    };
    const rgbPixel = { width: 1, height: 1, data: new Uint8ClampedArray([200, 80, 45, 255]) };
    const rgbTimeline = {
      colorDepth: 32,
      colorProfile: displayP3,
      activeLayer: 0,
      activeFrame: 0,
      layers: [
        { id: "rgb", name: "Layer 1", visible: true, locked: false, opacity: 255, flags: 3 },
      ],
      frames: [
        { duration: 100, cels: [{ pixels: rgbPixel, x: 0, y: 0, opacity: 255, zIndex: 0 }] },
      ],
    };
    const profileEditor = new core.RasterEditor();
    profileEditor.document.loadTimeline(rgbTimeline, 1, 1, "Profile.aseprite");
    profileEditor.sprite.setProperties({ colorProfile: { type: "srgb" } });
    assert.deepEqual(
      profileEditor.getSnapshot().document.timeline.frames[0].cels[0].pixels.data,
      rgbPixel.data,
      "Assign changes profile metadata without touching color samples",
    );
    profileEditor.history.undo();
    profileEditor.sprite.setProperties({
      colorProfile: { type: "srgb" },
      convertColorProfile: true,
    });
    const expectedSrgb = core.convertPixelsBetweenProfiles(rgbPixel, displayP3, { type: "srgb" });
    assert.deepEqual(
      profileEditor.getSnapshot().document.timeline.frames[0].cels[0].pixels.data,
      expectedSrgb.data,
      "Convert transforms pixels between the selected profiles",
    );
    profileEditor.history.undo();
    assert.deepEqual(
      profileEditor.getSnapshot().document.timeline.frames[0].cels[0].pixels.data,
      rgbPixel.data,
      "Undo restores Aseprite profile pixel samples",
    );
    console.log(
      "Sprite Properties persist aspect ratio, indexed transparency, UUIDs and user data through undo and ASE encode/reopen; Assign preserves samples, Convert transforms Display P3 to sRGB and undoes; Constant Frame Rate normalizes every frame duration.",
    );
  }, 60_000);
});
