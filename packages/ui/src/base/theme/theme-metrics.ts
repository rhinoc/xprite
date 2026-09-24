import type { UiStyleDefinition } from "$/base/theme/theme-context";

/** Layout metrics derived from the selected theme's atlas dimensions. */
export function themeMetrics(style: Pick<UiStyleDefinition, "dimensions" | "parts">) {
  const dimensions = style.dimensions;
  const tool = style.parts.tool_configuration ?? style.parts.tool_pencil;
  const toolWidth = tool?.width ?? 16;
  const toolHeight = tool?.height ?? 16;
  return {
    contextHeight: dimensions.context_bar_height,
    tabsHeight: dimensions.tabs_height,
    tabWidth: dimensions.tabs_width,
    tabFaceHeight: dimensions.docked_tabs_height,
    tabBottomHeight: dimensions.tabs_bottom_height,
    tabCloseWidth: dimensions.tabs_close_icon_width,
    toolWidth,
    toolHeight,
    toolPitch: toolHeight - 1,
    timelineRowHeight: dimensions.timeline_base_size,
    scrollbarSize: dimensions.mini_scrollbar_size,
    gap: 2,
  };
}
