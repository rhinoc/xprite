import { useEffect, useMemo, useRef, useState } from "react";

import { createBrowserAgentToolsPort } from "$/adapters/agent/browser-agent-tools";
import { createBrowserEditorHostPorts } from "$/adapters/platform/browser-editor-host";
import { createBrowserPwaPort } from "$/adapters/pwa/browser-pwa";
import { createBrowserReplayPort } from "$/adapters/replay/browser-replay";
import { BrowserReplayStorage } from "$/adapters/replay/browser-replay-storage";
import { DEFAULT_PROJECT_DATABASE_NAME } from "$/adapters/storage/project-storage/indexeddb";
import { RecoverySettingsStore } from "$/adapters/storage/recovery-settings-store";
import { EditorSurface } from "$/components/canvas/editor-surface";
import { ReplayHost } from "$/components/replay/replay-host";
import { EditorStartup } from "$/components/shell/editor-startup";
import { EditorView } from "$/components/shell/editor-view";
import { PwaNotifications } from "$/components/shell/pwa";
import { ColorProfileProvider } from "$/components/tools/color-profile";
import { currentUiLanguage, tUi, tUiSource, useUiLanguage } from "$/i18n";
import { AgentToolsManager } from "$/managers/agent/agent-tools-manager";
import { ColorSourcesProvider } from "$/managers/colors/color-sources";
import { useDiagnosticsPort } from "$/managers/diagnostics/diagnostics-context";
import { EditorProvider } from "$/managers/editor/editor-state-manager";
import { createEditorUiStore } from "$/managers/editor/editor-ui-store";
import type { EditorTab } from "$/managers/editor/editor-ui-store";
import {
  automaticViewTransition,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { PROJECT_SHARE_LIMITS } from "$/managers/files/sharing-policy";
import { CanvasInputProvider } from "$/managers/input/canvas-input-context";
import { useWheelDevicePreferences } from "$/managers/input/use-wheel-device-preferences";
import { WheelDeviceProvider } from "$/managers/input/wheel-device-context";
import { EditorPlatformProvider } from "$/managers/platform/editor-platform-context";
import { AGENT_DOCUMENTATION_FILE, AGENT_GLOBAL_NAME } from "$/managers/ports/agent-tools";
import { DiagnosticSource, type DiagnosticsPort } from "$/managers/ports/diagnostics";
import type {
  EditorHostFactory,
  EditorHostPorts,
  EditorInitialProject,
} from "$/managers/ports/editor-host";
import type { PwaPort } from "$/managers/ports/pwa";
import { PwaProvider } from "$/managers/pwa/pwa-context";
import { PwaManager } from "$/managers/pwa/pwa-manager";
import { ReplayProvider } from "$/managers/replay/replay-context";
import { ReplayManager } from "$/managers/replay/replay-manager";
import { EditorChromePreferencesManager } from "$/managers/shell/editor-chrome-preferences";
import { EditorChromePreferencesProvider } from "$/managers/shell/editor-chrome-preferences-context";
import { ProjectRepository } from "$/managers/storage/project-repository";
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
    repository: new ProjectRepository(host.createProjectStorage()),
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
  initialProject,
}: {
  workspace: DocumentWorkspace;
  workspaceLifetime: WorkspaceLifetime;
  uiStore: ReturnType<typeof createEditorUiStore>;
  home: boolean;
  initialTab: EditorTab;
  initialProject?: Promise<EditorInitialProject | Error | null> | null;
}) {
  const systemAppearanceMode = useSystemAppearance();
  const runtime = useEditorRuntime(
    workspace,
    systemAppearanceMode,
    preloadUiAssets,
    workspaceLifetime,
  );
  const telemetry = useTelemetry();
  const initialProjectImported = useRef(false);
  const wheelDevice = useWheelDevicePreferences();
  const [replay] = useState(
    () =>
      new ReplayManager(workspace, uiStore, createBrowserReplayPort(), new BrowserReplayStorage()),
  );

  useEffect(() => {
    if (runtime.startup !== "ready") return;
    const agent = new AgentToolsManager(workspace, createBrowserAgentToolsPort(), (transition) =>
      uiStore.getState().setTab("document", transition),
    );
    return agent.start();
  }, [runtime.startup, workspace, uiStore]);

  useEffect(() => {
    if (runtime.startup !== "ready" || !initialProject || initialProjectImported.current) return;
    let cancelled = false;
    void initialProject.then((result) => {
      if (cancelled || initialProjectImported.current) return;
      initialProjectImported.current = true;
      if (result instanceof Error) workspace.active.session.reportError(result);
      else if (result) {
        workspace.createDocumentFromProject(result.project, result.name);
        uiStore
          .getState()
          .setTab("document", automaticViewTransition(EditorViewChangeReason.DocumentOpened));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runtime.startup, initialProject, workspace, uiStore]);

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
                    <ReplayProvider manager={replay}>
                      <EditorSurface
                        label={tUi("ui.pixel.editor.browser.use", {
                          api: `window.${AGENT_GLOBAL_NAME}`,
                          path: `${import.meta.env.BASE_URL}${AGENT_DOCUMENTATION_FILE}`,
                        })}
                      >
                        <EditorView
                          home={home}
                          appearanceMode={runtime.appearanceMode}
                          onAppearanceModeChange={runtime.changeAppearanceMode}
                          persistAppearanceMode={runtime.persistAppearanceMode}
                        />
                        <PwaNotifications />
                        <ReplayHost />
                      </EditorSurface>
                    </ReplayProvider>
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
      replay,
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
  pwaPort: suppliedPwaPort,
}: {
  createHost?: EditorHostFactory;
  workspaceLifetime?: WorkspaceLifetime;
  pwaPort?: PwaPort;
} = {}) {
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
  const [initialProject, setInitialProject] = useState<Promise<
    EditorInitialProject | Error | null
  > | null>(null);
  const initialProjectRequested = useRef(false);
  useEffect(() => {
    if (initialProjectRequested.current) return;
    initialProjectRequested.current = true;
    const incoming = host.takeInitialProject?.(PROJECT_SHARE_LIMITS);
    if (incoming)
      setInitialProject(
        incoming.catch((reason: unknown) =>
          reason instanceof Error ? reason : new Error("Unable to open the viewer file."),
        ),
      );
  }, [host]);
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
  const [pwa] = useState(
    () =>
      new PwaManager({
        port:
          suppliedPwaPort ??
          createBrowserPwaPort({ enabled: false, baseUrl: import.meta.env.BASE_URL }),
        preferences: platform.preferences,
      }),
  );
  useEffect(() => pwa.start(), [pwa]);
  const [uiStore] = useState(() =>
    createEditorUiStore(initialTab, platform.preferences, platform.navigation.location?.read()),
  );

  return (
    <EditorPlatformProvider ports={platform}>
      <EditorChromePreferencesProvider manager={chromePreferences}>
        <PwaProvider manager={pwa}>
          <EditorApplication
            workspace={workspace}
            workspaceLifetime={workspaceLifetime}
            uiStore={uiStore}
            home={home}
            initialTab={initialTab}
            initialProject={initialProject}
          />
        </PwaProvider>
      </EditorChromePreferencesProvider>
    </EditorPlatformProvider>
  );
}
