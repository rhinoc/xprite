import type { Point } from "$/base/primitives";

/** Resolved semantic actions. An explicit false suppresses the physical-key
 * default, so rebinding one action cannot alter unrelated Ctrl/Shift behavior. */
export interface PointerActionModifiers {
  copySelection?: boolean;
  fineControl?: boolean;
  scaleFromPivot?: boolean;
  snapToGrid?: boolean;
  lockAxis?: boolean;
  angleSnap?: boolean;
  maintainAspectRatio?: boolean;
  addSelection?: boolean;
  subtractSelection?: boolean;
  intersectSelection?: boolean;
  autoSelectLayer?: boolean;
  straightLineFromLastPoint?: boolean;
  angleSnapFromLastPoint?: boolean;
  squareAspect?: boolean;
  drawFromCenter?: boolean;
  moveOrigin?: boolean;
  rotateShape?: boolean;
  cornerRadius?: boolean;
}

/** Platform-neutral pointer sample shared by feature interaction controllers. */
export interface PointerInput extends Point {
  /** Use the temporary Move tool without changing the selected tool. */
  quickMove?: boolean;
  /** A visible timeline range participates in Move gestures; omitted means visible. */
  timelineRangeVisible?: boolean;
  actionModifiers?: PointerActionModifiers;
  clickCount?: number;
  /** Physical Ctrl, independent of the platform primary shortcut modifier. */
  physicalCtrl?: boolean;
  space?: boolean;
  button?: number;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  pressure?: number;
  pointerType?: string;
  timeStamp?: number;
  screen?: Point;
}
