import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { AsepriteTagDirection, type AsepriteTag } from "$/import-export/aseprite/model";
import { defaultPlaybackSettings } from "$/timeline/animation-options";
import { TimelineController, type TimelineControllerPort } from "$/timeline/controller";
import type { SpriteTimeline, TimelineRange } from "$/timeline/types";

function createTimeline(): SpriteTimeline {
  return {
    activeFrame: 0,
    activeLayer: 0,
    layers: [
      { id: "layer-1", name: "Layer 1", visible: true, locked: false, opacity: 255, flags: 3 },
    ],
    frames: [
      { duration: 100, cels: [null] },
      { duration: 100, cels: [null] },
    ],
    tags: [],
    range: { kind: "frames", frames: [0, 1], layers: [0] },
  };
}

function createController() {
  let timeline = createTimeline();
  let playbackOptions = { ...defaultPlaybackSettings };
  let canResolve = true;
  const calls: { type: string; value?: unknown }[] = [];
  const port: TimelineControllerPort = {
    getTimeline: () => timeline,
    getPlaybackOptions: () => playbackOptions,
    setPlaybackOptions: (options) => {
      playbackOptions = options;
      calls.push({ type: "setPlaybackOptions", value: options });
    },
    resolvePendingEdits: () => canResolve,
    updateTimelineState: (next, options) => {
      timeline = next;
      calls.push({ type: "updateTimelineState", value: options });
    },
    commitTimeline: (label, change, activateSelection) => {
      timeline = change(timeline);
      calls.push({ type: "commitTimeline", value: { label, activateSelection } });
    },
    commitLayerTimeline: (label, change) => {
      timeline = change(timeline, { width: 8, height: 8 });
      calls.push({ type: "commitLayerTimeline", value: label });
    },
    activateCel: (frame, layer, clearRange) => {
      timeline = {
        ...timeline,
        activeFrame: frame,
        activeLayer: layer,
        ...(clearRange ? { range: undefined } : {}),
      };
      calls.push({ type: "activateCel", value: { frame, layer, clearRange } });
    },
    setRange: (range: TimelineRange | undefined) => {
      timeline = { ...timeline, range };
      calls.push({ type: "setRange", value: range });
    },
    setStatusReady: () => calls.push({ type: "setStatusReady" }),
    publish: (pixelsChanged) => calls.push({ type: "publish", value: pixelsChanged }),
  };
  const controller = new TimelineController(port);
  return {
    controller,
    calls,
    get timeline() {
      return timeline;
    },
    get playbackOptions() {
      return playbackOptions;
    },
    setCanResolve(value: boolean) {
      canResolve = value;
    },
    setTimeline(value: SpriteTimeline) {
      timeline = value;
    },
  };
}

describe("timeline-controller", () => {
  it("clears a timeline range once without republishing each subsequent canvas press", () => {
    const test = createController();
    test.controller.setTimelineRange(undefined);

    assert.equal(test.timeline.range, undefined);
    assert.deepEqual(test.calls, [
      { type: "setRange", value: undefined },
      { type: "publish", value: false },
    ]);

    const cleared = test.timeline;
    test.calls.length = 0;
    test.controller.setTimelineRange(undefined);

    assert.equal(test.timeline, cleared);
    assert.deepEqual(test.calls, []);
  });

  it("selects frames through the editor port and clears timeline range", () => {
    const test = createController();
    test.controller.selectFrame(1);

    assert.equal(test.timeline.activeFrame, 1);
    assert.equal(test.timeline.range, undefined);
    assert.deepEqual(test.calls, [
      { type: "activateCel", value: { frame: 1, layer: 0, clearRange: true } },
      { type: "setStatusReady" },
      { type: "publish", value: true },
    ]);
  });

  it("advances the preview clock without creating document history", () => {
    const test = createController();
    test.controller.setPlaying(true);
    assert.equal(test.controller.isPlaying(), true);
    test.controller.advancePlayback(100);

    assert.equal(test.timeline.activeFrame, 1);
    assert.deepEqual(test.calls, [
      { type: "publish", value: true },
      { type: "activateCel", value: { frame: 1, layer: 0, clearRange: false } },
      { type: "publish", value: true },
    ]);
    test.controller.setPlaying(false);
    assert.equal(test.controller.isPlaying(), false);
  });

  it("does not start playback while pending editor work cannot be resolved", () => {
    const test = createController();
    test.setCanResolve(false);
    test.controller.setPlaying(true);

    assert.equal(test.controller.isPlaying(), false);
    assert.deepEqual(test.calls, []);
  });

  it("normalizes playback settings before publishing them to the editor", () => {
    const test = createController();
    test.controller.setPlaybackOptions({ speed: Number.NaN });

    assert.equal(test.playbackOptions.speed, 1);
    assert.deepEqual(test.calls, [
      {
        type: "setPlaybackOptions",
        value: { ...defaultPlaybackSettings, speed: 1 },
      },
    ]);
  });

  it("adds and removes frames through one timeline edit", () => {
    const test = createController();
    const pixels = { width: 1, height: 1, data: Uint8ClampedArray.of(1, 2, 3, 255) };
    const cel = { pixels, x: 0, y: 0, opacity: 255, zIndex: 0 };
    test.setTimeline({
      ...test.timeline,
      frames: [
        { duration: 100, cels: [cel] },
        { duration: 100, cels: [null] },
      ],
    });

    test.controller.addFrame();
    assert.equal(test.timeline.frames.length, 3);
    assert.equal(test.timeline.activeFrame, 1);
    assert.notEqual(test.timeline.frames[1].cels[0]?.pixels, pixels);
    assert.notEqual(test.timeline.frames[1].cels[0]?.pixels.data, pixels.data);
    assert.deepEqual(test.calls[0], {
      type: "commitTimeline",
      value: { label: "New Frame", activateSelection: true },
    });

    test.setTimeline({ ...test.timeline, activeFrame: 2, range: undefined });
    test.controller.deleteFrame();
    assert.equal(test.timeline.frames.length, 2);
    assert.equal(test.timeline.activeFrame, 1);
    assert.deepEqual(test.calls[1], {
      type: "commitTimeline",
      value: { label: "Remove Frame", activateSelection: true },
    });
  });

  it("refuses to clear a range that contains every frame", () => {
    const test = createController();
    test.controller.deleteFrame();

    assert.equal(test.timeline.frames.length, 2);
    assert.deepEqual(test.calls, []);
  });

  it("changes the selected frame durations in one timeline edit", () => {
    const test = createController();
    test.controller.setFrameDuration(175);

    assert.deepEqual(
      test.timeline.frames.map((frame) => frame.duration),
      [175, 175],
    );
    assert.deepEqual(test.calls, [
      {
        type: "commitTimeline",
        value: { label: "Frame Duration", activateSelection: false },
      },
    ]);
  });

  it("toggles a Loop tag from the selected frame range", () => {
    const test = createController();
    const tag: AsepriteTag = {
      name: "Loop",
      from: 0,
      to: 1,
      direction: AsepriteTagDirection.Forward,
      repeat: 0,
      color: [0, 0, 0, 255],
    };

    assert.equal(test.controller.setLoopSection(), false);
    assert.deepEqual(test.timeline.tags, [tag]);
    assert.equal(test.controller.setLoopSection(), true);
    test.setTimeline({ ...test.timeline, range: undefined });
    assert.equal(test.controller.setLoopSection(), false);
    assert.deepEqual(test.timeline.tags, []);
  });

  it("updates layer flags with their existing pixel publication policies", () => {
    const test = createController();
    test.setTimeline({
      ...test.timeline,
      layers: [{ ...test.timeline.layers[0], kind: "group", flags: 3 }],
    });

    test.controller.setLayerCollapsed(true);
    test.controller.setLayerVisible(false);
    test.controller.setLayerLocked(true);
    test.controller.setLayerContinuous(true);
    assert.equal(test.timeline.layers[0].flags, 48);
    assert.equal(test.timeline.layers[0].visible, false);
    assert.equal(test.timeline.layers[0].locked, true);
    assert.deepEqual(test.calls, [
      { type: "updateTimelineState", value: { activateCel: false, pixelsChanged: false } },
      { type: "updateTimelineState", value: { activateCel: true, pixelsChanged: true } },
      { type: "updateTimelineState", value: { activateCel: true, pixelsChanged: false } },
      { type: "updateTimelineState", value: { activateCel: false, pixelsChanged: false } },
    ]);

    test.controller.setAllLayersVisible(true);
    test.controller.setAllLayersLocked(false);
    test.controller.setAllLayersContinuous(false);
    assert.equal(test.timeline.layers[0].flags, 35);
    assert.deepEqual(test.calls.slice(-3), [
      { type: "updateTimelineState", value: { activateCel: true, pixelsChanged: true } },
      { type: "updateTimelineState", value: { activateCel: true, pixelsChanged: false } },
      { type: "updateTimelineState", value: { activateCel: false, pixelsChanged: false } },
    ]);
  });

  it("owns layer creation, property updates and deletion as layer edits", () => {
    const test = createController();
    test.controller.addLayer("Ink");
    assert.equal(test.timeline.layers.length, 2);
    assert.equal(test.timeline.layers[test.timeline.activeLayer].name, "Ink");
    assert.equal(test.calls[0].type, "commitLayerTimeline");
    assert.equal(test.calls[0].value, "New Layer");

    test.controller.setLayerProperties({ name: "Color", opacity: 128, blendMode: 3 });
    assert.equal(test.timeline.layers[test.timeline.activeLayer].name, "Color");
    assert.equal(test.timeline.layers[test.timeline.activeLayer].opacity, 128);
    assert.equal(test.timeline.layers[test.timeline.activeLayer].blendMode, 3);

    test.controller.deleteLayer();
    assert.equal(test.timeline.layers.length, 1);
    assert.equal(test.timeline.activeLayer, 0);
    assert.deepEqual(
      test.calls.map((call) => call.value),
      ["New Layer", "Edit Layer", "Remove Layer"],
    );
  });
});
