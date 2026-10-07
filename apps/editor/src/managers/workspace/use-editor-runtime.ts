import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { TelemetryStartupStage, TelemetryStartupStatus } from "$/managers/ports/telemetry";
import { useTelemetry } from "$/managers/telemetry/telemetry-context";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import type { WorkspaceLifetime } from "$/managers/workspace/workspace-lifetime";
import { workingColorProfile } from "@xprite/editor-core/color";
import {
  resolveAppearanceMode,
  readAppearanceMode,
  AppearanceMode,
  APPEARANCE_MODE_STORAGE_KEY,
  type ResolvedAppearance,
} from "@xprite/editor-ui/appearance";

export type EditorUiAssetsPreloader = (appearance: ResolvedAppearance) => Promise<unknown>;
export type EditorRuntimeStartup = "loading" | "ready" | "error";
type SystemAppearance = "light" | "dark";

/** Owns workspace startup, persistence flushing, and disposal for one editor app instance. */
export function useEditorRuntime(
  workspace: DocumentWorkspace,
  systemAppearanceMode: SystemAppearance,
  preloadUiAssets: EditorUiAssetsPreloader,
  workspaceLifetime: WorkspaceLifetime,
) {
  const platform = useEditorPlatformPorts();
  const telemetry = useTelemetry();
  if (!platform) throw new Error("Editor runtime requires platform ports");
  const { preferences: preferenceStorage } = platform;
  const workspaceSnapshot = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    workspace.getSnapshot,
  );
  const active = workspace.active;
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() =>
    readAppearanceMode(preferenceStorage),
  );
  const systemAppearance =
    systemAppearanceMode === "dark" ? AppearanceMode.Dark : AppearanceMode.Light;
  const resolvedAppearance = resolveAppearanceMode(appearanceMode, systemAppearance);
  const appearance: ResolvedAppearance = resolvedAppearance;
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const changeAppearanceMode = useCallback((mode: AppearanceMode) => setAppearanceMode(mode), []);
  const persistAppearanceMode = useCallback(
    (mode: AppearanceMode) => {
      try {
        preferenceStorage.setItem(APPEARANCE_MODE_STORAGE_KEY, mode);
      } catch {
        /* Keep the in-session preference. */
      }
    },
    [preferenceStorage],
  );
  const colorProfile = useSyncExternalStore(
    active.core.subscribe,
    () => workingColorProfile(active.core.getSnapshot().document?.timeline),
    () => undefined,
  );
  const [startup, setStartup] = useState<EditorRuntimeStartup>("loading");

  useEffect(() => {
    let live = true;
    void preloadUiAssets(appearance).then(
      () => {
        if (live) active.core.canvas.setView({ appearance });
      },
      (reason) => {
        if (live) active.session.reportError(reason);
      },
    );
    return () => {
      live = false;
    };
  }, [active.core, active.session, preloadUiAssets, appearance]);

  const lifetime = useRef(0);
  useEffect(() => {
    const generation = ++lifetime.current;
    let live = true;
    telemetry.startup(TelemetryStartupStage.Workspace, TelemetryStartupStatus.Started);
    telemetry.startup(TelemetryStartupStage.UiAssets, TelemetryStartupStatus.Started);
    const assets = preloadUiAssets(appearanceRef.current).catch((reason) => {
      if (live) telemetry.startup(TelemetryStartupStage.UiAssets, TelemetryStartupStatus.Failed);
      throw reason;
    });
    const initialized = workspaceLifetime.initialize(workspace).then(
      () => {
        if (live)
          telemetry.startup(TelemetryStartupStage.Workspace, TelemetryStartupStatus.Completed);
      },
      (reason) => {
        if (live) telemetry.startup(TelemetryStartupStage.Workspace, TelemetryStartupStatus.Failed);
        throw reason;
      },
    );
    void Promise.all([initialized, assets])
      .then(async () => {
        let readyAppearance = appearanceRef.current;
        try {
          do {
            await preloadUiAssets(readyAppearance);
            if (readyAppearance === appearanceRef.current) break;
            readyAppearance = appearanceRef.current;
          } while (live);
        } catch (reason) {
          if (live)
            telemetry.startup(TelemetryStartupStage.UiAssets, TelemetryStartupStatus.Failed);
          throw reason;
        }
        if (live) {
          telemetry.startup(TelemetryStartupStage.UiAssets, TelemetryStartupStatus.Completed);
          workspace.active.core.canvas.setView({ appearance: readyAppearance });
          setStartup("ready");
          workspace.startBackgroundInitialization();
        }
      })
      .catch((reason) => {
        if (!live) return;
        workspace.active.session.reportError(reason);
        setStartup("error");
      });
    return () => {
      live = false;
      queueMicrotask(() => {
        if (lifetime.current === generation) void workspaceLifetime.retire(workspace);
      });
    };
  }, [preloadUiAssets, workspace, workspaceLifetime, telemetry]);

  useEffect(() => {
    const flush = () => {
      void workspace.flushRecovery().catch(() => {});
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [workspace]);

  return {
    workspace,
    workspaceSnapshot,
    active,
    colorProfile,
    startup,
    appearanceMode,
    systemAppearance,
    resolvedAppearance,
    appearance,
    changeAppearanceMode,
    persistAppearanceMode,
  };
}
