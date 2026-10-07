import { describe, expect, it } from "vitest";

import { ReplayInteractionKind } from "$/managers/replay/replay-recording";
import {
  decodeReplayRecording,
  encodeReplayRecording,
  replayFrameAt,
  type ReplayRecording,
} from "$/managers/replay/replay-recording";

function recording(): ReplayRecording {
  return {
    name: "drawing",
    duration: 300,
    frames: [
      {
        at: 0,
        data: new Uint8Array([1]),
        editorChanged: true,
        editorKeyframe: true,
        pixelsKeyframe: true,
        timelineVisible: true,
        panels: [],
      },
      {
        at: 100,
        data: new Uint8Array([2]),
        editorChanged: false,
        editorKeyframe: false,
        pixelsKeyframe: false,
        timelineVisible: false,
        panels: [],
      },
      {
        at: 300,
        data: new Uint8Array([3]),
        editorChanged: true,
        editorKeyframe: false,
        pixelsKeyframe: false,
        timelineVisible: true,
        panels: [],
      },
    ],
    pointers: [],
    interactions: [{ at: 100, kind: ReplayInteractionKind.Shortcut, target: null, keys: "Ctrl+Z" }],
  };
}

describe("portable replay files", () => {
  it("round-trips frames, presentation state, timestamps and semantic shortcuts", () => {
    expect(decodeReplayRecording(encodeReplayRecording(recording()))).toEqual(recording());
  });
  it("seeks to the last available frame without taking an action from the future", () => {
    const frames = recording().frames;
    expect(replayFrameAt(frames, 0)).toBe(0);
    expect(replayFrameAt(frames, 99)).toBe(0);
    expect(replayFrameAt(frames, 100)).toBe(1);
    expect(replayFrameAt(frames, 300)).toBe(2);
  });
  it("rejects incomplete payloads and trailing unrecognized data", () => {
    const bytes = encodeReplayRecording(recording());
    expect(() => decodeReplayRecording(bytes.subarray(0, bytes.length - 1))).toThrow();
    const extended = new Uint8Array(bytes.length + 1);
    extended.set(bytes);
    expect(() => decodeReplayRecording(extended)).toThrow();
  });
  it("rejects frames that precede earlier frames or exceed the duration", () => {
    const invalid = recording();
    invalid.frames[1].at = 301;
    expect(() => decodeReplayRecording(encodeReplayRecording(invalid))).toThrow();
    invalid.frames[1].at = 200;
    invalid.frames[2].at = 150;
    expect(() => decodeReplayRecording(encodeReplayRecording(invalid))).toThrow();
  });
});
