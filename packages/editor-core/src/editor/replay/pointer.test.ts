import { describe, expect, it } from "vitest";

import { EditorToolId } from "$/drawing/tool-settings";
import { replayPointerAt, type ReplayPointerSample } from "$/editor/replay/pointer";
import { EditorPointerPhase } from "$/editor/types";

function sample(
  at: number,
  x: number,
  phase = EditorPointerPhase.Move,
  pressed = true,
  stroke = 1,
): ReplayPointerSample {
  return {
    at,
    stroke,
    phase,
    pressed,
    point: { x, y: 2 },
    tool: EditorToolId.Pencil,
    size: 2,
    pressure: 1,
  };
}

describe("continuous recorded brush motion", () => {
  it("interpolates dense input at the playback clock without inventing a raster", () => {
    const samples = [sample(0, 0, EditorPointerPhase.Down), sample(20, 2), sample(40, 4)];
    expect(replayPointerAt(samples, 10)?.point?.x).toBeCloseTo(1);
    expect(replayPointerAt(samples, 30)?.point?.x).toBeCloseTo(3);
    expect(replayPointerAt(samples, -1)).toBeNull();
  });
  it("does not draw a connection across a pen lift, a new stroke or a long pause", () => {
    expect(
      replayPointerAt([sample(0, 0), sample(20, 50, EditorPointerPhase.Up, false)], 10)?.point?.x,
    ).toBe(0);
    expect(
      replayPointerAt([sample(0, 0), sample(20, 50, EditorPointerPhase.Move, true, 2)], 10)?.point
        ?.x,
    ).toBe(0);
    expect(replayPointerAt([sample(0, 0), sample(1000, 50)], 500)?.point?.x).toBe(0);
  });
  it("hides a leaving pointer and fades a lifted stationary brush", () => {
    expect(replayPointerAt([sample(0, 0, EditorPointerPhase.Up, false)], 1000)).toBeNull();
    expect(
      replayPointerAt([{ ...sample(0, 0), phase: EditorPointerPhase.Leave, point: null }], 0),
    ).toBeNull();
  });
  it("does not overshoot sharp turns or stationary axes", () => {
    const samples = [sample(0, 0), sample(20, 10), sample(40, 10), sample(60, 0)];
    for (let at = 20; at <= 40; at++) expect(replayPointerAt(samples, at)?.point?.x).toBe(10);
  });
});
