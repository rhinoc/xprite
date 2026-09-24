import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { DEFAULT_CANVAS_DISPLAY_PREFERENCES } from "$/managers/preferences/canvas-display-preferences";
import { DocumentPreferencesManager } from "$/managers/preferences/document-preferences";
import { DEFAULT_VIEW } from "@xprite/editor-core";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("document preferences", () => {
  it("keeps repeated view captures inert and invalidates them for site changes and resets", () => {
    const storage = memoryStorage();
    const manager = new DocumentPreferencesManager(storage);
    assert.equal(manager.captureView("slot:first", DEFAULT_VIEW, { frame: 0, layer: 0 }), true);
    assert.equal(manager.captureView("slot:first", DEFAULT_VIEW, { frame: 0, layer: 0 }), false);
    manager.captureViewport("slot:first", { zoom: 2, pan: { x: 3, y: 4 } });
    manager.copy("slot:first", "recent:saved");
    assert.equal(manager.captureView("slot:first", DEFAULT_VIEW, { frame: 1, layer: 0 }), true);
    manager.copy("slot:first", "recent:saved");
    const restored = new DocumentPreferencesManager(storage);
    assert.deepEqual(restored.get("recent:saved").site, { frame: 1, layer: 0 });
    assert.deepEqual(restored.get("recent:saved").viewport, {
      zoom: 2,
      pan: { x: 3, y: 4 },
    });
    manager.reset("slot:first");
    assert.equal(manager.captureView("slot:first", DEFAULT_VIEW, { frame: 1, layer: 0 }), true);
    manager.resetAll();
    assert.equal(manager.captureView("slot:first", DEFAULT_VIEW, { frame: 1, layer: 0 }), true);
  });

  it("captures changed values even when callers reuse a mutable view object", () => {
    const storage = memoryStorage();
    const manager = new DocumentPreferencesManager(storage);
    const view = { ...DEFAULT_VIEW };
    manager.captureView("slot:first", view);
    view.grid = true;
    assert.equal(manager.captureView("slot:first", view), true);
    assert.equal(new DocumentPreferencesManager(storage).get("slot:first").view?.grid, true);
  });

  it("retries unchanged captures and copies after storage failures", () => {
    const storage = memoryStorage();
    let failWrites = true;
    const manager = new DocumentPreferencesManager({
      getItem: storage.getItem,
      setItem(key, value) {
        if (failWrites) throw new Error("Storage unavailable");
        storage.setItem(key, value);
      },
    });
    manager.captureView("slot:first", DEFAULT_VIEW);
    failWrites = false;
    assert.equal(manager.captureView("slot:first", DEFAULT_VIEW), true);
    const viewport = { zoom: 2, pan: { x: 3, y: 4 } };
    failWrites = true;
    manager.captureViewport("slot:first", viewport);
    failWrites = false;
    manager.captureViewport("slot:first", viewport);
    failWrites = true;
    manager.copy("slot:first", "recent:saved");
    failWrites = false;
    manager.copy("slot:first", "recent:saved");
    const restored = new DocumentPreferencesManager(storage);
    assert.deepEqual(restored.get("recent:saved").viewport, viewport);
    assert.equal(restored.get("recent:saved").view?.grid, false);
  });

  it("restores the durable value after reverting a failed write", () => {
    const storage = memoryStorage();
    let failWrites = false;
    const manager = new DocumentPreferencesManager({
      getItem: storage.getItem,
      setItem(key, value) {
        if (failWrites) throw new Error("Storage unavailable");
        storage.setItem(key, value);
      },
    });
    manager.captureView("slot:first", DEFAULT_VIEW);
    failWrites = true;
    manager.captureView("slot:first", { ...DEFAULT_VIEW, grid: true });
    assert.equal(manager.get("slot:first").view?.grid, true);
    manager.captureView("slot:first", DEFAULT_VIEW);
    assert.equal(manager.get("slot:first").view?.grid, false);
    failWrites = false;
    manager.copy("slot:first", "recent:saved");
    assert.equal(new DocumentPreferencesManager(storage).get("recent:saved").view?.grid, false);
  });

  it("restores independent canvas viewpoints and carries them to a Save As identity", () => {
    const storage = memoryStorage();
    const manager = new DocumentPreferencesManager(storage);
    const first = { zoom: 3, pan: { x: 11, y: -9 } };
    manager.captureViewport("slot:first", first);
    manager.captureViewport("slot:second", { zoom: 0.5, pan: { x: -4, y: 5 } });
    first.pan.x = 99;
    manager.copy("slot:first", "recent:saved");
    manager.setDefaultView({ ...DEFAULT_VIEW, grid: true });

    const restored = new DocumentPreferencesManager(storage);
    assert.deepEqual(restored.get("slot:first").viewport, {
      zoom: 3,
      pan: { x: 11, y: -9 },
    });
    assert.deepEqual(restored.get("slot:second").viewport, {
      zoom: 0.5,
      pan: { x: -4, y: 5 },
    });
    assert.deepEqual(restored.get("recent:saved").viewport, restored.get("slot:first").viewport);
    assert.equal(restored.get("slot:new").viewport, undefined);
    assert.equal("zoom" in restored.getDefaultView(), false);
    assert.equal("pan" in restored.getDefaultView(), false);
    restored.resetAll();
    assert.equal(new DocumentPreferencesManager(storage).get("recent:saved").viewport, undefined);
  });

  it("ignores malformed stored viewpoints without losing other document preferences", () => {
    const storage = memoryStorage();
    for (const viewport of [
      { zoom: "3", pan: { x: 0, y: 0 } },
      { zoom: 0, pan: { x: 0, y: 0 } },
      { zoom: 3, pan: { x: "11", y: 0 } },
      { zoom: 3, pan: null },
    ]) {
      storage.setItem(
        "xse.document.preferences.v1." + encodeURIComponent("slot:first"),
        JSON.stringify({ version: 1, generation: 0, viewport, view: { grid: true } }),
      );
      const preferences = new DocumentPreferencesManager(storage).get("slot:first");
      assert.equal(preferences.viewport, undefined);
      assert.equal(preferences.view?.grid, true);
    }
  });

  it("isolates documents by durable identity and restores display and view settings", () => {
    const storage = memoryStorage();
    const manager = new DocumentPreferencesManager(storage);
    manager.setDisplay("recent:first", {
      ...DEFAULT_CANVAS_DISPLAY_PREFERENCES,
      gridColor: "#ff0000ff",
    });
    manager.captureView("recent:first", {
      ...DEFAULT_VIEW,
      grid: true,
      symmetryMode: 3,
      symmetryX: 12,
      symmetryY: 8,
      tiledMode: 2,
      snapToGrid: true,
    });
    manager.setDisplay("recent:second", {
      ...DEFAULT_CANVAS_DISPLAY_PREFERENCES,
      gridColor: "#00ff00ff",
    });
    manager.captureView("recent:second", { ...DEFAULT_VIEW, pixelGrid: true });
    const restored = new DocumentPreferencesManager(storage);
    assert.equal(restored.get("recent:first").display?.gridColor, "#ff0000ff");
    assert.equal(restored.get("recent:second").display?.gridColor, "#00ff00ff");
    assert.equal(restored.get("recent:first").view?.grid, true);
    assert.equal(restored.get("recent:first").view?.symmetryX, 12);
    assert.equal(restored.get("recent:first").view?.tiledMode, 2);
    assert.equal(restored.get("recent:first").view?.snapToGrid, undefined);
    assert.equal(restored.get("recent:second").view?.pixelGrid, true);
    assert.equal(restored.get("recent:second").view?.grid, false);
    assert.equal(restored.get("recent:first").view?.symmetryMode, 3);
  });

  it("keeps timeline defaults separate and carries preferences to a Save As identity", () => {
    const storage = memoryStorage();
    const manager = new DocumentPreferencesManager(storage);
    manager.captureView("slot:one", DEFAULT_VIEW);
    manager.setTimeline("slot:one", {
      ...manager.get("slot:one").timeline,
      firstFrame: 7,
      thumbnailsEnabled: true,
    });
    manager.copy("slot:one", "recent:saved");
    manager.setTimelineDefaults({ ...manager.getTimelineDefaults(), firstFrame: 0 });
    const restored = new DocumentPreferencesManager(storage);
    assert.equal(restored.get("recent:saved").timeline.firstFrame, 7);
    assert.equal(restored.get("recent:saved").timeline.thumbnailsEnabled, true);
    assert.equal(restored.get("slot:new").timeline.firstFrame, 0);
  });
  it("restores frame/layer positions and invalidates every old per-file record on reset", () => {
    const storage = memoryStorage();
    const manager = new DocumentPreferencesManager(storage);
    manager.captureView("recent:file", DEFAULT_VIEW, { frame: 3, layer: 2 });
    manager.captureView(
      "recent:closed-file",
      { ...DEFAULT_VIEW, grid: true },
      { frame: 1, layer: 1 },
    );
    const reopened = new DocumentPreferencesManager(storage);
    assert.deepEqual(reopened.get("recent:file").site, { frame: 3, layer: 2 });
    reopened.resetAll();
    const reset = new DocumentPreferencesManager(storage);
    assert.equal(reset.get("recent:file").site, undefined);
    assert.equal(reset.get("recent:closed-file").view, undefined);
  });
});
