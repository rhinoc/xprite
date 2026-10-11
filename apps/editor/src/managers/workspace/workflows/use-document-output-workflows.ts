import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ExportExecutionPorts } from "$/managers/files/export-animation";
import type {
  ExporterContext,
  ExporterResult,
  RegisteredExporter,
} from "$/managers/files/exporter-registry";
import { useExporterRegistry } from "$/managers/files/exporter-registry-context";
import { SheetExporterId } from "$/managers/files/exporters/sheet";
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
  type EditorDocument,
  type EditorScene,
  type RasterEditor,
} from "@xprite/editor-core";
import { cloneGraph } from "@xprite/editor-core/base";
import type { ImportSpriteSheetOptions } from "@xprite/editor-core/import-export";
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
  const registry = useExporterRegistry();
  const [shareSource, setShareSource] = useState<ShareProjectSource | null>(null);
  const [exportContext, setExportContext] = useState<ExporterContext | null>(null);
  const [exportDestination, setExportDestination] = useState("");
  const [exportPanels, setExportPanels] = useState<
    ReadonlyMap<string, ReturnType<RegisteredExporter["createPanel"]>>
  >(() => new Map());
  const lastExportDestination = useRef<string | null>(null);
  const [moduleBusy, setModuleBusy] = useState(false);
  const [sheetImport, setSheetImport] = useState<{
    core: RasterEditor;
    id: number | undefined;
    image: ReturnType<RasterEditor["canvas"]["exportComposite"]>;
  } | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const exportKey = useRef(workspace.active.id);
  const ownerKey = workspace.active.id;
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
    setShareSource(null);
    setExportContext(null);
    setExportPanels(new Map());
    setModuleBusy(false);
    setSheetImport(null);
    return disconnect;
  }, [exportOperation, core, ownerKey, registry]);

  const prepareExport = (detached = true) => {
    if (
      exportOperation.busy ||
      moduleBusy ||
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
  const exportPorts = (slotId: string, isCurrent: () => boolean): ExportExecutionPorts => {
    const preferenceId = workspace.getExportPreferenceId(slotId);
    return {
      storage: platform.preferences,
      webp: platform.files.webp,
      encodePng: platform.files.exportOutput?.encodePng,
      save: platform.files.exportOutput?.save,
      rememberExport: (record) => {
        if (isCurrent()) workspace.rememberExport(preferenceId, record);
      },
    };
  };
  const runExport = <T>(
    document: EditorDocument,
    exporting: (ports: ExportExecutionPorts) => Promise<T>,
    completed?: (result: T) => void,
  ) => {
    const key = exportKey.current;
    return exportOperation.run(
      { core, key },
      (isCurrent) => {
        const ports = exportPorts(key, isCurrent);
        return reportingExport(
          telemetry,
          document,
          key,
          (reportingPorts) => exporting({ ...ports, ...reportingPorts }),
          ports.save,
        );
      },
      completed,
      (reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) session.reportError(reason);
      },
    );
  };
  const acceptGenerated = (result: ExporterResult) => {
    if (!result.generated) return;
    const { pixels, palette, name } = result.generated;
    workspace.createDocumentFromImage(pixels, palette, name);
    options.openGeneratedDocument();
  };
  const performExporter = (id: string, value: unknown) => {
    if (!exportContext || sheetImport || moduleBusy) return;
    const exporter = registry.get(id);
    if (!exporter?.available(exportContext)) return;
    return runExport(
      exportContext.document,
      (ports) => registry.execute(id, exportContext, value, ports),
      (result) => {
        clearExport();
        acceptGenerated(result);
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
  const rememberExporterOptions = useCallback(
    (id: string, value: unknown) => {
      if (!exportContext || workspace.active.id !== exportContext.documentKey) return;
      const normalized = registry.get(id)?.normalizeOptions(value);
      if (normalized == null) return;
      workspace.rememberExport(workspace.getExportPreferenceId(exportContext.documentKey), {
        exporter: id,
        options: normalized,
      });
    },
    [workspace, registry, exportContext],
  );
  const selectExportDestination = (id: string) => {
    if (!exportContext || exportBusy || moduleBusy || !registry.available(id, exportContext))
      return;
    try {
      if (!exportPanels.has(id)) {
        const panel = registry.get(id)!.createPanel(exportContext);
        setExportPanels((previous) => new Map([...previous, [id, panel]]));
      }
      core.importExport.previewSpriteSheet(null);
      lastExportDestination.current = id;
      setExportDestination(id);
    } catch (reason) {
      session.reportError(reason);
    }
  };
  function clearExport() {
    core.importExport.previewSpriteSheet(null);
    setExportContext(null);
    setExportPanels(new Map());
  }
  const closeExport = () => {
    if (!exportOperation.busy && !moduleBusy) clearExport();
  };
  const contextFor = (document: EditorDocument): ExporterContext => ({
    document,
    documentKey: workspace.active.id,
    platform,
    preview: (pixels) => core.importExport.previewSpriteSheet(pixels),
    preferences: workspace.getExportPreferences(workspace.active.id),
  });
  const openExport = (requested?: string) => {
    const document = prepareExport();
    if (!document) return;
    const context = contextFor(document);
    const remembered =
      lastExportDestination.current ?? workspace.getLastExport(workspace.active.id)?.exporter;
    const id =
      requested ??
      (registry.available(remembered, context) ? remembered : registry.firstAvailable(context)?.id);
    if (!id || !registry.available(id, context)) return;
    try {
      const panel = registry.get(id)!.createPanel(context);
      telemetry.featureUsed(TelemetryFeature.Export, TelemetryFeatureAction.Open);
      lastExportDestination.current = id;
      setExportDestination(id);
      setExportPanels(new Map([[id, panel]]));
      setExportContext(context);
    } catch (reason) {
      session.reportError(reason);
    }
  };
  const lastExport = workspace.getLastExport(workspace.active.id);
  const currentDocument = core.getSnapshot().document;
  const currentExporter = registry.get(lastExport?.exporter);
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
    exportSpriteSheet: () => openExport(SheetExporterId.SpriteSheet),
    exportTileset: () => openExport(SheetExporterId.Tileset),
    importSpriteSheet: () => {
      if (prepareExport(false)) openSheetImport();
    },
    canRepeatExport:
      !!currentDocument &&
      !!lastExport &&
      !!currentExporter &&
      currentExporter.canRepeat(contextFor(currentDocument), lastExport.options),
    repeatLastExport: () => {
      if (!lastExport || !currentExporter || exportOperation.busy || moduleBusy) return;
      const document = prepareExport();
      if (!document) return;
      const context = contextFor(document);
      if (!currentExporter.available(context)) return;
      void runExport(
        document,
        (ports) => registry.execute(currentExporter.id, context, lastExport.options, ports),
        acceptGenerated,
      );
    },
  };
  return {
    actions,
    registry,
    exportContext,
    exportPanels,
    setModuleBusy,
    rememberExporterOptions,
    shareSource,
    setShareSource,
    closeExport,
    exportDestination,
    selectExportDestination,
    exportBusy: exportBusy || moduleBusy,
    sheetImport: sheetImport ? { image: sheetImport.image } : null,
    setSheetImport,
    openSheetImport,
    performExporter,
    performSheetImport,
    hasOpenDialog: !!(shareSource || exportContext || sheetImport),
  };
}
