import { InteractionBlocker } from "$/managers/ports/diagnostics";

export interface WorkflowInteractionFlags {
  aboutOpen: boolean;
  supportOpen: boolean;
  feedbackOpen: boolean;
  inputDialogOpen: boolean;
  newTilemapDialog: boolean;
  preferencesOpen: boolean;
  saveAsOpen: boolean;
  newDialog: boolean;
  duplicateSpriteOpen: boolean;
  keyboardShortcutsOpen: boolean;
  outputHasOpenDialog: boolean;
  deleteRecoveryOpen: boolean;
  deleteBrowserCopyOpen: boolean;
  sequenceImportOpen: boolean;
  videoImportOpen: boolean;
  pendingImportOpen: boolean;
  replacementOpen: boolean;
  errorOpen: boolean;
  exitNoticeOpen: boolean;
  exportBusy: boolean;
  saveAsBusy: boolean;
  recoveryBusy: boolean;
  closingSaveBusy: boolean;
  importBatchActive: boolean;
  sessionBusy: boolean;
  sessionSaving: boolean;
  sessionPrompt: "error" | "replacement" | "pixelation" | null;
  sessionCanStartInteraction: boolean;
}

export interface WorkflowInteractionState {
  readonly modalBlockers: readonly InteractionBlocker[];
  readonly modalOpen: boolean;
  readonly operationBusy: boolean;
  readonly interactionBlockers: readonly InteractionBlocker[];
  readonly interactionBlockerSignature: string;
  readonly canStartInteraction: boolean;
  readonly canDispatchEditorInput: boolean;
}

/**
 * Pure aggregator for modal/busy/session blockers so UI controls, shortcut dispatch,
 * and diagnostics share the exact same gating rules.
 */
export function computeWorkflowInteractionState(
  flags: WorkflowInteractionFlags,
): WorkflowInteractionState {
  const modalBlockers: InteractionBlocker[] = [];
  if (flags.aboutOpen) modalBlockers.push(InteractionBlocker.AboutDialog);
  if (flags.supportOpen) modalBlockers.push(InteractionBlocker.SupportDialog);
  if (flags.feedbackOpen) modalBlockers.push(InteractionBlocker.FeedbackDialog);
  if (flags.inputDialogOpen) modalBlockers.push(InteractionBlocker.InputDialog);
  if (flags.newTilemapDialog) modalBlockers.push(InteractionBlocker.NewTilemapDialog);
  if (flags.preferencesOpen) modalBlockers.push(InteractionBlocker.PreferencesDialog);
  if (flags.saveAsOpen) modalBlockers.push(InteractionBlocker.SaveAsDialog);
  if (flags.newDialog) modalBlockers.push(InteractionBlocker.NewDocumentDialog);
  if (flags.duplicateSpriteOpen) modalBlockers.push(InteractionBlocker.DuplicateSpriteDialog);
  if (flags.keyboardShortcutsOpen) modalBlockers.push(InteractionBlocker.KeyboardShortcutsDialog);
  if (flags.outputHasOpenDialog) modalBlockers.push(InteractionBlocker.OutputDialog);
  if (flags.deleteRecoveryOpen) modalBlockers.push(InteractionBlocker.DeleteRecoveryDialog);
  if (flags.deleteBrowserCopyOpen) modalBlockers.push(InteractionBlocker.DeleteBrowserCopyDialog);
  if (flags.sequenceImportOpen) modalBlockers.push(InteractionBlocker.SequenceImportDialog);
  if (flags.videoImportOpen) modalBlockers.push(InteractionBlocker.VideoImportDialog);
  if (flags.pendingImportOpen) modalBlockers.push(InteractionBlocker.ImportConfirmation);
  if (flags.replacementOpen) modalBlockers.push(InteractionBlocker.ReplacementConfirmation);
  if (flags.errorOpen) modalBlockers.push(InteractionBlocker.ErrorDialog);
  if (flags.exitNoticeOpen) modalBlockers.push(InteractionBlocker.ExitConfirmation);

  const modalOpen = modalBlockers.length > 0;
  const operationBusy =
    flags.exportBusy || flags.saveAsBusy || flags.recoveryBusy || flags.closingSaveBusy;

  const interactionBlockers: InteractionBlocker[] = [...modalBlockers];
  if (flags.exportBusy) interactionBlockers.push(InteractionBlocker.ExportBusy);
  if (flags.saveAsBusy) interactionBlockers.push(InteractionBlocker.SaveAsBusy);
  if (flags.recoveryBusy) interactionBlockers.push(InteractionBlocker.RecoveryBusy);
  if (flags.closingSaveBusy) interactionBlockers.push(InteractionBlocker.ClosingSaveBusy);
  if (flags.importBatchActive) interactionBlockers.push(InteractionBlocker.ImportBatch);
  if (flags.sessionBusy) interactionBlockers.push(InteractionBlocker.SessionBusy);
  if (flags.sessionSaving) interactionBlockers.push(InteractionBlocker.SessionSaving);
  if (flags.sessionPrompt === "error")
    interactionBlockers.push(InteractionBlocker.SessionPromptError);
  if (flags.sessionPrompt === "replacement")
    interactionBlockers.push(InteractionBlocker.SessionPromptReplacement);
  if (flags.sessionPrompt === "pixelation")
    interactionBlockers.push(InteractionBlocker.SessionPromptPixelation);
  if (
    !flags.sessionCanStartInteraction &&
    !flags.sessionBusy &&
    !flags.sessionSaving &&
    flags.sessionPrompt === null
  )
    interactionBlockers.push(InteractionBlocker.SessionUnavailable);

  return {
    modalBlockers,
    modalOpen,
    operationBusy,
    interactionBlockers,
    interactionBlockerSignature: interactionBlockers.join(","),
    canStartInteraction:
      !modalOpen && !operationBusy && !flags.importBatchActive && flags.sessionCanStartInteraction,
    canDispatchEditorInput:
      !modalOpen && !operationBusy && !flags.sessionBusy && !flags.importBatchActive,
  };
}
