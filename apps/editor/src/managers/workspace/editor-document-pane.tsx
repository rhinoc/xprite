import type { ReactNode } from "react";

import { EditorProvider } from "$/managers/editor/editor-state-manager";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

/** Mounts a document's editor manager context without passing its core handle to a component. */
export function EditorDocumentPane({
  documentId,
  children,
}: {
  documentId: string;
  children: ReactNode;
}) {
  const { workspace, uiStore } = useEditorRuntimeManagerContext();
  const slot = workspace.getSlot(documentId);
  if (!slot) return null;
  return (
    <EditorProvider core={slot.core} uiStore={uiStore}>
      {children}
    </EditorProvider>
  );
}
