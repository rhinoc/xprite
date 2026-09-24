export enum ClipboardPasteIntent {
  Menu = "menu",
  Keyboard = "keyboard",
}

export enum ClipboardPasteSource {
  System = "system",
  Event = "event",
  Workspace = "workspace",
}

export interface ClipboardPasteRequest {
  intent: ClipboardPasteIntent;
  hasEventImage: boolean;
}

/** Choose a payload source independently from browser I/O and paste effects. */
export function resolveClipboardPasteSource(
  request: ClipboardPasteRequest,
  hasAppImageCopy: boolean,
): ClipboardPasteSource {
  if (request.intent === ClipboardPasteIntent.Menu) return ClipboardPasteSource.System;
  if (!request.hasEventImage) return ClipboardPasteSource.Workspace;
  return hasAppImageCopy ? ClipboardPasteSource.System : ClipboardPasteSource.Event;
}
