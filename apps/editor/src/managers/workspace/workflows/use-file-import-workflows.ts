import { useEffect, useRef, useState } from "react";

import { tUi } from "$/i18n";
import { fileFromClipboardImage } from "$/managers/clipboard/clipboard-open-file";
import type { useEditor } from "$/managers/editor/editor-state-manager";
import {
  automaticViewTransition,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import { readDefaultPalette, readPalettePresets } from "$/managers/palette/presets";
import { DocumentOpenMethod } from "$/managers/ports/telemetry";
import type { TelemetryManager } from "$/managers/telemetry/telemetry-manager";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import {
  DEFAULT_SEQUENCE_FRAME_DURATION_MS,
  fileImportPlan,
  MAX_SEQUENCE_FRAME_DURATION_MS,
  MIN_SEQUENCE_FRAME_DURATION_MS,
  numberedPngGroups,
  type NumberedPngGroup,
} from "$/managers/workspace/file-import-plan";
import { openWorkspaceFiles } from "$/managers/workspace/workflows/open-workspace-files";
import { openBrowserFileInput } from "@xprite/bedrock/browser/file-system";
import {
  projectFromClipboardImage,
  type ClipboardImage,
  type RasterEditor,
} from "@xprite/editor-core";
import type { PixelBuffer, Rgba } from "@xprite/editor-core/base";
import { comparePaletteResourceNames } from "@xprite/editor-core/import-export";
import {
  SessionOperation,
  SessionOutcome,
  type EditorSession,
  type SessionSource,
} from "@xprite/editor-core/session";
import { readBundledPalettePresets } from "@xprite/editor-ui/palette-presets";
import { PalettePresetKind } from "@xprite/editor-ui/palette/model";

const NEW_SPRITE_FILE_EXTENSION = ".aseprite";
/** Non-audio accept list applied only on Android so Chrome does not request RECORD_AUDIO. */
const EDITOR_ANDROID_FILE_ACCEPT =
  "image/*,video/*,.ase,.aseprite,.psd,.psb,application/octet-stream";

/** Clamp user-entered PNG sequence frame duration to valid Aseprite millisecond bounds. */
export function clampSequenceFrameDuration(duration: number): number {
  return Number.isFinite(duration)
    ? Math.max(
        MIN_SEQUENCE_FRAME_DURATION_MS,
        Math.min(MAX_SEQUENCE_FRAME_DURATION_MS, Math.round(duration)),
      )
    : DEFAULT_SEQUENCE_FRAME_DURATION_MS;
}

/** Strip redundant `.ase` / `.aseprite` suffixes when validating a New Sprite base name. */
export function normalizeNewSpriteBaseName(fileBaseName: string): string {
  return fileBaseName
    .trim()
    .replace(/\.(?:aseprite|ase)$/i, "")
    .trim();
}

/** Build the sorted list of built-in + user-saved palette presets offered during pixelation import. */
export function buildPixelationPaletteChoices(
  bundled: readonly {
    id: string;
    name: string;
    colors: readonly Rgba[];
    group: string;
    author: string | null;
  }[],
  saved: readonly { name: string; colors: readonly Rgba[] }[],
) {
  return [
    ...bundled.map((preset) => ({
      ...preset,
      id: `builtin:${preset.id}`,
      source: PalettePresetKind.Builtin,
    })),
    ...saved.map((preset) => ({
      ...preset,
      id: `saved:${preset.name.toLocaleLowerCase()}`,
      group: "Saved Presets",
      author: null,
      source: PalettePresetKind.Saved,
    })),
  ].sort((a, b) => comparePaletteResourceNames(a.name, b.name));
}

/** Open a clipboard/selection image payload as a project when Aseprite/profile metadata exists. */
export function openClipboardImageInWorkspace(
  workspace: Pick<DocumentWorkspace, "createDocumentFromProject" | "createDocumentFromImage">,
  payload: ClipboardImage,
  name?: string,
): void {
  if (payload.asepriteSamples || payload.sourceProfile)
    workspace.createDocumentFromProject(projectFromClipboardImage(payload), name);
  else workspace.createDocumentFromImage(payload.pixels, payload.palette, name);
}

export interface FileImportWorkflowOptions {
  core: RasterEditor;
  session: EditorSession<string>;
  workspace: DocumentWorkspace;
  editor: ReturnType<typeof useEditor>;
  telemetry: TelemetryManager;
  workflowBusy: boolean;
  documentId: number | undefined;
  newDialog: boolean;
  setNewDialog(open: boolean): void;
  setDuplicateSpriteOpen(open: boolean): void;
  setDialog(dialog: "text" | "color" | null): void;
  openSheetImport(): void;
  canStartInteraction(): boolean;
  flushPendingLayerProperties(): void;
}

/** Owns file open, PNG sequence staging, sprite-sheet file intent, clipboard open, and new/duplicate sprite creation. */
export function useFileImportWorkflows(options: FileImportWorkflowOptions) {
  const {
    core,
    session,
    workspace,
    editor,
    telemetry,
    workflowBusy,
    documentId,
    newDialog,
    setNewDialog,
    setDuplicateSpriteOpen,
    setDialog,
    openSheetImport,
    canStartInteraction,
    flushPendingLayerProperties,
  } = options;

  const input = useRef<HTMLInputElement>(null);
  const sheetFileIntent = useRef(false);
  const [sequenceImport, setSequenceImport] = useState<{
    sources: readonly SessionSource<string>[];
    groups: readonly NumberedPngGroup[];
  } | null>(null);
  const sequenceSources = useRef<readonly SessionSource<string>[]>([]);
  const workflowMounted = useRef(true);
  const [sequenceDuration, setSequenceDuration] = useState(DEFAULT_SEQUENCE_FRAME_DURATION_MS);
  const [sheetFileTarget, setSheetFileTarget] = useState<{
    core: RasterEditor;
    generation: number;
  } | null>(null);

  useEffect(() => {
    workflowMounted.current = true;
    return () => {
      workflowMounted.current = false;
      for (const source of sequenceSources.current) workspace.ports.releaseSource?.(source.source);
      sequenceSources.current = [];
      workspace.cancelFileImport();
    };
  }, [workspace]);

  useEffect(() => {
    const node = input.current;
    if (!node) return;
    const cancel = () => {
      if (!sheetFileIntent.current) telemetry.documentOpenCancelled(DocumentOpenMethod.Import);
      sheetFileIntent.current = false;
    };
    node.addEventListener("cancel", cancel);
    return () => node.removeEventListener("cancel", cancel);
  }, [telemetry]);

  useEffect(() => {
    if (!sheetFileTarget || sheetFileTarget.core !== core) return;
    const imported = core.getSnapshot().document;
    if (imported && !workflowBusy) {
      openSheetImport();
      setSheetFileTarget(null);
    }
  }, [core, workflowBusy, documentId, sheetFileTarget]);

  const cancelSequenceImport = () => {
    for (const source of sequenceSources.current) workspace.ports.releaseSource?.(source.source);
    sequenceSources.current = [];
    setSequenceImport(null);
  };

  const confirmSequenceImport = (asSequences: boolean) => {
    if (!sequenceImport) return;
    const durationMs = clampSequenceFrameDuration(sequenceDuration);
    const plan = fileImportPlan(
      sequenceImport.sources,
      asSequences ? sequenceImport.groups : [],
      durationMs,
    );
    sequenceSources.current = [];
    setSequenceImport(null);
    void workspace.openFiles(plan);
  };

  const requestSources = (sources: readonly SessionSource<string>[]) => {
    if (!sources.length) return;
    if (!workflowMounted.current || sequenceSources.current.length || !canStartInteraction()) {
      for (const source of sources) workspace.ports.releaseSource?.(source.source);
      return;
    }
    flushPendingLayerProperties();
    setDialog(null);
    const groups = numberedPngGroups(sources);
    if (groups.length) {
      sequenceSources.current = sources;
      setSequenceDuration(DEFAULT_SEQUENCE_FRAME_DURATION_MS);
      setSequenceImport({ sources, groups });
    } else {
      void workspace.openFiles(fileImportPlan(sources));
    }
  };

  const requestImport = (files: readonly File[]) => {
    if (!files.length) return;
    const isSheet = sheetFileIntent.current;
    sheetFileIntent.current = false;
    if (isSheet) {
      if (!canStartInteraction()) return;
      flushPendingLayerProperties();
      const operation = workspace.openSource(workspace.ports.registerFile(files[0]));
      setSheetFileTarget({ core: workspace.active.core, generation: Date.now() });
      void operation;
      return;
    }
    requestSources(files.map((file) => workspace.ports.registerFile(file)));
  };

  const open = () => {
    openWorkspaceFiles({
      canStartInteraction,
      flushPendingLayerProperties,
      hasPendingSequenceSources: () => sequenceSources.current.length > 0,
      onRequested: () => telemetry.documentOpenRequested(DocumentOpenMethod.Import),
      pickFiles: () => workspace.ports.pickFiles(),
      fallbackInput: () => input.current,
      androidAccept: EDITOR_ANDROID_FILE_ACCEPT,
      onSources: requestSources,
      onCancelled: () => telemetry.documentOpenCancelled(DocumentOpenMethod.Import),
      onError: (reason) => session.reportError(reason, SessionOperation.Import),
    });
  };

  const openSpriteSheetFile = () => {
    sheetFileIntent.current = true;
    if (input.current) {
      openBrowserFileInput(input.current, {
        multiple: false,
        androidAccept: EDITOR_ANDROID_FILE_ACCEPT,
      });
    }
  };

  const openFromClipboard = () => {
    // Do not gate on canPasteNewSprite: first click must run under the user gesture so
    // the browser can show the clipboard permission prompt. After permission is known,
    // menu probing may disable the item when the OS clipboard has no image.
    if (!canStartInteraction()) return;
    if (sequenceSources.current.length) return;
    flushPendingLayerProperties();
    telemetry.documentOpenRequested(DocumentOpenMethod.Import);
    void (async () => {
      try {
        const image = await workspace.clipboard.read();
        if (!image || !workflowMounted.current || !canStartInteraction()) {
          telemetry.documentOpenCancelled(DocumentOpenMethod.Import);
          // Toast only after a definitive OS read found no image (empty/non-image).
          // Permission denial leaves hasSystemClipboardAccess false — browser UI handles that.
          if (
            !image &&
            workflowMounted.current &&
            workspace.clipboard.hasSystemClipboardAccess &&
            !workspace.clipboard.hasImage
          ) {
            editor.setNotice(tUi("ui.open.from.clipboard.empty"));
          }
          return;
        }
        const file = await fileFromClipboardImage(image);
        if (!workflowMounted.current || !canStartInteraction()) {
          telemetry.documentOpenCancelled(DocumentOpenMethod.Import);
          return;
        }
        requestImport([file]);
      } catch (reason) {
        session.reportError(reason, SessionOperation.Import);
      }
    })();
  };

  const newSpriteFromSelection = () => {
    if (!canStartInteraction()) return;
    const result = core.clipboard.createSpriteFromSelection();
    if (!result) return;
    openClipboardImageInWorkspace(workspace, result.image, result.name);
    editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentGenerated));
  };

  const handleNewSpriteOpenChange = (openDialog: boolean) => {
    if (!openDialog) {
      if (newDialog) telemetry.documentOpenCancelled(DocumentOpenMethod.New);
      session.resetNewSizeDraft();
    }
    setNewDialog(openDialog);
  };

  const createNewSprite = (
    width: number,
    height: number,
    colorDepth: 8 | 16 | 32,
    background: "transparent" | "white" | "black",
    fileBaseName: string,
  ) => {
    const normalizedBaseName = normalizeNewSpriteBaseName(fileBaseName);
    if (!normalizedBaseName) return;
    if (
      workspace.createDocument(
        {
          width,
          height,
          colorDepth,
          background,
          palette: readDefaultPalette(),
        },
        `${normalizedBaseName}${NEW_SPRITE_FILE_EXTENSION}`,
      ) !== SessionOutcome.Error
    )
      setNewDialog(false);
  };

  const duplicateCurrentSprite = ({ name, flatten }: { name: string; flatten: boolean }) => {
    const project = core.clipboard.duplicateProject(flatten);
    if (!project) return;
    workspace.createDocumentFromProject(project, name);
    editor.openTab("document", automaticViewTransition(EditorViewChangeReason.DocumentGenerated));
    setDuplicateSpriteOpen(false);
  };

  return {
    input,
    openSpriteSheetFile,
    sequenceImport,
    sequenceDuration,
    setSequenceDuration,
    cancelSequenceImport,
    confirmSequenceImport,
    cancelFileImport: () => workspace.cancelFileImport(),
    requestImport,
    open,
    openFromClipboard,
    newSpriteFromSelection,
    handleNewSpriteOpenChange,
    updateNewSpriteSize: (size: Parameters<typeof session.setNewSize>[0]) =>
      session.setNewSize(size),
    createNewSprite,
    duplicateCurrentSprite,
    discardEmptyImport: () => workspace.discardEmptyImport(),
    setPixelationOptions: (patch: Parameters<typeof session.setPixelationOptions>[0]) =>
      session.setPixelationOptions(patch),
    setImportAlgorithm: (...args: Parameters<typeof session.setImportAlgorithm>) =>
      void session.setImportAlgorithm(...args),
    setImportPreviewFrame: (frame: number) => session.setImportPreviewFrame(frame),
    acceptOriginalImport: (...args: Parameters<typeof session.acceptOriginal>) =>
      session.acceptOriginal(...args),
    acceptPixelatedImport: (transform?: (pixels: PixelBuffer) => PixelBuffer) =>
      void session.pixelate(undefined, transform),
    getPixelationPaletteChoices: () =>
      buildPixelationPaletteChoices(readBundledPalettePresets(), readPalettePresets()),
  };
}
