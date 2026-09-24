import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("timeline-interactions", () => {
  it("timeline-interactions behavior", async () => {
    const b = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      transferTimelineRange,
      timelineTags,
      asepriteFromProject,
      advanceTimelinePlaybackWithRepeats,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(b.outputFiles[0].contents).toString("base64")}`
    );
    const pixel = (value) => ({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([value, 0, 0, 255]),
    });
    const cel = (value) => ({ pixels: pixel(value), x: 0, y: 0, opacity: 255, zIndex: 0 });
    const t = {
      layers: [
        { id: "one", name: "One", visible: true, locked: false, opacity: 255, flags: 3 },
        { id: "two", name: "Two", visible: true, locked: false, opacity: 255, flags: 3 },
      ],
      frames: [10, 20, 30, 40].map((v, i) => ({ duration: 100 + i, cels: [cel(v), cel(v + 1)] })),
      activeFrame: 0,
      activeLayer: 0,
    };
    const r = { kind: "cels", frames: [0, 1], layers: [0] };
    const moved = transferTimelineRange(t, r, 1, 0, false);
    assert.deepEqual(
      moved.frames.map((f) => f.cels[0]?.pixels.data[0] ?? null),
      [null, 10, 20, 40],
      "overlap-safe move",
    );
    assert.equal(t.frames[0].cels[0].pixels.data[0], 10, "source immutable");
    const copied = transferTimelineRange(t, r, 1, 1, true);
    assert.equal(copied.frames[1].cels[1].pixels.data[0], 10);
    assert.notEqual(copied.frames[1].cels[1].pixels, t.frames[0].cels[0].pixels);
    const linked = {
      ...t,
      frames: t.frames.map((f) => ({ ...f, cels: [t.frames[0].cels[0], f.cels[1]] })),
    };
    const linkedCopy = transferTimelineRange(linked, r, 1, 1, true);
    assert.equal(linkedCopy.frames[1].cels[1].pixels, linkedCopy.frames[2].cels[1].pixels);
    assert.notEqual(linkedCopy.frames[1].cels[1].pixels, linked.frames[0].cels[0].pixels);
    assert.equal(
      transferTimelineRange(
        { ...t, layers: t.layers.map((l) => ({ ...l, locked: true })) },
        r,
        1,
        0,
        false,
      ).frames,
      t.frames,
    );
    assert.equal(transferTimelineRange(t, r, -1, 0, false), t);
    const frameRange = { kind: "frames", frames: [0, 1], layers: [0, 1] };
    const reordered = transferTimelineRange(t, frameRange, 2, 0, false);
    assert.deepEqual(
      reordered.frames.map((f) => f.duration),
      [102, 103, 100, 101],
    );
    const e = new RasterEditor();
    e.document.loadTimeline(t, 1, 1, "Range.aseprite");
    e.history.markSaved();
    e.timeline.setTimelineRange(frameRange);
    assert.equal(e.getSnapshot().dirty, false);
    e.timeline.transferTimelineRange(frameRange, 2, 0);
    assert.deepEqual(
      e.getSnapshot().document.timeline.frames.map((f) => f.duration),
      [102, 103, 100, 101],
    );
    e.history.undo();
    assert.deepEqual(
      e.getSnapshot().document.timeline.frames.map((f) => f.duration),
      [100, 101, 102, 103],
    );
    e.history.redo();
    assert.deepEqual(
      e.getSnapshot().document.timeline.frames.map((f) => f.duration),
      [102, 103, 100, 101],
    );
    e.timeline.setFrameDuration(250);
    assert.deepEqual(
      e.getSnapshot().document.timeline.frames.map((f) => f.duration),
      [102, 103, 250, 250],
    );
    e.history.undo();
    e.timeline.clearTimelineRange({ kind: "frames", frames: [0, 2], layers: [0, 1] });
    assert.equal(e.getSnapshot().document.timeline.frames.length, 2);
    e.history.undo();
    assert.equal(e.getSnapshot().document.timeline.frames.length, 4);
    e.timeline.setAnimationTag(0, {
      from: 0,
      to: 2,
      name: "Run",
      direction: "ping-pong",
      repeat: 2,
      color: [12, 34, 56, 255],
    });
    assert.equal(timelineTags(e.getSnapshot().document.timeline)[0].name, "Run");
    assert.equal(
      asepriteFromProject({
        image: e.canvas.composite(),
        timeline: e.getSnapshot().document.timeline,
      }).tags[0].name,
      "Run",
    );
    e.history.undo();
    assert.equal(timelineTags(e.getSnapshot().document.timeline).length, 0);
    e.history.redo();
    assert.equal(timelineTags(e.getSnapshot().document.timeline)[0].direction, "ping-pong");
    const frames = [0, 1, 2].map(() => ({ duration: 100, cels: [] }));
    let state = { frame: 0, elapsed: 0, cycles: 0, phase: undefined };
    const seen = [];
    for (let i = 0; i < 8; i++) {
      state = advanceTimelinePlaybackWithRepeats(
        frames,
        state.frame,
        state.elapsed,
        100,
        { from: 0, to: 2, direction: "ping-pong" },
        state.cycles,
        state.phase,
      );
      seen.push(state.frame);
    }
    assert.deepEqual(seen, [1, 2, 1, 0, 1, 2, 1, 0]);
    assert.equal(
      advanceTimelinePlaybackWithRepeats(frames, 2, 0, 100, {
        from: 0,
        to: 2,
        direction: "reverse",
      }).frame,
      1,
    );
    console.log(
      "Range overlap, copy/link identity, bounds/locks, frame reorder, batch duration/delete, undo/redo, tag export and directional playback pass.",
    );
  }, 60_000);
});
