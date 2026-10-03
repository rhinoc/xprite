import { useEffect, useMemo, useState } from "react";

import { createBrowserEditorHostPorts } from "$/adapters/platform/browser-editor-host";
import { DEFAULT_PROJECT_DATABASE_NAME } from "$/adapters/storage/project-storage/indexeddb";
import { RecoverySettingsStore } from "$/adapters/storage/recovery-settings-store";
import { EditorSurface } from "$/components/canvas/editor-surface";
import { EditorStartup } from "$/components/shell/editor-startup";
import { EditorView } from "$/components/shell/editor-view";
import { ColorProfileProvider } from "$/components/tools/color-profile";
import { currentUiLanguage, tUi, tUiSource, useUiLanguage } from "$/i18n";
import { ColorSourcesProvider } from "$/managers/colors/color-sources";
import { useDiagnosticsPort } from "$/managers/diagnostics/diagnostics-context";
import { EditorProvider } from "$/managers/editor/editor-state-manager";
import { createEditorUiStore } from "$/managers/editor/editor-ui-store";
import type { EditorTab } from "$/managers/editor/editor-ui-store";
import {
  automaticViewTransition,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { CanvasInputProvider } from "$/managers/input/canvas-input-context";
import { useWheelDevicePreferences } from "$/managers/input/use-wheel-device-preferences";
import { WheelDeviceProvider } from "$/managers/input/wheel-device-context";
import { EditorPlatformProvider } from "$/managers/platform/editor-platform-context";
import { DiagnosticSource, type DiagnosticsPort } from "$/managers/ports/diagnostics";
import type { EditorHostFactory, EditorHostPorts } from "$/managers/ports/editor-host";
import { EditorChromePreferencesManager } from "$/managers/shell/editor-chrome-preferences";
import { EditorChromePreferencesProvider } from "$/managers/shell/editor-chrome-preferences-context";
import { reportingSessionPorts } from "$/managers/telemetry/reporting-session-ports";
import { useTelemetry } from "$/managers/telemetry/telemetry-context";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { EditorRuntimeManagerProvider } from "$/managers/workspace/editor-runtime-context";
import { useEditorRuntime } from "$/managers/workspace/use-editor-runtime";
import { WorkspaceLifetime } from "$/managers/workspace/workspace-lifetime";
import { WorkspaceRecovery } from "$/managers/workspace/workspace-recovery";
import { randomId } from "@xprite/bedrock/browser/runtime-crypto";
import { UIProvider, useSystemAppearance } from "@xprite/ui";
import { preloadUiAssets } from "@xprite/ui/assets";

const PROJECT_DATABASE_NAME = DEFAULT_PROJECT_DATABASE_NAME;
const EMBEDDED_HOST_ENABLED = "true";
const defaultHostFactory =
  import.meta.env.VITE_EMBEDDED_HOST === EMBEDDED_HOST_ENABLED
    ? undefined
    : createBrowserEditorHostPorts;

function createEditorWorkspace(
  host: EditorHostPorts,
  diagnostics: DiagnosticsPort,
  telemetry: TelemetryManager,
) {
  const createId = randomId;
  const platform = host.platform;
  const recovery = new WorkspaceRecovery({
    repository: host.createRepository(),
    codec: host.createCodec(),
    settingsStore: new RecoverySettingsStore(PROJECT_DATABASE_NAME, platform.preferences),
    createId,
    inputDiagnostics: platform.canvasInput,
  });
  const workspace = new DocumentWorkspace({
    ports: reportingSessionPorts(host.createSessions(), telemetry),
    recovery,
    createId,
    preferenceStorage: platform.preferences,
    shortcutFiles: platform.shortcutFiles,
    primaryModifier: platform.input.primaryModifier,
    userPresetStorage: platform.userPresets,
    diagnostics,
    onSessionError: (reason, operation) =>
      diagnostics.capture(reason, DiagnosticSource.Session, { context: operation }),
  });
  diagnostics.setWorkspaceSnapshotProvider(() => workspace.getDiagnosticsSnapshot());
  telemetry.bindWorkspace(workspace);
  return workspace;
}

function EditorApplication({
  workspace,
  workspaceLifetime,
  uiStore,
  home,
  initialTab,
}: {
  workspace: DocumentWorkspace;
  workspaceLifetime: WorkspaceLifetime;
  uiStore: ReturnType<typeof createEditorUiStore>;
  home: boolean;
  initialTab: EditorTab;
}) {
  const systemAppearanceMode = useSystemAppearance();
  const runtime = useEditorRuntime(
    workspace,
    systemAppearanceMode,
    preloadUiAssets,
    workspaceLifetime,
  );
  const telemetry = useTelemetry();
  const wheelDevice = useWheelDevicePreferences();

  useEffect(() => {
    if (runtime.startup === "ready") telemetry.markReady();
  }, [runtime.startup, telemetry]);

  useEffect(() => {
    if (runtime.startup === "ready" && runtime.workspaceSnapshot.tabs.length === 0)
      uiStore
        .getState()
        .setTab("home", automaticViewTransition(EditorViewChangeReason.NoDocuments));
  }, [runtime.startup, runtime.workspaceSnapshot.tabs.length, uiStore]);

  const language = currentUiLanguage();
  const content = useMemo(
    () => (
      <EditorRuntimeManagerProvider
        value={{
          workspace,
          active: runtime.active,
          uiStore,
        }}
      >
        <WheelDeviceProvider {...wheelDevice}>
          <CanvasInputProvider controller={workspace.inputController}>
            <UIProvider
              appearance={runtime.appearance}
              language={language}
              translateKey={(key) => tUi(key as Parameters<typeof tUi>[0])}
              translateSource={tUiSource}
            >
              <ColorProfileProvider profile={runtime.colorProfile}>
                <ColorSourcesProvider>
                  <EditorProvider
                    core={runtime.active.core}
                    initialTab={initialTab}
                    uiStore={uiStore}
                  >
                    <EditorSurface>
                      <EditorView
                        home={home}
                        appearanceMode={runtime.appearanceMode}
                        onAppearanceModeChange={runtime.changeAppearanceMode}
                        persistAppearanceMode={runtime.persistAppearanceMode}
                      />
                    </EditorSurface>
                  </EditorProvider>
                </ColorSourcesProvider>
              </ColorProfileProvider>
            </UIProvider>
          </CanvasInputProvider>
        </WheelDeviceProvider>
      </EditorRuntimeManagerProvider>
    ),
    [
      workspace,
      uiStore,
      home,
      initialTab,
      language,
      runtime.active,
      runtime.appearance,
      runtime.colorProfile,
      runtime.appearanceMode,
      runtime.changeAppearanceMode,
      runtime.persistAppearanceMode,
      wheelDevice.device,
      wheelDevice.detected,
      wheelDevice.setDevice,
      wheelDevice.reportDetected,
    ],
  );
  return runtime.startup === "ready" ? content : <EditorStartup state={runtime.startup} />;
}

export default function App({
  createHost,
  workspaceLifetime: suppliedWorkspaceLifetime,
}: { createHost?: EditorHostFactory; workspaceLifetime?: WorkspaceLifetime } = {}) {
  useUiLanguage();
  const diagnostics = useDiagnosticsPort();
  const telemetry = useTelemetry();
  const [workspaceLifetime] = useState(() => suppliedWorkspaceLifetime ?? new WorkspaceLifetime());
  const [host] = useState(() => {
    const factory = createHost ?? defaultHostFactory;
    if (!factory) throw new Error("Editor host is required for this build target");
    return factory(diagnostics);
  });
  const platform = host.platform;
  const [chromePreferences] = useState(
    () =>
      new EditorChromePreferencesManager(
        platform.preferences,
        platform.input.keyboardLikelyAvailable,
      ),
  );
  const home = chromePreferences.getSnapshot().showHomeTabOnStart;
  const initialTab: EditorTab = home ? "home" : "document";
  const [workspace] = useState(() => createEditorWorkspace(host, diagnostics, telemetry));
  const [uiStore] = useState(() =>
    createEditorUiStore(initialTab, platform.preferences, platform.navigation.location?.read()),
  );

  return (
    <EditorPlatformProvider ports={platform}>
      <EditorChromePreferencesProvider manager={chromePreferences}>
        <EditorApplication
          workspace={workspace}
          workspaceLifetime={workspaceLifetime}
          uiStore={uiStore}
          home={home}
          initialTab={initialTab}
        />
      </EditorChromePreferencesProvider>
    </EditorPlatformProvider>
  );
}
