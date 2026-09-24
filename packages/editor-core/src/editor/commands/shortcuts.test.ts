import assert from "node:assert/strict";
import fs from "node:fs";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-shortcuts", () => {
  it("editor-shortcuts behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/editor/commands/shortcuts.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { resolveShortcut } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const catalog = JSON.parse(
      fs.readFileSync("apps/editor/assets/commands/libresprite-keyboard-shortcuts.json", "utf8"),
    );

    const availabilityBuild = await build({
      entryPoints: ["apps/editor/src/managers/menus/shortcut-availability.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { isCallableShortcut } = await import(
      `data:text/javascript;base64,${Buffer.from(availabilityBuild.outputFiles[0].contents).toString("base64")}`
    );
    assert.equal(catalog.schemaVersion, 3);
    assert.equal(catalog.commands.length, 53);
    assert.equal(catalog.tools.length, 26);
    assert.equal(catalog.actions.length, 13);
    assert.equal("drag" in catalog, false);
    assert.equal("quickTools" in catalog, false);
    for (const row of catalog.commands)
      assert(
        isCallableShortcut(row.shortcut, row.id, undefined, row.params),
        `${row.id} ${row.shortcut} resolves to its product action`,
      );
    for (const row of catalog.tools)
      assert(
        isCallableShortcut(row.shortcut, undefined, row.id),
        `${row.id} ${row.shortcut} resolves to its product tool`,
      );
    assert.deepEqual(
      catalog.actions.map((row) => row.id),
      [
        "CopySelection",
        "LockAxis",
        "AngleSnap",
        "MaintainAspectRatio",
        "AddSelection",
        "SubtractSelection",
        "IntersectSelection",
        "AutoSelectLayer",
        "StraightLineFromLastPoint",
        "SquareAspect",
        "DrawFromCenter",
        "MoveOrigin",
        "RotateShape",
      ],
    );
    console.log(
      "Keyboard catalog contains only resolver-backed commands/tools and implemented action modifiers.",
    );
    assert.deepEqual(resolveShortcut({ key: "d", ctrl: true }), {
      type: "deselect",
    });
    assert.deepEqual(
      resolveShortcut({ key: "d", ctrl: true, shift: true }),
      { type: "reselect" },
      "Implemented Aseprite Reselect is distinct from Deselect",
    );
    assert.deepEqual(resolveShortcut({ key: "d", meta: true, shift: true }), { type: "reselect" });
    assert.equal(resolveShortcut({ key: "d", meta: true, shift: true, editingText: true }), null);
    assert.deepEqual(
      resolveShortcut({ key: "'", meta: true, shift: true }),
      { type: "toggle-pixel-grid" },
      "Aseprite Shift+apostrophe toggles Pixel Grid independently from normal Grid",
    );
    assert.deepEqual(resolveShortcut({ key: '"', ctrl: true, shift: true }), {
      type: "toggle-pixel-grid",
    });
    assert.deepEqual(
      resolveShortcut({ key: "s", meta: true, alt: true, shift: true }),
      { type: "export" },
      "Export As uses its own implemented download action",
    );
    assert.deepEqual(resolveShortcut({ key: "s", ctrl: true, alt: true, shift: true }), {
      type: "export",
    });
    assert.equal(
      resolveShortcut({ key: "s", ctrl: true, alt: true }),
      null,
      "Ctrl+Alt+S is not Export As",
    );
    assert.equal(
      resolveShortcut({ key: "z", ctrl: true, alt: true }),
      null,
      "Extra modifiers must not accidentally undo",
    );
    assert.deepEqual(resolveShortcut({ key: "z", meta: true, shift: true }), {
      type: "redo",
    });
    assert.deepEqual(
      resolveShortcut({ key: "s", meta: true, shift: true }),
      { type: "save-as" },
      "Save As uses the product download action",
    );
    assert.deepEqual(resolveShortcut({ key: "r", ctrl: true }), { type: "redo" });
    assert.equal(resolveShortcut({ key: "r", ctrl: true, shift: true }), null);
    assert.equal(resolveShortcut({ key: "b", editingText: true }), null);
    console.log(
      "Shortcut checks pass: Aseprite modifier distinctions, unsupported commands ignored, supported undo/redo/save aliases and text isolation.",
    );

    assert.deepEqual(resolveShortcut({ key: "k", ctrl: true }), {
      type: "preferences",
    });
    assert.deepEqual(resolveShortcut({ key: ",", meta: true }), {
      type: "preferences",
    });
    assert.deepEqual(
      resolveShortcut({ key: "k", ctrl: true, alt: true, shift: true }),
      {
        type: "keyboard-shortcuts",
      },
      "The product Keyboard Shortcuts dialog uses Ctrl+Alt+Shift+K",
    );
    assert.deepEqual(
      resolveShortcut({ key: "k", meta: true, alt: true, shift: true }),
      {
        type: "keyboard-shortcuts",
      },
      "The Mac binding uses Command+Option+Shift+K",
    );
    assert.equal(
      resolveShortcut({ key: "k", ctrl: true, alt: true, shift: true, editingText: true }),
      null,
    );
    assert.deepEqual(resolveShortcut({ key: "n", ctrl: true, alt: true }), {
      type: "new-sprite-from-selection",
    });
    assert.deepEqual(resolveShortcut({ key: "n", meta: true, alt: true }), {
      type: "new-sprite-from-selection",
    });
    assert.deepEqual(resolveShortcut({ key: "j", ctrl: true }), { type: "new-layer-via-copy" });
    assert.deepEqual(resolveShortcut({ key: "j", meta: true }), { type: "new-layer-via-copy" });
    assert.deepEqual(resolveShortcut({ key: "j", ctrl: true, shift: true }), {
      type: "new-layer-via-cut",
    });
    assert.deepEqual(resolveShortcut({ key: "j", meta: true, shift: true }), {
      type: "new-layer-via-cut",
    });
    assert.equal(resolveShortcut({ key: "j", ctrl: true, editingText: true }), null);
    assert.equal(resolveShortcut({ key: "k", ctrl: true, shift: true }), null);
    assert.deepEqual(resolveShortcut({ key: "a", meta: true }), {
      type: "select-all",
    });
    assert.deepEqual(resolveShortcut({ key: "Delete" }), { type: "clear" });
    assert.deepEqual(resolveShortcut({ key: "Backspace" }), { type: "clear" });
    assert.equal(
      resolveShortcut({ key: "Delete", shift: true }),
      null,
      "Unsupported Cut must not clear without copying",
    );
    assert.deepEqual(
      resolveShortcut({ key: "v", ctrl: true }),
      { type: "paste" },
      "Clipboard Paste routes through the installed browser clipboard adapter",
    );
    assert.deepEqual(resolveShortcut({ key: "ArrowLeft" }), {
      type: "move-selection",
      dx: -1,
      dy: 0,
      boundsOnly: false,
      byGrid: false,
    });
    assert.deepEqual(resolveShortcut({ key: "ArrowDown", alt: true, shift: true }), {
      type: "move-selection",
      dx: 0,
      dy: 1,
      boundsOnly: true,
      byGrid: true,
    });
    assert.equal(resolveShortcut({ key: "ArrowDown", ctrl: true }), null);
    assert.equal(resolveShortcut({ key: "ArrowRight", editingText: true }), null);
    console.log("Selection shortcuts and unsupported clipboard isolation pass.");

    assert.deepEqual(resolveShortcut({ key: "0", meta: true }), { type: "fit-screen" });
    assert.deepEqual(resolveShortcut({ key: "Z", shift: true }), { type: "scroll-center" });
    assert.deepEqual(resolveShortcut({ key: "I", ctrl: true, shift: true }), {
      type: "invert-selection",
    });
    assert.equal(
      resolveShortcut({ key: "-", shift: true }),
      null,
      "Shift modifiers cannot leak to base brush command",
    );
    assert.equal(resolveShortcut({ key: "[", shift: true }), null);
    console.log("Fit-screen, center, invert-selection and remaining modifier isolation pass.");

    const commandBuild = await build({
      entryPoints: ["packages/editor-core/src/editor/commands/editor-commands.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { executeEditorCommand } = await import(
      `data:text/javascript;base64,${Buffer.from(commandBuild.outputFiles[0].contents).toString("base64")}`
    );
    const calls = [];
    const state = {
      document: {
        selection: { data: new Uint8Array([1]) },
        layer: { visible: true, locked: false },
      },
      settings: { tool: "marquee" },
      view: {},
      floatingPaste: null,
      inlineText: null,
      canUndo: false,
      canRedo: false,
      playing: false,
    };
    const fakeCore = {
      getSnapshot: () => state,
      clipboard: {
        newLayerViaSelection: (cut) => {
          calls.push(cut);
          return true;
        },
      },
    };
    const context = { scene: "document", viewport: { width: 128, height: 128 } };
    assert.deepEqual(executeEditorCommand(fakeCore, { type: "new-layer-via-copy" }, context), {
      kind: "handled",
    });
    assert.deepEqual(executeEditorCommand(fakeCore, { type: "new-layer-via-cut" }, context), {
      kind: "handled",
    });
    assert.deepEqual(
      calls,
      [false, true],
      "New Layer via Copy and Cut call the core operation with their Aseprite cut flag",
    );
    assert.deepEqual(
      executeEditorCommand(fakeCore, { type: "keyboard-shortcuts" }, { ...context, scene: "home" }),
      { kind: "request", action: "keyboard-shortcuts" },
    );
    assert.deepEqual(
      executeEditorCommand(fakeCore, { type: "new-sprite-from-selection" }, context),
      {
        kind: "request",
        action: "new-sprite-from-selection",
      },
    );
    console.log("Keyboard window requests and selection layer command routing pass.");
  }, 60_000);
});

describe("animation-shortcuts", () => {
  it("animation-shortcuts behavior", async () => {
    const bundled = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { RasterEditor, resolveShortcut, executeEditorCommand } = await import(
      `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`
    );
    const core = new RasterEditor({ width: 4, height: 4, data: new Uint8ClampedArray(64) }),
      context = { scene: "document", viewport: { width: 100, height: 100 } };
    const key = (key, other = {}) =>
      executeEditorCommand(core, resolveShortcut({ key, ...other }), context);
    key("n", { alt: true });
    assert.equal(core.getSnapshot().document.timeline.frames.length, 2);
    key("Home");
    assert.equal(core.getSnapshot().document.timeline.activeFrame, 0);
    key("ArrowRight");
    assert.equal(core.getSnapshot().document.timeline.activeFrame, 1);
    key("ArrowLeft");
    assert.equal(core.getSnapshot().document.timeline.activeFrame, 0);
    key("Enter");
    assert.equal(core.getSnapshot().playing, true);
    key("Escape");
    assert.equal(core.getSnapshot().playing, false);
    key("End");
    assert.equal(core.getSnapshot().document.timeline.activeFrame, 1);
    assert.equal(key("n", { shift: true }).kind, "handled");
    assert.equal(core.getSnapshot().document.layer.name, "Layer 2");
    core.timeline.deleteLayer();
    assert.deepEqual(key("p", { shift: true }), { kind: "request", action: "layer-properties" });
    assert.deepEqual(key("p"), { kind: "request", action: "frame-properties" });
    assert.deepEqual(
      resolveShortcut({ key: "Enter", shift: true }),
      { type: "play-preview" },
      "Aseprite Shift+Enter routes independent preview playback",
    );
    const beforePreview = core.getSnapshot();
    assert.deepEqual(key("Enter", { shift: true }), { kind: "request", action: "play-preview" });
    assert.equal(
      core.getSnapshot(),
      beforePreview,
      "Preview request must not change the editing timeline or its playback state",
    );
    core.timeline.addLayer("Above");
    key("ArrowDown");
    assert.equal(core.getSnapshot().document.timeline.activeLayer, 0);
    key("ArrowUp");
    assert.equal(core.getSnapshot().document.timeline.activeLayer, 1);
    const visible = core.getSnapshot().document.layer.visible;
    key("x", { shift: true });
    assert.equal(core.getSnapshot().document.layer.visible, !visible);
    key("x", { shift: true });
    core.drawing.settings.setSettings({ tool: "marquee" });
    core.selection.selectAll();
    key("ArrowLeft", { alt: true });
    assert.equal(
      core.getSnapshot().document.selection.x,
      -1,
      "Selection context takes priority over frame navigation",
    );
    assert.equal(core.getSnapshot().document.timeline.activeFrame, 1);
    console.log("Aseprite animation/layer keyboard commands and selection-context priority pass.");
    core.selection.deselect();
    core.drawing.settings.setSettings({ tool: "pencil" });
    core.timeline.selectFrame(0);
    key("ArrowLeft");
    assert.equal(core.getSnapshot().document.timeline.activeFrame, 1, "Previous frame wraps");
    key("ArrowRight");
    assert.equal(core.getSnapshot().document.timeline.activeFrame, 0, "Next frame wraps");
    core.timeline.selectLayer(0);
    key("ArrowDown");
    assert.equal(core.getSnapshot().document.timeline.activeLayer, 1, "Previous layer wraps");
    console.log("Aseprite frame/layer boundary wrap passes.");
  }, 60_000);
});
