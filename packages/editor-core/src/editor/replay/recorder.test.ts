import { describe, expect, it } from "vitest";

import { RasterEditor } from "$/editor/RasterEditor";
import { ReplayStreamReader } from "$/editor/replay/reader";
import { EditorReplayRecorder } from "$/editor/replay/recorder";

function editor() {
  return new RasterEditor({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) });
}

describe("core replay capture", () => {
  it("ignores pointer-only publications and preserves in-progress ink and undo", () => {
    const core = editor();
    const recorder = new EditorReplayRecorder(core);
    const frames = [recorder.capture()!];
    core.pointerMove({ x: 1, y: 1 });
    expect(recorder.capture()).toBeNull();
    core.pointerDown({ x: 1, y: 1 });
    core.pointerMove({ x: 3, y: 1 });
    frames.push(recorder.capture()!);
    const ink = structuredClone(new ReplayStreamReader(frames).read(1));
    core.pointerUp();
    core.history.undo();
    frames.push(recorder.capture()!);
    const undone = new ReplayStreamReader(frames).read(2);
    expect(ink.pixels.data[(1 * 8 + 3) * 4 + 3]).toBe(255);
    expect(undone.pixels.data.every((value) => value === 0)).toBe(true);
    expect(ink.pixels.data[(1 * 8 + 3) * 4 + 3]).toBe(255);
  });

  it("ignores saves and captures a replacement source on the same stream", () => {
    const first = editor();
    const recorder = new EditorReplayRecorder(first);
    const frames = [recorder.capture()!];
    first.history.markSaved("saved.aseprite", "aseprite");
    expect(recorder.observeEdit()).toBe(false);
    expect(recorder.capture()).toBeNull();
    const second = editor();
    second.pointerDown({ x: 5, y: 5 });
    second.pointerUp();
    recorder.setSource(second);
    frames.push(recorder.capture()!);
    const reader = new ReplayStreamReader(frames);
    expect(reader.read(1).pixels.data[(5 * 8 + 5) * 4 + 3]).toBe(255);
    expect(reader.read(0).pixels.data.every((value) => value === 0)).toBe(true);
  });
});
