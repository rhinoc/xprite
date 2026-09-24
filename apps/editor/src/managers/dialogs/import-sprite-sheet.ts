import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { documentToScreen, screenToDocument } from "@xprite/editor-core";
import {
  dragImportSheetRulers,
  hitImportSheetRulers,
  importSheetOverlayGeometry,
} from "@xprite/editor-core/import-export";

export interface ImportSheetPoint {
  x: number;
  y: number;
}

export interface ImportSheetRect extends ImportSheetPoint {
  width: number;
  height: number;
}

export interface ImportSheetView {
  zoom: number;
  pan: ImportSheetPoint;
  tiledMode?: 0 | 1 | 2 | 3;
}

export interface ImportSpriteSheetFormOptions {
  layout: "horizontal" | "vertical" | "rows" | "columns";
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  paddingEnabled: boolean;
  horizontalPadding: number;
  verticalPadding: number;
  partialTiles: boolean;
  duration?: number;
}

export type ImportSheetRuler = 0 | 1 | 2 | 3 | 4 | 5;

export interface ImportSheetOverlayGeometryView {
  shade: ImportSheetRect[];
  grid: { from: ImportSheetPoint; to: ImportSheetPoint }[];
  rulers: number[];
  rulerGuides: { axis: "horizontal" | "vertical"; position: number }[];
}

export function projectImportSheetDocumentPoint(
  point: ImportSheetPoint,
  viewport: { width: number; height: number },
  image: { width: number; height: number },
  view: ImportSheetView,
) {
  return documentToScreen(point, viewport, image, view);
}

export function unprojectImportSheetDocumentPoint(
  point: ImportSheetPoint,
  viewport: { width: number; height: number },
  image: { width: number; height: number },
  view: ImportSheetView,
) {
  return screenToDocument(point, viewport, image, view);
}

export function hitImportSheetOverlayRulers(
  point: ImportSheetPoint,
  options: ImportSpriteSheetFormOptions,
  tolerance: number,
): ImportSheetRuler[] {
  return hitImportSheetRulers(point, options, tolerance);
}

export function dragImportSheetOverlayRulers(
  image: { width: number; height: number },
  options: ImportSpriteSheetFormOptions,
  moving: readonly ImportSheetRuler[],
  delta: ImportSheetPoint,
  symmetric = false,
): ImportSpriteSheetFormOptions {
  return dragImportSheetRulers(image, options, moving, delta, symmetric);
}

export function getImportSheetOverlayGeometry(
  image: { width: number; height: number },
  options: ImportSpriteSheetFormOptions,
  viewport: ImportSheetRect,
  zoom = 1,
): ImportSheetOverlayGeometryView {
  return importSheetOverlayGeometry(image, options, viewport, zoom);
}

interface ImportSheetEditorView {
  document: {
    id?: number;
    name: string;
    width: number;
    height: number;
    selection?: ImportSheetRect;
    timeline?: {
      gridBounds?: ImportSheetRect;
      asepriteSource?: {
        header?: {
          gridX?: number;
          gridY?: number;
          gridWidth?: number;
          gridHeight?: number;
        };
      };
    };
  } | null;
  view: ImportSheetView;
}

/** Narrow import-overlay state and view command; the editor handle stays in this manager. */
export function useImportSheetEditor() {
  const { core } = useEditorManagerContext();
  const source = useEditorSnapshot(core, true);
  const document = source?.document;
  const view: ImportSheetView = {
    zoom: source?.view.zoom ?? 1,
    pan: source?.view.pan ?? { x: 0, y: 0 },
    tiledMode: source?.view.tiledMode,
  };
  const snapshot: ImportSheetEditorView = {
    document: document
      ? {
          id: document.id,
          name: document.name,
          width: document.width,
          height: document.height,
          selection: document.selection
            ? {
                x: document.selection.x,
                y: document.selection.y,
                width: document.selection.width,
                height: document.selection.height,
              }
            : undefined,
          timeline: document.timeline
            ? {
                gridBounds: document.timeline.gridBounds,
                asepriteSource: document.timeline.asepriteSource
                  ? { header: document.timeline.asepriteSource.header }
                  : undefined,
              }
            : undefined,
        }
      : null,
    view,
  };
  return {
    snapshot,
    setView: (patch: Partial<ImportSheetView>) => core?.canvas.setView(patch),
  };
}
