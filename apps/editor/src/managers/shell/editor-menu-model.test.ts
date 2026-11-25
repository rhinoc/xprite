import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

import { useEditorMenuModel } from "$/managers/shell/editor-menu-model";
import { RasterEditor } from "@xprite/editor-core";

const context = vi.hoisted(() => ({ core: null as RasterEditor | null }));

// Supply the hook's state inputs; execute the real model, capability policy and editor commands.
vi.mock("$/managers/editor/editor-state-manager", () => ({
  useEditorManagerContext: () => context,
  useEditorFields: () => ({ tab: "editor", timelineInteractionPreferences: {} }),
}));
vi.mock("$/managers/editor/use-editor-snapshot", () => ({
  useEditorSnapshot: (core: RasterEditor | null) => core?.getSnapshot(),
}));

afterEach(() => {
  context.core = null;
});

describe("background conversion menu availability", () => {
  it("disables both directions without an active document", () => {
    const menu = useEditorMenuModel();
    assert.equal(menu.canConvertBackground(true), false);
    assert.equal(menu.canConvertBackground(false), false);
  });

  it("follows conversion and undo rather than a source expression", () => {
    const core = (context.core = new RasterEditor({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255]),
    }));
    const menu = useEditorMenuModel();
    assert.equal(menu.canConvertBackground(true), true);
    assert.equal(menu.canConvertBackground(false), false);

    menu.commands.sprite.convertLayerBackground(true);
    assert.equal(useEditorMenuModel().canConvertBackground(true), false);
    assert.equal(useEditorMenuModel().canConvertBackground(false), true);

    core.history.undo();
    assert.equal(useEditorMenuModel().canConvertBackground(true), true);
    assert.equal(useEditorMenuModel().canConvertBackground(false), false);
  });

  it("disables conversion for groups and children of hidden or locked groups", () => {
    const core = (context.core = new RasterEditor({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray(4),
    }));
    core.timeline.addGroup("Group");
    const group = core.getSnapshot().document!.timeline!.activeLayer;
    assert.equal(useEditorMenuModel().canConvertBackground(true), false);

    core.timeline.addLayer("Child");
    assert.equal(useEditorMenuModel().canConvertBackground(true), true);
    core.timeline.setLayerVisible(false, group);
    assert.equal(useEditorMenuModel().canConvertBackground(true), false);
    core.timeline.setLayerVisible(true, group);
    core.timeline.setLayerLocked(true, group);
    assert.equal(useEditorMenuModel().canConvertBackground(true), false);
    core.timeline.setLayerLocked(false, group);
    assert.equal(useEditorMenuModel().canConvertBackground(true), true);
  });
});
