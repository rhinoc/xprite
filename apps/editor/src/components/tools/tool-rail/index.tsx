import { useCallback, useRef } from "react";

import { ToolGroupRail, type ToolGroup } from "$/components/tools/tool-group-rail";

import "$/components/tools/tool-rail/tool-rail.module.css";
import { tUi } from "$/i18n";
import {
  EditorWheelAction,
  EditorWheelSurface,
  useWheelInput,
  useWheelInputHandler,
} from "$/managers/input/use-wheel-input";
import { useShortcutManager } from "$/managers/shortcuts/use-shortcut-manager";
import { useToolRailModel, type ToolRailModel } from "$/managers/tools/tool-rail-model";
import toolTips from "$assets/commands/aseprite-tool-tips.json";
import { Button, Tooltip, useUi } from "@xprite/ui";
import { uiMetrics } from "@xprite/ui/assets";
import { UI_SCALE } from "@xprite/ui/canvas";
import {
  clientDeltaToLocal,
  formatShortcutForPlatform,
  layoutSize,
  scrollBy,
  scrollSize,
} from "@xprite/ui/utils";

const mainOrigin = { x: 0, y: 0 };
const horizontalToolOrder = [
  "Pencil",
  "Eraser",
  "Color",
  "Selection",
  "Fill",
  "Move",
  "View",
  "Traces",
  "Shapes",
  "Contours",
  "Effects",
  "Text",
];

const toolParts: readonly ToolGroup[] = [
  {
    id: "Selection",
    tools: [
      { value: "marquee", label: "Rectangular Marquee", icon: "tool_rectangular_marquee" },
      { value: "elliptical_marquee", label: "Elliptical Marquee", icon: "tool_elliptical_marquee" },
      { value: "lasso", label: "Lasso", icon: "tool_lasso" },
      { value: "polygonal_lasso", label: "Polygonal Lasso", icon: "tool_polygonal_lasso" },
      { value: "magic_wand", label: "Magic Wand", icon: "tool_magic_wand" },
    ],
  },
  {
    id: "Pencil",
    tools: [
      { value: "pencil", label: "Pencil", icon: "tool_pencil" },
      { value: "spray", label: "Spray", icon: "tool_spray" },
    ],
  },
  { id: "Eraser", tools: [{ value: "eraser", label: "Eraser", icon: "tool_eraser" }] },
  { id: "Color", tools: [{ value: "eyedropper", label: "Eyedropper", icon: "tool_eyedropper" }] },
  {
    id: "View",
    tools: [
      { value: "zoom", label: "Zoom", icon: "tool_zoom" },
      { value: "hand", label: "Hand", icon: "tool_hand" },
    ],
  },
  {
    id: "Move",
    tools: [
      { value: "move", label: "Move", icon: "tool_move" },
      { value: "slice", label: "Slice", icon: "tool_slice" },
    ],
  },
  {
    id: "Fill",
    tools: [
      { value: "bucket", label: "Paint Bucket", icon: "tool_paint_bucket" },
      { value: "gradient", label: "Gradient", icon: "tool_gradient" },
    ],
  },
  {
    id: "Traces",
    tools: [
      { value: "line", label: "Line", icon: "tool_line" },
      { value: "curve", label: "Curve", icon: "tool_curve" },
    ],
  },
  {
    id: "Shapes",
    tools: [
      { value: "rectangle", label: "Rectangle", icon: "tool_rectangle" },
      { value: "filled_rectangle", label: "Filled Rectangle", icon: "tool_filled_rectangle" },
      { value: "ellipse", label: "Ellipse", icon: "tool_ellipse" },
      { value: "filled_ellipse", label: "Filled Ellipse", icon: "tool_filled_ellipse" },
    ],
  },
  {
    id: "Contours",
    tools: [
      { value: "contour", label: "Contour", icon: "tool_contour" },
      { value: "polygon", label: "Polygon", icon: "tool_polygon" },
    ],
  },
  {
    id: "Effects",
    tools: [
      { value: "blur", label: "Blur", icon: "tool_blur" },
      { value: "jumble", label: "Jumble", icon: "tool_jumble" },
    ],
  },
  { id: "Text", tools: [{ value: "text", label: "Text", icon: "tool_text" }] },
];
export const toolGroups = toolParts.map((group) => ({
  ...group,
  tools: group.tools.map((tool) => {
    const key =
      tool.value === "marquee"
        ? "rectangular_marquee"
        : tool.value === "bucket"
          ? "paint_bucket"
          : tool.value;
    return {
      ...tool,
      tooltip: toolTips.tools[key as keyof typeof toolTips.tools]?.text ?? tool.label,
    };
  }),
}));
export function ToolRail({
  layout = "column",
  onActiveToolPress,
  openToolOptions,
}: {
  layout?: "row" | "column";
  onActiveToolPress?: (trigger: HTMLButtonElement) => void;
  openToolOptions?: ToolRailModel["tool"];
} = {}) {
  const editor = useToolRailModel();
  const { style } = useUi();
  const metrics = uiMetrics(style);
  const horizontal = layout === "row";
  const scrollHost = useRef<HTMLDivElement>(null);
  const wheel = useWheelInput();
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const node = scrollHost.current;
      if (!horizontal || !node) return;
      const viewport = layoutSize(node);
      if (scrollSize(node).width <= viewport.width) return;
      const decision = wheel.resolve(event, EditorWheelSurface.ToolRail);
      if (decision.action !== EditorWheelAction.Horizontal) return;
      const local = clientDeltaToLocal(node, { x: decision.x, y: decision.y });
      const delta = wheel.projectDelta(decision, local, viewport);
      scrollBy(node, { x: delta.x });
      event.preventDefault();
      event.stopPropagation();
    },
    [horizontal, wheel],
  );
  useWheelInputHandler(scrollHost, handleWheel);
  const shortcutManager = useShortcutManager();
  const boundToolGroups = toolGroups.map((group) => ({
    ...group,
    tools: group.tools.map((tool) => {
      const shortcut = shortcutManager?.formatToolShortcut(tool.value);
      if (shortcut === undefined) return tool;
      const tooltip = tool.tooltip.replace(/\n\nShortcut:.*$/, "");
      return {
        ...tool,
        tooltip: shortcut
          ? `${tooltip}\n\n${"Shortcut"}: ${formatShortcutForPlatform(shortcut)}`
          : tooltip,
      };
    }),
  }));
  const groups = horizontal
    ? [...boundToolGroups].sort(
        (first, second) =>
          horizontalToolOrder.indexOf(first.id) - horizontalToolOrder.indexOf(second.id),
      )
    : boundToolGroups;
  const groupPitch = metrics.toolPitch * UI_SCALE;
  const railWidth = metrics.toolWidth * UI_SCALE;
  const railHeight = metrics.toolHeight * UI_SCALE;
  const controlBounds = {
    x: 0,
    y: 0,
    width: metrics.toolWidth * UI_SCALE,
    height: railHeight,
  };
  return (
    <div
      className="xse-tool-rail"
      data-layout={layout}
      role="toolbar"
      aria-label={tUi("ui.tools")}
      style={{
        width: horizontal ? "100%" : railWidth,
        height: horizontal ? railHeight : "100%",
      }}
    >
      <div
        ref={scrollHost}
        className="xse-tool-rail-groups"
        data-layout={layout}
        style={
          horizontal
            ? { marginRight: railWidth * 2, height: railHeight }
            : { marginBottom: railHeight * 2 }
        }
      >
        <ToolGroupRail
          groups={groups}
          value={editor.tool}
          onValueChange={(tool) => editor.setTool(tool as ToolRailModel["tool"])}
          onActiveToolPress={onActiveToolPress}
          openToolOptions={openToolOptions}
          layout={layout}
          bounds={{
            x: 0,
            y: 0,
            width: metrics.toolWidth * UI_SCALE,
            height: railHeight,
          }}
          pitch={groupPitch}
          relativeTo={mainOrigin}
        />
      </div>
      <Tooltip
        text={editor.previewVisible ? toolTips.actions.preview_hide : toolTips.actions.preview_show}
        placement={horizontal ? "top" : "auto"}
      >
        <Button
          bounds={controlBounds}
          relativeTo={mainOrigin}
          part="toolbutton_normal"
          hotPart="toolbutton_hot"
          insetContent={false}
          icon="tool_minieditor"
          selected={editor.previewVisible}
          aria-label={editor.previewVisible ? "Hide Preview" : "Show Preview"}
          aria-pressed={editor.previewVisible}
          onClick={() => editor.setPreviewVisible((value) => !value)}
          style={
            horizontal
              ? { left: "auto", right: railWidth, top: 0 }
              : { left: 0, top: "auto", bottom: railHeight }
          }
        />
      </Tooltip>
      <Tooltip
        text={
          editor.timelineVisible ? toolTips.actions.timeline_hide : toolTips.actions.timeline_show
        }
        placement={horizontal ? "top" : "auto"}
      >
        <Button
          bounds={controlBounds}
          relativeTo={mainOrigin}
          part="toolbutton_last"
          hotPart="toolbutton_hot"
          insetContent={false}
          icon="tool_timeline"
          selected={editor.timelineVisible}
          aria-pressed={editor.timelineVisible}
          aria-label={editor.timelineVisible ? "Hide Timeline" : "Show Timeline"}
          onClick={() => editor.setTimelineVisible((value) => !value)}
          style={
            horizontal ? { left: "auto", right: 0, top: 0 } : { left: 0, top: "auto", bottom: 0 }
          }
        />
      </Tooltip>
    </div>
  );
}
