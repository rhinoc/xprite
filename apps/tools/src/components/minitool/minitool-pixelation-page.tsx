import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { MiniToolFrame } from "$/components/minitool/minitool-frame";
import { PixelationPage } from "$/components/pixelation/pixelation-page";
import { useToolTranslation } from "$/managers/locale/tool-language";
import type { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import { Toast, ToastTone } from "@xprite/ui";

const SAVED_NOTICE_MS = 2400;

/** The pixelate page with the container's album and note actions in place of export. */
export function MiniToolPixelationPage({ manager }: { manager: PixelationManager }) {
  const t = useToolTranslation();
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  const [saved, setSaved] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    if (state.downloading) return;
    if (!saving.current) return;
    saving.current = false;
    if (state.error) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [state.downloading, state.error]);
  return (
    <>
      <Toast text={saved ? t("Saved to your album") : null} tone={ToastTone.Info} />
      <PixelationPage
        manager={manager}
        host={{
          frame: MiniToolFrame,
          saveLabel: t("Save to album"),
          shareLabel: t("Post to note"),
          accept: "image/*",
          onSave: () => {
            saving.current = true;
          },
        }}
      />
    </>
  );
}
