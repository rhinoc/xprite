import { tUi } from "$/i18n";

/** Persistent storage status is separate from the status bar's transient notices. */
export function presentRecoveryProblem(input: {
  outputProblem?: string;
  failure: unknown;
  workspacePending: boolean;
  documentPending: boolean;
}): string | undefined {
  if (input.outputProblem) return input.outputProblem;
  if (!input.failure) return;
  return tUi(
    input.workspacePending
      ? input.documentPending
        ? "ui.recovery.save.failed.status"
        : "ui.recovery.workspace.failed.status"
      : "ui.recovery.backup.failed.status",
  );
}
