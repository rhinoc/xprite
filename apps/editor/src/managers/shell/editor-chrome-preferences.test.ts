import assert from "node:assert/strict";

import { build } from "esbuild";
import { it } from "vitest";

async function loadChromePreferencesManager() {
  const bundle = await build({
    entryPoints: ["apps/editor/src/managers/shell/editor-chrome-preferences.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const { EditorChromePreferencesManager } = await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
  return EditorChromePreferencesManager;
}

it("links layout chrome and settings, retaining per-layout changes after switching and reloading", async () => {
  const EditorChromePreferencesManager = await loadChromePreferencesManager();
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const compact = {
    showEditorMenuBar: false,
    showShortcutToolbar: true,
    showCanvasScrollbars: false,
    contextBarPresentation: "tool-popup",
  };
  const wide = {
    showEditorMenuBar: true,
    showShortcutToolbar: true,
    showCanvasScrollbars: true,
    contextBarPresentation: "docked",
  };
  const manager = new EditorChromePreferencesManager(storage);
  manager.activateWorkspaceLayout("compact", compact);
  assert.equal(manager.getSnapshot().showEditorMenuBar, false);
  manager.patchPreferences({ showEditorMenuBar: true, showShortcutToolbar: false });
  manager.activateWorkspaceLayout("compact", compact);
  assert.equal(
    manager.getSnapshot().showEditorMenuBar,
    true,
    "A settings change overrides the active preset default.",
  );
  manager.activateWorkspaceLayout("wide", wide);
  assert.equal(
    manager.getSnapshot().showShortcutToolbar,
    false,
    "A layout without a saved shortcut preference retains the user's current choice.",
  );
  manager.activateWorkspaceLayout("compact", compact);
  assert.equal(manager.getSnapshot().showShortcutToolbar, false);
  const reloaded = new EditorChromePreferencesManager(storage);
  reloaded.activateWorkspaceLayout("compact", compact);
  assert.equal(reloaded.getSnapshot().showEditorMenuBar, true);
  assert.equal(reloaded.getSnapshot().contextBarPresentation, "tool-popup");
  reloaded.activateWorkspaceLayout("compact", compact, true);
  assert.equal(reloaded.getSnapshot().showEditorMenuBar, false);
  assert.equal(reloaded.getSnapshot().showShortcutToolbar, true);
  reloaded.patchPreferences({ showEditorMenuBar: true, showShortcutToolbar: false });
  reloaded.activateWorkspaceLayout("wide", compact, true);
  reloaded.activateWorkspaceLayout("compact", compact, true);
  const resetReload = new EditorChromePreferencesManager(storage);
  resetReload.activateWorkspaceLayout("compact", compact);
  assert.equal(
    resetReload.getSnapshot().showEditorMenuBar,
    false,
    "Resetting must persist even when another layout currently has the same effective values.",
  );
});

it("uses keyboard hints only for the first shortcut default, independently of layout geometry", async () => {
  const EditorChromePreferencesManager = await loadChromePreferencesManager();
  for (const keyboardLikelyAvailable of [false, true]) {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const wide = {
      showEditorMenuBar: true,
      showShortcutToolbar: false,
      showCanvasScrollbars: false,
      contextBarPresentation: "docked",
    };
    const compact = { ...wide, showShortcutToolbar: true };
    const manager = new EditorChromePreferencesManager(storage, keyboardLikelyAvailable);
    assert.equal(manager.getSnapshot().showShortcutToolbar, !keyboardLikelyAvailable);
    manager.activateWorkspaceLayout("compact", compact);
    manager.activateWorkspaceLayout("wide", wide);
    assert.equal(manager.getSnapshot().showShortcutToolbar, !keyboardLikelyAvailable);

    // The first default is persisted even when the user has not opened Preferences.
    const returning = new EditorChromePreferencesManager(storage, !keyboardLikelyAvailable);
    returning.activateWorkspaceLayout("wide", wide);
    assert.equal(returning.getSnapshot().showShortcutToolbar, !keyboardLikelyAvailable);

    returning.patchPreferences({ showShortcutToolbar: keyboardLikelyAvailable });
    const reloaded = new EditorChromePreferencesManager(storage, keyboardLikelyAvailable);
    reloaded.activateWorkspaceLayout("wide", wide);
    assert.equal(reloaded.getSnapshot().showShortcutToolbar, keyboardLikelyAvailable);
    reloaded.activateWorkspaceLayout("unvisited", compact);
    assert.equal(reloaded.getSnapshot().showShortcutToolbar, keyboardLikelyAvailable);

    // Loading an explicitly saved layout still restores its own visibility setting.
    reloaded.activateWorkspaceLayout("saved:custom", wide, true);
    assert.equal(reloaded.getSnapshot().showShortcutToolbar, false);

    storage.setItem(
      "xse.shell.chrome-preferences.v1",
      JSON.stringify({ showShortcutToolbar: keyboardLikelyAvailable }),
    );
    storage.setItem(
      "xse.layout.chrome-preferences.v1",
      JSON.stringify({ wide: { ...wide, showShortcutToolbar: !keyboardLikelyAvailable } }),
    );
    const existing = new EditorChromePreferencesManager(storage, keyboardLikelyAvailable);
    assert.equal(existing.getSnapshot().showShortcutToolbar, keyboardLikelyAvailable);
    existing.activateWorkspaceLayout("wide", wide);
    assert.equal(existing.getSnapshot().showShortcutToolbar, !keyboardLikelyAvailable);
  }
});
