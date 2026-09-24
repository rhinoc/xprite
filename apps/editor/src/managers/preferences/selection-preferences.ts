export interface SelectionPreferences {
  autoOpaque: boolean;
  keepSelectionAfterClear: boolean;
  autoShowSelectionEdges: boolean;
  doubleClickSelectTile: boolean;
  moveEdges: boolean;
  modifiersDisableHandles: boolean;
  moveOnAddMode: boolean;
  multicelWhenLayersOrFrames: boolean;
}

export const defaultSelectionPreferences: SelectionPreferences = {
  autoOpaque: true,
  keepSelectionAfterClear: false,
  autoShowSelectionEdges: true,
  doubleClickSelectTile: true,
  moveEdges: true,
  modifiersDisableHandles: true,
  moveOnAddMode: true,
  multicelWhenLayersOrFrames: true,
};

export function normalizeSelectionPreferences(value: unknown): SelectionPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    multicelWhenLayersOrFrames:
      typeof saved.multicelWhenLayersOrFrames === "boolean"
        ? saved.multicelWhenLayersOrFrames
        : defaultSelectionPreferences.multicelWhenLayersOrFrames,
    moveEdges:
      typeof saved.moveEdges === "boolean"
        ? saved.moveEdges
        : defaultSelectionPreferences.moveEdges,
    modifiersDisableHandles:
      typeof saved.modifiersDisableHandles === "boolean"
        ? saved.modifiersDisableHandles
        : defaultSelectionPreferences.modifiersDisableHandles,
    moveOnAddMode:
      typeof saved.moveOnAddMode === "boolean"
        ? saved.moveOnAddMode
        : defaultSelectionPreferences.moveOnAddMode,
    doubleClickSelectTile:
      typeof saved.doubleClickSelectTile === "boolean"
        ? saved.doubleClickSelectTile
        : defaultSelectionPreferences.doubleClickSelectTile,
    autoOpaque:
      typeof saved.autoOpaque === "boolean"
        ? saved.autoOpaque
        : defaultSelectionPreferences.autoOpaque,
    keepSelectionAfterClear:
      typeof saved.keepSelectionAfterClear === "boolean"
        ? saved.keepSelectionAfterClear
        : defaultSelectionPreferences.keepSelectionAfterClear,
    autoShowSelectionEdges:
      typeof saved.autoShowSelectionEdges === "boolean"
        ? saved.autoShowSelectionEdges
        : defaultSelectionPreferences.autoShowSelectionEdges,
  };
}
