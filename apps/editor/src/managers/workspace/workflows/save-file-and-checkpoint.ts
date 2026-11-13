import { tUi } from "$/i18n";
import {
  SessionOutcome,
  type EditorSession,
  type SessionSaveIntent,
} from "@xprite/editor-core/session";

interface FileSaveWorkspace {
  checkpointSavedFile(slotId: string): Promise<"saved" | "pending" | "failed">;
  linkRecentFileToWorkspaceProject(slotId: string): void;
  recordFileOutputCheckpoint(
    slotId: string,
    downloaded: boolean,
    checkpoint: "saved" | "pending" | "failed",
  ): void;
}

/** A completed file output and a resumable workspace checkpoint are independent receipts. */
export async function saveFileAndCheckpoint(
  session: Pick<EditorSession<string>, "save" | "getLastSaveMethod">,
  workspace: FileSaveWorkspace,
  slotId: string,
  intent: SessionSaveIntent,
  suggestedName?: string,
): Promise<SessionOutcome> {
  // Do not insert an await before save: native pickers need the user's activation.
  const outcome = await session.save(intent, suggestedName);
  if (outcome !== SessionOutcome.Created) return outcome;
  const method = session.getLastSaveMethod();
  if (!method) throw new Error(tUi("ui.file.output.receipt.missing"));
  const checkpoint = await workspace.checkpointSavedFile(slotId);
  workspace.recordFileOutputCheckpoint(slotId, method === "download", checkpoint);
  if (checkpoint === "saved") workspace.linkRecentFileToWorkspaceProject(slotId);
  return outcome;
}

/** Both close paths must protect recovery/manifest state as well as external-file edits. */
export function canCloseSavedDocument(
  workspace: {
    isDocumentLocallyModified(slotId: string): boolean;
    needsBeforeUnloadWarning(): boolean;
  },
  slotId: string,
): boolean {
  return !workspace.isDocumentLocallyModified(slotId) && !workspace.needsBeforeUnloadWarning();
}
