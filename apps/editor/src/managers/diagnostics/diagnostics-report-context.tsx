import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { useDiagnosticsPort } from "$/managers/diagnostics/diagnostics-context";

interface DiagnosticsReportController {
  report: string | null;
  open(): Promise<void>;
  close(): void;
}

const DiagnosticsReportContext = createContext<DiagnosticsReportController | null>(null);

/** Mounted only by hosts that present logs without downloading a file. */
export function DiagnosticsReportProvider({ children }: { children: ReactNode }) {
  const diagnostics = useDiagnosticsPort();
  const [report, setReport] = useState<string | null>(null);
  const open = useCallback(async () => {
    if (!diagnostics.readReport) throw new Error("Diagnostic report viewing is unavailable");
    setReport(await diagnostics.readReport());
  }, [diagnostics]);
  const close = useCallback(() => setReport(null), []);
  const controller = useMemo(() => ({ report, open, close }), [report, open, close]);
  return (
    <DiagnosticsReportContext.Provider value={controller}>
      {children}
    </DiagnosticsReportContext.Provider>
  );
}

export function useDiagnosticsReport() {
  return useContext(DiagnosticsReportContext);
}
