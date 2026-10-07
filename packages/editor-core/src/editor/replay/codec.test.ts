import { describe, expect, it } from "vitest";

import { EditorPresentationView } from "$/editor/presentation-view";
import { RasterEditor } from "$/editor/RasterEditor";
import { decodeReplayFrame, encodeReplayFrame } from "$/editor/replay/codec";

function editor() {
  return new RasterEditor(
    { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) },
    "drawing",
  );
}
function frame(core: RasterEditor) {
  return { snapshot: core.getSnapshot(), pixels: core.canvas.previewComposite() };
}

describe("drawing replay frames", () => {
  it("detaches pixels at capture time and retains shared cel buffers on decode", () => {
    const core = editor();
    core.pointerDown({ x: 1, y: 1 });
    core.pointerUp();
    const recorded = frame(core);
    const bytes = encodeReplayFrame(recorded);
    const before = new Uint8ClampedArray(recorded.pixels.data);
    core.pointerDown({ x: 5, y: 5 });
    core.pointerUp();
    const decoded = decodeReplayFrame(bytes);
    expect(decoded.pixels.data).toEqual(before);
    const document = decoded.snapshot.document!;
    expect(document.layer.pixels.data).toBe(document.timeline!.frames[0].cels[0]!.pixels.data);
  });

  it("captures a stroke before its history transaction is committed", () => {
    const core = editor();
    core.pointerDown({ x: 1, y: 1 });
    core.pointerMove({ x: 3, y: 1 });
    const during = decodeReplayFrame(encodeReplayFrame(frame(core)));
    core.pointerMove({ x: 6, y: 1 });
    core.pointerUp();
    expect(during.pixels.data[(1 * 8 + 3) * 4 + 3]).toBe(255);
    expect(during.pixels.data[(1 * 8 + 6) * 4 + 3]).toBe(0);
  });

  it("preserves erased pixels and undo rather than reconstructing only the final artwork", () => {
    const core = editor();
    core.pointerDown({ x: 2, y: 2 });
    core.pointerUp();
    const painted = encodeReplayFrame(frame(core));
    core.history.undo();
    const undone = encodeReplayFrame(frame(core));
    expect(decodeReplayFrame(painted).pixels.data[(2 * 8 + 2) * 4 + 3]).toBe(255);
    expect(decodeReplayFrame(undone).pixels.data[(2 * 8 + 2) * 4 + 3]).toBe(0);
  });

  it("presents recorded preview pixels without modifying the source or recording graph", () => {
    const source = editor();
    source.drawing.settings.setSettings({ tool: "line" });
    source.pointerDown({ x: 1, y: 1 });
    source.pointerMove({ x: 6, y: 1 });
    const recorded = decodeReplayFrame(encodeReplayFrame(frame(source)));
    const revision = source.getSnapshot().revision;
    const replay = new EditorPresentationView();
    replay.present(recorded.snapshot, recorded.pixels, { zoom: 2 });
    expect(replay.canvas.previewComposite().data).toEqual(recorded.pixels.data);
    replay.canvas.setView({ zoom: 4 });
    expect(recorded.snapshot.view.zoom).not.toBe(4);
    expect(source.getSnapshot().revision).toBe(revision);
    expect(replay.getCommittedPersistenceSnapshot()).toBeNull();
  });

  it("rejects truncated compressed frames", () => {
    expect(() => decodeReplayFrame(new Uint8Array([1, 2, 3]))).toThrow();
  });
});

it("observes document-space pen contact without adding history commands", () => {
  const source = editor();
  const samples: { phase: string; pressed: boolean; x: number | null }[] = [];
  const stop = source.subscribePointer((sample) =>
    samples.push({ phase: sample.phase, pressed: sample.pressed, x: sample.point?.x ?? null }),
  );
  source.pointerDown({ x: 1.25, y: 1.5, pressure: 0.4 });
  source.pointerMove({ x: 3.75, y: 1.5, pressure: 0.6 });
  source.pointerUp();
  expect(samples.map((sample) => sample.phase)).toEqual(["down", "move", "up"]);
  expect(samples.map((sample) => sample.pressed)).toEqual([true, true, false]);
  expect(samples[1].x).toBe(3.75);
  stop();
  source.history.undo();
  expect(source.canvas.previewComposite().data.every((value) => value === 0)).toBe(true);
});
