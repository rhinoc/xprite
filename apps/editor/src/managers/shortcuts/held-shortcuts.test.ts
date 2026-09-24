import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { EditorPrimaryModifier } from "$/managers/ports/platform";
import type { ShortcutFileEntry } from "$/managers/ports/shortcut-files";
import { shortcutContexts } from "$/managers/shortcuts/shortcut-contexts";
import {
  SHORTCUT_DEFINITIONS,
  ShortcutBindingKind,
  ShortcutDragAction,
  ShortcutManager,
} from "$/managers/shortcuts/shortcut-manager";
import { RasterEditor } from "@xprite/editor-core";

const findDefinition = (kind: ShortcutBindingKind, id: string) => {
  const definition = SHORTCUT_DEFINITIONS.find((entry) => entry.kind === kind && entry.id === id);
  assert.ok(definition);
  return definition;
};
const emptyStorage = { getItem: () => null, setItem: () => {} };

describe("held tool and drag shortcuts", () => {
  it("matches native quick tools exactly and keeps physical Control for Mac drag values", () => {
    const manager = new ShortcutManager(emptyStorage, undefined, EditorPrimaryModifier.Command);
    assert.equal(manager.resolveQuickTool({ key: "", alt: true }), "eyedropper");
    assert.equal(manager.resolveQuickTool({ key: "", meta: true }), "move");
    assert.equal(manager.resolveQuickTool({ key: "", space: true }), "hand");
    assert.equal(manager.resolveQuickTool({ key: "", ctrl: true }), null);
    assert.equal(manager.resolveQuickTool({ key: "", ctrl: true, alt: true }), null);
    assert.equal(manager.resolveQuickTool({ key: "", meta: true, shift: true }), null);
    const drag = manager.resolveDragActions({ key: "", ctrl: true, alt: true });
    assert.equal(drag.length, 1);
    assert.equal(drag[0].id, ShortcutDragAction.BrushSize);
    assert.deepEqual(drag[0].vector, { x: 4, y: 0 });
    assert.equal(manager.resolveDragActions({ key: "", meta: true, alt: true }).length, 0);
    assert.equal(manager.isDragActionPressed(drag[0], { key: "", ctrl: true }), false);
  });

  it("retains the selected tool when a held character binding shadows a normal tool key", () => {
    const manager = new ShortcutManager(emptyStorage);
    const hand = findDefinition(ShortcutBindingKind.QuickTool, "hand");
    manager.apply(manager.update(manager.beginDraft(), hand.key, ["R"]));
    manager.setPressedKey("r", true);
    assert.equal(manager.resolve({ key: "R" }, { type: "tool", tool: "blur" }), null);
    assert.equal(manager.resolveQuickTool({ key: "" }), "hand");
    manager.setPressedKey("r", false);
    assert.equal(manager.resolveQuickTool({ key: "" }), null);
    assert.equal(manager.resolveQuickTool({ key: "", space: true }), null);
    assert.equal(manager.resolveQuickTool({ key: "R", editingText: true }), null);
  });

  it("keeps independent binding/vector drafts and persists only applied changes", () => {
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    };
    const manager = new ShortcutManager(storage);
    const brush = findDefinition(ShortcutBindingKind.Drag, "BrushSize");
    let draft = manager.updateDragVector(manager.beginDraft(), brush, { x: 0, y: 8 });
    draft = manager.update(draft, brush.key, ["Shift+F8"]);
    assert.deepEqual(manager.dragVector(brush, draft), { x: 0, y: 8 });
    assert.deepEqual(manager.dragVector(brush), { x: 4, y: 0 });
    manager.apply(draft);
    const discarded = manager.updateDragVector(manager.beginDraft(), brush, { x: -16, y: 0 });
    assert.deepEqual(manager.dragVector(brush, discarded), { x: -16, y: 0 });
    const restored = new ShortcutManager(storage);
    assert.deepEqual(restored.dragVector(brush), { x: 0, y: 8 });
    assert.deepEqual(restored.bindings(brush), ["Shift+F8"]);
    restored.setPressedKey("F8", true);
    assert.equal(restored.resolveDragActions({ key: "", shift: true }).length, 1);
    restored.clearPressedKeys();
    assert.equal(restored.resolveDragActions({ key: "", shift: true }).length, 0);
    const reset = restored.reset(restored.beginDraft(), brush.key);
    assert.deepEqual(restored.dragVector(brush, reset), { x: 4, y: 0 });
    assert.deepEqual(restored.bindings(brush, reset), ["Ctrl+Alt"]);
  });

  it("exports vector-only changes and imports quicktool/drag removals and additions", async () => {
    let entries: readonly ShortcutFileEntry[] = [];
    const port = {
      read: async () => entries,
      write: async (value: readonly ShortcutFileEntry[]) => {
        entries = value;
      },
    };
    const manager = new ShortcutManager(emptyStorage, port);
    const brush = findDefinition(ShortcutBindingKind.Drag, "BrushSize");
    const hand = findDefinition(ShortcutBindingKind.QuickTool, "hand");
    let draft = manager.updateDragVector(manager.beginDraft(), brush, { x: 0, y: -12 });
    draft = manager.update(draft, hand.key, ["F9"]);
    await manager.exportDraft(draft);
    assert.ok(
      entries.some(
        (entry) =>
          entry.kind === ShortcutBindingKind.Drag &&
          entry.shortcut === "Ctrl+Alt" &&
          !entry.removed &&
          entry.vector?.y === -12,
      ),
    );
    assert.ok(
      entries.some(
        (entry) =>
          entry.kind === ShortcutBindingKind.QuickTool &&
          entry.shortcut === "Space" &&
          entry.removed,
      ),
    );
    const imported = await manager.importDraft({});
    assert.ok(imported);
    assert.deepEqual(manager.dragVector(brush, imported), { x: 0, y: -12 });
    assert.deepEqual(manager.bindings(brush, imported), ["Ctrl+Alt"]);
    assert.deepEqual(manager.bindings(hand, imported), ["F9"]);
  });

  it("keeps idle shape tool shortcuts available and consumes shape action keys only while drawing", () => {
    const manager = new ShortcutManager(emptyStorage);
    const editor = new RasterEditor({ width: 1, height: 1, data: new Uint8ClampedArray(4) });
    const snapshot = editor.getSnapshot();
    const idle = { ...snapshot, settings: { ...snapshot.settings, tool: "rectangle" as const } };
    const idleContexts = shortcutContexts(idle);
    assert.equal(idleContexts.actions.includes("Shape"), false);
    assert.deepEqual(
      manager.resolve({ key: "C", shift: true }, null, idleContexts.command, idleContexts.actions),
      { type: "tool", tool: "slice" },
    );
    const drawing = {
      ...idle,
      preview: { tool: "rectangle" as const, points: [{ x: 0, y: 0 }], button: 0 },
    };
    const drawingContexts = shortcutContexts(drawing);
    assert.equal(drawingContexts.actions.includes("Shape"), true);
    assert.equal(
      manager.resolve(
        { key: "C" },
        { type: "tool", tool: "contour" },
        drawingContexts.command,
        drawingContexts.actions,
      ),
      null,
    );
    assert.equal(
      shortcutContexts({
        ...idle,
        settings: { ...idle.settings, tool: "pencil" as const },
      }).actions.includes("Freehand"),
      true,
    );
  });

  it("treats Corner Radius as a held Shape action under loose modifier matching", () => {
    const manager = new ShortcutManager(emptyStorage);
    manager.setPressedKey("C", true);
    assert.equal(manager.resolveAction("CornerRadius", { key: "", ctrl: true }, "Shape"), true);
    assert.equal(
      manager.resolve({ key: "C", shift: true }, { type: "tool", tool: "slice" }, "Normal", [
        "Shape",
      ]),
      null,
    );
    manager.setPressedKey("C", false);
    assert.equal(manager.resolveAction("CornerRadius", { key: "" }, "Shape"), false);
  });
});
