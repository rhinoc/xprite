import type { ShortcutManager } from "$/managers/shortcuts/shortcut-manager";
import type { PointerActionModifiers, ShortcutInput } from "@xprite/editor-core";

enum PointerShortcutAction {
  CopySelection = "CopySelection",
  FineControl = "FineControl",
  ScaleFromCenter = "ScaleFromCenter",
  SnapToGrid = "SnapToGrid",
  LockAxis = "LockAxis",
  AngleSnap = "AngleSnap",
  MaintainAspectRatio = "MaintainAspectRatio",
  AddSelection = "AddSelection",
  SubtractSelection = "SubtractSelection",
  IntersectSelection = "IntersectSelection",
  AutoSelectLayer = "AutoSelectLayer",
  StraightLineFromLastPoint = "StraightLineFromLastPoint",
  AngleSnapFromLastPoint = "AngleSnapFromLastPoint",
  SquareAspect = "SquareAspect",
  DrawFromCenter = "DrawFromCenter",
  MoveOrigin = "MoveOrigin",
  RotateShape = "RotateShape",
  CornerRadius = "CornerRadius",
}

export interface ModifierKeys {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface TouchModifierLocks {
  constrain: boolean;
  duplicate: boolean;
  fromCenter: boolean;
}

/** Resolve each editing capability independently. Physical modifier bits stay
 * intact for operations outside this shortcut catalog (e.g. quick eyedropper). */
export function resolvePointerActionModifiers(
  shortcuts: ShortcutManager | null,
  event: ModifierKeys,
  space = false,
  locks?: TouchModifierLocks,
): PointerActionModifiers {
  const input: ShortcutInput = {
    key: "",
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
    alt: event.altKey,
    space,
  };
  const action = (id: PointerShortcutAction, fallback: boolean) =>
    shortcuts?.resolveAction(id, input) ?? fallback;
  return {
    copySelection: action(PointerShortcutAction.CopySelection, event.ctrlKey) || !!locks?.duplicate,
    fineControl: action(PointerShortcutAction.FineControl, event.ctrlKey),
    scaleFromPivot: action(PointerShortcutAction.ScaleFromCenter, event.altKey),
    snapToGrid: action(PointerShortcutAction.SnapToGrid, event.altKey),
    lockAxis: action(PointerShortcutAction.LockAxis, event.shiftKey) || !!locks?.constrain,
    angleSnap: action(PointerShortcutAction.AngleSnap, event.shiftKey) || !!locks?.constrain,
    maintainAspectRatio:
      action(PointerShortcutAction.MaintainAspectRatio, event.shiftKey) || !!locks?.constrain,
    addSelection: action(PointerShortcutAction.AddSelection, event.shiftKey),
    subtractSelection: action(
      PointerShortcutAction.SubtractSelection,
      event.shiftKey && event.altKey,
    ),
    intersectSelection: action(
      PointerShortcutAction.IntersectSelection,
      event.shiftKey && event.ctrlKey,
    ),
    autoSelectLayer: action(PointerShortcutAction.AutoSelectLayer, event.ctrlKey || event.metaKey),
    straightLineFromLastPoint: action(
      PointerShortcutAction.StraightLineFromLastPoint,
      event.shiftKey,
    ),
    angleSnapFromLastPoint: action(PointerShortcutAction.AngleSnapFromLastPoint, event.ctrlKey),
    squareAspect: action(PointerShortcutAction.SquareAspect, event.shiftKey) || !!locks?.constrain,
    drawFromCenter:
      action(PointerShortcutAction.DrawFromCenter, event.ctrlKey) || !!locks?.fromCenter,
    moveOrigin: action(PointerShortcutAction.MoveOrigin, space),
    rotateShape: action(PointerShortcutAction.RotateShape, event.altKey),
    cornerRadius: action(PointerShortcutAction.CornerRadius, false),
  };
}
