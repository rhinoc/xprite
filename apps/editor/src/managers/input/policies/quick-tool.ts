import type { ModifierKeys } from "$/managers/input/policies/action-modifiers";
import { EditorPrimaryModifier } from "$/managers/ports/platform";
import type { ShortcutManager } from "$/managers/shortcuts/shortcut-manager";
import {
  isSelectionTool,
  type EditorSnapshot,
  type EditorTool,
  type PointerActionModifiers,
} from "@xprite/editor-core";

export type CanvasQuickTool = EditorTool;

export interface CanvasQuickToolContext {
  inside: boolean;
  space: boolean;
  pointerActive: boolean;
}

/** Selection modifiers retain their editing meaning; captured drags keep the
 * tool they started with until release, even when a modifier changes. */
export function resolveCanvasQuickTool(
  state: EditorSnapshot,
  keys: ModifierKeys,
  actions: PointerActionModifiers,
  primaryModifier: EditorPrimaryModifier,
  context: CanvasQuickToolContext,
  current: CanvasQuickTool | null,
  shortcuts?: ShortcutManager | null,
): CanvasQuickTool | null {
  if (context.pointerActive) return current;
  if (!context.inside || !state.document) return null;
  if (
    isSelectionTool(state.settings.tool) &&
    (actions.addSelection ||
      actions.subtractSelection ||
      actions.intersectSelection ||
      actions.copySelection)
  )
    return null;
  const input = {
    key: "",
    ctrl: keys.ctrlKey,
    meta: keys.metaKey,
    alt: keys.altKey,
    shift: keys.shiftKey,
    space: context.space,
  };
  if (shortcuts?.resolveDragActions(input).length) return null;
  const move =
    primaryModifier === EditorPrimaryModifier.Command
      ? keys.metaKey && !keys.ctrlKey
      : keys.ctrlKey && !keys.metaKey;
  const fallback: CanvasQuickTool | null =
    !keys.ctrlKey && !keys.metaKey && !keys.shiftKey
      ? !keys.altKey && context.space
        ? "hand"
        : keys.altKey && !context.space
          ? "eyedropper"
          : null
      : move && !keys.shiftKey && !keys.altKey && !context.space
        ? "move"
        : null;
  const tool = shortcuts ? shortcuts.resolveQuickTool(input) : fallback;
  if (
    tool === "move" &&
    (state.floatingPaste || state.inlineText || state.selectionTransform || state.preview)
  )
    return null;
  return tool;
}
