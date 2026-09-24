import { createContext, useContext, type ReactNode } from "react";

import type { DiagnosticsPort } from "$/managers/ports/diagnostics";

const emptyDiagnostics: DiagnosticsPort = {
  capture: () => {},
  recordWorkspaceEvent: () => {},
  setWorkspaceSnapshotProvider: () => {},
  getRuntimeCapabilities: () => ({
    openFilePicker: false,
    saveFilePicker: false,
    opfs: false,
    indexedDb: false,
    workers: false,
    compressionStream: false,
    offscreenCanvas: false,
    imageBitmap: false,
  }),
  getRecent: async () => [],
  clear: async () => {},
  exportLogs: async () => 0,
};

const DiagnosticsContext = createContext<DiagnosticsPort>(emptyDiagnostics);

export function DiagnosticsProvider({
  diagnostics,
  children,
}: {
  diagnostics: DiagnosticsPort;
  children: ReactNode;
}) {
  return <DiagnosticsContext.Provider value={diagnostics}>{children}</DiagnosticsContext.Provider>;
}

export function useDiagnosticsPort(): DiagnosticsPort {
  return useContext(DiagnosticsContext);
}
