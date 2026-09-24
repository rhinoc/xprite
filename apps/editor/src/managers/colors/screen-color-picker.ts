import { useEffect, useRef, useState } from "react";

import { tUi } from "$/i18n";
import { sampledColorInProfile } from "$/managers/colors/color-sources";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import { hexToRgba } from "@xprite/editor-core";
import type { AsepriteColorProfile } from "@xprite/editor-core/import-export";

export function useScreenColorPicker(
  open: boolean,
  scope: string,
  publish: (color: string) => void,
  profile?: AsepriteColorProfile,
) {
  const port = useEditorPlatformPorts()?.colorSampling;
  const core = useOptionalEditorRuntimeManagerContext()?.active.core;
  const request = useRef<AbortController | null>(null);
  const current = useRef({ open, scope, core, port, profile });
  current.current = { open, scope, core, port, profile };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setError(null);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [open, scope, core, port, profile]);
  return {
    available: port?.screenAvailable() ?? false,
    busy,
    error,
    async pick() {
      if (!open || !port?.screenAvailable() || request.current) return;
      const controller = new AbortController();
      request.current = controller;
      const started = current.current;
      setBusy(true);
      setError(null);
      try {
        // Invoke synchronously before yielding so browser user activation is retained.
        const color = await port.pickScreen(controller.signal);
        if (
          request.current === controller &&
          color &&
          !controller.signal.aborted &&
          current.current.open &&
          current.current.scope === started.scope &&
          current.current.core === started.core &&
          current.current.port === started.port &&
          current.current.profile === started.profile
        )
          publish(sampledColorInProfile({ color: hexToRgba(color) }, profile));
      } catch {
        if (request.current === controller && !controller.signal.aborted)
          setError(tUi("ui.screen.color.failed"));
      } finally {
        if (request.current === controller) {
          request.current = null;
          setBusy(false);
        }
      }
    },
  };
}
