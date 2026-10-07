import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createAnimalCrossingExportSource,
  type AnimalCrossingExportSource,
} from "$/managers/files/animal-crossing-export";
import {
  exportDocumentAnimation,
  exportDocumentSpriteSheet,
  repeatLastExport,
  type AnimationExportPorts,
} from "$/managers/files/export-animation";
import {
  createShareProjectSource,
  type ShareProjectSource,
} from "$/managers/files/project-sharing";
import type { EditorPlatformPorts } from "$/managers/ports/platform";
import { TelemetryFeature, TelemetryFeatureAction } from "$/managers/ports/telemetry";
import { reportingExport } from "$/managers/telemetry/reporting-export";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { DocumentOutputExportOperation } from "$/managers/workspace/workflows/document-output-export-operation";
import {
  canExecuteEditorAction,
  colorProfileToSrgb,
  type EditorDocument,
  type EditorScene,
  type ExportFileOptions,
  type RasterEditor,
} from "@xprite/editor-core";
import { cloneGraph } from "@xprite/editor-core/base";
import { workingColorProfile } from "@xprite/editor-core/color";
import type {
  ImportSpriteSheetOptions,
  SpriteSheetOptions,
  SpriteSheetResult,
} from "@xprite/editor-core/import-export";
import type { EditorSession } from "@xprite/editor-core/session";

interface DocumentOutputWorkflowOptions {
  core: RasterEditor;
  session: EditorSession<string>;
  workspace: DocumentWorkspace;
  platform: EditorPlatformPorts;
  telemetry: TelemetryManager;
  scene: EditorScene;
  canStartInteraction(): boolean;
  flushPendingLayerProperties(): void;
  openGeneratedDocument(): void;
}

/** Owns committed output snapshots, export preferences, and output dialog lifetimes. */
export function useDocumentOutputWorkflows(options: DocumentOutputWorkflowOptions) {
  const { core, session, workspace, platform, telemetry } = options;
  const [animalCrossingSource, setAnimalCrossingSource] =
    useState<AnimalCrossingExportSource | null>(null);
  const [shareSource, setShareSource] = useState<ShareProjectSource | null>(null);
  const [exportDocument, setExportDocument] = useState<EditorDocument | null>(null);
  const [sheetSource, setSheetSource] = useState<SpriteSheetOptions["source"]>(undefined);
  const [sheetExport, setSheetExport] = useState<EditorDocument | null>(null);
  const [sheetImport, setSheetImport] = useState<{
    core: RasterEditor;
    id: number | undefined;
    image: ReturnType<RasterEditor["canvas"]["exportComposite"]>;
  } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const exportKey = useRef(workspace.active.id);
  const ownerKey = workspace.active.id;
  const exportOperation = useMemo(
    () =>
      new DocumentOutputExportOperation(
        () => ({ core: workspace.active.core, key: workspace.active.id }),
        setExportBusy,
      ),
    [workspace],
  );
  const sheetPreviewCore = useRef<RasterEditor | null>(null);
  const showSheetPreview = useCallback(
    (result: SpriteSheetResult | null) =>
      sheetPreviewCore.current?.importExport.previewSpriteSheet(result?.pixels ?? null),
    [],
  );
  useEffect(() => {
    if (
      sheetImport &&
      (sheetImport.core !== core || sheetImport.id !== core.getSnapshot().document?.id)
    )
      setSheetImport(null);
  }, [core, sheetImport]);

  useEffect(() => {
    const disconnect = exportOperation.connect();
    setAnimalCrossingSource(null);
    setShareSource(null);
    setExportDocument(null);
    setSheetExport(null);
    setSheetImport(null);
    return () => {
      disconnect();
      sheetPreviewCore.current?.importExport.previewSpriteSheet(null);
      sheetPreviewCore.current = null;
    };
  }, [exportOperation, core, ownerKey]);

  const prepareExport = (detached = true) => {
    if (
      exportOperation.busy ||
      !options.canStartInteraction() ||
      !canExecuteEditorAction("export", core.getSnapshot(), options.scene)
    )
      return null;
    options.flushPendingLayerProperties();
    if (core.getSnapshot().inlineText && !core.drawing.text.commitInlineText()) return null;
    if (core.getSnapshot().floatingPaste && !core.clipboard.commitFloatingPaste()) return null;
    core.timeline.setPlaying(false);
    core.cancelGesture();
    exportKey.current = workspace.active.id;
    const document = core.getSnapshot().document;
    return document ? (detached ? cloneGraph(document) : document) : null;
  };
  const exportPorts = (slotId: string, isCurrent: () => boolean): AnimationExportPorts => {
    const preferenceId = workspace.getExportPreferenceId(slotId);
    const last = workspace.getLastExport(slotId);
    return {
      storage: platform.preferences,
      rememberExport: (record) => {
        if (isCurrent()) workspace.rememberExport(preferenceId, record);
      },
      getLastExport: () => last,
    };
  };
  const runExport = <T>(
    document: EditorDocument,
    exporting: (ports: AnimationExportPorts) => Promise<T>,
    completed?: (result: T) => void,
  ) => {
    const key = exportKey.current;
    return exportOperation.run(
      { core, key },
      (isCurrent) => {
        const ports = exportPorts(key, isCurrent);
        return reportingExport(telemetry, document, key, (reportingPorts) =>
          exporting({ ...ports, ...reportingPorts }),
        );
      },
      completed,
      (reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) session.reportError(reason);
      },
    );
  };
  const performExport = (exportOptions: ExportFileOptions) => {
    if (!exportDocument || sheetExport || sheetImport) return;
    return runExport(
      exportDocument,
      (ports) =>
        exportDocumentAnimation(exportDocument, exportOptions, {
          ...ports,
          webp: platform.files.webp,
        }),
      () => setExportDocument(null),
    );
  };
  const performSheetExport = (exportOptions: SpriteSheetOptions) => {
    if (!sheetExport) return;
    return runExport(
      sheetExport,
      (ports) => exportDocumentSpriteSheet(sheetExport, exportOptions, ports),
      (result) => {
        sheetPreviewCore.current?.importExport.previewSpriteSheet(null);
        sheetPreviewCore.current = null;
        setSheetExport(null);
        if (exportOptions.openGenerated) {
          workspace.createDocumentFromImage(
            result.pixels,
            sheetExport.palette?.map((color) =>
              colorProfileToSrgb(color, workingColorProfile(sheetExport.timeline)),
            ),
            exportOptions.name,
          );
          options.openGeneratedDocument();
        }
      },
    );
  };
  const performSheetImport = (importOptions: ImportSpriteSheetOptions) => {
    if (
      !sheetImport ||
      sheetImport.core !== core ||
      sheetImport.id !== core.getSnapshot().document?.id
    )
      return;
    try {
      core.importExport.importSpriteSheet(importOptions);
      setSheetImport(null);
    } catch (reason) {
      session.reportError(reason);
    }
  };
  const openSheetImport = () => {
    const document = core.getSnapshot().document;
    if (document) setSheetImport({ core, id: document.id, image: core.canvas.exportComposite() });
  };
  const openExportFileDialog = () => {
    const document = prepareExport();
    if (document) {
      telemetry.featureUsed(TelemetryFeature.Export, TelemetryFeatureAction.Open);
      setExportDocument(document);
    }
  };
  const actions = {
    exportFile: openExportFileDialog,
    exportCopy: openExportFileDialog,
    share: platform.files.sharing
      ? () => {
          const document = prepareExport(false);
          if (!document) return;
          try {
            const snapshot = core.getCommittedPersistenceSnapshot();
            if (snapshot) setShareSource(createShareProjectSource(document, snapshot));
          } catch (reason) {
            session.reportError(reason);
          }
        }
      : undefined,
    exportAnimalCrossing: platform.files.animalCrossingExport
      ? () => {
          const document = prepareExport();
          if (!document) return;
          try {
            setAnimalCrossingSource(createAnimalCrossingExportSource(document));
          } catch (reason) {
            session.reportError(reason);
          }
        }
      : undefined,
    exportSpriteSheet: () => {
      const document = prepareExport();
      if (document) {
        telemetry.featureUsed(TelemetryFeature.Export, TelemetryFeatureAction.Open);
        setSheetSource(undefined);
        sheetPreviewCore.current = core;
        setSheetExport(document);
      }
    },
    exportTileset: () => {
      const document = prepareExport();
      if (document?.timeline?.layers[document.timeline.activeLayer]?.kind === "tilemap") {
        document.timeline.range = {
          kind: "layers",
          layers: [document.timeline.activeLayer],
          frames: [document.timeline.activeFrame],
        };
        setSheetSource("tilesets");
        sheetPreviewCore.current = core;
        setSheetExport(document);
      }
    },
    importSpriteSheet: () => {
      if (prepareExport(false)) openSheetImport();
    },
    canRepeatExport:
      !!core.getSnapshot().document && !!workspace.getLastExport(workspace.active.id),
    repeatLastExport: () => {
      if (exportOperation.busy) return;
      const document = prepareExport();
      if (!document) return;
      void runExport(document, (ports) =>
        repeatLastExport(document, {
          ...ports,
          webp: platform.files.webp,
        }),
      );
    },
  };
  return {
    actions,
    animalCrossingSource,
    setAnimalCrossingSource,
    shareSource,
    setShareSource,
    exportDocument,
    setExportDocument,
    exportBusy,
    exportKey,
    showSheetPreview,
    sheetSource,
    sheetExport,
    sheetImport: sheetImport ? { image: sheetImport.image } : null,
    setSheetImport,
    openSheetImport,
    performExport,
    performSheetExport,
    performSheetImport,
    closeSheetExport: () => {
      sheetPreviewCore.current?.importExport.previewSpriteSheet(null);
      sheetPreviewCore.current = null;
      setSheetExport(null);
    },
    hasOpenDialog: !!(
      animalCrossingSource ||
      shareSource ||
      exportDocument ||
      sheetExport ||
      sheetImport
    ),
  };
}
