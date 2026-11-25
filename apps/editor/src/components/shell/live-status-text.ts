import { tUi, tUiSource, type UiMessageKey } from "$/i18n";
import type { LiveStatusIcon, LiveStatusIndicator } from "$/managers/shell/live-status-manager";

const STATUS_ICON_LABEL_KEYS: Record<LiveStatusIcon, UiMessageKey> = {
  eyedropper: "ui.eyedropper",
  pos: "ui.status.position",
  size: "ui.size",
  selsize: "ui.status.selection.size",
  grid: "ui.grid",
  search: "ui.status.cell.index",
  angle: "ui.angle",
  frame: "ui.frame",
  clock: "ui.duration",
  start: "ui.start",
  end: "ui.end",
  distance: "ui.status.distance",
  aspect_ratio: "ui.status.aspect.ratio",
};

export function translateLiveStatusText(text: string): string {
  return text.trim() === "Ready" ? tUi("ui.ready") : tUiSource(text);
}

export function formatLiveStatusAnnouncement(indicators: readonly LiveStatusIndicator[]): string {
  return indicators
    .map((item) =>
      "text" in item
        ? translateLiveStatusText(item.text).trim()
        : "color" in item
          ? tUi("ui.status.color.sample")
          : tUi(STATUS_ICON_LABEL_KEYS[item.icon]),
    )
    .filter(Boolean)
    .join(" ");
}
