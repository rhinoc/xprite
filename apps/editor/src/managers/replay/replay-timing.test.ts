import { describe, expect, it } from "vitest";

import { ReplayTiming } from "$/managers/replay/replay-timing";

describe("replay idle compression", () => {
  const frames = [0, 100, 5100, 5200].map((at) => ({ at }));

  it("retains exact recording time when disabled", () => {
    const timing = new ReplayTiming(frames, 11200, false);
    expect(timing.duration).toBe(11200);
    expect(timing.recordedAt(2600)).toBe(2600);
    expect(timing.playbackAt(2600)).toBe(2600);
  });

  it("compresses long pauses and trailing idle without changing short actions", () => {
    const original = frames.map(({ at }) => at);
    const timing = new ReplayTiming(frames, 11200, true);
    expect(timing.duration).toBe(2200);
    expect(timing.playbackAt(100)).toBe(100);
    expect(timing.playbackAt(5100)).toBe(1100);
    expect(timing.playbackAt(5200)).toBe(1200);
    expect(timing.recordedAt(600)).toBe(2600);
    expect(timing.playbackAt(timing.recordedAt(600))).toBe(600);
    expect(frames.map(({ at }) => at)).toEqual(original);
  });

  it("handles empty, duplicate and out-of-range positions", () => {
    const empty = new ReplayTiming([], 0, true);
    expect(empty.duration).toBe(0);
    expect(empty.recordedAt(100)).toBe(0);
    const timing = new ReplayTiming([{ at: 0 }, { at: 0 }, { at: 5000 }], 5000, true);
    expect(timing.playbackAt(-1)).toBe(0);
    expect(timing.recordedAt(2000)).toBe(5000);
    expect(timing.duration).toBe(1000);
  });
});
