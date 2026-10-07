import { describe, expect, it } from "vitest";

import { recordedKeysAt, recordedPointerAt } from "$/managers/replay/replay-input";
import {
  decodeReplayRecording,
  encodeReplayRecording,
  ReplayInteractionKind,
  type RecordedReplayPointer,
  type ReplayRecording,
} from "$/managers/replay/replay-recording";
import { EditorPointerPhase, EditorToolId } from "@xprite/editor-core";

const cursor = {
  source: "data:image/svg+xml,%3Csvg%20width%3D%2216%22%20height%3D%2216%22%2F%3E",
  width: 16,
  height: 16,
  hotspot: { x: 3, y: 3 },
};
function pointer(at: number, phase = EditorPointerPhase.Move): RecordedReplayPointer {
  return {
    at,
    phase,
    point: { x: 2, y: 3 },
    pressed: false,
    tool: EditorToolId.Pencil,
    size: 1,
    pressure: 1,
    stroke: 1,
    cursor,
  };
}

describe("recorded input presentation", () => {
  it("keeps the actual idle cursor visible and follows explicit hide/leave states", () => {
    const first = pointer(0);
    expect(recordedPointerAt([first], 5000)?.cursor).toEqual(cursor);
    const hidden = { ...pointer(100), cursor: null };
    expect(recordedPointerAt([first, hidden], 100)).toBeNull();
    const leave = { ...pointer(100, EditorPointerPhase.Leave), point: null };
    expect(recordedPointerAt([first, leave], 100)).toBeNull();
  });
  it("switches the stored artwork/hotspot at the recorded time", () => {
    const second = {
      ...pointer(100),
      tool: EditorToolId.Hand,
      cursor: {
        ...cursor,
        source: cursor.source.replaceAll("%2216%22", "%2232%22"),
        width: 32,
        height: 32,
        hotspot: { x: 7, y: 9 },
      },
    };
    expect(recordedPointerAt([pointer(0), second], 99)?.cursor).toEqual(cursor);
    expect(recordedPointerAt([pointer(0), second], 100)?.cursor).toEqual(second.cursor);
  });
  it("shows only past key events and expires them without moving the drawing clock", () => {
    const keys = [{ at: 100, kind: ReplayInteractionKind.Shortcut, target: null, keys: "Ctrl+Z" }];
    expect(recordedKeysAt(keys, 99)).toBeNull();
    expect(recordedKeysAt(keys, 100)).toBe("Ctrl+Z");
    expect(recordedKeysAt(keys, 1601)).toBeNull();
  });
  it("preserves cursor appearance in portable files and rejects oversized descriptors", () => {
    const tape: ReplayRecording = {
      name: "test",
      duration: 100,
      interactions: [],
      pointers: [pointer(0)],
      frames: [
        {
          at: 0,
          data: new Uint8Array([1]),
          editorChanged: true,
          editorKeyframe: true,
          pixelsKeyframe: true,
          panels: [],
          timelineVisible: true,
        },
      ],
    };
    expect(decodeReplayRecording(encodeReplayRecording(tape)).pointers[0].cursor).toEqual(cursor);
    tape.pointers[0].cursor = { ...cursor, width: 10000 };
    expect(() => decodeReplayRecording(encodeReplayRecording(tape))).toThrow();
  });
});
