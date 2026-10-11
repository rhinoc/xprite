import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createAnimalCrossingExportSource,
  type AnimalCrossingExportSource,
} from "$/managers/files/animal-crossing-export";
import type { AnimalCrossingExportOptions } from "$/managers/files/animal-crossing-export-options";
import {
  exportDocumentAnimation,
  exportDocumentSpriteSheet,
  repeatLastExport,
  type AnimationExportPorts,
} from "$/managers/files/export-animation";
import { ExportDestination } from "$/managers/files/export-destination";
import { ExportKind } from "$/managers/files/export-preferences";
import {
  createShareProjectSource,
  type ShareProjectSource,
} from "$/managers/files/project-sharing";
import { tilesetExportSource } from "$/managers/files/tileset-export-source";
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
  const [exportDestination, setExportDestination] = useState(ExportDestination.Image);
  const lastExportDestination = useRef<ExportDestination | null>(null);
  const [animalCrossingBusy, setAnimalCrossingBusy] = useState(false);
  const [sheetImport, setSheetImport] = useState<{
    core: RasterEditor;
    id: number | undefined;
    image: ReturnType<RasterEditor["canvas"]["exportComposite"]>;
  } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const exportKey = useRef(workspace.active.id);
  const ownerKey = workspace.active.id;
  const showSheetPreview = useCallback(
    (result: SpriteSheetResult | null) => {
      core.importExport.previewSpriteSheet(result?.pixels ?? null);
    },
    [core],
  );
  useEffect(() => () => core.importExport.previewSpriteSheet(null), [core, ownerKey]);
  const exportOperation = useMemo(
    () =>
      new DocumentOutputExportOperation(
        () => ({ core: workspace.active.core, key: workspace.active.id }),
        setExportBusy,
      ),
    [workspace],
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
    setAnimalCrossingBusy(false);
    setSheetImport(null);
    return disconnect;
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
    if (!exportDocument || sheetImport) return;
    return runExport(
      exportDocument,
      (ports) =>
        exportDocumentAnimation(exportDocument, exportOptions, {
          ...ports,
          webp: platform.files.webp,
        }),
      clearExport,
    );
  };
  const openGeneratedSheet = (
    document: EditorDocument,
    exportOptions: SpriteSheetOptions,
    result: SpriteSheetResult,
  ) => {
    if (!exportOptions.openGenerated) return;
    workspace.createDocumentFromImage(
      result.pixels,
      document.palette?.map((color) =>
        colorProfileToSrgb(color, workingColorProfile(document.timeline)),
      ),
      exportOptions.name,
    );
    options.openGeneratedDocument();
  };
  const performSheetExport = (exportOptions: SpriteSheetOptions) => {
    if (!exportDocument) return;
    const source =
      exportOptions.source === "tilesets" ? tilesetExportSource(exportDocument) : exportDocument;
    return runExport(
      source,
      (ports) => exportDocumentSpriteSheet(source, exportOptions, ports),
      (result) => {
        clearExport();
        openGeneratedSheet(source, exportOptions, result);
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
  const canExportTileset =
    !!exportDocument &&
    exportDocument.timeline?.layers[exportDocument.timeline.activeLayer]?.kind === "tilemap";
  const destinationAvailable = (destination: ExportDestination, document: EditorDocument) =>
    destination === ExportDestination.Tileset
      ? document.timeline?.layers[document.timeline.activeLayer]?.kind === "tilemap"
      : destination !== ExportDestination.AnimalCrossing || !!platform.files.animalCrossingExport;
  const animalCrossingSourceFor = (document: EditorDocument) => {
    const source = createAnimalCrossingExportSource(document);
    const remembered = workspace.getExportPreferences(exportKey.current).animalCrossing;
    return remembered ? { ...source, settings: { ...remembered.settings } } : source;
  };
  const rememberAnimalCrossingExport = useCallback(
    (exportOptions: AnimalCrossingExportOptions) => {
      if (workspace.active.id !== exportKey.current || !exportDocument) return;
      workspace.rememberExport(workspace.getExportPreferenceId(exportKey.current), {
        type: ExportKind.AnimalCrossing,
        options: exportOptions,
      });
    },
    [workspace, exportDocument],
  );
  const selectExportDestination = (destination: ExportDestination) => {
    if (
      !exportDocument ||
      exportBusy ||
      animalCrossingBusy ||
      !destinationAvailable(destination, exportDocument)
    )
      return;
    if (destination === ExportDestination.AnimalCrossing && !animalCrossingSource) {
      try {
        setAnimalCrossingSource(animalCrossingSourceFor(exportDocument));
      } catch (reason) {
        session.reportError(reason);
        return;
      }
    }
    core.importExport.previewSpriteSheet(null);
    lastExportDestination.current = destination;
    setExportDestination(destination);
  };
  function clearExport() {
    core.importExport.previewSpriteSheet(null);
    setExportDocument(null);
    setAnimalCrossingSource(null);
  }
  const closeExport = () => {
    if (!exportOperation.busy && !animalCrossingBusy) clearExport();
  };
  const openExport = (requested?: ExportDestination) => {
    const document = prepareExport();
    if (!document) return;
    const last = workspace.getLastExport(workspace.active.id);
    const remembered =
      lastExportDestination.current ??
      (last?.type === ExportKind.AnimalCrossing
        ? ExportDestination.AnimalCrossing
        : last?.type === ExportKind.Sheet
          ? last.options.source === "tilesets"
            ? ExportDestination.Tileset
            : ExportDestination.SpriteSheet
          : ExportDestination.Image);
    const destination =
      requested ??
      (destinationAvailable(remembered, document) ? remembered : ExportDestination.Image);
    if (!destinationAvailable(destination, document)) return;
    try {
      setAnimalCrossingSource(
        destination === ExportDestination.AnimalCrossing ? animalCrossingSourceFor(document) : null,
      );
      telemetry.featureUsed(TelemetryFeature.Export, TelemetryFeatureAction.Open);
      lastExportDestination.current = destination;
      setExportDestination(destination);
      setExportDocument(document);
    } catch (reason) {
      session.reportError(reason);
    }
  };
  const lastExport = workspace.getLastExport(workspace.active.id);
  const currentDocument = core.getSnapshot().document;
  const currentTimeline = currentDocument?.timeline;
  const activeTilemap = currentTimeline?.layers[currentTimeline.activeLayer]?.kind === "tilemap";
  const actions = {
    exportFile: () => openExport(),
    exportCopy: () => openExport(),
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
      ? () => openExport(ExportDestination.AnimalCrossing)
      : undefined,
    exportSpriteSheet: () => openExport(ExportDestination.SpriteSheet),
    exportTileset: () => openExport(ExportDestination.Tileset),
    importSpriteSheet: () => {
      if (prepareExport(false)) openSheetImport();
    },
    canRepeatExport:
      !!currentDocument &&
      !!lastExport &&
      (lastExport.type !== ExportKind.AnimalCrossing || !!platform.files.animalCrossingExport) &&
      (lastExport.type !== ExportKind.Sheet ||
        lastExport.options.source !== "tilesets" ||
        activeTilemap),
    repeatLastExport: () => {
      if (exportOperation.busy) return;
      const document = prepareExport();
      if (!document) return;
      void runExport(
        document,
        (ports) =>
          repeatLastExport(document, {
            ...ports,
            webp: platform.files.webp,
            animalCrossing: platform.files.animalCrossingExport,
          }),
        (result) => {
          if (lastExport?.type === ExportKind.Sheet && "pixels" in result)
            openGeneratedSheet(document, lastExport.options, result);
        },
      );
    },
  };
  return {
    actions,
    animalCrossingSource,
    setAnimalCrossingBusy,
    rememberAnimalCrossingExport,
    shareSource,
    setShareSource,
    exportDocument,
    closeExport,
    exportDestination,
    selectExportDestination,
    canExportTileset,
    exportBusy: exportBusy || animalCrossingBusy,
    exportKey,
    showSheetPreview,
    sheetImport: sheetImport ? { image: sheetImport.image } : null,
    setSheetImport,
    openSheetImport,
    performExport,
    performSheetExport,
    performSheetImport,
    hasOpenDialog: !!(animalCrossingSource || shareSource || exportDocument || sheetImport),
  };
}
