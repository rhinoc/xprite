import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { tUi } from "$/i18n";
import { ClipboardRegion, createClipboardActions } from "$/managers/clipboard";
import type { useEditor } from "$/managers/editor/editor-state-manager";
import type { useEditorPaletteModel } from "$/managers/palette/editor-palette-model";
import { TelemetryFeature, TelemetryFeatureAction } from "$/managers/ports/telemetry";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { openClipboardImageInWorkspace } from "$/managers/workspace/workflows/use-file-import-workflows";
import { TimelinePasteRejectionReason, type RasterEditor } from "@xprite/editor-core";

/** Map a core timeline-paste rejection code to its localized UI notice string. */
export function timelinePasteRejectionMessage(reason: TimelinePasteRejectionReason): string {
  switch (reason) {
    case TimelinePasteRejectionReason.NoDocument:
      return tUi("ui.timeline.paste.no.document");
    case TimelinePasteRejectionReason.EditorBusy:
      return tUi("ui.timeline.paste.editor.busy");
    case TimelinePasteRejectionReason.EmptyRange:
      return tUi("ui.timeline.paste.empty.range");
    case TimelinePasteRejectionReason.ImageBudgetExceeded:
      return tUi("ui.timeline.paste.image.budget.exceeded");
    case TimelinePasteRejectionReason.LayerLimitExceeded:
      return tUi("ui.timeline.paste.layer.limit.exceeded");
    case TimelinePasteRejectionReason.FrameLimitExceeded:
      return tUi("ui.timeline.paste.frame.limit.exceeded");
    case TimelinePasteRejectionReason.InsufficientTargetLayers:
      return tUi("ui.timeline.paste.insufficient.target.layers");
    case TimelinePasteRejectionReason.IncompatibleTilemapLayer:
      return tUi("ui.timeline.paste.incompatible.tilemap.layer");
    case TimelinePasteRejectionReason.IncompatibleTilemapPalette:
      return tUi("ui.timeline.paste.incompatible.tilemap.palette");
    default:
      return tUi("ui.timeline.paste.empty.range");
  }
}

export interface ClipboardWorkflowOptions {
  core: RasterEditor;
  workspace: DocumentWorkspace;
  activeId: string;
  editor: ReturnType<typeof useEditor>;
  paletteModel: ReturnType<typeof useEditorPaletteModel>;
  telemetry: TelemetryManager;
  recoveryOpen: boolean;
  canDispatchEditorInput(): boolean;
}

/** Owns clipboard focus region tracking, clipboard action wiring, and window paste dispatch. */
export function useClipboardWorkflows(options: ClipboardWorkflowOptions) {
  const {
    core,
    workspace,
    activeId,
    editor,
    paletteModel,
    telemetry,
    recoveryOpen,
    canDispatchEditorInput,
  } = options;
  const paletteModelRef = useRef(paletteModel);
  paletteModelRef.current = paletteModel;

  const clipboardRegionRef = useRef(ClipboardRegion.Canvas);
  const [, setClipboardRegionState] = useState(ClipboardRegion.Canvas);
  const setClipboardRegion = (region: ClipboardRegion) => {
    clipboardRegionRef.current = region;
    setClipboardRegionState(region);
  };
  useEffect(() => {
    setClipboardRegion(ClipboardRegion.Canvas);
  }, [activeId]);

  const clipboard = createClipboardActions({
    clipboard: workspace.clipboard,
    getCore: () => workspace.active.core,
    getRegion: () => clipboardRegionRef.current,
    palette: {
      getOwnerCore: () => core,
      getSelection: () => paletteModelRef.current.getPaletteSelection(),
      deleteSelection: () => paletteModelRef.current.deleteSelectedPaletteColors(),
      getWorkingIndices: () => ({
        foreground: paletteModelRef.current.paletteIndex,
        background: paletteModelRef.current.backgroundIndex,
      }),
    },
    isDocumentActive: () => editor.tab === "document" && !recoveryOpen,
    createDocument: (payload) => openClipboardImageInWorkspace(workspace, payload),
    getViewport: () => measuredEditorViewport(workspace.active.core, editor.timelineVisible),
    onError: (message) => workspace.active.session.reportError(message),
    onTimelinePasteRejected: (reason) => {
      editor.setNotice(timelinePasteRejectionMessage(reason));
      telemetry.featureUsed(TelemetryFeature.Clipboard, TelemetryFeatureAction.Rejected, {
        operation: "paste-timeline-range",
        reason,
      });
    },
  });

  useSyncExternalStore(clipboard.subscribe, clipboard.getVersion, clipboard.getVersion);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (!canDispatchEditorInput() || recoveryOpen) return;
      clipboard.handlePasteEvent(event);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  return {
    clipboard,
    clipboardRegionRef,
    setClipboardRegion,
    actions: {
      clipboardCapabilities: clipboard.getCapabilities(),
      copy: () => {
        if (!canDispatchEditorInput()) return;
        void clipboard.copy();
      },
      copyMerged: () => {
        if (!canDispatchEditorInput()) return;
        void clipboard.copyMerged();
      },
      cut: () => {
        if (!canDispatchEditorInput()) return;
        void clipboard.cut();
      },
      paste: () => {
        if (!canDispatchEditorInput()) return;
        void clipboard.paste();
      },
      pasteNewLayer: () => {
        if (!canDispatchEditorInput()) return;
        void clipboard.pasteNewLayer();
      },
      pasteNewReferenceLayer: () => {
        if (!canDispatchEditorInput()) return;
        void clipboard.pasteNewReferenceLayer();
      },
      pasteNewSprite: () => {
        if (!canDispatchEditorInput()) return;
        void clipboard.pasteNewSprite();
      },
      probeClipboardImage: () => {
        clipboard.probeSystemImage();
      },
    },
  };
}
