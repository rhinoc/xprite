import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

const effects = vi.hoisted(() => [] as (() => void)[]);
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => (() => void) | undefined) => {
    const cleanup = effect();
    if (cleanup) effects.push(cleanup);
  },
}));
vi.mock("$/components/window/interaction", () => ({ isOwnedOverlayTarget: () => false }));

import {
  createModalFocusScope,
  focusDialogContainer,
  isDialogPopupTarget,
  useModalFocus,
  type ModalFocusOptions,
} from "$/components/window/focus";

class FocusDocument extends EventTarget {
  activeElement: FocusElement | null = null;
  focusChanges = 0;
  elementsById = new Map<string, FocusElement>();
  getElementById(id: string) {
    return this.elementsById.get(id) ?? null;
  }
}

class FocusElement {
  isConnected = true;
  disabled = false;
  hidden = false;
  id = "";
  popupFor: string | null = null;
  children: FocusElement[] = [];
  constructor(readonly ownerDocument: FocusDocument) {}
  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }
  matches() {
    return true;
  }
  closest(selector: string) {
    if (selector === "[data-popup-for]" && this.popupFor) return this;
    if (selector === "[hidden]" && this.hidden) return this;
    return null;
  }
  getAttribute(name: string) {
    if (name === "data-popup-for") return this.popupFor;
    return null;
  }
  querySelectorAll(selector: string) {
    return selector === "[aria-controls]" ? [] : this.children;
  }
  focus() {
    const document = this.ownerDocument;
    if (this.disabled || document.activeElement === this) return;
    // A trap loop must fail deterministically instead of exhausting the test process stack.
    if (++document.focusChanges > 20) throw new Error("Modal focus loop");
    document.activeElement = this;
    const event = new Event("focusin");
    Object.defineProperty(event, "target", { value: this });
    document.dispatchEvent(event);
  }
}

function mount(
  root: FocusElement,
  onKeyDown = vi.fn(),
  isSuspended?: () => boolean,
  extra: Partial<ModalFocusOptions> = {},
) {
  useModalFocus({
    open: true,
    rootRef: { current: root as unknown as HTMLElement },
    onKeyDown,
    isSuspended,
    ...extra,
  });
  return onKeyDown;
}

function key(document: FocusDocument, value: string | undefined, shiftKey = false) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, {
    key: { value },
    shiftKey: { value: shiftKey },
    target: { value: document.activeElement },
  });
  document.dispatchEvent(event);
  return event;
}

afterEach(() => {
  while (effects.length) effects.pop()!();
  vi.unstubAllGlobals();
});

function browser() {
  vi.stubGlobal("HTMLElement", FocusElement);
  vi.stubGlobal("Element", FocusElement);
  vi.stubGlobal("Node", FocusElement);
  return new FocusDocument();
}

describe("modal focus ownership", () => {
  it("opens a portaled child without recursive focus and restores its parent", () => {
    const document = browser();
    const opener = new FocusElement(document);
    opener.focus();
    const parent = new FocusElement(document);
    const parentKeys = mount(parent);
    const child = new FocusElement(document);
    const first = new FocusElement(document),
      last = new FocusElement(document);
    child.children = [first, last];
    const childKeys = mount(child);
    assert.equal(document.activeElement, child);
    last.focus();
    assert.equal(key(document, "Tab").defaultPrevented, true);
    assert.equal(document.activeElement, first);
    key(document, "Tab", true);
    assert.equal(document.activeElement, last);
    key(document, "Escape");
    assert.equal(parentKeys.mock.calls.length, 0);
    assert.equal(childKeys.mock.calls.length, 3);
    const outside = new FocusElement(document);
    outside.focus();
    assert.equal(document.activeElement, child);
    effects.pop()!();
    assert.equal(document.activeElement, parent);
    key(document, "Escape");
    assert.equal(parentKeys.mock.calls.length, 1);
    effects.pop()!();
    assert.equal(document.activeElement, opener);
  });

  it("keeps a child active when its containing parent's effect mounts later", () => {
    const document = browser();
    const child = new FocusElement(document);
    const parent = new FocusElement(document);
    parent.children = [child];
    const childKeys = mount(child);
    const parentKeys = mount(parent);
    assert.equal(document.activeElement, child);
    key(document, "Escape");
    assert.equal(parentKeys.mock.calls.length, 0);
    assert.equal(childKeys.mock.calls.length, 1);
    effects.pop()!();
    assert.equal(document.activeElement, child);
  });

  it("does not restore a background modal over a newer modal", () => {
    const document = browser();
    const background = createModalFocusScope(new FocusElement(document) as unknown as HTMLElement);
    const foreground = createModalFocusScope(new FocusElement(document) as unknown as HTMLElement);
    assert.equal(background.dispose(), false);
    assert.equal(foreground.isActive(), true);
    assert.equal(foreground.dispose(), true);
  });

  it("keeps a newer unrelated modal above a parent that registers after its child", () => {
    const document = browser();
    const child = new FocusElement(document),
      parent = new FocusElement(document);
    parent.children = [child];
    const childScope = createModalFocusScope(child as unknown as HTMLElement);
    const foreground = createModalFocusScope(new FocusElement(document) as unknown as HTMLElement);
    const parentScope = createModalFocusScope(parent as unknown as HTMLElement);
    assert.equal(foreground.isActive(), true);
    assert.equal(parentScope.dispose(), false);
    assert.equal(foreground.dispose(), true);
    assert.equal(childScope.isActive(), true);
    childScope.dispose();
  });

  it("gives focus to a child modal opened over a scoped parent and returns it on close", () => {
    // Save As keeps its form open when saving fails; the error dialog opens on top of it.
    const document = browser();
    const saveAs = new FocusElement(document);
    const nameInput = new FocusElement(document);
    saveAs.children = [nameInput];
    mount(saveAs);
    nameInput.focus();
    const error = new FocusElement(document);
    const ok = new FocusElement(document);
    error.children = [ok];
    const errorKeys = mount(error);
    assert.equal(document.activeElement, error);
    ok.focus();
    assert.equal(document.activeElement, ok);
    key(document, "Escape");
    assert.equal(errorKeys.mock.calls.length, 1);
    effects.pop()!();
    assert.equal(document.activeElement, nameInput);
  });

  it("keeps focus in the parent modal when the child's opener cannot take it back", () => {
    // Save As disables its Save button while saving, so focus cannot return there.
    const document = browser();
    const saveAs = new FocusElement(document);
    const save = new FocusElement(document);
    saveAs.children = [save];
    mount(saveAs);
    save.focus();
    const error = new FocusElement(document);
    mount(error);
    assert.equal(document.activeElement, error);
    save.disabled = true;
    effects.pop()!();
    assert.equal(document.activeElement, saveAs);
  });

  it("stops two focus traps that disagree after one move instead of recursing", () => {
    const document = browser();
    const first = new FocusElement(document);
    const second = new FocusElement(document);
    for (const root of [first, second])
      document.addEventListener("focusin", (event) => {
        if (!root.contains(event.target)) focusDialogContainer(root as unknown as HTMLElement);
      });
    assert.doesNotThrow(() => second.focus());
    assert.ok(document.focusChanges <= 3, `focus moved ${document.focusChanges} times`);
  });

  it("isolates documents and gates business shortcuts while suspended", () => {
    const document = browser();
    const otherDocument = new FocusDocument();
    const opener = new FocusElement(document);
    opener.focus();
    const suspended = new FocusElement(document);
    const suspendedKeys = mount(suspended, vi.fn(), () => true);
    assert.equal(document.activeElement, opener);
    const activeKeys = mount(new FocusElement(otherDocument));
    key(document, "Escape");
    key(otherDocument, "Escape");
    assert.equal(suspendedKeys.mock.calls.length, 0);
    assert.equal(activeKeys.mock.calls.length, 1);
  });

  it("disables trapping when modal is false and skips restoration when restoreFocus is false", () => {
    const document = browser();
    const opener = new FocusElement(document);
    opener.focus();
    const nonModal = new FocusElement(document);
    const onEscape = vi.fn();
    mount(nonModal, vi.fn(), undefined, { modal: false, onEscape });
    assert.equal(document.activeElement, opener);
    key(document, "Escape");
    assert.equal(onEscape.mock.calls.length, 0);

    const noRestore = new FocusElement(document);
    mount(noRestore, vi.fn(), undefined, { restoreFocus: false });
    assert.equal(document.activeElement, noRestore);
    effects.pop()!();
    assert.equal(document.activeElement, noRestore);
  });

  it("runs onEscape after onKeyDown unless prevented and handles missing event.key safely", () => {
    const document = browser();
    const dialog = new FocusElement(document);
    const onEscape = vi.fn();
    let consumeEscape = true;
    mount(
      dialog,
      (event) => {
        if (consumeEscape && event.key === "Escape") event.preventDefault();
      },
      undefined,
      { onEscape },
    );
    assert.doesNotThrow(() => key(document, undefined));
    assert.equal(onEscape.mock.calls.length, 0);

    key(document, "Escape");
    assert.equal(onEscape.mock.calls.length, 0);

    consumeEscape = false;
    const escaped = key(document, "Escape");
    assert.equal(escaped.defaultPrevented, true);
    assert.equal(onEscape.mock.calls.length, 1);
  });

  it("filters hidden controls during Tab cycling and reclaims focus via custom reclaimFocus", () => {
    const document = browser();
    const dialog = new FocusElement(document);
    const visibleFirst = new FocusElement(document);
    const hiddenMiddle = new FocusElement(document);
    hiddenMiddle.hidden = true;
    const visibleLast = new FocusElement(document);
    dialog.children = [visibleFirst, hiddenMiddle, visibleLast];
    mount(dialog, vi.fn(), undefined, {
      filterFocusable: (node) => !node.closest("[hidden]"),
    });
    visibleLast.focus();
    key(document, "Tab");
    assert.equal(document.activeElement, visibleFirst);
    key(document, "Tab", true);
    assert.equal(document.activeElement, visibleLast);

    // Custom reclaimFocus (used by AlertDialog) reclaims outside focus and restores parent fallback.
    const alert = new FocusElement(document);
    const okButton = new FocusElement(document);
    alert.children = [okButton];
    const focusOk = () => okButton.focus();
    mount(alert, vi.fn(), undefined, {
      initialFocus: focusOk,
      reclaimFocus: focusOk,
    });
    assert.equal(document.activeElement, okButton);
    const outside = new FocusElement(document);
    outside.focus();
    assert.equal(document.activeElement, okButton);
  });

  it("allows focus inside portaled popups linked via data-popup-for", () => {
    const document = browser();
    const dialog = new FocusElement(document);
    const trigger = new FocusElement(document);
    trigger.id = "wechat-trigger";
    document.elementsById.set(trigger.id, trigger);
    dialog.children = [trigger];
    mount(dialog);

    const popup = new FocusElement(document);
    popup.popupFor = trigger.id;
    assert.equal(
      isDialogPopupTarget(dialog as unknown as HTMLElement, popup as unknown as Node),
      true,
    );
    popup.focus();
    assert.equal(document.activeElement, popup);
  });
});
