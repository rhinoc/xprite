export interface TimelineInteractionPreferences {
  autoShowTimeline: boolean;
  rewindOnStop: boolean;
  keepSelection: boolean;
  selectOnClick: boolean;
  selectOnClickWithKey: boolean;
  selectOnDrag: boolean;
  dragAndDropFromEdges: boolean;
}

export const defaultTimelineInteractionPreferences: TimelineInteractionPreferences = {
  autoShowTimeline: true,
  rewindOnStop: false,
  keepSelection: false,
  selectOnClick: true,
  selectOnClickWithKey: true,
  selectOnDrag: true,
  dragAndDropFromEdges: true,
};

export function normalizeTimelineInteractionPreferences(
  value: unknown,
): TimelineInteractionPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    autoShowTimeline:
      typeof saved.autoShowTimeline === "boolean"
        ? saved.autoShowTimeline
        : defaultTimelineInteractionPreferences.autoShowTimeline,
    rewindOnStop:
      typeof saved.rewindOnStop === "boolean"
        ? saved.rewindOnStop
        : defaultTimelineInteractionPreferences.rewindOnStop,
    keepSelection:
      typeof saved.keepSelection === "boolean"
        ? saved.keepSelection
        : defaultTimelineInteractionPreferences.keepSelection,
    selectOnClick:
      typeof saved.selectOnClick === "boolean"
        ? saved.selectOnClick
        : defaultTimelineInteractionPreferences.selectOnClick,
    selectOnClickWithKey:
      typeof saved.selectOnClickWithKey === "boolean"
        ? saved.selectOnClickWithKey
        : defaultTimelineInteractionPreferences.selectOnClickWithKey,
    selectOnDrag:
      typeof saved.selectOnDrag === "boolean"
        ? saved.selectOnDrag
        : defaultTimelineInteractionPreferences.selectOnDrag,
    dragAndDropFromEdges:
      typeof saved.dragAndDropFromEdges === "boolean"
        ? saved.dragAndDropFromEdges
        : defaultTimelineInteractionPreferences.dragAndDropFromEdges,
  };
}
