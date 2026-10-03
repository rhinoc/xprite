import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { createEditorUiStore, editorViewForState } from "$/managers/editor/editor-ui-store";
import {
  automaticViewTransition,
  EditorView,
  EditorViewChangeTrigger,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { HelpDocumentTab } from "$/managers/shell/help";

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

describe("editor view transitions", () => {
  it("preserves the transition cause when the current view is selected again", () => {
    const store = createEditorUiStore("home");
    store.getState().openTab("document");
    assert.equal(store.getState().viewTransition.trigger, EditorViewChangeTrigger.User);
    const transition = store.getState().viewTransition;
    store
      .getState()
      .openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentActivated));
    store.getState().setTab("document");
    assert.equal(store.getState().viewTransition, transition);
    store
      .getState()
      .setTab("home", automaticViewTransition(EditorViewChangeReason.LastDocumentClosed));
    assert.equal(editorViewForState(store.getState()), EditorView.Home);
    assert.equal(store.getState().viewTransition.trigger, EditorViewChangeTrigger.Automatic);
    assert.equal(store.getState().viewTransition.reason, EditorViewChangeReason.LastDocumentClosed);
  });

  it("distinguishes recovery and guide views and leaves recovery on navigation", () => {
    const store = createEditorUiStore("home");
    store.getState().setRecoveryOpen(true);
    assert.equal(editorViewForState(store.getState()), EditorView.Recovery);
    assert.equal(store.getState().viewTransition.reason, EditorViewChangeReason.RecoveryOpened);
    store.getState().setRecoveryOpen(false);
    assert.equal(editorViewForState(store.getState()), EditorView.Home);
    assert.equal(store.getState().viewTransition.reason, EditorViewChangeReason.RecoveryClosed);
    store.getState().setRecoveryOpen(true);
    store.getState().openTab("document", {
      trigger: EditorViewChangeTrigger.Navigation,
      reason: EditorViewChangeReason.HistoryNavigation,
    });
    assert.equal(store.getState().recoveryOpen, false);
    assert.equal(editorViewForState(store.getState()), EditorView.Editor);
    assert.equal(store.getState().viewTransition.trigger, EditorViewChangeTrigger.Navigation);
    store.getState().openTab(HelpDocumentTab.Guide);
    assert.equal(editorViewForState(store.getState()), EditorView.Guide);
    store.getState().closeTab(HelpDocumentTab.Guide);
    assert.equal(editorViewForState(store.getState()), EditorView.Editor);
    assert.equal(store.getState().viewTransition.reason, EditorViewChangeReason.TabClosed);
  });

  it("does not replace the view transition when an inactive tab closes", () => {
    const store = createEditorUiStore("home");
    const transition = store.getState().viewTransition;
    store.getState().closeTab("document");
    assert.equal(editorViewForState(store.getState()), EditorView.Home);
    assert.equal(store.getState().viewTransition, transition);
  });
});
