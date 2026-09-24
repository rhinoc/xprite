import type { Point, Rect } from "$/base/primitives";
import { DEFAULT_SLICE_COLOR } from "$/drawing/tool-settings";
import { setSliceKey, sliceKeyAt } from "$/sprite/slice-metadata";
import type { SpriteSlice, SlicePropertiesEdit } from "$/sprite/slices";

export interface SlicePointerInput extends Point {
  button?: number;
  shift?: boolean;
}

export interface SliceTimelineState {
  activeFrame: number;
  slices: readonly SpriteSlice[];
}

export interface SliceEditTransaction {
  setSlices(slices: readonly SpriteSlice[]): void;
  commit(): boolean;
  cancel(): boolean;
}

export interface SliceControllerPort {
  getTimeline(): SliceTimelineState | null;
  getOptions(): { useKeys: boolean; zoom: number; defaultSliceColor?: string };
  beginEdit(label: string): SliceEditTransaction | null;
  setPointer(point: Point): void;
  publish(): void;
}

export interface SliceControllerSnapshot {
  selectedSliceIds: readonly string[];
  mark: Rect | null;
}

type SliceDrag = {
  start: Point;
  moved: boolean;
  mode: "mark" | "move" | "resize" | "center";
  base: readonly SpriteSlice[];
  bounds?: Rect;
  handle?: string;
};

const point = (value: Point): Point => ({ x: Math.floor(value.x), y: Math.floor(value.y) });

export class SpriteSliceController {
  private selectedSliceIds: string[] = [];
  private sliceDrag: SliceDrag | null = null;
  private sliceMark: Rect | null = null;
  private transaction: SliceEditTransaction | null = null;

  constructor(private readonly port: SliceControllerPort) {}

  getSnapshot = (): SliceControllerSnapshot => ({
    selectedSliceIds: this.selectedSliceIds,
    mark: this.sliceMark,
  });

  hasPendingDocumentEdit = (): boolean => !!this.transaction;

  isGestureActive = (): boolean => this.sliceDrag !== null;

  getGestureState = (): { mode: SliceDrag["mode"]; moved: boolean } | null =>
    this.sliceDrag
      ? {
          mode: this.sliceDrag.mode,
          moved: this.sliceDrag.moved,
        }
      : null;

  reset() {
    this.transaction?.cancel();
    this.transaction = null;
    this.selectedSliceIds = [];
    this.sliceDrag = null;
    this.sliceMark = null;
  }

  retainExistingSlices() {
    const timeline = this.port.getTimeline();
    const existing = new Set(timeline?.slices.map((slice) => slice.id) ?? []);
    this.selectedSliceIds = this.selectedSliceIds.filter((id) => existing.has(id));
  }

  private selectedSliceBounds(): Rect | undefined {
    const timeline = this.port.getTimeline();
    if (!timeline) return;
    const bounds = timeline.slices
      .filter((slice) => this.selectedSliceIds.includes(slice.id))
      .map((slice) => sliceKeyAt(slice, timeline.activeFrame)?.bounds)
      .filter((value): value is Rect => !!value);
    if (!bounds.length) return;
    const x = Math.min(...bounds.map((value) => value.x));
    const y = Math.min(...bounds.map((value) => value.y));
    return {
      x,
      y,
      width: Math.max(...bounds.map((value) => value.x + value.width)) - x,
      height: Math.max(...bounds.map((value) => value.y + value.height)) - y,
    };
  }

  selectSlice(id: string, add = false) {
    const timeline = this.port.getTimeline();
    if (!timeline?.slices.some((slice) => slice.id === id)) return;
    this.selectedSliceIds = add ? [...new Set([...this.selectedSliceIds, id])] : [id];
    this.port.publish();
  }

  editSliceProperties(id: string, patch: SlicePropertiesEdit) {
    return this.editSlicesProperties([id], patch);
  }

  editSlicesProperties(ids: readonly string[], patch: SlicePropertiesEdit) {
    const timeline = this.port.getTimeline();
    if (!timeline || !timeline.slices.some((slice) => ids.includes(slice.id))) return false;
    const selected = timeline.slices.filter((slice) => ids.includes(slice.id));
    const { useKeys } = this.port.getOptions();
    const frame =
      useKeys || selected.some((slice) => slice.keys.length > 1) ? timeline.activeFrame : 0;
    const transaction = this.port.beginEdit("Slice Properties");
    if (!transaction) return false;
    const slices = timeline.slices.map((slice) => {
      if (!ids.includes(slice.id)) return slice;
      const userDataSlice = {
        ...slice,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.data !== undefined ? { data: patch.data } : {}),
        ...(Object.prototype.hasOwnProperty.call(patch, "properties")
          ? { properties: patch.properties?.slice() }
          : {}),
      };
      const key = sliceKeyAt(slice, timeline.activeFrame);
      if (!key) return userDataSlice;
      const bounds = { ...key.bounds, ...patch.bounds };
      bounds.x = Math.trunc(bounds.x);
      bounds.y = Math.trunc(bounds.y);
      bounds.width = Math.max(1, Math.trunc(bounds.width));
      bounds.height = Math.max(1, Math.trunc(bounds.height));
      const defaultCenter = {
        x: 1,
        y: 1,
        width: Math.max(1, bounds.width - 2),
        height: Math.max(1, bounds.height - 2),
      };
      const center =
        patch.center === null
          ? undefined
          : patch.center === undefined
            ? key.center
            : { ...(key.center ?? defaultCenter), ...patch.center };
      const pivot =
        patch.pivot === null
          ? undefined
          : patch.pivot === undefined
            ? key.pivot
            : { ...(key.pivot ?? { x: 0, y: 0 }), ...patch.pivot };
      if (center) {
        center.x = Math.trunc(center.x);
        center.y = Math.trunc(center.y);
        center.width = Math.max(1, Math.trunc(center.width));
        center.height = Math.max(1, Math.trunc(center.height));
      }
      if (pivot) {
        pivot.x = Math.trunc(pivot.x);
        pivot.y = Math.trunc(pivot.y);
      }
      return setSliceKey(userDataSlice, frame, { bounds, center, pivot });
    });
    if (JSON.stringify(slices) === JSON.stringify(timeline.slices)) {
      transaction.cancel();
      return false;
    }
    transaction.setSlices(slices);
    transaction.commit();
    this.port.publish();
    return true;
  }

  deleteSelectedSlices() {
    return this.deleteSlices(this.selectedSliceIds);
  }

  deleteSlices(ids: readonly string[]) {
    const timeline = this.port.getTimeline();
    if (!timeline || !ids.some((id) => timeline.slices.some((slice) => slice.id === id)))
      return false;
    const transaction = this.port.beginEdit("Delete Slice");
    if (!transaction) return false;
    const { useKeys } = this.port.getOptions();
    transaction.setSlices(
      timeline.slices.flatMap((slice) => {
        if (!ids.includes(slice.id)) return [slice];
        return useKeys && slice.keys.length > 1
          ? [
              setSliceKey(slice, timeline.activeFrame, {
                bounds: { x: 0, y: 0, width: 0, height: 0 },
              }),
            ]
          : [];
      }),
    );
    this.selectedSliceIds = this.selectedSliceIds.filter((id) => !ids.includes(id));
    transaction.commit();
    this.port.publish();
    return true;
  }

  duplicateSlices(ids: readonly string[]) {
    const timeline = this.port.getTimeline();
    if (!timeline || !ids.length) return false;
    const source = timeline.slices.filter((slice) => ids.includes(slice.id));
    if (!source.length) return false;
    const transaction = this.port.beginEdit("Duplicate Slice");
    if (!transaction) return false;
    const used = new Set(timeline.slices.map((slice) => slice.id));
    const copies: SpriteSlice[] = [];
    for (const slice of source) {
      let n = 1;
      while (used.has(`slice-${n}`)) n++;
      const id = `slice-${n}`;
      used.add(id);
      copies.push({
        ...slice,
        id,
        name: `Copy of ${slice.name}`,
        keys: slice.keys.map((key) => ({
          ...key,
          bounds: { ...key.bounds, x: key.bounds.x + 2, y: key.bounds.y + 2 },
          center: key.center ? { ...key.center } : undefined,
          pivot: key.pivot ? { ...key.pivot } : undefined,
        })),
        properties: slice.properties?.slice(),
      });
    }
    transaction.setSlices([...timeline.slices, ...copies]);
    this.selectedSliceIds = copies.map((slice) => slice.id);
    transaction.commit();
    this.port.publish();
    return true;
  }

  beginGesture(input: SlicePointerInput) {
    const timeline = this.port.getTimeline();
    if (!timeline || (input.button ?? 0) !== 0) return;
    const start = point(input);
    const slices = timeline.slices;
    const frame = timeline.activeFrame;
    const { zoom } = this.port.getOptions();
    const bounds = this.selectedSliceBounds();
    const tolerance = Math.max(0.5, 2 / zoom);
    let handle: string | undefined;
    if (bounds) {
      const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
      const left = near(input.x, bounds.x);
      const right = near(input.x, bounds.x + bounds.width);
      const top = near(input.y, bounds.y);
      const bottom = near(input.y, bounds.y + bounds.height);
      const withinX =
        input.x >= bounds.x - tolerance && input.x <= bounds.x + bounds.width + tolerance;
      const withinY =
        input.y >= bounds.y - tolerance && input.y <= bounds.y + bounds.height + tolerance;
      handle =
        top && withinX
          ? left
            ? "nw"
            : right
              ? "ne"
              : "n"
          : bottom && withinX
            ? left
              ? "sw"
              : right
                ? "se"
                : "s"
            : left && withinY
              ? "w"
              : right && withinY
                ? "e"
                : undefined;
    }
    const hit = [...slices].reverse().find((slice) => {
      const sliceBounds = sliceKeyAt(slice, frame)?.bounds;
      return (
        sliceBounds &&
        input.x >= sliceBounds.x &&
        input.y >= sliceBounds.y &&
        input.x < sliceBounds.x + sliceBounds.width &&
        input.y < sliceBounds.y + sliceBounds.height
      );
    });
    if (hit && !this.selectedSliceIds.includes(hit.id)) handle = undefined;
    if (hit && !this.selectedSliceIds.includes(hit.id) && !input.shift)
      this.selectedSliceIds = [hit.id];
    else if (hit && input.shift)
      this.selectedSliceIds = [...new Set([...this.selectedSliceIds, hit.id])];
    let centerHandle: string | undefined;
    let centerDistance = Infinity;
    if (hit) {
      const key = sliceKeyAt(hit, frame);
      if (key?.center) {
        const b = key.bounds;
        const c = key.center;
        const x = b.x + c.x;
        const y = b.y + c.y;
        const near = (a: number, value: number) => Math.abs(a - value) <= tolerance;
        const left = near(input.x, x);
        const right = near(input.x, x + c.width);
        const top = near(input.y, y);
        const bottom = near(input.y, y + c.height);
        const withinX = input.x >= b.x && input.x <= b.x + b.width;
        const withinY = input.y >= b.y && input.y <= b.y + b.height;
        centerHandle =
          top && withinX
            ? left
              ? "nw"
              : right
                ? "ne"
                : "n"
            : bottom && withinX
              ? left
                ? "sw"
                : right
                  ? "se"
                  : "s"
              : left && withinY
                ? "w"
                : right && withinY
                  ? "e"
                  : undefined;
        centerDistance = Math.min(
          Math.abs(input.x - x),
          Math.abs(input.x - x - c.width),
          Math.abs(input.y - y),
          Math.abs(input.y - y - c.height),
        );
      }
    }
    const outerDistance = bounds
      ? Math.min(
          Math.abs(input.x - bounds.x),
          Math.abs(input.x - bounds.x - bounds.width),
          Math.abs(input.y - bounds.y),
          Math.abs(input.y - bounds.y - bounds.height),
        )
      : Infinity;
    const useCenter = !!centerHandle && (!handle || centerDistance < outerDistance);
    if (hit || handle) {
      this.transaction = this.port.beginEdit("Move Slice");
      this.sliceDrag = {
        start,
        moved: false,
        mode: useCenter ? "center" : handle ? "resize" : "move",
        base: slices,
        bounds: this.selectedSliceBounds(),
        handle: useCenter ? centerHandle : handle,
      };
    } else {
      this.selectedSliceIds = [];
      this.sliceDrag = { start, moved: false, mode: "mark", base: slices };
      this.sliceMark = { x: start.x, y: start.y, width: 1, height: 1 };
    }
    this.port.publish();
  }

  updateGesture(input: SlicePointerInput) {
    const drag = this.sliceDrag;
    const timeline = this.port.getTimeline();
    if (!drag || !timeline) return;
    const p = point(input);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    if (dx !== 0 || dy !== 0) drag.moved = true;
    this.port.setPointer(p);
    if (drag.mode === "mark") {
      this.sliceMark = {
        x: Math.min(p.x, drag.start.x),
        y: Math.min(p.y, drag.start.y),
        width: Math.abs(dx) + 1,
        height: Math.abs(dy) + 1,
      };
      this.port.publish();
      return;
    }
    if (dx === 0 && dy === 0) return;
    const bounds = drag.bounds;
    if (!bounds || !this.transaction) return;
    const handle = drag.handle ?? "";
    if (drag.mode === "center") {
      const slices = drag.base.map((slice) => {
        if (!this.selectedSliceIds.includes(slice.id)) return slice;
        const key = sliceKeyAt(slice, timeline.activeFrame);
        const center = key?.center;
        if (!key || !center) return slice;
        const x = center.x + (handle.includes("w") ? dx : 0);
        const y = center.y + (handle.includes("n") ? dy : 0);
        const width = Math.max(
          1,
          center.width + (handle.includes("e") ? dx : handle.includes("w") ? -dx : 0),
        );
        const height = Math.max(
          1,
          center.height + (handle.includes("s") ? dy : handle.includes("n") ? -dy : 0),
        );
        const nextCenter = {
          x: handle.includes("w") ? center.x + center.width - width : x,
          y: handle.includes("n") ? center.y + center.height - height : y,
          width,
          height,
        };
        const { useKeys } = this.port.getOptions();
        const frame =
          useKeys ||
          drag.base.some(
            (value) => this.selectedSliceIds.includes(value.id) && value.keys.length > 1,
          )
            ? timeline.activeFrame
            : 0;
        return setSliceKey(slice, frame, {
          bounds: key.bounds,
          center: nextCenter,
          pivot: key.pivot,
        });
      });
      this.transaction.setSlices(slices);
      this.port.publish();
      return;
    }
    const x = bounds.x + (handle.includes("w") ? dx : 0);
    const y = bounds.y + (handle.includes("n") ? dy : 0);
    const width = Math.max(
      1,
      bounds.width + (handle.includes("e") ? dx : handle.includes("w") ? -dx : 0),
    );
    const height = Math.max(
      1,
      bounds.height + (handle.includes("s") ? dy : handle.includes("n") ? -dy : 0),
    );
    const nextBounds = {
      x: handle.includes("w") ? bounds.x + bounds.width - width : x,
      y: handle.includes("n") ? bounds.y + bounds.height - height : y,
      width,
      height,
    };
    const slices = drag.base.map((slice) => {
      if (!this.selectedSliceIds.includes(slice.id)) return slice;
      const key = sliceKeyAt(slice, timeline.activeFrame);
      if (!key) return slice;
      const old = key.bounds;
      const next =
        drag.mode === "move"
          ? { ...old, x: old.x + dx, y: old.y + dy }
          : {
              x: nextBounds.x + Math.round(((old.x - bounds.x) * nextBounds.width) / bounds.width),
              y:
                nextBounds.y + Math.round(((old.y - bounds.y) * nextBounds.height) / bounds.height),
              width: Math.max(1, Math.round((old.width * nextBounds.width) / bounds.width)),
              height: Math.max(1, Math.round((old.height * nextBounds.height) / bounds.height)),
            };
      const center =
        drag.mode === "resize" && key.center
          ? {
              ...key.center,
              width: Math.max(1, next.width - (old.width - key.center.width)),
              height: Math.max(1, next.height - (old.height - key.center.height)),
            }
          : key.center;
      const { useKeys } = this.port.getOptions();
      const frame =
        useKeys ||
        drag.base.some((value) => this.selectedSliceIds.includes(value.id) && value.keys.length > 1)
          ? timeline.activeFrame
          : 0;
      return setSliceKey(slice, frame, { bounds: next, center, pivot: key.pivot });
    });
    this.transaction.setSlices(slices);
    this.port.publish();
  }

  endGesture(input?: SlicePointerInput) {
    const drag = this.sliceDrag;
    const timeline = this.port.getTimeline();
    if (!drag || !timeline) return;
    if (input) this.updateGesture(input);
    if (drag.mode === "mark" && this.sliceMark) {
      const bounds = this.sliceMark;
      const touched = drag.base.filter((slice) => {
        const sliceBounds = sliceKeyAt(slice, timeline.activeFrame)?.bounds;
        return (
          sliceBounds &&
          bounds.x <= sliceBounds.x + sliceBounds.width &&
          bounds.x + bounds.width >= sliceBounds.x &&
          bounds.y <= sliceBounds.y + sliceBounds.height &&
          bounds.y + bounds.height >= sliceBounds.y
        );
      });
      if (touched.length) this.selectedSliceIds = touched.map((slice) => slice.id);
      else if (bounds.width > 1 || bounds.height > 1) {
        const transaction = this.port.beginEdit("New Slice");
        if (transaction) {
          const used = new Set(drag.base.map((slice) => slice.id));
          let n = 1;
          while (used.has(`slice-${n}`)) n++;
          const id = `slice-${n}`;
          const nameNumber =
            Math.max(
              0,
              ...drag.base.map((slice) => Number(/^Slice\s+(\d+)/.exec(slice.name)?.[1] ?? 0)),
            ) + 1;
          const { useKeys, defaultSliceColor } = this.port.getOptions();
          transaction.setSlices([
            ...drag.base,
            {
              id,
              name: `Slice ${nameNumber}`,
              color: defaultSliceColor ?? DEFAULT_SLICE_COLOR,
              keys: [{ frame: useKeys ? timeline.activeFrame : 0, bounds }],
            },
          ]);
          this.selectedSliceIds = [id];
          transaction.commit();
        }
      }
    } else {
      this.transaction?.commit();
    }
    this.transaction = null;
    this.sliceDrag = null;
    this.sliceMark = null;
    this.port.publish();
  }

  cancelGesture() {
    if (!this.sliceDrag) return;
    this.transaction?.cancel();
    this.transaction = null;
    this.sliceDrag = null;
    this.sliceMark = null;
    this.port.publish();
  }
}
