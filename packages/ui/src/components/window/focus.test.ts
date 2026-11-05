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

import { createModalFocusScope, useModalFocus } from "$/components/window/focus";

class FocusDocument extends EventTarget {
  activeElement: FocusElement | null = null;
  focusChanges = 0;
}

class FocusElement {
  isConnected = true;
  children: FocusElement[] = [];
  constructor(readonly ownerDocument: FocusDocument) {}
  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }
  matches() {
    return true;
  }
  closest() {
    return null;
  }
  querySelectorAll(selector: string) {
    return selector === "[aria-controls]" ? [] : this.children;
  }
  focus() {
    const document = this.ownerDocument;
    if (document.activeElement === this) return;
    // A trap loop must fail deterministically instead of exhausting the test process stack.
    if (++document.focusChanges > 20) throw new Error("Modal focus loop");
    document.activeElement = this;
    const event = new Event("focusin");
    Object.defineProperty(event, "target", { value: this });
    document.dispatchEvent(event);
  }
}

function mount(root: FocusElement, onKeyDown = vi.fn(), isSuspended?: () => boolean) {
  useModalFocus({
    open: true,
    rootRef: { current: root as unknown as HTMLElement },
    onKeyDown,
    isSuspended,
  });
  return onKeyDown;
}

function key(document: FocusDocument, value: string, shiftKey = false) {
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

  it("isolates documents and gates business shortcuts while suspended", () => {
    const document = browser();
    const otherDocument = new FocusDocument();
    const suspendedKeys = mount(new FocusElement(document), vi.fn(), () => true);
    const activeKeys = mount(new FocusElement(otherDocument));
    key(document, "Escape");
    key(otherDocument, "Escape");
    assert.equal(suspendedKeys.mock.calls.length, 0);
    assert.equal(activeKeys.mock.calls.length, 1);
  });
});
