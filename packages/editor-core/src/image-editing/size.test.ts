import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-document-size [feature-1-6]", () => {
  it("editor-document-size behavior", async () => {
    Error.stackTraceLimit = 0;

    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const pixel = (w = 2, h = 2) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(
        Array.from({ length: w * h }, (_, i) => [(i + 1) % 255, 20, 30, 255]).flat(),
      ),
    });
    const blank = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    const state = (e) => e.getSnapshot();
    const bytes = (doc) =>
      JSON.stringify(
        {
          width: doc.width,
          height: doc.height,
          selection: doc.selection && { ...doc.selection, data: [...doc.selection.data] },
          timeline: doc.timeline,
        },
        (_, value) => (value instanceof Uint8ClampedArray ? [...value] : value),
      );
    function fixture() {
      const e = new RasterEditor(blank(8, 6)),
        p = pixel(),
        ref = pixel(3, 2);
      const layers = [
        {
          id: "group",
          kind: "group",
          name: "Group",
          parentId: null,
          flags: 1,
          visible: true,
          locked: true,
          opacity: 190,
          blendMode: 3,
        },
        {
          id: "child",
          kind: "image",
          parentId: "group",
          name: "Child",
          flags: 3,
          visible: true,
          locked: false,
          opacity: 210,
          blendMode: 2,
        },
        {
          id: "ref",
          kind: "image",
          parentId: null,
          name: "Reference",
          flags: 67,
          visible: false,
          locked: false,
          opacity: 255,
          blendMode: 0,
        },
      ];
      const a = { pixels: p, x: 1, y: 2, opacity: 230, zIndex: 2 },
        b = {
          pixels: ref,
          x: 1,
          y: -1,
          preciseBounds: { x: 1.5, y: -1.25, width: 3.5, height: 4.5 },
          opacity: 255,
          zIndex: 0,
        };
      e.document.loadTimeline(
        {
          activeFrame: 0,
          activeLayer: 1,
          layers,
          frames: [
            { duration: 100, cels: [null, a, b] },
            { duration: 230, cels: [null, { ...a }, null] },
          ],
          tags: [
            {
              from: 0,
              to: 1,
              name: "Loop",
              direction: "forward",
              repeat: 2,
              color: [1, 2, 3, 255],
            },
          ],
        },
        8,
        6,
        "Sizing.aseprite",
      );
      return e;
    }
    let e = fixture();
    let before = state(e),
      beforeBytes = bytes(before.document),
      beforeFrames = before.document.timeline.frames;
    e.imageEditing.resizeSprite(16, 12, "nearest");
    let after = state(e),
      afterBytes = bytes(after.document);
    assert.equal(after.dirty, true);
    assert.equal(after.document.width, 16);
    assert.equal(after.document.height, 12);
    assert.equal(after.document.timeline.frames[0].cels[0], null);
    assert.equal(after.document.timeline.layers[0].kind, "group");
    assert.equal(after.document.timeline.layers[1].parentId, "group");
    assert.equal(after.document.timeline.layers[0].locked, true);
    assert.equal(after.document.timeline.layers[1].locked, false);
    assert.equal(
      after.document.timeline.frames[0].cels[1].pixels,
      after.document.timeline.frames[1].cels[1].pixels,
    );
    assert.equal(after.document.timeline.frames[0].cels[2].pixels, beforeFrames[0].cels[2].pixels);
    assert.deepEqual(after.document.timeline.frames[0].cels[2].preciseBounds, {
      x: 3,
      y: -2.5,
      width: 7,
      height: 9,
    });
    assert.deepEqual(after.document.timeline.tags, before.document.timeline.tags);
    e.history.undo();
    assert.equal(bytes(state(e).document), beforeBytes);
    assert.equal(state(e).dirty, false);
    assert.equal(state(e).canUndo, false);
    assert.equal(state(e).canRedo, true);
    e.history.redo();
    assert.equal(bytes(state(e).document), afterBytes);
    assert.equal(state(e).dirty, true);
    e.history.undo();
    e.canvas.setView({ pan: { x: 13, y: -7 } });
    e.imageEditing.resizeCanvas({ x: 0, y: 0, width: 8, height: 6 }, false);
    assert.equal(state(e).dirty, true);
    assert.equal(state(e).canRedo, false);
    assert.equal(state(e).canUndo, true);
    assert.deepEqual(state(e).view.pan, { x: 13, y: -7 });
    e.history.undo();
    assert.equal(state(e).dirty, false);
    for (const angle of [90, -90, 180]) {
      e = fixture();
      e.selection.selectAll();
      e.history.markSaved();
      before = state(e);
      beforeBytes = bytes(before.document);
      e.imageEditing.rotateCanvas(angle);
      afterBytes = bytes(state(e).document);
      assert.equal(state(e).document.width, angle === 180 ? 8 : 6);
      assert.equal(state(e).document.height, angle === 180 ? 6 : 8);
      e.history.undo();
      assert.equal(bytes(state(e).document), beforeBytes);
      assert.equal(state(e).dirty, false);
      e.history.redo();
      assert.equal(bytes(state(e).document), afterBytes);
    }
    // Canvas offset and background fill must participate in the same transaction.
    e = new RasterEditor(pixel(3, 2));
    e.sprite.convertLayerBackground(true);
    e.history.markSaved();
    beforeBytes = bytes(state(e).document);
    e.drawing.settings.setSettings({ background: [10, 20, 30, 0] });
    e.imageEditing.resizeCanvas({ x: -2, y: -1, width: 6, height: 4 }, false);
    assert.deepEqual(
      Array.from(state(e).document.layer.pixels.data.slice(0, 4)),
      [10, 20, 30, 255],
    );
    e.history.undo();
    assert.equal(bytes(state(e).document), beforeBytes);
    assert.equal(state(e).dirty, false);
    e.history.redo();
    assert.equal(state(e).document.width, 6);
    // Rejected allocation preserves the saved point, original raster and redo branch.
    e = new RasterEditor(pixel());
    e.imageEditing.resizeSprite(4, 4);
    e.history.undo();
    before = state(e);
    beforeBytes = bytes(before.document);
    const retained = before.document.layer.pixels;
    assert.throws(() => e.imageEditing.resizeSprite(32768, 32768), RangeError);
    assert.equal(bytes(state(e).document), beforeBytes);
    assert.equal(state(e).document.layer.pixels, retained);
    assert.equal(state(e).dirty, false);
    assert.equal(state(e).canUndo, false);
    assert.equal(state(e).canRedo, true);
    e.history.redo();
    assert.equal(state(e).document.width, 4);
    assert.equal(state(e).dirty, true);
    // RotSprite intermediate preflight rejects the whole transform before allocating output cels.
    e = new RasterEditor(blank(8, 6));
    const small = pixel(),
      large = pixel(5000, 1);
    e.document.loadTimeline(
      {
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "a", name: "A", flags: 3, visible: true, locked: false, opacity: 255 },
          { id: "b", name: "B", flags: 3, visible: true, locked: false, opacity: 255 },
        ],
        frames: [
          {
            duration: 100,
            cels: [
              { pixels: small, x: 0, y: 0, opacity: 255, zIndex: 0 },
              { pixels: large, x: 0, y: 0, opacity: 255, zIndex: 0 },
            ],
          },
        ],
      },
      8,
      6,
      "Large cel.aseprite",
    );
    beforeBytes = bytes(state(e).document);
    const originalImages = state(e).document.timeline.frames[0].cels.map((c) => c.pixels);
    assert.throws(() => e.imageEditing.resizeSprite(8, 6, "rotsprite"), RangeError);
    assert.equal(bytes(state(e).document), beforeBytes);
    assert.deepEqual(
      state(e).document.timeline.frames[0].cels.map((c) => c.pixels),
      originalImages,
    );
    assert.equal(state(e).canUndo, false);
    assert.equal(state(e).dirty, false);
    // Crop Sprite defaults to trimOutside=false upstream; it moves the canvas,
    // preserving pixels outside the new visible bounds, unlike the trim checkbox.
    e = new RasterEditor(pixel(6, 5));
    e.drawing.settings.setSettings({ tool: "marquee" });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerUp({ x: 3, y: 2 });
    e.history.markSaved();
    before = state(e);
    beforeBytes = bytes(before.document);
    const mask = before.document.selection,
      source = before.document.layer.pixels;
    assert.ok(mask);
    e.imageEditing.cropSprite();
    assert.equal(state(e).document.width, mask.width);
    assert.equal(state(e).document.height, mask.height);
    assert.equal(state(e).document.layer.pixels, source, "Crop must preserve off-canvas pixels");
    assert.equal(state(e).document.layer.x, -mask.x);
    e.history.undo();
    assert.equal(bytes(state(e).document), beforeBytes);
    assert.equal(state(e).dirty, false);
    // Aseprite unchanged Canvas Size and tight nonempty Trim still execute SetSpriteSize, marking dirty and replacing redo.
    e = new RasterEditor(pixel(3, 3));
    e.imageEditing.rotateCanvas(90);
    e.history.undo();
    e.canvas.setView({ pan: { x: -8, y: 12 } });
    e.imageEditing.trimSprite();
    assert.equal(state(e).dirty, true);
    assert.equal(state(e).canUndo, true);
    assert.equal(state(e).canRedo, false);
    assert.deepEqual(state(e).view.pan, { x: -8, y: 12 });
    e.history.undo();
    assert.equal(state(e).dirty, false);
    console.log(
      "RasterEditor size integration: undo/redo, Aseprite unchanged-command dirty/view preservation, groups/references/links/tags, background, crop semantics, initial and mid-transform allocation rollback verified.",
    );

    // Aggregate unique-image cap applies even when every individual output fits.
    e = new RasterEditor(blank(2, 2));
    e.document.loadTimeline(
      {
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "a", name: "A", flags: 3, visible: true, locked: false, opacity: 255 },
          { id: "b", name: "B", flags: 3, visible: true, locked: false, opacity: 255 },
        ],
        frames: [
          {
            duration: 100,
            cels: [
              { pixels: pixel(), x: 0, y: 0, opacity: 255, zIndex: 0 },
              { pixels: pixel(), x: 0, y: 0, opacity: 255, zIndex: 0 },
            ],
          },
        ],
      },
      2,
      2,
      "Aggregate.aseprite",
    );
    beforeBytes = bytes(state(e).document);
    assert.throws(() => e.imageEditing.resizeSprite(7000, 7000), /cel memory/);
    assert.equal(bytes(state(e).document), beforeBytes);
    assert.equal(state(e).dirty, false);
    assert.equal(state(e).canUndo, false);
    // Distinct background frame images are also counted separately before growth.
    e = new RasterEditor(pixel());
    e.sprite.convertLayerBackground(true);
    e.timeline.setLayerContinuous(false);
    e.timeline.addFrame(true);
    e.history.markSaved();
    beforeBytes = bytes(state(e).document);
    assert.throws(
      () => e.imageEditing.resizeCanvas({ x: 0, y: 0, width: 7000, height: 7000 }),
      /cel memory/,
    );
    assert.equal(bytes(state(e).document), beforeBytes);
    assert.equal(state(e).dirty, false);
    console.log(
      "Aggregate cel allocation budget preflight verified for resize and animated backgrounds.",
    );
    // DeselectMask hides the current mask, which CanvasSize/Flip still transform;
    // Aseprite SpriteSize and Rotate only transform visible masks.
    e = new RasterEditor(pixel(4, 4));
    e.drawing.settings.setSettings({ tool: "marquee" });
    e.pointerDown({ x: 0, y: 1 });
    e.pointerUp({ x: 0, y: 2 });
    e.selection.deselect();
    const hidden = state(e).document.hiddenSelection;
    assert.ok(hidden);
    e.imageEditing.resizeCanvas({ x: -1, y: -1, width: 6, height: 6 });
    assert.equal(state(e).document.hiddenSelection.x, hidden.x + 1);
    assert.equal(state(e).document.hiddenSelection.y, hidden.y + 1);
    e.history.undo();
    assert.equal(state(e).document.hiddenSelection, hidden);
    e.history.redo();
    assert.equal(state(e).document.hiddenSelection.x, 1);
    e.history.undo();
    e.imageEditing.flipCanvas("horizontal");
    assert.equal(state(e).document.hiddenSelection.x, 3);
    e.history.undo();
    assert.equal(state(e).document.hiddenSelection, hidden);
    e.imageEditing.rotateCanvas(90);
    assert.equal(state(e).document.hiddenSelection, hidden);
    e.history.undo();
    e.imageEditing.resizeSprite(8, 8, "nearest");
    assert.equal(state(e).document.hiddenSelection, hidden);
    e.history.undo();
    e.selection.reselect();
    assert.equal(state(e).document.selection, hidden);
    console.log(
      "Hidden selection Canvas/Flip transforms, Resize/Rotate preservation and undo/redo verified.",
    );
  }, 60_000);
});

describe("document-size [feature-1-6]", () => {
  it("document-size behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/image-editing/size.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      canvasBoundsForAnchor,
      resizeDocumentCanvas,
      resizeDocumentSprite,
      rotateDocumentCanvas,
      trimDocumentCanvas,
      resizeSpritePixels,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = (w, h, reds = []) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(
        Array.from({ length: w * h }, (_, i) => [reds[i] ?? 0, 0, 0, reds[i] ? 255 : 0]).flat(),
      ),
    });
    const make = (pixels = image(2, 2, [1, 2, 3, 4])) => ({
      width: 8,
      height: 6,
      name: "x",
      selection: null,
      layer: { name: "Layer", pixels, x: 1, y: 2, visible: true, locked: false },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        layers: [{ id: "a", name: "Layer", visible: true, locked: false, opacity: 255, flags: 3 }],
        frames: [
          { duration: 100, cels: [{ pixels, x: 1, y: 2, opacity: 255, zIndex: 0 }] },
          { duration: 250, cels: [{ pixels, x: 1, y: 2, opacity: 255, zIndex: 0 }] },
        ],
      },
    });
    const reds = (p) => [...p.data].filter((_, i) => i % 4 === 0);
    assert.deepEqual(canvasBoundsForAnchor(16, 16, 17, 19, 4), {
      x: 0,
      y: -2,
      width: 17,
      height: 19,
    });
    assert.deepEqual(canvasBoundsForAnchor(16, 16, 13, 13, 4), {
      x: 1,
      y: 2,
      width: 13,
      height: 13,
    });
    for (let anchor = 0; anchor < 9; anchor++) {
      const b = canvasBoundsForAnchor(8, 6, 12, 10, anchor);
      assert.equal(b.x, -(anchor % 3) * 2 || 0);
      assert.equal(b.y, -Math.floor(anchor / 3) * 2 || 0);
    }
    let doc = make();
    let original = doc.timeline;
    resizeDocumentCanvas(doc, { x: 3, y: 3, width: 2, height: 2 });
    assert.equal(doc.layer.x, -2);
    assert.equal(doc.layer.pixels, original.frames[0].cels[0].pixels);
    assert.equal(doc.timeline.frames[1].duration, 250);
    doc = make();
    resizeDocumentCanvas(doc, { x: 2, y: 3, width: 3, height: 3 }, true);
    assert.deepEqual(reds(doc.layer.pixels), [4]);
    assert.equal(doc.layer.x, 0);
    assert.equal(doc.timeline.frames[0].cels[0].pixels, doc.timeline.frames[1].cels[0].pixels);
    doc = make();
    resizeDocumentCanvas(doc, { x: 7, y: 5, width: 1, height: 1 }, true);
    assert.equal(doc.timeline.frames[0].cels[0], null);
    doc = make();
    doc.timeline.layers[0].flags |= 8;
    doc.timeline.frames.forEach((f) => {
      f.cels[0].x = 0;
      f.cels[0].y = 0;
    });
    resizeDocumentCanvas(doc, { x: -1, y: -1, width: 4, height: 4 }, false, [10, 20, 30, 0]);
    assert.deepEqual(Array.from(doc.layer.pixels.data.slice(0, 4)), [10, 20, 30, 255]);
    assert.equal(doc.layer.x, 0);
    doc = make();
    resizeDocumentSprite(doc, 16, 12);
    assert.equal(doc.layer.x, 2);
    assert.equal(doc.layer.y, 4);
    assert.deepEqual(reds(doc.layer.pixels), [1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4]);
    assert.equal(doc.timeline.frames[0].cels[0].pixels, doc.timeline.frames[1].cels[0].pixels);
    doc = make();
    rotateDocumentCanvas(doc, 90);
    assert.equal(doc.width, 6);
    assert.equal(doc.height, 8);
    assert.equal(doc.layer.x, 2);
    assert.equal(doc.layer.y, 1);
    assert.deepEqual(reds(doc.layer.pixels), [3, 1, 4, 2]);
    rotateDocumentCanvas(doc, -90);
    assert.deepEqual(reds(doc.layer.pixels), [1, 2, 3, 4]);
    assert.equal(doc.layer.x, 1);
    assert.equal(doc.layer.y, 2);
    doc = make();
    doc.timeline.layers[0].flags |= 64;
    doc.timeline.frames[0].cels[0].preciseBounds = { x: 1.5, y: -1.25, width: 3.5, height: 4.5 };
    const pixels = doc.layer.pixels;
    resizeDocumentSprite(doc, 16, 12);
    assert.equal(doc.layer.pixels, pixels);
    assert.deepEqual(doc.timeline.frames[0].cels[0].preciseBounds, {
      x: 3,
      y: -2.5,
      width: 7,
      height: 9,
    });
    doc = make();
    assert.equal(trimDocumentCanvas(doc), true);
    assert.equal(doc.width, 2);
    assert.equal(doc.height, 2);
    assert.equal(doc.layer.x, 0);
    assert.equal(doc.layer.y, 0);
    doc = make();
    original = doc.timeline;
    assert.throws(() => resizeDocumentSprite(doc, 32768, 32768));
    assert.equal(doc.timeline, original);
    assert.equal(doc.width, 8);
    const bilinear = resizeSpritePixels(image(2, 1, [200, 0]), 3, 1, "bilinear");
    assert.deepEqual([...bilinear.data], [200, 0, 0, 255, 200, 0, 0, 127, 200, 0, 0, 0]);
    console.log(
      "Document sizing verified: anchors, trim, background, links, scaling, rotation, reference bounds, atomic rejection.",
    );

    const exprBundle = await build({
      entryPoints: ["packages/editor-core/src/sprite/document-size-expression.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { evaluateSizeExpression } = await import(
      `data:text/javascript;base64,${Buffer.from(exprBundle.outputFiles[0].contents).toString("base64")}`
    );
    for (const [expression, result] of [
      ["16*2", 32],
      ["(16+8)/2", 12],
      ["2^3^2", 64],
      ["-2^2", 4],
      ["sin(pi/2)*16", 16],
      ["sqrt 16", 4],
      ["ncr(5,2)", 10],
      ["pow(2,4)", 16],
      ["invalid", null],
      ["16+", 16],
      ["1/0", null],
      ["1,2", 2],
    ])
      assert.equal(evaluateSizeExpression(expression), result, expression);
    console.log("Dimension expression grammar verified.");
  }, 60_000);
});
