import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("linked-cels", () => {
  it("linked-cels behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      linkTimelineCels,
      unlinkTimelineCels,
      duplicateTimelineCels,
      asepriteFromProject,
      projectFromAseprite,
      encodeAsepriteSync,
      decodeAsepriteSync,
      resolveShortcut,
      executeEditorCommand,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const pixel = (v) => ({ width: 1, height: 1, data: new Uint8ClampedArray([v, 0, 0, 255]) });
    const cel = (v, x = 0) => ({ pixels: pixel(v), x, y: 0, opacity: 255, zIndex: 0 });
    const layer = {
      id: "image",
      name: "Image",
      visible: true,
      locked: false,
      opacity: 255,
      flags: 3,
    };
    const t = {
      layers: [layer],
      frames: [cel(10, 2), null, cel(30, 5), cel(40, 7)].map((c) => ({ duration: 100, cels: [c] })),
      activeFrame: 0,
      activeLayer: 0,
    };
    const range = { kind: "cels", frames: [0, 1, 2], layers: [0] };
    const linked = linkTimelineCels(t, range);
    assert.equal(linked.frames[1].cels[0].pixels, linked.frames[0].cels[0].pixels);
    assert.equal(linked.frames[2].cels[0].pixels, linked.frames[0].cels[0].pixels);
    assert.equal(linked.frames[2].cels[0].x, 2);
    assert.equal(t.frames[2].cels[0].pixels.data[0], 30, "link does not mutate previous history");
    const detached = unlinkTimelineCels(linked, { kind: "cels", frames: [0, 2], layers: [0] });
    assert.notEqual(detached.frames[0].cels[0].pixels, detached.frames[1].cels[0].pixels);
    assert.notEqual(detached.frames[2].cels[0].pixels, detached.frames[1].cels[0].pixels);
    assert.notEqual(detached.frames[0].cels[0].pixels, detached.frames[2].cels[0].pixels);
    assert.equal(
      linked.frames[0].cels[0].pixels,
      linked.frames[1].cels[0].pixels,
      "unlink does not mutate source",
    );
    const copied = duplicateTimelineCels(
      linked,
      { kind: "cels", frames: [0, 1], layers: [0] },
      false,
    );
    assert.equal(
      copied.frames[2].cels[0].pixels,
      copied.frames[3].cels[0].pixels,
      "source links remain within ordinary copied selection",
    );
    assert.notEqual(
      copied.frames[2].cels[0].pixels,
      copied.frames[0].cels[0].pixels,
      "ordinary copies are independent",
    );
    const forced = duplicateTimelineCels(t, { kind: "cels", frames: [2], layers: [0] }, true);
    assert.equal(
      forced.frames[3].cels[0].pixels,
      forced.frames[2].cels[0].pixels,
      "linked duplicate replaces destination despite discontinuous layer",
    );
    const e = new RasterEditor();
    e.document.loadTimeline(t, 8, 8, "Linked.aseprite");
    e.history.markSaved();
    e.timeline.linkCels(range);
    assert.equal(
      e.getSnapshot().document.timeline.frames[2].cels[0].pixels,
      e.getSnapshot().document.timeline.frames[0].cels[0].pixels,
    );
    e.history.undo();
    assert.equal(e.getSnapshot().document.timeline.frames[2].cels[0].pixels.data[0], 30);
    e.history.redo();
    assert.equal(
      e.getSnapshot().document.timeline.frames[2].cels[0].pixels,
      e.getSnapshot().document.timeline.frames[0].cels[0].pixels,
    );
    e.timeline.unlinkCels({ kind: "cels", frames: [1], layers: [0] });
    assert.notEqual(
      e.getSnapshot().document.timeline.frames[1].cels[0].pixels,
      e.getSnapshot().document.timeline.frames[0].cels[0].pixels,
    );
    e.history.undo();
    const document = e.getSnapshot().document;
    const sprite = asepriteFromProject({
      image: e.canvas.composite(),
      timeline: document.timeline,
    });
    assert.equal(sprite.frames[1].cels[0].type, "linked");
    assert.equal(sprite.frames[2].cels[0].type, "linked");
    const reopened = projectFromAseprite(decodeAsepriteSync(encodeAsepriteSync(sprite)));
    assert.equal(
      reopened.timeline.frames[0].cels[0].pixels,
      reopened.timeline.frames[1].cels[0].pixels,
    );
    assert.equal(
      reopened.timeline.frames[0].cels[0].pixels,
      reopened.timeline.frames[2].cels[0].pixels,
    );
    const painter = new RasterEditor();
    painter.document.loadTimeline(linked, 8, 8, "Paint.aseprite");
    painter.timeline.selectFrame(1);
    painter.drawing.settings.setSettings({ tool: "pencil", foreground: [0, 255, 0, 255] });
    painter.pointerDown({ x: 2, y: 0 });
    painter.pointerUp();
    assert.equal(
      painter.getSnapshot().document.timeline.frames[0].cels[0].pixels,
      painter.getSnapshot().document.timeline.frames[1].cels[0].pixels,
      "painting propagates through link",
    );
    assert.deepEqual(
      Array.from(painter.getSnapshot().document.timeline.frames[0].cels[0].pixels.data.slice(0, 4)),
      [0, 255, 0, 255],
    );
    const locked = { ...t, layers: [{ ...layer, locked: true }] };
    assert.equal(linkTimelineCels(locked, range), locked);
    assert.equal(unlinkTimelineCels(locked, range), locked);
    assert.equal(duplicateTimelineCels(locked, range, true), locked);
    const background = {
      ...t,
      layers: [{ ...layer, flags: 11 }],
      frames: [
        { duration: 100, cels: [cel(10)] },
        { duration: 100, cels: [cel(20)] },
      ],
    };
    const backgroundLinked = linkTimelineCels(background, {
      kind: "cels",
      frames: [0, 1],
      layers: [0],
    });
    assert.equal(
      backgroundLinked.frames[0].cels[0].pixels,
      backgroundLinked.frames[1].cels[0].pixels,
      "editable background cels can link",
    );
    assert.notEqual(
      unlinkTimelineCels(backgroundLinked, { kind: "cels", frames: [1], layers: [0] }).frames[1]
        .cels[0].pixels,
      backgroundLinked.frames[0].cels[0].pixels,
    );
    assert.equal(
      duplicateTimelineCels(background, { kind: "cels", frames: [0], layers: [0] }, true).frames[1]
        .cels[0].pixels,
      background.frames[0].cels[0].pixels,
    );
    const indexedPalette0 = [
        [0, 0, 0, 0],
        [255, 0, 0, 255],
        [0, 0, 255, 255],
      ],
      indexedPalette1 = [
        [0, 0, 0, 0],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
      ];
    const sourceSamplesA = { depth: 8, width: 1, height: 1, data: new Uint8Array([1]) },
      sourceSamplesB = { depth: 8, width: 1, height: 1, data: new Uint8Array([2]) };
    const indexed = {
      ...t,
      colorDepth: 8,
      transparentIndex: 0,
      frames: [
        {
          duration: 100,
          palette: indexedPalette0,
          cels: [{ ...cel(255), asepriteSamples: sourceSamplesA }],
        },
        {
          duration: 100,
          palette: indexedPalette1,
          cels: [{ ...cel(0), asepriteSamples: sourceSamplesB }],
        },
      ],
    };
    const indexedLink = linkTimelineCels(indexed, { kind: "cels", frames: [0, 1], layers: [0] });
    assert.equal(
      indexedLink.frames[0].cels[0].asepriteSamples,
      indexedLink.frames[1].cels[0].asepriteSamples,
    );
    assert.deepEqual(
      [...indexedLink.frames[1].cels[0].pixels.data],
      [0, 255, 0, 255],
      "linked indexed cel uses destination frame palette",
    );
    const indexedSprite = asepriteFromProject({ image: pixel(255), timeline: indexedLink });
    assert.equal(indexedSprite.frames[1].cels[0].type, "linked");
    assert.equal(indexedSprite.frames[0].cels[0].asepritePixels[0], 1);
    const indexedCopy = duplicateTimelineCels(
      indexed,
      { kind: "cels", frames: [0], layers: [0] },
      false,
    );
    assert.notEqual(
      indexedCopy.frames[1].cels[0].asepriteSamples,
      indexedCopy.frames[0].cels[0].asepriteSamples,
    );
    assert.equal(indexedCopy.frames[1].cels[0].asepriteSamples.data[0], 1);
    assert.deepEqual([...indexedCopy.frames[1].cels[0].pixels.data], [0, 255, 0, 255]);
    const empty = { ...t, frames: [{ duration: 100, cels: [null] }] };
    assert.equal(
      duplicateTimelineCels(empty, { kind: "cels", frames: [0], layers: [0] }, true).frames.length,
      2,
      "empty cel duplication extends timeline",
    );
    const shortcutCore = new RasterEditor();
    shortcutCore.document.loadTimeline(t, 8, 8, "Shortcuts.aseprite");
    assert.deepEqual(resolveShortcut({ key: "d", alt: true }), { type: "duplicate-cels" });
    assert.deepEqual(resolveShortcut({ key: "m", alt: true }), { type: "duplicate-linked-cels" });
    const shortcutContext = { scene: "document", viewport: { width: 100, height: 100 } };
    executeEditorCommand(shortcutCore, resolveShortcut({ key: "m", alt: true }), shortcutContext);
    assert.equal(
      shortcutCore.getSnapshot().document.timeline.frames[1].cels[0].pixels,
      shortcutCore.getSnapshot().document.timeline.frames[0].cels[0].pixels,
    );
    console.log(
      "Link, unlink, ordinary/linked duplicate, undo/redo, locked layers, and ASE save/reopen pass.",
    );
  }, 60_000);
});
