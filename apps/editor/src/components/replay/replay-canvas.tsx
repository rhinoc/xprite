import { memo, useLayoutEffect, useRef, useState } from "react";

import { tUi, useUiLanguage } from "$/i18n";
import { useReplayMotion, type ReplayCursorPresentation } from "$/managers/replay/replay-context";
import { CursorImage } from "@xprite/ui/cursor";
import { observeResize } from "@xprite/ui/utils";

import styles from "$/components/replay/replay.module.css";

export const ReplayCanvas = memo(function ReplayCanvas() {
  useUiLanguage();
  const { manager, motion } = useReplayMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState<ReplayCursorPresentation | null>(null);
  useLayoutEffect(() => {
    if (!canvas.current) return;
    manager.paint(canvas.current);
    setCursor(manager.cursorPresentation(canvas.current));
  }, [manager, motion]);
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node) return;
    return observeResize([node], () => setCursor(manager.cursorPresentation(node)));
  }, [manager]);
  return (
    <div className={styles.canvasFrame}>
      <canvas ref={canvas} className={styles.canvas} aria-label={tUi("replay.canvas")} />
      {cursor && <CursorImage {...cursor} />}
    </div>
  );
});
