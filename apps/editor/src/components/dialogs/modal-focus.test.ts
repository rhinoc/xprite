import assert from "node:assert/strict";

import { afterEach, describe, it, vi } from "vitest";

interface HookSlot {
  states: unknown[];
  refs: { current: unknown }[];
  cleanups: (() => void)[];
  pendingEffects: (() => (() => void) | undefined)[];
  stateCursor: number;
  refCursor: number;
  idCounter: number;
}

const hooks = vi.hoisted(() => {
  const active: { current: HookSlot | null } = { current: null };
  return active;
});

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    Fragment: ({ children }: { children?: unknown }) => children,
    Suspense: ({ children }: { children?: unknown }) => children,
    createContext: <T>(defaultValue: T) => ({
      Provider: ({ children }: { children?: unknown }) => children,
      _defaultValue: defaultValue,
    }),
    useContext: <T>(context: { _defaultValue: T }) => context._defaultValue,
    createElement: (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({
      type,
      props: {
        ...props,
        ...(children.length === 1
          ? { children: children[0] }
          : children.length > 1
            ? { children }
            : undefined),
      },
    }),
    useState: (initial: unknown) => {
      const slot = hooks.current!;
      const index = slot.stateCursor++;
      if (!(index in slot.states)) {
        slot.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      return [
        slot.states[index],
        (next: unknown) => {
          slot.states[index] =
            typeof next === "function"
              ? (next as (prev: unknown) => unknown)(slot.states[index])
              : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const slot = hooks.current!;
      const index = slot.refCursor++;
      if (!(index in slot.refs)) slot.refs[index] = { current: initial };
      return slot.refs[index];
    },
    useCallback: <T>(fn: T) => fn,
    useMemo: <T>(fn: () => T) => fn(),
    useId: () => `test-id-${hooks.current!.idCounter++}`,
    useEffect: (effect: () => (() => void) | undefined) => {
      hooks.current!.pendingEffects.push(effect);
    },
    useLayoutEffect: (effect: () => (() => void) | undefined) => {
      hooks.current!.pendingEffects.push(effect);
    },
  };
});

vi.mock("$/components/canvas/scene-bounds", () => ({
  useSceneBounds: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
}));
vi.mock("$/components/dialogs/overlay", () => ({
  EditorDialog: (props: Record<string, unknown>) => ({ type: "EditorDialog", props }),
  EditorPopover: (props: Record<string, unknown>) => ({ type: "EditorPopover", props }),
  useEditorDialogInitialFocus:
    () => (root: HTMLElement | null, options?: { selector?: string }) => {
      const target = options?.selector
        ? root?.querySelector<HTMLElement>(options.selector)
        : root?.querySelector<HTMLElement>("input:not(:disabled)");
      (target ?? root)?.focus({ preventScroll: true });
    },
}));
vi.mock("$/components/dialogs/form-dialog/flow-form", () => ({
  FlowForm: (props: Record<string, unknown>) => ({ type: "FlowForm", props }),
}));
vi.mock("$/components/shared/icon-control", () => ({
  IconControl: (props: Record<string, unknown>) => ({ type: "IconControl", props }),
}));
vi.mock("$/components/tools/color-picker", () => ({
  ColorPicker: (props: Record<string, unknown>) => ({ type: "ColorPicker", props }),
}));
vi.mock("$/components/tools/editor-color-button", () => ({
  EditorColorButton: (props: Record<string, unknown>) => ({ type: "EditorColorButton", props }),
}));
vi.mock("$/components/workspace/workspace-link", () => ({
  WorkspaceLink: (props: Record<string, unknown>) => ({ type: "WorkspaceLink", props }),
  WorkspaceLinkVariant: { Inline: "inline" },
}));
vi.mock("$/components/workspace/home-view/about", () => ({
  getEditorHomeAbout: () => ({ repositoryHref: "https://github.com/example/xprite" }),
}));
vi.mock("$/managers/dialogs/input-values", () => ({
  DIALOG_IMAGE_DIMENSION_MAX: 65535,
  parseNewSpriteDimension: (value: string) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  },
  useDialogInputPreferences: () => ({
    readNewSpriteChoices: () => ({ colorDepth: 32 as const, background: "transparent" as const }),
    writeNewSpriteChoices: () => {},
  }),
}));
vi.mock("$/managers/input/use-wheel-input", () => ({
  useWheelInput: () => ({ connect: () => () => {} }),
}));
vi.mock("$/i18n", () => ({
  tUi: (key: string) => key,
  tUiSource: (value: string) => value,
  useUiLanguage: () => "en",
}));
vi.mock("$assets/support/wechat-qr.webp?url", () => ({ default: "wechat-qr.webp" }));
vi.mock("$/components/dialogs/keyboard-shortcuts/keyboard-shortcuts.module.css", () => ({
  default: {},
}));
vi.mock("$/components/dialogs/new-sprite-dialog/new-sprite-dialog.module.css", () => ({
  default: {},
}));
vi.mock("$/components/dialogs/support/support.module.css", () => ({ default: {} }));
vi.mock("$/components/dialogs/export-dialog/export-dialog.module.css", () => ({ default: {} }));

vi.mock("@xprite/ui/assets", () => ({
  UiPart: (props: Record<string, unknown>) => ({ type: "UiPart", props }),
  centerUiPixel: (origin: number, outer: number, inner: number) =>
    origin + Math.round((outer - inner) / 2),
  measureUiText: (text: string) => text.length * 8,
  useUiAssets: () => null,
}));
vi.mock("@xprite/ui/canvas", () => ({
  DEFAULT_SURFACE_VIEWPORT: { width: 1280, height: 800, sceneWidth: 1280, sceneHeight: 800 },
  FIELD_ROW_HEIGHT: 30,
  RASTER_SCALE: 2,
  surfaceLayout: (bounds: { x: number; y: number; width: number; height: number }) => ({
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }),
}));
vi.mock("@xprite/ui/popover", () => ({
  measurePopoverAnchor: () => ({ bounds: { x: 10, y: 10, width: 100, height: 30 } }),
}));
vi.mock("@xprite/ui/utils", async () => {
  const actual = await vi.importActual<typeof import("@xprite/ui/utils")>("@xprite/ui/utils");
  return {
    isImeKeyboardEvent: actual.isImeKeyboardEvent,
    keyboardEventKey: actual.keyboardEventKey,
    clientDeltaToSurface: (_node: unknown, delta: { x: number; y: number }) => delta,
    clientRect: (node: { rect?: { width: number; height: number } }) =>
      node.rect ?? { width: 80, height: 30 },
    dropdownArrowOffsetY: () => 0,
    useElementSize: () => ({ width: 400, height: 300 }),
  };
});
vi.mock("@xprite/ui", async () => {
  const actual = await vi.importActual<typeof import("@xprite/ui")>("@xprite/ui");
  return {
    createModalFocusScope: actual.createModalFocusScope,
    focusDialogContainer: actual.focusDialogContainer,
    isDialogPopupTarget: actual.isDialogPopupTarget,
    restoreModalFocus: actual.restoreModalFocus,
    useModalFocus: actual.useModalFocus,
    useModalInputDismiss: actual.useModalInputDismiss,
    Button: (props: Record<string, unknown>) => ({ type: "Button", props }),
    ButtonVariant: { Icon: "icon", FlatIcon: "flat-icon" },
    Checkbox: (props: Record<string, unknown>) => ({ type: "Checkbox", props }),
    Combobox: (props: Record<string, unknown>) => ({ type: "Combobox", props }),
    Dialog: (props: Record<string, unknown>) => ({ type: "Dialog", props }),
    Divider: (props: Record<string, unknown>) => ({ type: "Divider", props }),
    FocusRingBehavior: { Always: "always" },
    FontRole: { Primary: "primary", Compact: "compact" },
    Icon: (props: Record<string, unknown>) => ({ type: "Icon", props }),
    Input: (props: Record<string, unknown>) => ({ type: "Input", props }),
    Menu: (props: Record<string, unknown>) => ({ type: "Menu", props }),
    MenuCheckType: { Radio: "radio" },
    OverlayContentLayout: { Flow: "flow", Positioned: "positioned" },
    Scrollbar: (props: Record<string, unknown>) => ({ type: "Scrollbar", props }),
    ScrollbarStyle: { Compact: "compact" },
    Text: (props: Record<string, unknown>) => ({ type: "Text", props }),
    TextAlignment: { Center: "center" },
    TextVariant: { Control: "control", Inline: "inline", PositionedPixel: "positioned-pixel" },
    createUiPortal: (node: unknown) => node,
    defaultActionProps: () => ({}),
    triggerDefaultAction: () => false,
    useUi: () => ({ style: { colors: {} }, translateSource: (value: string) => value }),
  };
});

import { ExportDialog } from "$/components/dialogs/export-dialog";
import { FormDialog } from "$/components/dialogs/form-dialog";
import { KeyboardShortcutsDialog } from "$/components/dialogs/keyboard-shortcuts/KeyboardShortcutsDialog";
import { NewSpriteDialog } from "$/components/dialogs/new-sprite-dialog";
import { SupportDialog } from "$/components/dialogs/support";
import { useModalFocus } from "@xprite/ui";

class MockDocument extends EventTarget {
  activeElement: MockElement | null = null;
  focusChanges = 0;
  body: MockElement;
  elementsById = new Map<string, MockElement>();
  constructor() {
    super();
    this.body = new MockElement(this);
  }
  getElementById(id: string) {
    return this.elementsById.get(id) ?? null;
  }
}

class MockElement {
  isConnected = true;
  disabled = false;
  hidden = false;
  rect = { width: 80, height: 30 };
  id = "";
  role = "";
  popupFor: string | null = null;
  attributes = new Map<string, string>();
  children: MockElement[] = [];
  constructor(
    readonly ownerDocument: MockDocument,
    role = "",
  ) {
    this.role = role;
  }
  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }
  matches(selector: string) {
    if (selector === '[role="dialog"]') return this.role === "dialog";
    return false;
  }
  closest(selector: string) {
    if (selector === "[data-ui-scene]") return this.ownerDocument.body;
    if (selector === "[data-popup-for]" && this.popupFor) return this;
    if (selector === "[hidden]" && this.hidden) return this;
    return null;
  }
  getAttribute(name: string) {
    if (name === "data-popup-for") return this.popupFor;
    if (name === "role") return this.role || null;
    return this.attributes.get(name) ?? null;
  }
  querySelector(selector: string): MockElement | null {
    if (selector === '[role="dialog"]') {
      if (this.role === "dialog") return this;
      return this.children.find((child) => child.role === "dialog") ?? null;
    }
    if (selector === "[data-support-primary]") {
      return this.children.find((child) => child.attributes.has("data-support-primary")) ?? null;
    }
    if (selector.includes('data-label-source="File name"')) {
      return (
        this.children.find((child) => child.attributes.get("data-label-source") === "File name") ??
        null
      );
    }
    if (selector.startsWith("input")) {
      return this.children.find((child) => child.attributes.get("data-tag") === "input") ?? null;
    }
    return this.children[0] ?? null;
  }
  querySelectorAll(selector: string) {
    if (selector === "[aria-controls]") return [];
    return this.children.filter((child) => !child.disabled && child.role !== "dialog");
  }
  focus() {
    const document = this.ownerDocument;
    if (this.disabled || document.activeElement === this) return;
    if (++document.focusChanges > 20) throw new Error("Modal focus recursion detected");
    document.activeElement = this;
    const event = new Event("focusin");
    Object.defineProperty(event, "target", { value: this });
    document.dispatchEvent(event);
  }
}

interface VNode {
  type: unknown;
  ref?: unknown;
  props?: Record<string, unknown>;
}

const activeSlots: HookSlot[] = [];

function createSlot(): HookSlot {
  const slot: HookSlot = {
    states: [],
    refs: [],
    cleanups: [],
    pendingEffects: [],
    stateCursor: 0,
    refCursor: 0,
    idCounter: 0,
  };
  activeSlots.push(slot);
  return slot;
}

function renderWithSlot<T>(slot: HookSlot, fn: () => T): T {
  slot.stateCursor = 0;
  slot.refCursor = 0;
  slot.pendingEffects = [];
  hooks.current = slot;
  try {
    return fn();
  } finally {
    hooks.current = null;
  }
}

function flushEffects(slot: HookSlot) {
  const pending = slot.pendingEffects.splice(0);
  for (const effect of pending) {
    const cleanup = effect();
    if (cleanup) slot.cleanups.push(cleanup);
  }
}

function unmountSlot(slot: HookSlot) {
  while (slot.cleanups.length) slot.cleanups.pop()!();
}

function attachRefs(node: unknown, root: MockElement, portalMarker?: MockElement) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) attachRefs(child, root, portalMarker);
    return;
  }
  const vnode = node as VNode;
  const ref = vnode.ref;
  if (vnode.type === "span" && portalMarker && ref && typeof ref === "object" && "current" in ref) {
    (ref as { current: unknown }).current = portalMarker;
  } else if (typeof ref === "function") {
    (ref as (el: unknown) => void)(root);
  } else if (ref && typeof ref === "object" && "current" in ref) {
    (ref as { current: unknown }).current = root;
  }
  const props = vnode.props;
  if (props) {
    if (typeof props.onRootRef === "function") {
      (props.onRootRef as (el: unknown) => void)(root);
    }
    if ("children" in props) attachRefs(props.children, root, portalMarker);
  }
}

function dispatchKey(document: MockDocument, value: string, shiftKey = false) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, {
    key: { value },
    shiftKey: { value: shiftKey },
    target: { value: document.activeElement },
  });
  document.dispatchEvent(event);
  return event;
}

function mountChildAlert(document: MockDocument, onEscape = vi.fn()) {
  const slot = createSlot();
  const alertRoot = new MockElement(document, "dialog");
  const okButton = new MockElement(document);
  alertRoot.children = [okButton];
  renderWithSlot(slot, () =>
    useModalFocus({
      open: true,
      rootRef: { current: alertRoot as unknown as HTMLElement },
      initialFocus: () => okButton.focus(),
      reclaimFocus: () => okButton.focus(),
      onEscape,
    }),
  );
  flushEffects(slot);
  return { slot, alertRoot, okButton, onEscape };
}

function setupBrowser() {
  const document = new MockDocument();
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", {
    setTimeout: () => 0,
    clearTimeout: () => {},
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  vi.stubGlobal("HTMLElement", MockElement);
  vi.stubGlobal("HTMLInputElement", MockElement);
  vi.stubGlobal("Element", MockElement);
  vi.stubGlobal("Node", MockElement);
  return document;
}

afterEach(() => {
  while (activeSlots.length) unmountSlot(activeSlots.pop()!);
  vi.unstubAllGlobals();
});

describe("migrated dialogs nested modal focus safety", () => {
  it("NewSpriteDialog yields focus to a nested alert modal without recursion and restores cleanly", () => {
    const document = setupBrowser();
    const opener = new MockElement(document);
    opener.focus();

    const slot = createSlot();
    const onOpenChange = vi.fn();
    const root = new MockElement(document, "dialog");
    const fileNameInput = new MockElement(document);
    fileNameInput.attributes.set("data-label-source", "File name");
    root.children = [fileNameInput];

    const tree = renderWithSlot(slot, () =>
      NewSpriteDialog({
        open: true,
        onOpenChange,
        suggestedBaseName: "Sprite-0001",
        width: 32,
        height: 32,
        onWidthChange: () => {},
        onHeightChange: () => {},
        onAccept: () => {},
      }),
    );
    attachRefs(tree, root);
    flushEffects(slot);
    assert.equal(document.activeElement, fileNameInput);

    const child = mountChildAlert(document);
    assert.equal(document.activeElement, child.okButton);

    // Escape targets only the child alert, not NewSpriteDialog.
    dispatchKey(document, "Escape");
    assert.equal(child.onEscape.mock.calls.length, 1);
    assert.equal(onOpenChange.mock.calls.length, 0);

    // Closing the child restores focus to NewSpriteDialog without recursion.
    unmountSlot(child.slot);
    assert.equal(document.activeElement, fileNameInput);

    dispatchKey(document, "Escape");
    assert.deepEqual(onOpenChange.mock.calls, [[false]]);

    unmountSlot(slot);
    assert.equal(document.activeElement, opener);
  });

  it("KeyboardShortcutsDialog yields to child modals and respects suspendFocus without recursion", () => {
    const document = setupBrowser();
    const opener = new MockElement(document);
    opener.focus();

    const slot = createSlot();
    const root = new MockElement(document, "dialog");
    const searchInput = new MockElement(document);
    root.children = [searchInput];

    const tree = renderWithSlot(slot, () =>
      KeyboardShortcutsDialog({
        open: true,
        onOpenChange: () => {},
        sections: [{ id: "menus", label: "Menus", items: [] }],
        suspendFocus: false,
      }),
    );
    attachRefs(tree, root);
    flushEffects(slot);
    assert.equal(document.activeElement, root);

    const child = mountChildAlert(document);
    assert.equal(document.activeElement, child.okButton);

    const outside = new MockElement(document);
    outside.focus();
    assert.equal(document.activeElement, child.okButton);

    unmountSlot(child.slot);
    assert.equal(document.activeElement, root);

    unmountSlot(slot);
    assert.equal(document.activeElement, opener);
  });

  it("SupportDialog keeps WeChat popup focus compatible and yields to a nested modal without recursion", () => {
    const document = setupBrowser();
    const opener = new MockElement(document);
    opener.focus();

    const slot = createSlot();
    const root = new MockElement(document, "dialog");
    const primary = new MockElement(document);
    primary.attributes.set("data-support-primary", "");
    const wechatTrigger = new MockElement(document);
    wechatTrigger.id = "test-id-0";
    document.elementsById.set(wechatTrigger.id, wechatTrigger);
    root.children = [primary, wechatTrigger];

    const tree = renderWithSlot(slot, () =>
      SupportDialog({
        open: true,
        onOpenChange: () => {},
        onOption: () => {},
      }),
    );
    attachRefs(tree, root);
    flushEffects(slot);
    assert.equal(document.activeElement, primary);

    // Focusing inside the WeChat QR popover (linked via data-popup-for) must not be reclaimed.
    const qrPopup = new MockElement(document);
    qrPopup.popupFor = wechatTrigger.id;
    qrPopup.focus();
    assert.equal(document.activeElement, qrPopup);

    // Opening a nested alert dialog yields cleanly and restores on close.
    const child = mountChildAlert(document);
    assert.equal(document.activeElement, child.okButton);
    unmountSlot(child.slot);
    assert.equal(document.activeElement, qrPopup);

    unmountSlot(slot);
    assert.equal(document.activeElement, opener);
  });

  it("FormDialog activates modal focus after portalTarget mounts and yields to nested alerts", () => {
    const document = setupBrowser();
    const opener = new MockElement(document);
    opener.focus();

    const slot = createSlot();
    const onOpenChange = vi.fn();
    const portalMarker = new MockElement(document);
    const root = new MockElement(document, "dialog");
    const input = new MockElement(document);
    input.attributes.set("data-tag", "input");
    root.children = [input];

    const renderForm = (modal = true) =>
      renderWithSlot(slot, () =>
        FormDialog({
          open: true,
          modal,
          onOpenChange,
          title: "Resize",
          fields: [{ key: "width", label: "Width", type: "text", value: "32", onChange: () => {} }],
          actions: [{ label: "OK", onClick: () => {} }],
        }),
      );

    // Pass 1 mounts portalMarker and resolves portalTarget.
    const firstTree = renderForm(true);
    attachRefs(firstTree, root, portalMarker);
    flushEffects(slot);

    // Pass 2 portals the dialog and activates useModalFocus.
    const secondTree = renderForm(true);
    attachRefs(secondTree, root, portalMarker);
    flushEffects(slot);
    assert.equal(document.activeElement, input);

    const child = mountChildAlert(document);
    assert.equal(document.activeElement, child.okButton);

    dispatchKey(document, "Escape");
    assert.equal(child.onEscape.mock.calls.length, 1);
    assert.equal(onOpenChange.mock.calls.length, 0);

    unmountSlot(child.slot);
    assert.equal(document.activeElement, input);

    dispatchKey(document, "Escape");
    assert.deepEqual(onOpenChange.mock.calls, [[false]]);

    unmountSlot(slot);
    assert.equal(document.activeElement, opener);
  });

  it("ExportDialog filters hidden controls during Tab cycling and yields to nested alerts", () => {
    const document = setupBrowser();
    const opener = new MockElement(document);
    opener.focus();

    const slot = createSlot();
    const onClose = vi.fn();
    const root = new MockElement(document, "dialog");
    const first = new MockElement(document);
    const hidden = new MockElement(document);
    hidden.hidden = true;
    const zeroSized = new MockElement(document);
    zeroSized.rect = { width: 0, height: 0 };
    const last = new MockElement(document);
    root.children = [first, hidden, zeroSized, last];

    const entry = {
      id: "image",
      label: () => "PNG",
      initialSize: { width: 400, height: 300 },
      available: () => true,
      createPanel: () => () => null,
    };
    const tree = renderWithSlot(slot, () =>
      ExportDialog({
        registry: {
          entries: [entry],
          get: (id: string) => (id === "image" ? entry : undefined),
        } as never,
        context: {} as never,
        panels: new Map(),
        destination: "image",
        onDestinationChange: () => {},
        onModuleBusyChange: () => {},
        onExported: () => {},
        execute: () => {},
        filePreferences: {} as never,
        busy: false,
        onClose,
      }),
    );
    attachRefs(tree, root);
    flushEffects(slot);
    assert.equal(document.activeElement, root);

    // Tab wraps across visible controls only, skipping hidden and zero-sized nodes.
    last.focus();
    dispatchKey(document, "Tab");
    assert.equal(document.activeElement, first);

    const child = mountChildAlert(document);
    assert.equal(document.activeElement, child.okButton);

    dispatchKey(document, "Escape");
    assert.equal(child.onEscape.mock.calls.length, 1);
    assert.equal(onClose.mock.calls.length, 0);

    unmountSlot(child.slot);
    assert.equal(document.activeElement, first);

    dispatchKey(document, "Escape");
    assert.equal(onClose.mock.calls.length, 1);

    unmountSlot(slot);
    assert.equal(document.activeElement, opener);
  });
});
