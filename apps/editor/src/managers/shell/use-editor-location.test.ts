import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { EditorPageRoute } from "$/managers/ports/platform";
import { HelpDocumentTab } from "$/managers/shell/help";
import {
  normalizeEditorPath,
  resolveEditorHistoryNavigation,
  resolveEditorLocationWrite,
  resolveEditorRouteTab,
} from "$/managers/shell/use-editor-location";

describe("editor location routing", () => {
  it("normalizes root and trailing-slash routes", () => {
    assert.equal(normalizeEditorPath("/"), EditorPageRoute.Home);
    assert.equal(normalizeEditorPath(""), EditorPageRoute.Home);
    assert.equal(normalizeEditorPath("/home/"), EditorPageRoute.Home);
    assert.equal(normalizeEditorPath("/editor/"), EditorPageRoute.Document);
  });

  it("ignores utility tabs and never resolves an empty workspace to the document route", () => {
    assert.equal(resolveEditorRouteTab(HelpDocumentTab.Guide, false), null);
    assert.equal(resolveEditorRouteTab(HelpDocumentTab.Guide, true), null);
    assert.equal(resolveEditorRouteTab("document", false), "home");
    assert.equal(resolveEditorRouteTab("document", true), "document");
    assert.equal(resolveEditorRouteTab("home", true), "home");
  });

  it("pushes history only when switching between home and an open document", () => {
    assert.deepEqual(resolveEditorLocationWrite("/", "document", "home", true), {
      target: EditorPageRoute.Document,
      appendHistory: true,
    });
    assert.deepEqual(resolveEditorLocationWrite("/editor", "home", "document", true), {
      target: EditorPageRoute.Home,
      appendHistory: true,
    });
    assert.deepEqual(resolveEditorLocationWrite("/editor", "home", "document", false), {
      target: EditorPageRoute.Home,
      appendHistory: false,
    });
    assert.deepEqual(resolveEditorLocationWrite("/editor", "home", "home", false), {
      target: EditorPageRoute.Home,
      appendHistory: false,
    });
    assert.equal(resolveEditorLocationWrite("/", "home", "home", false), null);
  });

  it("keeps browser back/forward out of the empty document view when no documents are open", () => {
    assert.deepEqual(resolveEditorHistoryNavigation("/editor", "home", false), {
      nextTab: null,
      replaceRoute: EditorPageRoute.Home,
    });
    assert.deepEqual(resolveEditorHistoryNavigation("/editor", HelpDocumentTab.Guide, false), {
      nextTab: "home",
      replaceRoute: EditorPageRoute.Home,
    });
    assert.deepEqual(resolveEditorHistoryNavigation("/editor", "home", true), {
      nextTab: "document",
      replaceRoute: null,
    });
    assert.deepEqual(resolveEditorHistoryNavigation("/", "document", true), {
      nextTab: "home",
      replaceRoute: null,
    });
    assert.deepEqual(resolveEditorHistoryNavigation("/", "home", false), {
      nextTab: null,
      replaceRoute: null,
    });
  });
});
