import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { resolveCanvasQuickTool } from "$/managers/input/policies/quick-tool";
import { EditorPrimaryModifier } from "$/managers/ports/platform";
import { RasterEditor } from "@xprite/editor-core";

const keys = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
const context = { inside: true, space: false, pointerActive: false };
const snapshot = () =>
  new RasterEditor({ width: 1, height: 1, data: new Uint8ClampedArray(4) }).getSnapshot();

describe("temporary canvas tools", () => {
  it("uses Command on macOS and Control elsewhere", () => {
    const state = snapshot();
    assert.equal(
      resolveCanvasQuickTool(
        state,
        { ...keys, metaKey: true },
        {},
        EditorPrimaryModifier.Command,
        context,
        null,
      ),
      "move",
    );
    assert.equal(
      resolveCanvasQuickTool(
        state,
        { ...keys, ctrlKey: true },
        {},
        EditorPrimaryModifier.Command,
        context,
        null,
      ),
      null,
    );
    assert.equal(
      resolveCanvasQuickTool(
        state,
        { ...keys, ctrlKey: true },
        {},
        EditorPrimaryModifier.Control,
        context,
        null,
      ),
      "move",
    );
    assert.equal(
      resolveCanvasQuickTool(
        state,
        { ...keys, metaKey: true },
        {},
        EditorPrimaryModifier.Control,
        context,
        null,
      ),
      null,
    );
  });

  it("preserves selection modifiers and gives Option its eyedropper behavior", () => {
    const initial = snapshot();
    const state = { ...initial, settings: { ...initial.settings, tool: "marquee" as const } };
    const command = { ...keys, metaKey: true };
    assert.equal(
      resolveCanvasQuickTool(state, command, {}, EditorPrimaryModifier.Command, context, null),
      "move",
    );
    for (const action of [
      "copySelection",
      "addSelection",
      "subtractSelection",
      "intersectSelection",
    ])
      assert.equal(
        resolveCanvasQuickTool(
          state,
          command,
          { [action]: true },
          EditorPrimaryModifier.Command,
          context,
          null,
        ),
        null,
      );
    assert.equal(
      resolveCanvasQuickTool(
        state,
        { ...keys, altKey: true },
        {},
        EditorPrimaryModifier.Command,
        context,
        null,
      ),
      "eyedropper",
    );
  });

  it("does not replace drawing modifier combinations with Move", () => {
    const state = snapshot();
    for (const extra of [{ shiftKey: true }, { ctrlKey: true }])
      assert.equal(
        resolveCanvasQuickTool(
          state,
          { ...keys, metaKey: true, ...extra },
          {},
          EditorPrimaryModifier.Command,
          context,
          null,
        ),
        null,
      );
  });

  it("keeps captured drags stable and restores the tool after release or leaving", () => {
    const state = snapshot();
    assert.equal(
      resolveCanvasQuickTool(
        state,
        keys,
        {},
        EditorPrimaryModifier.Command,
        { ...context, pointerActive: true },
        "move",
      ),
      "move",
    );
    assert.equal(
      resolveCanvasQuickTool(state, keys, {}, EditorPrimaryModifier.Command, context, "move"),
      null,
    );
    assert.equal(
      resolveCanvasQuickTool(
        state,
        { ...keys, metaKey: true },
        {},
        EditorPrimaryModifier.Command,
        { ...context, inside: false },
        "move",
      ),
      null,
    );
    assert.equal(
      resolveCanvasQuickTool(
        state,
        { ...keys, metaKey: true },
        {},
        EditorPrimaryModifier.Command,
        { ...context, space: true },
        "move",
      ),
      null,
    );
    assert.equal(
      resolveCanvasQuickTool(
        { ...state, document: null },
        { ...keys, metaKey: true },
        {},
        EditorPrimaryModifier.Command,
        context,
        null,
      ),
      null,
    );
  });
});
