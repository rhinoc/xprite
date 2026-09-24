import { useEffect, useState } from "react";

import type { UiMessageKey } from "$/i18n";
import { useCanvasInputController } from "$/managers/input/canvas-input-context";
import { FingerMode } from "$/managers/input/controllers/pointer-controller";

const INPUT_MODE_NOTICE_DURATION_MS = 2500;

/** Announce drawing policy changes; routine pointer and wheel input stays quiet. */
export function useInputModeNotice() {
  const controller = useCanvasInputController();
  const [notice, setNotice] = useState<{ key: UiMessageKey } | null>(null);

  useEffect(() => {
    return controller?.subscribeFingerMode(() => {
      const snapshot = controller.getSnapshot();
      setNotice({
        key:
          snapshot.fingerMode === FingerMode.Auto && snapshot.penDetected
            ? "ui.input.mode.pen.detected"
            : snapshot.effectiveFingerMode === FingerMode.Pan
              ? "ui.input.mode.finger.pan"
              : "ui.input.mode.finger.draw",
      });
    });
  }, [controller]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), INPUT_MODE_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return notice?.key ?? null;
}
