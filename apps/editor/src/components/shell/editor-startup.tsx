import { useEffect, useRef } from "react";

import { startStartupAnimation } from "$/components/shell/startup-animation";
import { tUi } from "$/i18n";
import type { EditorRuntimeStartup } from "$/managers/workspace/use-editor-runtime";

export function EditorStartup({ state }: { state: Exclude<EditorRuntimeStartup, "ready"> }) {
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
        <StartupAnimation />
      )}
    </div>
  );
}

function StartupAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const startedAt = Number(document.documentElement.dataset.xseStartupStartedAt);
    return startStartupAnimation(
      canvas,
      Number.isFinite(startedAt) ? startedAt : performance.now(),
    );
  }, []);

  return (
    <div className="xse-loading-sprite" aria-hidden="true">
      <canvas ref={canvasRef} className="xse-loading-sprite__canvas" width={7} height={7} />
    </div>
  );
}
