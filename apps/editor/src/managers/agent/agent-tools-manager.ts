import { AGENT_TOOL_DEFINITIONS } from "$/managers/agent/agent-tool-definitions";
import {
  automaticViewTransition,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import {
  AGENT_INTERFACE_VERSION,
  AgentFileFormat,
  AgentToolName,
  type AgentToolsPort,
  type AgentToolResponse,
} from "$/managers/ports/agent-tools";
import type { DocumentSlot, DocumentWorkspace } from "$/managers/workspace/document-workspace";
import {
  BATCH_EDIT_LIMITS,
  BatchEditError,
  BatchEditErrorCode,
  BatchEditKind,
  effectiveLayerVisible,
  layerEditable,
  renderTimelineFrame,
  type BatchEditOperation,
  type EditorDocument,
  type PixelBuffer,
  type Rect,
} from "@xprite/editor-core";
import { convertPixelsToSrgb, workingColorProfile } from "@xprite/editor-core/color";
import { asepriteFromProject, encodeAseprite } from "@xprite/editor-core/import-export";
import { SessionOutcome } from "@xprite/editor-core/session";

const MAX_READ_PIXELS = 65536;
const MAX_DOCUMENT_SIDE = 2048;
const PNG_MIME_TYPE = "image/png";
const ASEPRITE_MIME_TYPE = "application/octet-stream";
const DEFAULT_BATCH_NAME = "AI edit";

function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Arguments must be an object");
  return input as Record<string, unknown>;
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, `Invalid ${name}`);
  return value;
}
function name(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > BATCH_EDIT_LIMITS.nameLength)
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, `Invalid ${key}`);
  return value;
}
function region(value: unknown, doc: EditorDocument, limit: number): Rect {
  const r =
    value === undefined ? { x: 0, y: 0, width: doc.width, height: doc.height } : inputObject(value);
  const x = integer(r.x, "rect.x", 0, doc.width - 1),
    y = integer(r.y, "rect.y", 0, doc.height - 1);
  const width = integer(r.width, "rect.width", 1, doc.width - x),
    height = integer(r.height, "rect.height", 1, doc.height - y);
  if (width * height > limit)
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      `Read a smaller region (maximum ${limit} pixels)`,
    );
  return { x, y, width, height };
}

/** No state mirror: every request resolves the current workspace and editor. */
export class AgentToolsManager {
  constructor(
    private readonly workspace: DocumentWorkspace,
    private readonly port: AgentToolsPort,
    private readonly showDocument: (reason: ReturnType<typeof automaticViewTransition>) => void,
  ) {}

  start(): () => void {
    return this.port.publish({ tools: AGENT_TOOL_DEFINITIONS, execute: this.execute });
  }

  private slots(): DocumentSlot[] {
    return this.workspace.getSnapshot().tabs.flatMap((tab) => {
      const slot = this.workspace.getSlot(tab.id);
      return slot?.core.getSnapshot().document ? [slot] : [];
    });
  }

  private resolve(input: Record<string, unknown>): DocumentSlot {
    const id = name(input.documentId, "documentId");
    const slots = this.slots();
    const slot =
      slots.find(
        (item) => item.documentId === id && item.id === this.workspace.getSnapshot().activeId,
      ) ?? slots.find((item) => item.documentId === id);
    if (!slot) throw new BatchEditError(BatchEditErrorCode.NotFound, "Document is no longer open");
    return slot;
  }

  private assertIdle(slot: DocumentSlot, input?: Record<string, unknown>): void {
    const session = slot.session.getSnapshot();
    if (session.busy || session.pendingImport || session.replacement)
      throw new BatchEditError(
        BatchEditErrorCode.Busy,
        "Finish the pending document operation first",
      );
    if (
      this.slots().some(
        (view) =>
          view.documentId === slot.documentId &&
          (view.session.getSnapshot().busy ||
            view.session.getSnapshot().pendingImport ||
            view.session.getSnapshot().replacement ||
            view.core.hasPendingDocumentEdit() ||
            view.core.getSnapshot().inlineText ||
            view.core.imageEditing.getEffectPreview() ||
            view.core.importExport.getSpriteSheetPreview()),
      )
    )
      throw new BatchEditError(BatchEditErrorCode.Busy, "Finish the pending document edit first");
    if (
      input &&
      integer(input.expectedRevision, "expectedRevision", 0, Number.MAX_SAFE_INTEGER) !==
        slot.core.getContentRevision()
    )
      throw new BatchEditError(BatchEditErrorCode.Conflict, "Document changed; read context again");
  }

  private context(slot: DocumentSlot) {
    const state = slot.core.getSnapshot(),
      doc = state.document!,
      t = doc.timeline!;
    return {
      id: slot.documentId,
      viewId: slot.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      revision: slot.core.getContentRevision(),
      modified:
        this.workspace.getSnapshot().tabs.find((tab) => tab.id === slot.id)?.modified ??
        state.dirty,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      busy:
        slot.session.getSnapshot().busy ||
        !!slot.session.getSnapshot().pendingImport ||
        !!slot.session.getSnapshot().replacement ||
        slot.core.hasPendingDocumentEdit() ||
        !!state.inlineText ||
        !!slot.core.imageEditing.getEffectPreview() ||
        !!slot.core.importExport.getSpriteSheetPreview(),
      colorDepth: t.colorDepth ?? 32,
      activeLayerId: t.layers[t.activeLayer].id,
      activeFrameIndex: t.activeFrame,
      layers: t.layers.map((layer, index) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind ?? "image",
        parentId: layer.parentId ?? null,
        visible: layer.visible,
        locked: !layerEditable(t, index),
        effectiveVisible: effectiveLayerVisible(t, index),
        opacity: layer.opacity,
        writable:
          (t.colorDepth ?? 32) === 32 &&
          (!layer.kind || layer.kind === "image") &&
          layerEditable(t, index) &&
          effectiveLayerVisible(t, index),
      })),
      frames: t.frames.map((frame, index) => ({ index, duration: frame.duration })),
      selection: doc.selection
        ? {
            x: doc.selection.x,
            y: doc.selection.y,
            width: doc.selection.width,
            height: doc.selection.height,
          }
        : null,
      palette: (t.frames[t.activeFrame].palette ?? doc.palette ?? state.palette).map((rgba) => [
        ...rgba,
      ]),
    };
  }

  private pixels(slot: DocumentSlot, input: Record<string, unknown>, limit: number) {
    const doc = slot.core.getSnapshot().document!,
      t = doc.timeline!;
    const rect = region(input.rect, doc, limit);
    const frameIndex = integer(
      input.frameIndex ?? t.activeFrame,
      "frameIndex",
      0,
      t.frames.length - 1,
    );
    let source: PixelBuffer | undefined;
    let origin = { x: 0, y: 0 };
    if (input.layerId === undefined && doc.width * doc.height > BATCH_EDIT_LIMITS.pixels)
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        "Composite exceeds the render limit; use readPixels with a layerId",
      );
    if (input.layerId === undefined)
      source =
        frameIndex === t.activeFrame
          ? slot.core.canvas.composite()
          : renderTimelineFrame(t, doc.width, doc.height, frameIndex);
    else {
      const id = name(input.layerId, "layerId"),
        index = t.layers.findIndex((layer) => layer.id === id);
      if (index < 0) throw new BatchEditError(BatchEditErrorCode.NotFound, "Layer does not exist");
      if (t.layers[index].kind && t.layers[index].kind !== "image")
        throw new BatchEditError(
          BatchEditErrorCode.Unsupported,
          "Read image-layer pixels or omit layerId for the composite",
        );
      const cel = t.frames[frameIndex].cels[index];
      const active = frameIndex === t.activeFrame && index === t.activeLayer;
      source = active ? doc.layer.pixels : cel?.pixels;
      origin = active ? { x: doc.layer.x, y: doc.layer.y } : { x: cel?.x ?? 0, y: cel?.y ?? 0 };
    }
    const pixels: PixelBuffer = {
      width: rect.width,
      height: rect.height,
      data: new Uint8ClampedArray(rect.width * rect.height * BATCH_EDIT_LIMITS.rgbaChannels),
    };
    if (source)
      for (let y = 0; y < rect.height; y++)
        for (let x = 0; x < rect.width; x++) {
          const sx = rect.x + x - origin.x,
            sy = rect.y + y - origin.y;
          if (sx >= 0 && sy >= 0 && sx < source.width && sy < source.height) {
            const at = (sy * source.width + sx) * BATCH_EDIT_LIMITS.rgbaChannels;
            pixels.data.set(
              source.data.subarray(at, at + BATCH_EDIT_LIMITS.rgbaChannels),
              (y * rect.width + x) * BATCH_EDIT_LIMITS.rgbaChannels,
            );
          }
        }
    return {
      pixels,
      rect,
      frameIndex,
      profile: workingColorProfile(t),
      revision: slot.core.getContentRevision(),
    };
  }

  execute = async (tool: AgentToolName, args: unknown): Promise<AgentToolResponse> => {
    try {
      const input = inputObject(args);
      if (tool === AgentToolName.GetContext) {
        const seen = new Set<string>();
        const documents = this.slots()
          .filter((slot) => {
            if (seen.has(slot.documentId)) return false;
            seen.add(slot.documentId);
            return true;
          })
          .map((slot) => this.context(slot));
        const active = this.workspace.active;
        return {
          ok: true,
          data: {
            version: AGENT_INTERFACE_VERSION,
            activeDocument: active?.core.getSnapshot().document ? this.context(active) : null,
            documents,
            limits: {
              ...BATCH_EDIT_LIMITS,
              readPixels: MAX_READ_PIXELS,
              documentSide: MAX_DOCUMENT_SIDE,
            },
            operations: Object.values(BatchEditKind),
            coordinates: "sprite pixels; zero-based frame indices",
            colorInput: "working-space #RRGGBB, #RRGGBBAA or RGBA bytes; replacement ink",
          },
        };
      }
      if (tool === AgentToolName.CreateDocument) {
        const width = integer(input.width, "width", 1, MAX_DOCUMENT_SIDE),
          height = integer(input.height, "height", 1, MAX_DOCUMENT_SIDE);
        const background = input.background ?? "transparent";
        if (background !== "transparent" && background !== "white" && background !== "black")
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid background");
        const active = this.workspace.active;
        if (active) this.assertIdle(active);
        for (const open of this.slots()) this.assertIdle(open);
        const outcome = this.workspace.createDocument(
          { width, height, colorDepth: 32, background },
          input.name === undefined ? undefined : name(input.name, "name"),
        );
        if (outcome === SessionOutcome.Error) throw new Error("Unable to create document");
        this.showDocument(automaticViewTransition(EditorViewChangeReason.DocumentOpened));
        return { ok: true, data: this.context(this.workspace.active) };
      }
      const slot = this.resolve(input);
      if (tool === AgentToolName.ApplyBatch) {
        this.assertIdle(slot, input);
        const result = slot.core.applyBatch(
          input.operations as readonly BatchEditOperation[],
          input.expectedRevision as number,
          name(input.label ?? DEFAULT_BATCH_NAME, "label"),
        );
        return {
          ok: true,
          data: {
            ...result,
            documentId: slot.documentId,
            revision: slot.core.getContentRevision(),
            canUndo: slot.core.getSnapshot().canUndo,
          },
        };
      }
      if (tool === AgentToolName.Undo || tool === AgentToolName.Redo) {
        this.assertIdle(slot, input);
        const state = slot.core.getSnapshot(),
          changed = tool === AgentToolName.Undo ? state.canUndo : state.canRedo;
        if (changed) {
          if (tool === AgentToolName.Undo) slot.core.history.undo();
          else slot.core.history.redo();
        }
        return { ok: true, data: { changed, document: this.context(slot) } };
      }
      if (tool === AgentToolName.ReadPixels || tool === AgentToolName.Render) {
        if (tool === AgentToolName.ReadPixels && input.rect === undefined)
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "rect is required");
        const read = this.pixels(
          slot,
          input,
          tool === AgentToolName.ReadPixels ? MAX_READ_PIXELS : BATCH_EDIT_LIMITS.pixels,
        );
        const metadata = {
          documentId: slot.documentId,
          revision: read.revision,
          frameIndex: read.frameIndex,
          rect: read.rect,
        };
        if (tool === AgentToolName.ReadPixels) {
          const mask = slot.core.getSnapshot().document!.selection;
          const selectionMask = mask
            ? Array.from({ length: read.rect.width * read.rect.height }, (_, index) => {
                const x = read.rect.x + (index % read.rect.width) - mask.x;
                const y = read.rect.y + Math.floor(index / read.rect.width) - mask.y;
                return x >= 0 &&
                  y >= 0 &&
                  x < mask.width &&
                  y < mask.height &&
                  mask.data[y * mask.width + x]
                  ? 1
                  : 0;
              })
            : null;
          return {
            ok: true,
            data: {
              ...metadata,
              colorSpace: "working",
              rgba: Array.from(read.pixels.data),
              selectionMask,
            },
          };
        }
        const bytes = await this.port.encodePng(convertPixelsToSrgb(read.pixels, read.profile));
        return {
          ok: true,
          data: {
            ...metadata,
            mimeType: PNG_MIME_TYPE,
            dataUrl: `data:${PNG_MIME_TYPE};base64,${this.port.encodeBase64(bytes)}`,
          },
        };
      }
      if (tool === AgentToolName.ExportDocument) {
        this.assertIdle(slot);
        const format = input.format;
        if (format !== AgentFileFormat.Png && format !== AgentFileFormat.Aseprite)
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Unsupported export format");
        const state = slot.core.getSnapshot(),
          revision = slot.core.getContentRevision();
        let bytes: Uint8Array;
        if (format === AgentFileFormat.Png) {
          const read = this.pixels(
            slot,
            { ...input, rect: undefined, layerId: undefined },
            BATCH_EDIT_LIMITS.pixels,
          );
          bytes = await this.port.encodePng(convertPixelsToSrgb(read.pixels, read.profile));
        } else {
          const snapshot = slot.core.getPersistenceSnapshot()!,
            doc = snapshot.document;
          bytes = await encodeAseprite(
            asepriteFromProject({
              image: { width: doc.width, height: doc.height },
              timeline: doc.timeline!,
              palette: doc.palette,
            }),
          );
        }
        const baseName = state.document!.name.replace(/\.[^.]+$/, "");
        return {
          ok: true,
          data: {
            documentId: slot.documentId,
            revision,
            filename: `${baseName}.${format}`,
            mimeType: format === AgentFileFormat.Png ? PNG_MIME_TYPE : ASEPRITE_MIME_TYPE,
            byteLength: bytes.byteLength,
            base64: this.port.encodeBase64(bytes),
          },
        };
      }
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Unknown tool");
    } catch (reason) {
      return {
        ok: false,
        error: {
          code: reason instanceof BatchEditError ? reason.code : "operation_failed",
          message: reason instanceof Error ? reason.message : "Operation failed",
        },
      };
    }
  };
}
