import { Component, type ErrorInfo, type ReactNode } from "react";

import { Alert } from "$/components/dialogs/alert";
import { currentUiLanguage, tUi, tUiSource } from "$/i18n";
import { AlertDialogActionVariant, UIProvider, useUi } from "@xprite/ui";

import styles from "$/components/errors/app-error-boundary.module.css";

interface AppErrorBoundaryProps {
  onError: (error: Error, componentStack: string | undefined) => void;
  onExportDiagnostics: () => Promise<number>;
  onViewDiagnostics?: () => Promise<void>;
  children: ReactNode;
}

interface AppErrorBoundaryState {
  failed: boolean;
  exporting: boolean;
  status: string;
}

function translateKey(key: string) {
  return tUi(key as Parameters<typeof tUi>[0]);
}

function reloadEditor() {
  const url = new URL(window.location.href);
  if (import.meta.env.DEV && url.searchParams.get("mockError") === "1") {
    url.searchParams.delete("mockError");
    window.history.replaceState(null, "", url);
  }
  window.location.reload();
}

function ErrorScreen({
  exporting,
  status,
  onExportDiagnostics,
  viewing,
}: {
  exporting: boolean;
  status: string;
  onExportDiagnostics: () => void;
  viewing: boolean;
}) {
  const { style: uiStyle } = useUi();

  return (
    <div
      className={`${styles.screen} xse-global`}
      role="alert"
      aria-live="polite"
      style={{ background: uiStyle.colors.editor_face }}
    >
      <Alert
        open
        onOpenChange={(open) => {
          if (!open) reloadEditor();
        }}
        title={tUi("ui.diagnostics.error.title")}
        messageLines={[
          ...tUi("ui.diagnostics.error.description").split("\n"),
          ...(status ? [status] : []),
        ]}
        actions={[
          {
            label: tUi("ui.diagnostics.error.reload"),
            onClick: reloadEditor,
            variant: AlertDialogActionVariant.Primary,
          },
          {
            label: exporting
              ? tUi(viewing ? "ui.diagnostics.loading" : "ui.diagnostics.exporting")
              : tUi(viewing ? "ui.diagnostics.view.button" : "ui.diagnostics.export.button"),
            onClick: onExportDiagnostics,
            disabled: exporting,
          },
        ]}
        defaultActionIndex={0}
        cancelActionIndex={-1}
      />
    </div>
  );
}

/** Last-resort render boundary kept outside App so startup failures have a recovery screen. */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false, exporting: false, status: "" };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true, exporting: false, status: "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError(error, info.componentStack ?? undefined);
  }

  private exportDiagnostics = async () => {
    this.setState({ exporting: true, status: "" });
    try {
      if (this.props.onViewDiagnostics) {
        await this.props.onViewDiagnostics();
        this.setState({ exporting: false, status: "" });
        return;
      }
      const count = await this.props.onExportDiagnostics();
      this.setState({
        exporting: false,
        status: tUi("ui.diagnostics.export.complete", { count }),
      });
    } catch {
      this.setState({
        exporting: false,
        status: tUi(
          this.props.onViewDiagnostics
            ? "ui.diagnostics.read.failed"
            : "ui.diagnostics.export.failed",
        ),
      });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <UIProvider
        appearance="dark"
        language={currentUiLanguage()}
        translateKey={translateKey}
        translateSource={tUiSource}
      >
        <ErrorScreen
          exporting={this.state.exporting}
          status={this.state.status}
          onExportDiagnostics={() => void this.exportDiagnostics()}
          viewing={this.props.onViewDiagnostics !== undefined}
        />
      </UIProvider>
    );
  }
}
