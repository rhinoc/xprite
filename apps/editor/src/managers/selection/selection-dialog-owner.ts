/** Document IDs are local to an editor instance, not workspace-global. A modal
 * owns both the editor object and the document installed when it was opened. */
export interface SelectionDialogOwner {
  getSnapshot: () => { document: { id?: number; name: string } | null };
}
export function selectionDialogMatchesOwner(
  openedCore: SelectionDialogOwner | null,
  currentCore: SelectionDialogOwner | null,
  openedDocumentId: number | string | null,
): boolean {
  if (!openedCore || openedCore !== currentCore || openedDocumentId === null) return false;
  const document = currentCore.getSnapshot().document;
  return !!document && (document.id ?? document.name) === openedDocumentId;
}
