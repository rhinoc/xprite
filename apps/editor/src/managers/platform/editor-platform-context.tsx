import { createContext, useContext, type ReactNode } from "react";

import type { EditorPlatformPorts } from "$/managers/ports/platform";

const EditorPlatformContext = createContext<EditorPlatformPorts | null>(null);

/** Injects browser capabilities into app managers from the composition root. */
export function EditorPlatformProvider({
  ports,
  children,
}: {
  ports: EditorPlatformPorts;
  children: ReactNode;
}) {
  return <EditorPlatformContext.Provider value={ports}>{children}</EditorPlatformContext.Provider>;
}

export function useEditorPlatformPorts(): EditorPlatformPorts | null {
  return useContext(EditorPlatformContext);
}
