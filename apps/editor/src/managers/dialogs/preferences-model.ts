export interface UndoPreferencesView {
  maxBytes: number;
  allowNonlinearHistory: boolean;
  gotoModified: boolean;
  showTooltip: boolean;
}

export const DEFAULT_UNDO_PREFERENCES: UndoPreferencesView = {
  maxBytes: 0,
  allowNonlinearHistory: false,
  gotoModified: true,
  showTooltip: true,
};
