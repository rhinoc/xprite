import type { PreferenceStoragePort } from "$/managers/ports/platform";
export const timelineDockPositions = ["top", "left", "right", "bottom"] as const;
export type TimelineDockPosition = (typeof timelineDockPositions)[number];

export const TIMELINE_DOCK_POSITION_STORAGE_KEY = "xse.timeline.dock-position.v1";

function isTimelineDockPosition(value: string | null): value is TimelineDockPosition {
  return timelineDockPositions.includes(value as TimelineDockPosition);
}

export function readTimelineDockPosition(storage?: PreferenceStoragePort): TimelineDockPosition {
  try {
    const saved = storage?.getItem(TIMELINE_DOCK_POSITION_STORAGE_KEY) ?? null;
    return isTimelineDockPosition(saved) ? saved : "bottom";
  } catch {
    return "bottom";
  }
}
