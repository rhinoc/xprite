import { createRoot } from "react-dom/client";

import { createWechatDiagnostics } from "$/adapters/diagnostics/diagnostics";
import { createWechatEditorHost } from "$/adapters/platform/editor-host";
import {
  EditorApplication,
  AppErrorBoundary,
  DiagnosticsProvider,
} from "@xprite/editor-app/embedded-runtime";

/** Mount the same application, dialogs, menus, workspace and editor controls. */
export function mountWechatEditor(container: HTMLElement) {
  const diagnostics = createWechatDiagnostics();
  (window as unknown as { __xpriteDiagnostics: typeof diagnostics }).__xpriteDiagnostics =
    diagnostics;
  const root = createRoot(container);
  root.render(
    <DiagnosticsProvider diagnostics={diagnostics}>
      <AppErrorBoundary
        onError={(error) => console.error(error)}
        onExportDiagnostics={() => diagnostics.exportLogs()}
      >
        <EditorApplication createHost={createWechatEditorHost} />
      </AppErrorBoundary>
    </DiagnosticsProvider>,
  );
  return { unmount: () => root.unmount() };
}
