import { UINT8_MAX } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import { EyedropperChannel } from "$/drawing/types";
import type { EditorSnapshot } from "$/editor/types";

export type StatusIcon =
  | "eyedropper"
  | "pos"
  | "size"
  | "selsize"
  | "grid"
  | "search"
  | "angle"
  | "frame"
  | "clock"
  | "start"
  | "end"
  | "distance"
  | "aspect_ratio";
export type StatusIndicator =
  | { text: string }
  | { icon: StatusIcon }
  | { color: Rgba; mask: boolean };

export function statusColorIndicators(
  color: Rgba,
  mask = false,
  depth?: number,
  description?: string,
): StatusIndicator[] {
  const valueText =
    description ??
    (mask ? "Mask" : depth === 16 ? `Gray ${color[0]}` : `RGB ${color[0]} ${color[1]} ${color[2]}`);
  const hex = `#${color
    .slice(0, 3)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
  return [
    { icon: "eyedropper" },
    { color, mask },
    { text: `${valueText} ${hex}${!mask && color[3] < UINT8_MAX ? ` A${color[3]}` : ""}` },
  ];
}

/** Format the status timer with stable units and a compact two-decimal display. */
export function statusReadableTime(milliseconds: number): string {
  const units = [
    { until: 900, divisor: 1, suffix: "ms" },
    { until: 59_000, divisor: 1_000, suffix: "s" },
    { until: 59 * 60_000, divisor: 60_000, suffix: "m" },
    { until: Infinity, divisor: 60 * 60_000, suffix: "h" },
  ];
  const selected = units.find((unit) => milliseconds < unit.until) ?? units[units.length - 1];
  const value =
    selected.divisor === 1 ? String(milliseconds) : (milliseconds / selected.divisor).toFixed(2);
  return `${value}${selected.suffix}`;
}

/** Compose icon and text records from the browser editor state. Browser
 * documents have no trustworthy filesystem directory to append. */
export function editorStatusIndicators(
  state: EditorSnapshot,
  notice = "",
  hoveredColor?: Rgba | null,
  buttonHoverColor?: Rgba | null,
  buttonHoverDescription?: string,
): StatusIndicator[] {
  if (notice) return [{ text: notice }];
  const doc = state.document;
  if (buttonHoverColor)
    return statusColorIndicators(
      buttonHoverColor,
      false,
      doc?.timeline?.colorDepth,
      buttonHoverDescription,
    );
  if (!doc) return [{ text: state.status }];
  if (state.floatingPaste && !state.error) {
    const { x, y, pixels } = state.floatingPaste;
    const w = pixels.width,
      h = pixels.height;
    let a = w,
      b = h;
    while (b) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    const divisor = a || 1;
    // Translation-only floating selection status.
    return [
      { icon: "pos" },
      { text: `${Math.trunc(x)} ${Math.trunc(y)}` },
      { icon: "size" },
      { text: `${w} ${h}` },
      { icon: "selsize" },
      { text: `${w} ${h} [100.00% 100.00%]` },
      { icon: "angle" },
      { text: "0.0" },
      { icon: "aspect_ratio" },
      { text: `${w / divisor}:${h / divisor}` },
    ];
  }
  if (state.preview?.tool === "text" && state.preview.points.length) {
    const first = state.preview.points[0],
      last = state.preview.points[state.preview.points.length - 1],
      pointer = state.pointer ?? last;
    return [
      { icon: "pos" },
      { text: `${Math.trunc(pointer.x)} ${Math.trunc(pointer.y)}` },
      { icon: "start" },
      { text: `${Math.trunc(first.x)} ${Math.trunc(first.y)}` },
      { icon: "size" },
      {
        text: `${Math.abs(Math.trunc(last.x) - Math.trunc(first.x)) + 1} ${Math.abs(Math.trunc(last.y) - Math.trunc(first.y)) + 1}`,
      },
    ];
  }
  const loaded = `${doc.name} · ${doc.width} × ${doc.height}`;
  if (state.status && state.status !== "Ready" && state.status !== loaded)
    return [{ text: state.status }];
  if (state.settings.tool === "eyedropper" && state.pointer && hoveredColor) {
    const color = hoveredColor;
    const mask =
      color[3] === 0 && state.settings.eyedropperChannel === EyedropperChannel.ColorAlpha;
    return [
      ...statusColorIndicators(color, mask, doc.timeline?.colorDepth),
      { icon: "pos" },
      { text: `${Math.floor(state.pointer.x)} ${Math.floor(state.pointer.y)}` },
    ];
  }
  const preview = state.preview ?? state.linePreview;
  const freehandLinePreview = !!state.linePreview && preview === state.linePreview;
  if (
    preview?.points.length &&
    ["line", "rectangle", "marquee", "lasso", "contour", "pencil", "eraser", "blur"].includes(
      preview.tool,
    )
  ) {
    const first = preview.points[0];
    const last = preview.points[preview.points.length - 1];
    const result: StatusIndicator[] = [
      { icon: "start" },
      { text: `${first.x} ${first.y}` },
      { icon: "end" },
      { text: `${last.x} ${last.y}` },
    ];
    // TwoPoints controller measures inclusive pixel bounds, even in reverse
    // drags and outside the canvas. It does not report the clipped selection.
    if (["line", "rectangle", "marquee"].includes(preview.tool) || freehandLinePreview) {
      const width = Math.abs(last.x - first.x) + 1;
      const height = Math.abs(last.y - first.y) + 1;
      let divisor = width,
        remainder = height;
      while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
      result.push(
        { icon: "size" },
        { text: `${width} ${height}` },
        { icon: "distance" },
        { text: Math.hypot(width, height).toFixed(1) },
      );
      if (preview.tool === "line" || freehandLinePreview)
        result.push(
          { icon: "angle" },
          {
            text: ((Math.atan2(first.y - last.y, last.x - first.x) * 180) / Math.PI).toFixed(1),
          },
        );
      result.push({ icon: "aspect_ratio" }, { text: `${width / divisor}:${height / divisor}` });
    }
    return result;
  }
  const pointer = state.pointer;
  const result: StatusIndicator[] = pointer
    ? [{ icon: "pos" }, { text: `${Math.floor(pointer.x)} ${Math.floor(pointer.y)}` }]
    : [{ text: `${doc.name} ` }];
  result.push({ icon: "size" }, { text: `${doc.width} ${doc.height}` });
  if (doc.selection)
    result.push({ icon: "selsize" }, { text: `${doc.selection.width} ${doc.selection.height}` });
  const timeline = doc.timeline;
  // Aseprite's default document text omits animation information; standby text
  // under the canvas pointer includes the current frame and total duration.
  if (pointer && timeline && timeline.frames.length > 1) {
    const duration = timeline.frames[timeline.activeFrame].duration;
    const total = timeline.frames.reduce((sum, frame) => sum + frame.duration, 0);
    result.push(
      { icon: "frame" },
      { text: String(timeline.activeFrame + 1) },
      { icon: "clock" },
      { text: `${statusReadableTime(duration)}/${statusReadableTime(total)}` },
    );
  }
  if (pointer && state.view.grid) {
    const x = Math.floor(pointer.x / state.view.gridWidth),
      y = Math.floor(pointer.y / state.view.gridHeight);
    result.push({ icon: "grid" }, { text: `${x} ${y}` });
    if (pointer.x >= 0 && pointer.y >= 0 && pointer.x < doc.width && pointer.y < doc.height)
      result.push(
        { icon: "search" },
        { text: String(x + y * Math.ceil(doc.width / state.view.gridWidth)) },
      );
  }
  return result;
}
export function editorStatusDescription(indicators: readonly StatusIndicator[]): string {
  const labels: Record<StatusIcon, string> = {
    eyedropper: "Eyedropper",
    pos: "Position",
    size: "Size",
    selsize: "Selection size",
    grid: "Grid",
    search: "Cell index",
    angle: "Angle",
    frame: "Frame",
    clock: "Duration",
    start: "Start",
    end: "End",
    distance: "Distance",
    aspect_ratio: "Aspect ratio",
  };
  return indicators
    .map((item) =>
      "text" in item ? item.text.trim() : "color" in item ? "Color sample" : labels[item.icon],
    )
    .join(" ");
}
