import { useEffect, useRef, type MutableRefObject } from "react";

import { ClipboardRegion } from "$/managers/clipboard";
import type { useEditor } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import { ShortcutBindingKind, shortcutIdentity } from "$/managers/shortcuts/shortcut-catalog";
import { shortcutContexts } from "$/managers/shortcuts/shortcut-contexts";
import { SHORTCUT_DEFINITIONS } from "$/managers/shortcuts/shortcut-manager";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { normalizeKeyboardEvent } from "@xprite/bedrock/browser/keyboard";
import { keyboardKey } from "@xprite/bedrock/common/keyboard-key";
import {
  EffectKind,
  executeEditorCommand,
  resolveShortcut,
  type EditorCommand,
  type EditorSnapshot,
  type RasterEditor,
} from "@xprite/editor-core";

const DELETE_SHORTCUT_WIDGET_SELECTOR =
  '[role="listbox"], [role="option"], [role="grid"], [role="tree"], ' +
  '[role="slider"], [role="separator"], [role="scrollbar"]';

const TAB_FOCUS_WIDGET_SELECTOR =
  'button, a[href], input, textarea, select, [contenteditable="true"], ' +
  '[role="listbox"], [role="grid"], [role="tree"], [role="tablist"], ' +
  '[role="slider"], [role="separator"], [tabindex]:not(canvas)';

const NON_REPEATING_COMMAND_TYPES: ReadonlySet<string> = new Set([
  "new",
  "preferences",
  "open",
  "save",
  "save-as",
  "export",
  "reopen-closed-file",
]);

export interface EditorCommandPresentationContext {
  viewport: { width: number; height: number };
  zoomAnchor?: { x: number; y: number };
}

export interface RequestedEditorActionHandlers {
  keyboardShortcuts(): void;
  newSpriteFromSelection(): void;
  exportSpriteSheet?: () => void;
  importSpriteSheet?: () => void;
  canRepeatExport?: boolean;
  repeatLastExport?: () => void;
  openEffect?: (kind: EffectKind) => void;
  togglePreview(): void;
  openFullscreenPreview?: () => void;
  toggleTimeline(): void;
  toggleTimelineThumbnails(): void;
  playPreview?: () => void;
  copy(): void;
  copyMerged(): void;
  cut(): void;
  paste(): void;
  pasteNewLayer(): void;
  pasteNewSprite(): void;
  closeAllDocuments(): void;
  reopenClosedFile(): void;
  openLayerPropertiesDialog?: () => void;
  openNewTilemapDialog(): void;
  openFramePropertiesDialog?: () => void;
  newDocument(): void;
  openDocument(): void;
  openPreferences(): void;
  closeDocument(): void;
  saveDocument(): void;
  saveDocumentAs(): void;
  exportCopy(): void;
  insertText(): void;
}

/** Pure dispatcher for high-level application actions requested by `executeEditorCommand`. */
export function dispatchRequestedEditorAction(
  action: string,
  handlers: RequestedEditorActionHandlers,
): void {
  switch (action) {
    case "keyboard-shortcuts":
      handlers.keyboardShortcuts();
      break;
    case "new-sprite-from-selection":
      handlers.newSpriteFromSelection();
      break;
    case "export-sheet":
      handlers.exportSpriteSheet?.();
      break;
    case "import-sheet":
      handlers.importSpriteSheet?.();
      break;
    case "repeat-export":
      if (handlers.canRepeatExport) handlers.repeatLastExport?.();
      break;
    case "effect-hue-saturation":
      handlers.openEffect?.(EffectKind.HueSaturation);
      break;
    case "effect-replace-color":
      handlers.openEffect?.(EffectKind.ReplaceColor);
      break;
    case "effect-outline":
      handlers.openEffect?.(EffectKind.Outline);
      break;
    case "toggle-preview":
      handlers.togglePreview();
      break;
    case "fullscreen-preview":
      handlers.openFullscreenPreview?.();
      break;
    case "toggle-timeline":
      handlers.toggleTimeline();
      break;
    case "toggle-timeline-thumbnails":
      handlers.toggleTimelineThumbnails();
      break;
    case "play-preview":
      handlers.playPreview?.();
      break;
    case "copy":
      handlers.copy();
      break;
    case "copy-merged":
      handlers.copyMerged();
      break;
    case "cut":
      handlers.cut();
      break;
    case "paste":
      handlers.paste();
      break;
    case "paste-new-layer":
      handlers.pasteNewLayer();
      break;
    case "paste-new-sprite":
      handlers.pasteNewSprite();
      break;
    case "close-all":
      handlers.closeAllDocuments();
      break;
    case "reopen-closed-file":
      handlers.reopenClosedFile();
      break;
    case "layer-properties":
      handlers.openLayerPropertiesDialog?.();
      break;
    case "new-tilemap-layer":
      handlers.openNewTilemapDialog();
      break;
    case "frame-properties":
      handlers.openFramePropertiesDialog?.();
      break;
    case "new":
      handlers.newDocument();
      break;
    case "open":
      handlers.openDocument();
      break;
    case "preferences":
      handlers.openPreferences();
      break;
    case "close":
      handlers.closeDocument();
      break;
    case "save":
      handlers.saveDocument();
      break;
    case "save-as":
      handlers.saveDocumentAs();
      break;
    case "export":
      handlers.exportCopy();
      break;
    case "insert-text":
      handlers.insertText();
      break;
  }
}

/** True when a Ctrl/Cmd+V paste shortcut should fall through to the trusted OS ClipboardEvent. */
export function shouldDeferNativePaste(
  commandType: string | undefined,
  normalizedKey: string,
  modifiers: { ctrl: boolean; meta: boolean; alt: boolean; shift: boolean },
  clipboardRegion: ClipboardRegion,
): boolean {
  return (
    commandType === "paste" &&
    (modifiers.ctrl || modifiers.meta) &&
    normalizedKey === "v" &&
    !modifiers.alt &&
    !modifiers.shift &&
    clipboardRegion !== ClipboardRegion.Palette &&
    clipboardRegion !== ClipboardRegion.Tileset
  );
}

/** True when key-repeat events should be suppressed for a one-shot dialog/IO command. */
export function shouldSkipRepeatedCommand(repeat: boolean, commandType: string): boolean {
  return repeat && NON_REPEATING_COMMAND_TYPES.has(commandType);
}

export interface CommandAndShortcutWorkflowOptions {
  core: RasterEditor;
  workspace: DocumentWorkspace;
  editor: ReturnType<typeof useEditor>;
  state: EditorSnapshot;
  documentScene: boolean;
  dialog: "text" | "color" | null;
  colorTarget: "foreground" | "background";
  setDialog(dialog: "text" | "color" | null): void;
  setColorTarget(target: "foreground" | "background"): void;
  clipboardRegionRef: MutableRefObject<ClipboardRegion>;
  dismissTimelineCopyRange(): void;
  canStartInteraction(): boolean;
  canDispatchEditorInput(): boolean;
  flushPendingLayerProperties(): void;
  getCommandContext?: () => EditorCommandPresentationContext | undefined;
  actionHandlers: RequestedEditorActionHandlers;
}

/** Owns keyboard shortcut dispatch, palette-popup capture, command execution, and playback rAF loop. */
export function useCommandAndShortcutWorkflows(options: CommandAndShortcutWorkflowOptions) {
  const {
    core,
    workspace,
    editor,
    state,
    documentScene,
    dialog,
    colorTarget,
    setDialog,
    setColorTarget,
    clipboardRegionRef,
    dismissTimelineCopyRange,
    canStartInteraction,
    canDispatchEditorInput,
    flushPendingLayerProperties,
    getCommandContext,
    actionHandlers,
  } = options;

  const heldSpace = useRef(false);

  const palettePopupShortcut = useRef(() => {});
  const palettePopupAvailable = useRef(false);
  const palettePopupVisible = useRef(false);
  palettePopupVisible.current = dialog === "color";
  palettePopupAvailable.current = dialog === "color" || canStartInteraction();
  palettePopupShortcut.current = () => {
    if (dialog === "color" && colorTarget === "foreground") {
      editor.setPaletteEditable(false);
      setDialog(null);
    } else {
      editor.setPaletteEditable(true);
      setColorTarget("foreground");
      setDialog("color");
    }
  };

  useEffect(() => {
    const params = { edit: "switch", popup: "foreground" };
    const unregister = workspace.shortcuts.registerMenuCommand(
      shortcutIdentity(ShortcutBindingKind.Command, "PaletteEditor", "Any", params),
      {
        execute: () => palettePopupShortcut.current(),
        canExecute: () => palettePopupAvailable.current,
      },
    );
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"]') &&
        !palettePopupVisible.current
      )
        return;
      if (
        !palettePopupAvailable.current ||
        event.defaultPrevented ||
        !workspace.shortcuts.matchesCommandShortcut(
          normalizeKeyboardEvent(event),
          "PaletteEditor",
          params,
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      palettePopupShortcut.current();
    };
    document.addEventListener("keydown", key, true);
    return () => {
      unregister();
      document.removeEventListener("keydown", key, true);
    };
  }, [workspace]);

  const command = (cmd: EditorCommand, presentationContext = getCommandContext?.()) => {
    if (!canDispatchEditorInput()) return;
    if (cmd.type === "undo" || cmd.type === "redo") {
      if (!documentScene) return;
      flushPendingLayerProperties();
      if (workspace.traverseTabDock(cmd.type)) return;
    }
    if (cmd.type === "cancel") dismissTimelineCopyRange();
    const viewport =
      presentationContext?.viewport.width && presentationContext.viewport.height
        ? presentationContext.viewport
        : measuredEditorViewport(core, editor.timelineVisible);
    const result = executeEditorCommand(core, cmd, {
      scene: editorSceneForTab(editor.tab),
      viewport,
      zoomAnchor: presentationContext?.zoomAnchor,
    });
    if (result.kind === "handled" && result.paletteIndex !== undefined) {
      editor.setPaletteIndex(result.paletteIndex);
    }
    if (result.kind !== "request") return;
    dispatchRequestedEditorAction(result.action, actionHandlers);
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const keyboard = normalizeKeyboardEvent(event);
      const normalizedKey = keyboardKey(keyboard.key).toLowerCase();
      const target = event.target;
      const editingText =
        target instanceof HTMLElement &&
        (target.matches("input,textarea,select") || target.isContentEditable);
      if (
        event.defaultPrevented ||
        !canDispatchEditorInput() ||
        (event.target instanceof Element &&
          (event.target.closest('[role="dialog"]') ||
            (event.target.closest('[role="menu"]') && !event.ctrlKey && !event.metaKey)))
      )
        return;
      const deleteInKeyboardWidget =
        !keyboard.alt &&
        !keyboard.ctrl &&
        !keyboard.meta &&
        !keyboard.shift &&
        (normalizedKey === "delete" || normalizedKey === "backspace") &&
        target instanceof Element &&
        !!target.closest(DELETE_SHORTCUT_WIDGET_SELECTOR);
      if (deleteInKeyboardWidget) {
        event.preventDefault();
        return;
      }
      const shortcutInput = {
        ...keyboard,
        editingText,
        space: heldSpace.current,
      };
      const contexts = shortcutContexts(state);
      if (
        workspace.shortcuts.executeMenuShortcut(shortcutInput, contexts.command, contexts.actions)
      ) {
        event.preventDefault();
        return;
      }
      const fallback = resolveShortcut(shortcutInput);
      const cmd = workspace.shortcuts.resolve(
        shortcutInput,
        fallback,
        contexts.command,
        contexts.actions,
      );
      // Removed bindings also suppress browser commands such as native Paste.
      if (!cmd && fallback) event.preventDefault();
      // Controls retain Tab focus navigation; the canvas and un-focused editor
      // regions use the native timeline toggle.
      if (
        cmd?.type === "toggle-timeline" &&
        normalizedKey === "tab" &&
        target instanceof Element &&
        !(target instanceof HTMLCanvasElement) &&
        target.closest(TAB_FOCUS_WIDGET_SELECTOR)
      )
        return;
      // Let the trusted ClipboardEvent deliver OS image bytes without an
      // additional navigator.clipboard.read permission request.
      if (shouldDeferNativePaste(cmd?.type, normalizedKey, keyboard, clipboardRegionRef.current))
        return;
      if (cmd) {
        event.preventDefault();
        if (!shouldSkipRepeatedCommand(event.repeat, cmd.type)) command(cmd);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "Space") heldSpace.current = false;
      workspace.shortcuts.setPressedKey(event.key, false);
    };
    const captureKey = (event: KeyboardEvent) => {
      const target = event.target;
      const editingText =
        target instanceof HTMLElement &&
        (target.matches("input,textarea,select") || target.isContentEditable);
      if (event.code === "Space" && !editingText) heldSpace.current = true;
      workspace.shortcuts.setPressedKey(event.key, true, editingText);
    };
    const blur = () => {
      heldSpace.current = false;
      workspace.shortcuts.clearPressedKeys();
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", captureKey, true);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", captureKey, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  });

  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    let previous: number | null = performance.now();
    const tick = (now: number) => {
      if (previous !== null) core.timeline.advancePlayback(now - previous);
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [core, state.playing]);

  return {
    heldSpace,
    command,
  };
}

/** Registers workspace-level tab navigation menu shortcuts (GotoNextTab / GotoPreviousTab). */
export function useTabNavigationShortcuts(
  workspace: DocumentWorkspace,
  nextDocumentTab: () => void,
  previousDocumentTab: () => void,
  canSelectOtherDocumentTab: boolean,
): void {
  useEffect(() => {
    const disposers = (
      [
        ["GotoNextTab", nextDocumentTab],
        ["GotoPreviousTab", previousDocumentTab],
      ] as const
    ).map(([id, execute]) => {
      const definition = SHORTCUT_DEFINITIONS.find((candidate) => candidate.id === id);
      return (
        definition &&
        workspace.shortcuts.registerMenuCommand(definition.key, {
          execute,
          canExecute: () => canSelectOtherDocumentTab,
        })
      );
    });
    return () => {
      for (const dispose of disposers) dispose?.();
    };
  }, [workspace, nextDocumentTab, previousDocumentTab, canSelectOtherDocumentTab]);
}
