import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import type { CanvasQuickTool } from "$/managers/input/policies/quick-tool";
import type { EditorColor, EditorColorProfile } from "$/managers/tools/color-control";
import {
  editorStatusDescription,
  editorStatusIndicators,
  statusColorIndicators,
} from "@xprite/editor-core";
import { workingColorProfile } from "@xprite/editor-core/color";

type LiveStatusIndicatorView = ReturnType<typeof editorStatusIndicators>[number];

export interface LiveStatusView {
  indicators: readonly LiveStatusIndicatorView[];
  description: string;
  undoTooltip: string;
  colorProfile?: EditorColorProfile;
  documentName?: string;
}

export function useLiveStatusManager({
  active,
  quickTool,
  notice,
  buttonHoverColor = null,
  buttonHoverDescription,
}: {
  active: boolean;
  quickTool: CanvasQuickTool | null;
  notice?: string;
  buttonHoverColor?: EditorColor | null;
  buttonHoverDescription?: string;
}): LiveStatusView {
  const { core } = useEditorManagerContext();
  const read = useCallback((): readonly LiveStatusIndicatorView[] => {
    if (!active || !core)
      return buttonHoverColor
        ? statusColorIndicators(buttonHoverColor, false, undefined, buttonHoverDescription)
        : [{ text: "" }];
    const snapshot = core.getSnapshot();
    const state =
      quickTool && quickTool !== snapshot.settings.tool
        ? { ...snapshot, settings: { ...snapshot.settings, tool: quickTool } }
        : snapshot;
    const hoveredColor =
      state.settings.tool === "eyedropper" && state.pointer
        ? core.drawing.eyedropper.colorAt(state.pointer)
        : null;
    return editorStatusIndicators(
      state,
      notice,
      hoveredColor,
      buttonHoverColor,
      buttonHoverDescription,
    );
  }, [active, core, notice, buttonHoverColor, buttonHoverDescription, quickTool]);
  const [indicators, setIndicators] = useState(read);
  const [undoTooltip, setUndoTooltip] = useState("");
  const lastUndoNotice = useRef(0);
  const undoTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    let raf = 0;
    lastUndoNotice.current = core?.getSnapshot().undoNotice?.id ?? 0;
    setUndoTooltip("");
    const update = () => {
      const item = core?.getSnapshot().undoNotice;
      if (item && item.id !== lastUndoNotice.current) {
        lastUndoNotice.current = item.id;
        setUndoTooltip(item.text);
        if (undoTooltipTimer.current) clearTimeout(undoTooltipTimer.current);
        undoTooltipTimer.current = setTimeout(() => {
          setUndoTooltip("");
          undoTooltipTimer.current = null;
        }, 1000);
      }
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          const next = readRef.current();
          setIndicators((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
        });
    };
    const unsubscribe = core?.subscribe(update);
    update();
    return () => {
      unsubscribe?.();
      cancelAnimationFrame(raf);
      if (undoTooltipTimer.current) clearTimeout(undoTooltipTimer.current);
    };
  }, [core]);
  useEffect(() => {
    const next = read();
    setIndicators((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
  }, [read]);
  const colorProfile = workingColorProfile(core?.getSnapshot().document?.timeline);
  return {
    indicators,
    description: editorStatusDescription(indicators),
    undoTooltip,
    colorProfile,
    documentName: core?.getSnapshot().document?.name,
  };
}
