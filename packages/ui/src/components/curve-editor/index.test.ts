import type { KeyboardEvent, PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { CurveEditor, type CurveEditorProps } from "$/components/curve-editor";

vi.mock("react", () => ({ useRef: (value: unknown) => ({ current: value }) }));

function editor(overrides: Partial<CurveEditorProps> = {}) {
  const points = [
    { x: 0, y: 0 },
    { x: 128, y: 64 },
    { x: 255, y: 255 },
  ];
  const onPointsChange = vi.fn();
  const onSelectionChange = vi.fn();
  const element = CurveEditor({
    bounds: { x: 0, y: 0, width: 200, height: 200 },
    points,
    selectedIndex: 1,
    min: 0,
    max: 255,
    step: 1,
    "aria-label": "Curve",
    onPointsChange,
    onSelectionChange,
    ...overrides,
  });
  return { props: element.props, onPointsChange, onSelectionChange, points };
}

function key(value: string, shiftKey = false) {
  return {
    key: value,
    shiftKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent<HTMLDivElement>;
}

describe("curve point interactions", () => {
  it("moves with arrows, supports Shift steps and prevents crossing neighboring input values", () => {
    const view = editor();
    const right = key("ArrowRight", true);
    view.props.onKeyDown(right);
    expect(view.onPointsChange.mock.lastCall?.[0][1]).toEqual({ x: 138, y: 64 });
    expect(right.preventDefault).toHaveBeenCalled();
    for (let index = 0; index < 20; index++) view.props.onKeyDown(key("ArrowRight", true));
    expect(view.onPointsChange.mock.lastCall?.[0][1].x).toBe(254);
    view.props.onKeyDown(key("ArrowUp"));
    expect(view.onPointsChange.mock.lastCall?.[0][1]).toEqual({ x: 254, y: 65 });
  });
  it("deletes and inserts points, preserves a minimum of one point, and selects endpoints", () => {
    const view = editor();
    view.props.onKeyDown(key("Delete"));
    expect(view.onPointsChange.mock.lastCall?.[0]).toEqual([view.points[0], view.points[2]]);
    view.props.onKeyDown(key("End"));
    expect(view.onSelectionChange).toHaveBeenLastCalledWith(1);
    const single = editor({ points: [{ x: 128, y: 64 }], selectedIndex: 0 });
    single.props.onKeyDown(key("Delete"));
    expect(single.onPointsChange).not.toHaveBeenCalled();
    const add = editor();
    add.props.onKeyDown(key("Insert"));
    expect(add.onPointsChange.mock.lastCall?.[0]).toContainEqual({ x: 64, y: 64 });
  });
  it("adds and drags a captured point without reordering or mutating source points", () => {
    const view = editor();
    const target = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({ width: "200px", height: "200px", boxSizing: "border-box" }),
        },
      },
      focus: vi.fn(),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    };
    const pointer = (x: number, y: number) =>
      ({
        button: 0,
        pointerId: 4,
        clientX: x,
        clientY: y,
        currentTarget: target,
        preventDefault: vi.fn(),
      }) as unknown as PointerEvent<HTMLDivElement>;
    view.props.onPointerDown(pointer(27, 73));
    expect(target.setPointerCapture).toHaveBeenCalledWith(4);
    expect(view.onSelectionChange).toHaveBeenLastCalledWith(1);
    view.props.onPointerMove(pointer(98, 12));
    expect(view.onPointsChange.mock.lastCall?.[0][1].x).toBe(127);
    expect(view.onPointsChange.mock.lastCall?.[0][1].y).toBeGreaterThan(200);
    view.props.onPointerUp(pointer(98, 12));
    expect(target.releasePointerCapture).toHaveBeenCalledWith(4);
    expect(view.points[1]).toEqual({ x: 128, y: 64 });
  });
  it("does not consume keys or alter points when disabled", () => {
    const view = editor({ disabled: true });
    view.props.onKeyDown(key("Delete"));
    expect(view.onPointsChange).not.toHaveBeenCalled();
    expect(view.props.tabIndex).toBe(-1);
  });
});
