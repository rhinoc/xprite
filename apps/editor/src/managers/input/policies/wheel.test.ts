import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { BrowserWheelInput } from "$/adapters/input/browser-wheel";
import {
  EditorWheelSurface,
  resolveEditorWheelInput,
  resolveWheelDecision,
  wheelZoomSteps,
  brushSizeAfterWheel,
  wheelCellSizeDelta,
  projectWheelDelta,
} from "$/managers/input/policies/wheel";
import {
  EditorWheelAction,
  EditorWheelInputKind,
  type EditorWheelPolicyInput,
  type EditorWheelPreferences,
} from "$/managers/ports/platform";
import { WheelDevice } from "$/managers/ports/wheel-device";
import { asepriteZoomLevels, stepAsepriteZoom, timelineWheelFrameIndex } from "@xprite/editor-core";

const event = (fields: Partial<WheelEvent> & { wheelDeltaY?: number } = {}) =>
  ({
    deltaX: 0,
    deltaY: 12,
    deltaMode: 0,
    timeStamp: 1,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...fields,
  }) as WheelEvent;

const mouse = { x: 0, y: 1, precise: false };
const trackpad = { ...mouse, precise: true };

describe("shared wheel input", () => {
  it("does not dispatch consumed wheel events to another editor handler", () => {
    const input = new BrowserWheelInput();
    const target = new EventTarget();
    let first = 0;
    let second = 0;
    const disconnectFirst = input.connect(target as HTMLElement, (event) => {
      first++;
      event.preventDefault();
    });
    const disconnectSecond = input.connect(target as HTMLElement, () => second++);
    target.dispatchEvent(new Event("wheel", { cancelable: true }));
    assert.equal(first, 1);
    assert.equal(second, 0);
    disconnectFirst();
    target.dispatchEvent(new Event("wheel", { cancelable: true }));
    assert.equal(second, 1);
    disconnectSecond();
  });

  it("retains the original canvas modifier and preference table", () => {
    const cases: Array<[EditorWheelPolicyInput, EditorWheelPreferences, EditorWheelAction]> = [
      [mouse, {}, EditorWheelAction.Zoom],
      [{ ...mouse, ctrl: true }, {}, EditorWheelAction.Brush],
      [{ ...mouse, ctrl: true, shift: true }, {}, EditorWheelAction.Frame],
      [{ ...mouse, shift: true }, {}, EditorWheelAction.Horizontal],
      [{ ...mouse, alt: true }, {}, EditorWheelAction.Foreground],
      [{ ...mouse, alt: true, shift: true, ctrl: true }, {}, EditorWheelAction.Background],
      [{ ...mouse, x: 1 }, {}, EditorWheelAction.Horizontal],
      [trackpad, {}, EditorWheelAction.Vertical],
      [{ ...trackpad, ctrl: true }, {}, EditorWheelAction.Zoom],
      [{ ...trackpad, shift: true }, {}, EditorWheelAction.Horizontal],
      [trackpad, { zoomWithSlide: true }, EditorWheelAction.Zoom],
      [{ ...trackpad, x: 3 }, { zoomWithSlide: true }, EditorWheelAction.Horizontal],
      [{ ...trackpad, shift: true }, { zoomWithSlide: true }, EditorWheelAction.Vertical],
      [{ ...trackpad, ctrl: true }, { zoomWithSlide: true }, EditorWheelAction.Brush],
      [{ ...trackpad, ctrl: true, shift: true }, { zoomWithSlide: true }, EditorWheelAction.Frame],
      [mouse, { zoomWithWheel: false }, EditorWheelAction.Vertical],
      [{ ...mouse, ctrl: true }, { zoomWithWheel: false }, EditorWheelAction.Zoom],
      [{ ...mouse, alt: true }, { quickZoom: true }, EditorWheelAction.Zoom],
    ];
    for (const [input, preferences, expected] of cases)
      assert.equal(resolveEditorWheelInput(input, preferences), expected);
  });

  it("interprets one physical Ctrl mouse event consistently across surfaces", () => {
    const normalizer = new BrowserWheelInput();
    const input = normalizer.read(
      event({ deltaY: -100, wheelDeltaY: 120, ctrlKey: true }),
      WheelDevice.Auto,
      true,
    );
    assert.equal(input.kind, EditorWheelInputKind.Wheel);
    assert.equal(input.precise, false);
    assert.equal(brushSizeAfterWheel(4, input, { x: 0, y: -100 }), 5);
    assert.equal(brushSizeAfterWheel(64, input, { x: 0, y: -100 }), 64);
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Canvas).action,
      EditorWheelAction.Brush,
    );
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Timeline).action,
      EditorWheelAction.Zoom,
    );
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Palette).action,
      EditorWheelAction.CellSize,
    );
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Canvas, { zoomWithWheel: false }).action,
      EditorWheelAction.Zoom,
    );
  });

  it("keeps synthetic pinch separate from physical modifiers for every device override", () => {
    for (const device of Object.values(WheelDevice)) {
      const normalizer = new BrowserWheelInput();
      for (const deltaY of [-12, -100, -2.5, -120]) {
        const input = normalizer.read(
          event({ deltaY, ctrlKey: true, wheelDeltaY: 120 }),
          device,
          false,
        );
        assert.equal(input.kind, EditorWheelInputKind.Magnify);
        assert.equal(input.precise, true);
        assert.equal(
          resolveWheelDecision(input, EditorWheelSurface.Canvas, { zoomWithSlide: true }).action,
          EditorWheelAction.Zoom,
        );
        assert.equal(
          resolveWheelDecision(input, EditorWheelSurface.Timeline).action,
          EditorWheelAction.Zoom,
        );
        assert.equal(
          resolveWheelDecision(input, EditorWheelSurface.Palette).action,
          EditorWheelAction.CellSize,
        );
      }
      assert.equal(
        normalizer.read(event(), WheelDevice.Auto, false).detected,
        WheelDevice.Trackpad,
        "Pinch does not train the ordinary wheel detector",
      );
    }
  });

  it("shares detector history between regions and classifies a bubbling event once", () => {
    const normalizer = new BrowserWheelInput();
    const first = event();
    const input = normalizer.read(first, WheelDevice.Auto, false);
    for (const surface of Object.values(EditorWheelSurface)) {
      assert.equal(normalizer.read(first, WheelDevice.Auto, false), input);
      resolveWheelDecision(input, surface);
    }
    assert.equal(
      normalizer.read(event({ timeStamp: 2 }), WheelDevice.Auto, false).detected,
      WheelDevice.Trackpad,
      "Repeated reads must not count as additional mouse ticks",
    );
    assert.equal(
      normalizer.read(event({ timeStamp: 3 }), WheelDevice.Auto, false).detected,
      WheelDevice.Mouse,
    );
    const inPalette = normalizer.read(event({ timeStamp: 4 }), WheelDevice.Auto, false);
    assert.equal(inPalette.precise, false, "A region change does not reset known mouse input");
  });

  it("honors explicit devices and precise scrolling preferences", () => {
    const wheel = event({ ctrlKey: true });
    const mouseInput = new BrowserWheelInput().read(wheel, WheelDevice.Mouse, true);
    const trackpadInput = new BrowserWheelInput().read(wheel, WheelDevice.Trackpad, true);
    assert.equal(
      resolveWheelDecision(mouseInput, EditorWheelSurface.Canvas).action,
      EditorWheelAction.Brush,
    );
    assert.equal(
      resolveWheelDecision(trackpadInput, EditorWheelSurface.Canvas).action,
      EditorWheelAction.Zoom,
    );
    assert.equal(
      resolveWheelDecision(trackpadInput, EditorWheelSurface.Canvas, { zoomWithSlide: true })
        .action,
      EditorWheelAction.Brush,
    );
    const alt = new BrowserWheelInput().read(
      event({ ctrlKey: true, altKey: true }),
      WheelDevice.Mouse,
      true,
    );
    assert.equal(
      resolveWheelDecision(alt, EditorWheelSurface.Canvas).action,
      EditorWheelAction.Foreground,
    );
    assert.equal(
      resolveWheelDecision(alt, EditorWheelSurface.Palette).action,
      EditorWheelAction.Vertical,
    );
  });

  it("scopes custom canvas bindings and quick zoom without changing other panels", () => {
    const normalizer = new BrowserWheelInput();
    const input = normalizer.read(event({ deltaMode: 1, deltaY: 3 }), WheelDevice.Auto, false);
    const custom = () => EditorWheelAction.Brush;
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Canvas, {}, custom).action,
      EditorWheelAction.Brush,
    );
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Timeline, {}, custom).action,
      EditorWheelAction.Vertical,
    );
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Palette, {}, custom).action,
      EditorWheelAction.Vertical,
    );
    assert.equal(
      resolveWheelDecision(input, EditorWheelSurface.Canvas, { quickZoom: true }, custom).action,
      EditorWheelAction.Zoom,
    );
    const pinch = normalizer.read(event({ ctrlKey: true }), WheelDevice.Auto, false);
    assert.equal(
      resolveWheelDecision(pinch, EditorWheelSurface.Canvas, {}, custom).action,
      EditorWheelAction.Zoom,
    );
  });

  it("retains axis projection and handles horizontal zoom and precise noise", () => {
    const normalizer = new BrowserWheelInput();
    const shifted = resolveWheelDecision(
      normalizer.read(event({ deltaY: 3, deltaMode: 1, shiftKey: true }), WheelDevice.Mouse, false),
      EditorWheelSurface.Canvas,
    );
    assert.deepEqual(projectWheelDelta(shifted, { x: 0, y: 3 }, { width: 100, height: 80 }), {
      x: 10,
      y: 0,
    });
    const slide = resolveWheelDecision(
      normalizer.read(event({ deltaX: 8, deltaY: 3 }), WheelDevice.Trackpad, false),
      EditorWheelSurface.Canvas,
      { zoomWithSlide: true },
    );
    assert.equal(slide.axis, "x");
    assert.deepEqual(projectWheelDelta(slide, { x: 4, y: 1.5 }, { width: 100, height: 80 }), {
      x: 4,
      y: 0,
    });
    const horizontal = normalizer.read(
      event({ deltaX: -100, deltaY: 0 }),
      WheelDevice.Mouse,
      false,
    );
    assert.equal(wheelZoomSteps(horizontal, { x: -100, y: 0 }), 1);
    const diagonal = normalizer.read(event({ deltaX: 50, deltaY: 100 }), WheelDevice.Mouse, false);
    assert.equal(
      wheelCellSizeDelta(diagonal),
      0,
      "Discrete axes are normalized independently before adjusting cells",
    );
    const precise = normalizer.read(event({ deltaY: 0.4 }), WheelDevice.Trackpad, false);
    assert.equal(wheelZoomSteps(precise, { x: 0, y: 0.4 }), 0);
    assert.equal(wheelZoomSteps(precise, { x: 0, y: 30 }), -1);
    assert.equal(brushSizeAfterWheel(8, precise, { x: 1, y: 2 }), 5);
    assert.equal(brushSizeAfterWheel(1, precise, { x: 0, y: 30 }), 1);
  });

  it("retains zoom stops and frame navigation wrapping", () => {
    assert.equal(stepAsepriteZoom(100, 1), 200);
    assert.equal(stepAsepriteZoom(100, -1), 50);
    assert.equal(stepAsepriteZoom(600, 1), 800);
    assert.equal(stepAsepriteZoom(800, 1), 1200);
    assert.equal(stepAsepriteZoom(100, -999), 100 / 64);
    assert.equal(stepAsepriteZoom(100, 999), 6400);
    assert.equal(asepriteZoomLevels.length, 25);
    assert.equal(timelineWheelFrameIndex(0, 3, 1, false), 2);
    assert.equal(timelineWheelFrameIndex(2, 3, -1, false), 0);
    assert.equal(timelineWheelFrameIndex(0, 3, -30, true), 1);
  });
});
