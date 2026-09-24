import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-persistence", () => {
  it("editor-persistence behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const blank = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    const editor = new RasterEditor(blank, "Recovery");
    const revision = () => editor.getSnapshot().persistenceRevision;
    const paint = (x = 2) => {
      editor.pointerDown({ x, y: 2 });
      editor.pointerUp();
    };
    const interrupted = new RasterEditor(blank, "Interrupted");
    interrupted.drawing.settings.setSettings({ foreground: [255, 0, 0, 255] });
    const interruptedRevision = interrupted.getSnapshot().persistenceRevision;
    interrupted.pointerDown({ x: 1, y: 1 });
    interrupted.pointerMove({ x: 5, y: 1 });
    const inProgressPixels = interrupted.canvas.composite().data.slice();
    assert.equal(
      interrupted.finishInterruptedStroke(),
      true,
      "browser interruption finishes applied ink",
    );
    assert.deepEqual(
      interrupted.canvas.composite().data,
      inProgressPixels,
      "capture loss keeps the visible stroke",
    );
    assert.equal(
      interrupted.getSnapshot().persistenceRevision,
      interruptedRevision + 1,
      "interrupted stroke reaches recovery",
    );
    assert.equal(interrupted.getSnapshot().canUndo, true);
    interrupted.history.undo();
    assert.ok(
      interrupted.canvas.composite().data.every((value) => value === 0),
      "interrupted stroke is one undo entry",
    );
    interrupted.pointerDown({ x: 2, y: 2 });
    interrupted.pointerMove({ x: 4, y: 2 });
    interrupted.cancelPointerGesture();
    assert.ok(
      interrupted.canvas.composite().data.every((value) => value === 0),
      "explicit cancel still rolls back ink",
    );
    const marquee = new RasterEditor(blank, "Marquee interruption");
    marquee.drawing.settings.setSettings({ tool: "marquee" });
    const marqueeRevision = marquee.getSnapshot().persistenceRevision;
    marquee.pointerDown({ x: 1, y: 1, screen: { x: 10, y: 10 }, timeStamp: 0 });
    marquee.pointerMove({ x: 5, y: 5, screen: { x: 50, y: 50 }, timeStamp: 100 });
    assert.ok(
      marquee.selection.preview(),
      "the user can see the active marquee before interruption",
    );
    assert.equal(
      marquee.finishInterruptedGesture(),
      true,
      "capture loss finishes a visible marquee drag",
    );
    assert.deepEqual(
      [
        marquee.getSnapshot().document.selection.x,
        marquee.getSnapshot().document.selection.y,
        marquee.getSnapshot().document.selection.width,
        marquee.getSnapshot().document.selection.height,
      ],
      [1, 1, 5, 5],
    );
    assert.equal(
      marquee.getSnapshot().persistenceRevision,
      marqueeRevision,
      "selection-only commit does not trigger autosave",
    );
    marquee.pointerDown({ x: 7, y: 7, screen: { x: 70, y: 70 }, timeStamp: 200 });
    marquee.pointerMove({ x: 7, y: 8, screen: { x: 71, y: 71 }, timeStamp: 230 });
    assert.equal(marquee.finishInterruptedGesture(), false, "a tiny movement is still cancellable");
    marquee.cancelPointerGesture();
    assert.equal(
      marquee.getSnapshot().document.selection.width,
      5,
      "explicit cancellation retains the committed mask",
    );
    const branchedSelection = new RasterEditor(blank, "Selection branch");
    branchedSelection.selection.selectAll();
    branchedSelection.history.markSaved();
    branchedSelection.history.undo();
    const branchRevision = branchedSelection.getSnapshot().persistenceRevision;
    branchedSelection.drawing.settings.setSettings({ tool: "marquee" });
    branchedSelection.pointerDown({ x: 1, y: 1, screen: { x: 10, y: 10 }, timeStamp: 0 });
    branchedSelection.pointerMove({ x: 5, y: 5, screen: { x: 50, y: 50 }, timeStamp: 100 });
    branchedSelection.pointerUp({ x: 5, y: 5, screen: { x: 50, y: 50 }, timeStamp: 120 });
    assert.equal(
      branchedSelection.getSnapshot().persistenceRevision,
      branchRevision + 1,
      "discarding a saved redo state can schedule a checkpoint even for a selection-only branch",
    );
    assert.ok(
      branchedSelection.getSnapshot().document.selection,
      "that checkpoint does not erase the live selection",
    );
    interrupted.drawing.settings.setSettings({ tool: "line" });
    interrupted.pointerDown({ x: 1, y: 1 });
    interrupted.pointerMove({ x: 5, y: 1 });
    assert.equal(
      interrupted.finishInterruptedStroke(),
      false,
      "an uncommitted shape preview stays cancellable",
    );
    interrupted.cancelPointerGesture();
    let before = revision();
    editor.canvas.setView({ zoom: 2 });
    editor.pointerMove({ x: 4, y: 4 });
    editor.drawing.settings.setSettings({ foreground: [255, 0, 0, 255] });
    assert.equal(revision(), before, "view/pointer/settings do not schedule recovery");
    editor.pointerDown({ x: 2, y: 2 });
    editor.pointerMove({ x: 3, y: 2 });
    assert.equal(revision(), before);
    assert.ok(
      editor.getPersistenceSnapshot().document.layer.pixels.data.every((v) => !v),
      "live stroke snapshots recover the prior commit",
    );
    editor.cancelPointerGesture();
    assert.equal(revision(), before, "cancel does not commit partial pixels");
    paint();
    assert.equal(revision(), before + 1);
    const painted = editor.getPersistenceSnapshot();
    assert.equal(painted.dirty, true);
    assert.equal(painted.document.id, undefined);
    paint(4);
    assert.notDeepEqual(
      editor.getPersistenceSnapshot(),
      painted,
      "snapshot is detached from subsequent painting",
    );
    const owned = editor.getPersistenceSnapshot();
    owned.document.layer.pixels.data.fill(0);
    assert.ok(
      editor.getPersistenceSnapshot().document.layer.pixels.data.some(Boolean),
      "caller mutation cannot corrupt checkpoint",
    );
    before = revision();
    editor.history.undo();
    editor.history.redo();
    assert.equal(revision(), before + 2);
    editor.history.markSaved();
    for (const change of [
      () => editor.timeline.setLayerVisible(false),
      () => editor.timeline.setLayerLocked(true),
      () => editor.timeline.setLayerContinuous(true),
    ]) {
      before = revision();
      change();
      assert.equal(revision(), before + 1);
      assert.equal(
        editor.getPersistenceSnapshot().dirty,
        false,
        "non-history flags retain external dirty semantics",
      );
    }
    editor.timeline.setLayerVisible(true);
    editor.timeline.setLayerLocked(false);
    for (const change of [
      () => editor.timeline.renameLayer("Pixels"),
      () => editor.color.setPalette([[1, 2, 3, 255]]),
      () => editor.timeline.addFrame(),
      () => editor.timeline.setFrameDuration(250),
      () =>
        editor.timeline.setAnimationTag(0, {
          from: 0,
          to: 1,
          name: "Loop",
          direction: "forward",
          repeat: 0,
          color: [2, 3, 4, 255],
          userData: { properties: new Uint8Array([7, 8]) },
        }),
    ]) {
      before = revision();
      change();
      assert.ok(revision() > before);
    }
    const checkpoint = editor.getPersistenceSnapshot();
    assert.equal(
      checkpoint.document.timeline.frames[0].cels[0].pixels,
      checkpoint.document.timeline.frames[1].cels[0].pixels,
      "linked images remain linked",
    );
    before = revision();
    editor.timeline.selectFrame(0);
    editor.timeline.setPlaying(true);
    editor.timeline.advancePlayback(120);
    editor.timeline.setPlaying(false);
    editor.timeline.setTimelineRange({ kind: "frames", frames: [0], layers: [0] });
    assert.equal(revision(), before, "navigation/playback/ranges are not content");
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerMove({ x: 3, y: 3 });
    editor.pointerUp();
    editor.selection.deselect();
    editor.history.undo();
    editor.history.redo();
    assert.equal(revision(), before, "selection-only commits/undo/redo are not content");
    const runtimeId = editor.getSnapshot().document.id;
    editor.restorePersistenceSnapshot(checkpoint);
    assert.notEqual(editor.getSnapshot().document.id, runtimeId);
    assert.equal(editor.getSnapshot().dirty, true);
    assert.equal(editor.getSnapshot().canUndo, false);
    const restored = editor.getPersistenceSnapshot();
    assert.deepEqual(restored, checkpoint);
    assert.equal(
      restored.document.timeline.frames[0].cels[0].pixels,
      restored.document.timeline.frames[1].cels[0].pixels,
    );
    checkpoint.document.timeline.tags[0].userData.properties[0] = 99;
    assert.equal(
      editor.getPersistenceSnapshot().document.timeline.tags[0].userData.properties[0],
      7,
      "opaque source metadata is detached",
    );
    const unchanged = editor.getSnapshot().document.id;
    assert.throws(() =>
      editor.restorePersistenceSnapshot({
        ...restored,
        document: { ...restored.document, width: -1 },
      }),
    );
    assert.equal(
      editor.getSnapshot().document.id,
      unchanged,
      "invalid restore leaves document intact",
    );
    editor.drawing.settings.setSettings({ tool: "pencil" });
    paint(5);
    editor.history.undo();
    assert.equal(
      editor.getSnapshot().dirty,
      true,
      "undo after restoration cannot erase external dirty state",
    );
    editor.history.markSaved("Saved.aseprite", "aseprite");
    assert.equal(editor.getPersistenceSnapshot().document.name, "Saved.aseprite");
    assert.equal(editor.getPersistenceSnapshot().dirty, false);
    editor.restorePersistenceSnapshot(editor.getPersistenceSnapshot());
    assert.equal(editor.getSnapshot().dirty, false);
    // Cutting a selection changes live pixels before Apply. Recovery must retain
    // the committed artwork until the staged transform is explicitly committed.
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerMove({ x: 4, y: 4 });
    editor.pointerUp();
    before = revision();
    const beforeTransform = editor.getPersistenceSnapshot();
    assert.equal(editor.selection.beginTransform("move", { x: 2, y: 2 }), true);
    editor.pointerMove({ x: 4, y: 4 });
    assert.equal(revision(), before);
    assert.deepEqual(editor.getPersistenceSnapshot(), beforeTransform);
    editor.cancelPointerGesture();
    assert.ok(editor.getSnapshot().floatingPaste, "pointer cancel preserves staged selection");
    assert.equal(editor.getSnapshot().floatingPaste.x, 1);
    editor.clipboard.cancelFloatingPaste();
    assert.equal(revision(), before);
    assert.deepEqual(editor.getPersistenceSnapshot(), beforeTransform);
    const font = {
      height: 1,
      lineHeight: 1,
      glyphs: { X: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) } },
    };
    editor.drawing.settings.setSettings({ font });
    editor.drawing.text.beginTextPaste("X", 1, undefined, { x: 2, y: 2 });
    const paste = editor.getSnapshot().floatingPaste;
    editor.pointerDown({ x: paste.x, y: paste.y });
    editor.pointerMove({ x: paste.x + 2, y: paste.y + 2 });
    editor.cancelPointerGesture();
    assert.equal(editor.getSnapshot().floatingPaste.x, paste.x);
    assert.equal(revision(), before);
    editor.clipboard.commitFloatingPaste();
    assert.ok(revision() > before);
    editor.document.close();
    assert.equal(editor.getPersistenceSnapshot(), null);
    console.log(
      "Recovery core: committed revisions, stroke rollback, detached linked graphs, source metadata, atomic restore and external dirty state pass.",
    );
  }, 60_000);
});
