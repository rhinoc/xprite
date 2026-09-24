export enum ShortcutBindingKind {
  Command = "command",
  Tool = "tool",
  Action = "action",
  QuickTool = "quicktool",
  Drag = "drag",
  Wheel = "wheel",
}

export interface ShortcutDragVector {
  x: number;
  y: number;
}

export interface ShortcutFileEntry {
  kind: ShortcutBindingKind;
  id: string;
  context: string;
  params?: Record<string, string>;
  shortcut: string;
  removed: boolean;
  vector?: ShortcutDragVector;
}

/** Platform serialization and file selection for Aseprite shortcut sets. */
export interface ShortcutFilePort {
  read(): Promise<readonly ShortcutFileEntry[] | null>;
  write(entries: readonly ShortcutFileEntry[]): Promise<void>;
}
