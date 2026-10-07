import { describe, expect, it } from "vitest";

import type { EditorDocument } from "$/document/types";
import { EditorKernel, type EditorSnapshotDraft } from "$/editor/kernel";
import {
  isCommittedPersistenceSnapshot,
  projectFromCommittedPersistenceSnapshot,
} from "$/editor/persistence-snapshot";

function fixture() {
  const image = { width: 1, height: 1, data: Uint8ClampedArray.of(1, 2, 3, 255) };
  const second = { width: 1, height: 1, data: Uint8ClampedArray.of(4, 5, 6, 255) };
  const cel = { pixels: image, x: 0, y: 0, opacity: 255, zIndex: 0 };
  const document: EditorDocument = {
    id: 1,
    name: "Shared",
    width: 1,
    height: 1,
    layer: { name: "Ink", pixels: image, x: 0, y: 0, visible: true, locked: false },
    selection: null,
    timeline: {
      activeFrame: 0,
      activeLayer: 0,
      layers: [{ id: "ink", name: "Ink", visible: true, locked: false, flags: 3, opacity: 255 }],
      frames: [
        { duration: 100, cels: [cel] },
        { duration: 100, cels: [{ ...cel }] },
        { duration: 100, cels: [{ ...cel, pixels: second }] },
      ],
    },
  };
  const kernel = new EditorKernel();
  kernel.replaceDocument(document);
  const publish = () => kernel.publishSnapshot({} as EditorSnapshotDraft);
  const snapshot = () => kernel.getCommittedPersistenceSnapshot()!;
  publish();
  return { document, image, second, kernel, publish, snapshot };
}

describe("committed persistence sharing", () => {
  it("creates a full-canvas save view at current navigation without copying its stored cel graph", () => {
    const { document, kernel, publish, snapshot } = fixture();
    document.width = 2;
    publish();
    const committed = snapshot();
    const range = { kind: "frames" as const, frames: [2], layers: [0] };
    const project = projectFromCommittedPersistenceSnapshot(committed, {
      activeFrame: 2,
      activeLayer: 0,
      range,
    });
    expect(project.image.width).toBe(2);
    expect(project.image.height).toBe(1);
    expect(Array.from(project.image.data)).toEqual([4, 5, 6, 255, 0, 0, 0, 0]);
    expect(project.timeline.frames).toBe(committed.document.timeline!.frames);
    expect(project.timeline.activeFrame).toBe(2);
    expect(committed.document.timeline!.activeFrame).toBe(0);
    range.frames[0] = 0;
    expect(project.timeline.range!.frames).toEqual([2]);
    expect(() =>
      projectFromCommittedPersistenceSnapshot(committed, { activeFrame: 9, activeLayer: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      projectFromCommittedPersistenceSnapshot(kernel.getPersistenceSnapshot()!, {
        activeFrame: 0,
        activeLayer: 0,
      }),
    ).toThrow(TypeError);
  });

  it("copies no RGBA buffers for metadata and saved-state changes", () => {
    const { document, kernel, publish, snapshot } = fixture();
    const initial = snapshot();
    kernel.runHistoryTransaction(
      document,
      "Duration",
      () => {
        const timeline = document.timeline!;
        document.timeline = {
          ...timeline,
          frames: timeline.frames.map((frame, index) =>
            index === 0 ? { ...frame, duration: 250 } : frame,
          ),
        };
      },
      () => {},
    );
    publish();
    const changed = snapshot();
    expect(changed.document.timeline!.frames[0].duration).toBe(250);
    expect(initial.document.timeline!.frames[0].duration).toBe(100);
    expect(changed.document.timeline).not.toBe(initial.document.timeline);
    for (let index = 0; index < 3; index++)
      expect(changed.document.timeline!.frames[index].cels[0]!.pixels.data).toBe(
        initial.document.timeline!.frames[index].cels[0]!.pixels.data,
      );
    kernel.markSaved();
    publish();
    expect(snapshot().dirty).toBe(false);
    expect(snapshot().document.layer.pixels.data).toBe(changed.document.layer.pixels.data);
    expect(isCommittedPersistenceSnapshot(snapshot())).toBe(true);
    const owned = kernel.getPersistenceSnapshot()!;
    expect(isCommittedPersistenceSnapshot(owned)).toBe(false);
    owned.document.layer.pixels.data.fill(0);
    expect(snapshot().document.layer.pixels.data[0]).toBe(1);
  });

  it("invalidates mutated arrays on patch commit, undo and redo while retaining untouched cels", () => {
    const { document, image, kernel, publish, snapshot } = fixture();
    const initial = snapshot();
    const transaction = kernel.beginTransaction("Ink")!;
    kernel.captureHistory(image, { x: 0, y: 0, width: 1, height: 1 });
    transaction.update(() => {
      image.data[0] = 99;
    });
    expect(snapshot().document.layer.pixels.data[0]).toBe(1);
    transaction.commit();
    publish();
    const painted = snapshot();
    expect(painted.document.layer.pixels.data[0]).toBe(99);
    expect(painted.document.layer.pixels.data).not.toBe(initial.document.layer.pixels.data);
    expect(painted.document.timeline!.frames[0].cels[0]!.pixels).toBe(
      painted.document.timeline!.frames[1].cels[0]!.pixels,
    );
    expect(painted.document.timeline!.frames[2].cels[0]!.pixels.data).toBe(
      initial.document.timeline!.frames[2].cels[0]!.pixels.data,
    );
    kernel.undo();
    publish();
    const undone = snapshot();
    expect(undone.document.layer.pixels.data[0]).toBe(1);
    expect(painted.document.layer.pixels.data[0]).toBe(99);
    kernel.redo();
    publish();
    expect(snapshot().document.layer.pixels.data[0]).toBe(99);
    expect(undone.document.layer.pixels.data[0]).toBe(1);
    expect(initial.document.layer.pixels.data[0]).toBe(1);
    const cancel = kernel.beginTransaction("Cancelled ink")!;
    kernel.captureHistory(image, { x: 0, y: 0, width: 1, height: 1 });
    cancel.update(() => {
      image.data[0] = 17;
    });
    cancel.cancel();
    publish();
    expect(snapshot().document.layer.pixels.data[0]).toBe(99);
    expect(document.layer.pixels.data[0]).toBe(99);
  });

  it("falls back for unclassified custom commands and preserves prior snapshots through undo", () => {
    const { document, second, kernel, publish, snapshot } = fixture();
    const initial = snapshot();
    kernel.beginHistoryTransaction(document, "External pixels");
    second.data[0] = 88;
    kernel.commitHistoryTransaction(document, false, [
      {
        undo: () => {
          second.data[0] = 4;
        },
        redo: () => {
          second.data[0] = 88;
        },
      },
    ]);
    publish();
    const changed = snapshot();
    expect(changed.document.timeline!.frames[2].cels[0]!.pixels.data[0]).toBe(88);
    expect(initial.document.timeline!.frames[2].cels[0]!.pixels.data[0]).toBe(4);
    expect(changed.document.layer.pixels.data).not.toBe(initial.document.layer.pixels.data);
    kernel.undo();
    publish();
    expect(snapshot().document.timeline!.frames[2].cels[0]!.pixels.data[0]).toBe(4);
    expect(changed.document.timeline!.frames[2].cels[0]!.pixels.data[0]).toBe(88);
  });

  it("shares mutation evidence across linked kernels without exposing retained committed bytes", () => {
    const { image, kernel, publish, snapshot } = fixture();
    const linked = kernel.createLinkedKernel(() =>
      linked.publishSnapshot({} as EditorSnapshotDraft),
    );
    publish();
    const initial = linked.getCommittedPersistenceSnapshot()!;
    const edit = kernel.beginTransaction("Linked ink")!;
    kernel.captureHistory(image, { x: 0, y: 0, width: 1, height: 1 });
    edit.update(() => {
      image.data[1] = 90;
    });
    edit.commit();
    publish();
    const changed = linked.getCommittedPersistenceSnapshot()!;
    expect(changed.document.layer.pixels.data[1]).toBe(90);
    expect(snapshot().document.layer.pixels.data[1]).toBe(90);
    expect(initial.document.layer.pixels.data[1]).toBe(2);
    expect(changed.document.timeline!.frames[2].cels[0]!.pixels.data).toBe(
      initial.document.timeline!.frames[2].cels[0]!.pixels.data,
    );
    linked.undo();
    linked.publishSnapshot({} as EditorSnapshotDraft);
    expect(linked.getCommittedPersistenceSnapshot()!.document.layer.pixels.data[1]).toBe(2);
    expect(changed.document.layer.pixels.data[1]).toBe(90);
  });

  it("keeps indexed/grayscale samples, tile grids and opaque metadata detached", () => {
    const { document, kernel, publish, snapshot } = fixture();
    const cel = document.timeline!.frames[0].cels[0]!;
    const samples = Uint8Array.of(2, 255);
    const tiles = Uint32Array.of(1);
    const profile = Uint8Array.of(9, 8);
    document.timeline = {
      ...document.timeline!,
      colorProfile: { type: "icc", data: profile },
      userData: { properties: Uint8Array.of(7) },
      frames: document.timeline!.frames.map((frame) => ({
        ...frame,
        cels: frame.cels.map((item) =>
          item?.pixels === cel.pixels
            ? {
                ...item,
                asepriteSamples: { depth: 16, width: 1, height: 1, data: samples },
                tilemap: { width: 1, height: 1, tiles },
              }
            : item,
        ),
      })),
    };
    publish();
    const before = snapshot();
    samples[0] = 42;
    tiles[0] = 5;
    profile[0] = 6;
    document.name = "Metadata update";
    publish();
    const after = snapshot();
    expect(before.document.timeline!.frames[0].cels[0]!.asepriteSamples!.data[0]).toBe(2);
    expect(after.document.timeline!.frames[0].cels[0]!.asepriteSamples!.data[0]).toBe(42);
    expect(before.document.timeline!.frames[0].cels[0]!.tilemap!.tiles[0]).toBe(1);
    expect(after.document.timeline!.frames[0].cels[0]!.tilemap!.tiles[0]).toBe(5);
    expect(before.document.timeline!.colorProfile).toEqual({
      type: "icc",
      data: Uint8Array.of(9, 8),
    });
    expect(after.document.timeline!.colorProfile).toEqual({
      type: "icc",
      data: Uint8Array.of(6, 8),
    });
    expect(after.document.layer.pixels.data).toBe(before.document.layer.pixels.data);
    kernel.replaceDocument(null);
    publish();
    expect(kernel.getCommittedPersistenceSnapshot()).toBe(null);
  });
});
