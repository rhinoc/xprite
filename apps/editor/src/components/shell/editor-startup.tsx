import { useLayoutEffect, useRef } from "react";

import { startStartupAnimation } from "$/components/shell/startup-animation";
import { tUi } from "$/i18n";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { EditorRuntimeStartup } from "$/managers/workspace/use-editor-runtime";

export function EditorStartup({ state }: { state: Exclude<EditorRuntimeStartup, "ready"> }) {
  const startupScreen = useEditorPlatformPorts()?.startupScreen;
  const retainedScreen = state === "loading" && startupScreen?.available;
  useLayoutEffect(() => {
    if (retainedScreen && startupScreen) return startupScreen.retain();
  }, [retainedScreen, startupScreen]);
  if (retainedScreen) return null;
  return (
    <div
      className="xse-startup"
      role="status"
      aria-live="polite"
      aria-label={state === "loading" ? tUi("ui.loading") : undefined}
    >
      {state === "error" ? (
        <>
          {tUi("ui.unable.to.load.the.workspace")}{" "}
          <button onClick={() => window.location.reload()}>{tUi("ui.reload")}</button>
        </>
      ) : (
        <>
          <StartupAnimation />
          <section className="xse-startup-copy">
            <p className="xse-startup-subtitle">{tUi("ui.about.description")}</p>
            <p>{tUi("ui.home.introduction.description")}</p>
          </section>
        </>
      )}
    </div>
  );
}

function StartupAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const startedAt = Number(document.documentElement.dataset.xseStartupStartedAt);
    return startStartupAnimation(
      canvas,
      Number.isFinite(startedAt) ? startedAt : performance.now(),
    );
  }, []);

  return (
    <h1 className="xse-loading-sprite" aria-label="Xprite">
      <canvas ref={canvasRef} className="xse-loading-sprite__canvas" width={7} height={7} />
    </h1>
  );
}
