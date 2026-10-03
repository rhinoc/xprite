export enum EditorView {
  Home = "home",
  Editor = "editor",
  Guide = "guide",
  Recovery = "recovery",
}

export enum EditorViewChangeTrigger {
  Initial = "initial",
  User = "user",
  Automatic = "automatic",
  Navigation = "navigation",
}

export enum EditorViewChangeReason {
  InitialLoad = "initial_load",
  TabSelected = "tab_selected",
  TabClosed = "tab_closed",
  NoDocuments = "no_documents",
  DocumentOpened = "document_opened",
  DocumentActivated = "document_activated",
  DocumentClosed = "document_closed",
  LastDocumentClosed = "last_document_closed",
  DocumentRecovered = "document_recovered",
  DocumentGenerated = "document_generated",
  RecoveryOpened = "recovery_opened",
  RecoveryClosed = "recovery_closed",
  HistoryNavigation = "history_navigation",
}

export interface EditorViewTransition {
  readonly trigger: EditorViewChangeTrigger;
  readonly reason: EditorViewChangeReason;
}

export function automaticViewTransition(reason: EditorViewChangeReason): EditorViewTransition {
  return { trigger: EditorViewChangeTrigger.Automatic, reason };
}

export function userViewTransition(reason: EditorViewChangeReason): EditorViewTransition {
  return { trigger: EditorViewChangeTrigger.User, reason };
}
