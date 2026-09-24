import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { EditorDocument } from "$/document/types";
import { EditorKernel } from "$/editor/kernel";

function document(name: string): EditorDocument {
  return {
    id: 1,
    format: "png",
    name,
    width: 2,
    height: 2,
    layer: {
      name: "Layer 1",
      pixels: { width: 2, height: 2, data: new Uint8ClampedArray(16) },
      x: 0,
      y: 0,
      visible: true,
      locked: false,
    },
    selection: null,
    palette: [[0, 0, 0, 255]],
  };
}

describe("editor-kernel", () => {
  it("owns document replacement and resets history with it", () => {
    const kernel = new EditorKernel();
    const first = document("First");
    kernel.replaceDocument(first);

    const changed = kernel.runHistoryTransaction(
      first,
      "Kernel edit",
      () => {
        first.palette = [[255, 0, 0, 255]];
      },
      () => {},
    );
    assert.equal(changed.committed, true);
    assert.equal(kernel.dirty, true);
    assert.equal(kernel.canUndo, true);

    kernel.replaceDocument(document("Second"));
    assert.equal(kernel.dirty, false);
    assert.equal(kernel.canUndo, false);
  });

  it("rolls back cancelled edits and rejects transactions for replaced documents", () => {
    const kernel = new EditorKernel();
    const first = document("First");
    kernel.replaceDocument(first);

    const cancelled = kernel.beginTransaction("Cancel me");
    assert.ok(cancelled);
    const selection = { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([255]) };
    assert.equal(
      cancelled.update((current) => (current.selection = selection)),
      true,
    );
    assert.equal(cancelled.cancel(), true);
    assert.equal(first.selection, null);
    assert.equal(kernel.canUndo, false);

    const stale = kernel.beginTransaction("Stale edit");
    assert.ok(stale);
    kernel.replaceDocument(document("Replacement"));
    assert.equal(
      stale.update((current) => (current.name = "Stale")),
      false,
    );
    assert.equal(stale.commit(), false);
  });

  it("cancels a failed prepared transaction without adding history", () => {
    const kernel = new EditorKernel();
    const current = document("Before");
    kernel.replaceDocument(current);
    assert.throws(
      () =>
        kernel.runHistoryTransaction(
          current,
          "Failing edit",
          () => {
            current.selection = {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              data: new Uint8Array([255]),
            };
          },
          () => {
            throw new Error("prepare failed");
          },
        ),
      /prepare failed/,
    );
    assert.equal(current.selection, null);
    assert.equal(kernel.canUndo, false);
    assert.equal(kernel.dirty, false);
  });
});
