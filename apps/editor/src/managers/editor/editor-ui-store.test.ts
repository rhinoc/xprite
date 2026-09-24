import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { createEditorUiStore } from "$/managers/editor/editor-ui-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("editor tab recovery", () => {
  it("remembers tab selection through opening, switching and closing tabs", () => {
    const storage = memoryStorage();
    const first = createEditorUiStore("home", storage);
    first.getState().openTab("document");
    const reopened = createEditorUiStore("home", storage, "/");
    assert.equal(reopened.getState().tab, "document");
    reopened.getState().setTab("home");
    assert.equal(createEditorUiStore("document", storage).getState().tab, "home");
    reopened.getState().openTab("document");
    reopened.getState().closeTab("document");
    assert.equal(createEditorUiStore("document", storage).getState().tab, "home");
  });

  it("honors the current route on refresh and remembers it for the next root visit", () => {
    const storage = memoryStorage();
    createEditorUiStore("home", storage);
    const editor = createEditorUiStore("home", storage, "/editor/");
    assert.equal(editor.getState().tab, "document");
    assert.equal(createEditorUiStore("home", storage, "/").getState().tab, "document");
    const home = createEditorUiStore("document", storage, "/home");
    assert.equal(home.getState().tab, "home");
    assert.equal(createEditorUiStore("document", storage, "/").getState().tab, "home");
  });

  it("uses the startup preference without a valid record and tolerates storage failures", () => {
    assert.equal(createEditorUiStore("home", memoryStorage()).getState().tab, "home");
    assert.equal(createEditorUiStore("document", memoryStorage()).getState().tab, "document");
    const invalidStorage = { getItem: () => "invalid", setItem: () => {} };
    assert.equal(createEditorUiStore("home", invalidStorage).getState().tab, "home");
    const unavailableStorage = {
      getItem: () => {
        throw new Error("Storage unavailable");
      },
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    };
    const store = createEditorUiStore("home", unavailableStorage);
    assert.equal(store.getState().tab, "home");
    store.getState().openTab("document");
    assert.equal(store.getState().tab, "document");
    assert.equal(
      createEditorUiStore("home", unavailableStorage, "/editor").getState().tab,
      "document",
    );
  });
});
