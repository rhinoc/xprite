import {
  composeAgentPreview,
  previewBoolean,
  previewOptions,
  previewCaptionWidth,
  type AgentPreviewFrame,
} from "$/managers/agent/agent-preview";
import { AGENT_TOOL_DEFINITIONS } from "$/managers/agent/agent-tool-definitions";
import {
  automaticViewTransition,
  EditorViewChangeReason,
} from "$/managers/editor/editor-view-transition";
import {
  AGENT_INTERFACE_VERSION,
  AgentFileFormat,
  AgentOutput,
  AgentToolName,
  type AgentToolsPort,
  type AgentToolResponse,
} from "$/managers/ports/agent-tools";
import type { DocumentSlot, DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { SaveTarget } from "$/managers/workspace/save-target";
import {
  BATCH_EDIT_LIMITS,
  BatchEditError,
  BatchEditErrorCode,
  BatchEditKind,
  AnimationIntent,
  analyzePalette,
  assertAgentPaletteSize,
  assertExportPixelBudget,
  blendNormalAt,
  buildPaletteRamp,
  compositeDocumentFrame,
  effectiveLayerVisible,
  layerEditable,
  MAX_IMAGE_DIMENSION,
  paletteColorHex,
  paletteUsageAcrossFrames,
  quantizePalette,
  renderTimelineFrame,
  snapDocumentToPalette,
  timelineTags,
  validateDocument,
  type BatchEditOperation,
  type EditorDocument,
  type PixelBuffer,
  type Rect,
  type Rgba,
  type ValidateOptions,
} from "@xprite/editor-core";
import { convertPixelsToSrgb, hexToRgba, workingColorProfile } from "@xprite/editor-core/color";
import {
  asepriteFromProject,
  decodeGifAnimation,
  encodeAseprite,
  encodeGif,
  isGifData,
  renderExportAnimation,
  type ExportFileOptions,
} from "@xprite/editor-core/import-export";
import { SessionOutcome, SessionSaveIntent } from "@xprite/editor-core/session";

const MAX_READ_PIXELS = 65536;
const MAX_DOCUMENT_SIDE = 2048;
const PNG_MIME_TYPE = "image/png";
const ASEPRITE_MIME_TYPE = "application/octet-stream";
const DEFAULT_BATCH_NAME = "AI edit";
const GRID_TRANSPARENT_CHARACTER = ".";
const GRID_CHARACTER_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:',<`~?/\\\"";
const STATS_HISTOGRAM_LIMIT = 64;
const DEFAULT_ONION_ALPHA = 0.4;
const MAX_ONION_RANGE = 64;
const MAX_ARTIFACTS = 32;
const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const GIF_MIME_TYPE = "image/gif";
const MAX_VALIDATE_RANGES = 64;
const MAX_IMPORT_SIDE = 2048;
const MAX_IMPORT_BASE64 = 32 * 1024 * 1024;
const AGENT_DOC_INDEX = "README.md";
/** Band directories by leading digit, matching craft/README.md. */
const AGENT_DOC_BANDS: Record<string, string> = {
  "0": "00-core",
  "1": "10-technique",
  "2": "20-color",
  "3": "30-characters",
  "4": "40-animation",
  "5": "50-creatures",
  "6": "60-environments",
  "7": "70-objects",
  "8": "80-effects-ui",
  "9": "90-style",
};
const AGENT_DOC_ID = /^[0-9a-z][0-9a-z-]{0,127}$/;

/** Map a doc id to its file under agent/craft/. Accepts a bare name
 * ("42-walk-and-run") or a band-prefixed path ("40-animation/42-walk-and-run",
 * optional ".md"); band is derived from the leading digit. */
function agentDocPath(input: unknown): string {
  if (input === undefined || input === "index") return AGENT_DOC_INDEX;
  const raw = name(input, "id").replace(/\.md$/i, "");
  const slash = raw.indexOf("/");
  const id = slash < 0 ? raw : raw.slice(slash + 1);
  if (!AGENT_DOC_ID.test(id) || id.includes("..") || !id.includes("-"))
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      'id must look like "42-walk-and-run"; call listDocs for the index',
    );
  const band = AGENT_DOC_BANDS[id[0]];
  if (!band)
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, `Unknown doc band "${id[0]}"`);
  return `${band}/${id}.md`;
}

/** Bounding box of non-transparent pixels inside one buffer, or null. */
function alphaBounds(pixels: PixelBuffer): Rect | null {
  let minX = -1,
    minY = -1,
    maxX = -1,
    maxY = -1;
  const data = pixels.data,
    channels = BATCH_EDIT_LIMITS.rgbaChannels;
  for (let y = 0; y < pixels.height; y++) {
    const row = y * pixels.width * channels;
    for (let x = 0; x < pixels.width; x++)
      if (data[row + x * channels + 3] !== 0) {
        if (minX < 0 || x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (minY < 0) minY = y;
        maxY = y;
      }
  }
  return minX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Alpha-composite `source` over `target` at sprite offset, opacity 0–255. */
function blendPixels(
  target: PixelBuffer,
  source: PixelBuffer,
  offsetX: number,
  offsetY: number,
  opacity: number,
): void {
  const channels = BATCH_EDIT_LIMITS.rgbaChannels;
  for (let y = 0; y < source.height; y++) {
    const ty = y + offsetY;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = x + offsetX;
      if (tx < 0 || tx >= target.width) continue;
      const from = (y * source.width + x) * channels;
      if (source.data[from + 3] === 0) continue;
      blendNormalAt(target.data, (ty * target.width + tx) * channels, source.data, from, opacity);
    }
  }
}

function statHex(r: number, g: number, b: number, a: number): string {
  const channels = a === 255 ? [r, g, b] : [r, g, b, a];
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

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

const PREVIEW_FILENAME = /^[\w.-]+\.png$/;

function previewFileName(value: unknown): string {
  const candidate = name(value, "filename");
  if (!PREVIEW_FILENAME.test(candidate))
    throw new BatchEditError(
      BatchEditErrorCode.InvalidInput,
      "filename must be a plain *.png file name",
    );
  return candidate;
}

function docBaseName(slot: DocumentSlot): string {
  const base = slot.core
    .getSnapshot()
    .document!.name.replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "-");
  return base || "document";
}

/** No state mirror: every request resolves the current workspace and editor. */
export class AgentToolsManager {
  private readonly artifacts = new Map<string, number>();
  private stopped = false;
  constructor(
    private readonly workspace: DocumentWorkspace,
    private readonly port: AgentToolsPort,
    private readonly showDocument: (reason: ReturnType<typeof automaticViewTransition>) => void,
  ) {}

  start(): () => void {
    this.stopped = false;
    const stop = this.port.publish({ tools: AGENT_TOOL_DEFINITIONS, execute: this.execute });
    return () => {
      this.stopped = true;
      stop();
      for (const url of this.artifacts.keys()) this.port.artifacts?.revoke(url);
      this.artifacts.clear();
    };
  }

  private binaryOutput(
    bytes: Uint8Array,
    mimeType: string,
    filename: string,
    input: Record<string, unknown>,
    fallback: AgentOutput,
  ) {
    const output = input.output ?? fallback;
    if (output !== fallback && output !== AgentOutput.Url)
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        `output must be ${fallback} or url`,
      );
    if (output === AgentOutput.Url) {
      if (!this.port.artifacts || this.stopped)
        throw new BatchEditError(BatchEditErrorCode.Unsupported, "File URLs are unavailable");
      const retained = [...this.artifacts.values()].reduce((sum, size) => sum + size, 0);
      if (this.artifacts.size >= MAX_ARTIFACTS || retained + bytes.byteLength > MAX_ARTIFACT_BYTES)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          "Artifact limit reached; call releaseArtifact for files you have finished using",
        );
      const url = this.port.artifacts.create(bytes, mimeType, filename);
      this.artifacts.set(url, bytes.byteLength);
      return { output, url };
    }
    const base64 = this.port.encodeBase64(bytes);
    return output === AgentOutput.Base64
      ? { output, base64 }
      : { output, dataUrl: `data:${mimeType};base64,${base64}` };
  }

  private async previewResponse(
    slot: DocumentSlot,
    input: Record<string, unknown>,
    frames: readonly AgentPreviewFrame[],
    metadata: Record<string, unknown> = {},
    filmstrip?: Record<string, unknown>,
  ): Promise<AgentToolResponse> {
    const revision = slot.core.getContentRevision();
    const { pixels, ...presentation } = composeAgentPreview(
      frames,
      previewOptions(input, filmstrip),
      this.port.rasterText,
    );
    const bytes = await this.port.encodePng(pixels);
    const filename = `${docBaseName(slot)}-preview.png`;
    return {
      ok: true,
      data: {
        documentId: slot.documentId,
        revision,
        ...metadata,
        ...presentation,
        frames: frames.length,
        mimeType: PNG_MIME_TYPE,
        filename,
        byteLength: bytes.byteLength,
        ...this.binaryOutput(bytes, PNG_MIME_TYPE, filename, input, AgentOutput.DataUrl),
      },
    };
  }

  private async animationPreview(
    slot: DocumentSlot,
    input: Record<string, unknown>,
  ): Promise<AgentToolResponse> {
    this.assertIdle(slot);
    const doc = slot.core.getSnapshot().document!;
    const revision = slot.core.getContentRevision();
    const indices = this.exportFrameIndices(doc, input);
    const options = previewOptions(input);
    assertExportPixelBudget(doc, indices.length, options.scale);
    options.minimumWidth = previewCaptionWidth(
      indices.map((frameIndex) => ({
        frameIndex,
        duration: doc.timeline!.frames[frameIndex].duration,
      })),
      options,
      this.port.rasterText,
    );
    let allocated = 0;
    const frames = indices.map((frameIndex) => {
      const read = this.pixels(slot, { ...input, frameIndex }, BATCH_EDIT_LIMITS.pixels);
      const duration = doc.timeline!.frames[frameIndex].duration;
      const preview = composeAgentPreview(
        [{ pixels: convertPixelsToSrgb(read.pixels, read.profile), frameIndex, duration }],
        options,
        this.port.rasterText,
      );
      allocated += preview.width * preview.height;
      if (allocated > BATCH_EDIT_LIMITS.pixels)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          "Animation preview exceeds the pixel budget; reduce scale or frame range",
        );
      return { pixels: preview.pixels, duration, sourceFrame: frameIndex };
    });
    const bytes = encodeGif(frames);
    const filename = `${docBaseName(slot)}-preview.gif`;
    return {
      ok: true,
      data: {
        documentId: slot.documentId,
        revision,
        mimeType: GIF_MIME_TYPE,
        filename,
        byteLength: bytes.byteLength,
        width: frames[0].pixels.width,
        height: frames[0].pixels.height,
        frames: frames.length,
        frameIndices: indices,
        durations: frames.map(({ duration }) => duration),
        ...this.binaryOutput(bytes, GIF_MIME_TYPE, filename, input, AgentOutput.DataUrl),
      },
    };
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

  private context(slot: DocumentSlot, input: Record<string, unknown> = {}) {
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
      layers: t.layers.map((layer, index) => {
        let inkBounds: Rect | null = null;
        if (
          input.includeInkBounds &&
          (!layer.kind || layer.kind === "image") &&
          effectiveLayerVisible(t, index)
        ) {
          const cel = t.frames[t.activeFrame].cels[index];
          const active = index === t.activeLayer;
          const source = active ? doc.layer.pixels : cel?.pixels;
          if (source) {
            const origin = active
              ? { x: doc.layer.x, y: doc.layer.y }
              : { x: cel?.x ?? 0, y: cel?.y ?? 0 };
            const bounds = alphaBounds(source);
            if (bounds)
              inkBounds = {
                x: bounds.x + origin.x,
                y: bounds.y + origin.y,
                width: bounds.width,
                height: bounds.height,
              };
          }
        }
        return {
          id: layer.id,
          name: layer.name,
          kind: layer.kind ?? "image",
          parentId: layer.parentId ?? null,
          visible: layer.visible,
          locked: !layerEditable(t, index),
          effectiveVisible: effectiveLayerVisible(t, index),
          opacity: layer.opacity,
          ...(input.includeInkBounds ? { inkBounds } : {}),
          writable:
            (t.colorDepth ?? 32) === 32 &&
            (!layer.kind || layer.kind === "image") &&
            layerEditable(t, index) &&
            effectiveLayerVisible(t, index),
        };
      }),
      frames: t.frames.map((frame, index) => ({ index, duration: frame.duration })),
      tags: timelineTags(t).map((tag) => ({
        name: tag.name,
        from: tag.from,
        to: tag.to,
        direction: tag.direction,
        repeat: tag.repeat,
        color: [...tag.color],
      })),
      tilesets: (t.tilesets ?? []).map((set) => ({
        id: set.id,
        name: set.name,
        tileWidth: set.tileWidth,
        tileHeight: set.tileHeight,
        tileCount: set.tileCount,
        baseIndex: set.baseIndex,
      })),
      selection: doc.selection
        ? {
            x: doc.selection.x,
            y: doc.selection.y,
            width: doc.selection.width,
            height: doc.selection.height,
          }
        : null,
      ...(input.includePalette
        ? {
            palette: (t.frames[t.activeFrame].palette ?? doc.palette ?? state.palette).map(
              (rgba) => [...rgba],
            ),
          }
        : {}),
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

  private grid(read: ReturnType<AgentToolsManager["pixels"]>) {
    const legend: Record<string, string> = {};
    const colors = new Map<string, string>();
    let next = 0;
    const keyFor = (r: number, g: number, b: number, a: number) => `${r},${g},${b},${a}`;
    const hex = (r: number, g: number, b: number, a: number) =>
      `#${[r, g, b, a].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    const rows: string[] = [];
    for (let y = 0; y < read.pixels.height; y++) {
      let row = "";
      for (let x = 0; x < read.pixels.width; x++) {
        const at = (y * read.pixels.width + x) * BATCH_EDIT_LIMITS.rgbaChannels;
        const r = read.pixels.data[at],
          g = read.pixels.data[at + 1],
          b = read.pixels.data[at + 2],
          a = read.pixels.data[at + 3];
        if (!a) {
          row += GRID_TRANSPARENT_CHARACTER;
          continue;
        }
        const key = keyFor(r, g, b, a);
        let character = colors.get(key);
        if (!character) {
          if (next >= GRID_CHARACTER_ALPHABET.length)
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              `Grid read supports at most ${GRID_CHARACTER_ALPHABET.length} opaque colors`,
            );
          character = GRID_CHARACTER_ALPHABET[next++];
          colors.set(key, character);
          legend[character] = hex(r, g, b, a);
        }
        row += character;
      }
      rows.push(row);
    }
    return { legend, rows };
  }

  /** Resolve one diff endpoint: {documentId?, frameIndex?, layerId?} inherits defaults. */
  private diffEndpoint(
    endpoint: unknown,
    defaults: { documentId: string; frameIndex: unknown; layerId: unknown },
  ) {
    const spec = endpoint === undefined ? {} : inputObject(endpoint);
    const documentId = spec.documentId !== undefined ? spec.documentId : defaults.documentId;
    const slot = this.resolve({ ...spec, documentId });
    const t = slot.core.getSnapshot().document!.timeline!;
    return {
      slot,
      documentId: slot.documentId,
      frameIndex: spec.frameIndex !== undefined ? spec.frameIndex : defaults.frameIndex,
      layerId: spec.layerId !== undefined ? spec.layerId : defaults.layerId,
      frameCount: t.frames.length,
    };
  }

  /** mode:"diff" — compare the same rect between two document/frame/layer endpoints. */
  private diff(input: Record<string, unknown>): AgentToolResponse {
    const defaults = {
      documentId: input.documentId as string,
      frameIndex: input.frameIndex,
      layerId: input.layerId,
    };
    const fromSpec = this.diffEndpoint(input.from, defaults);
    const toSpec = this.diffEndpoint(input.to, defaults);
    const readAt = (spec: ReturnType<AgentToolsManager["diffEndpoint"]>) =>
      this.pixels(
        spec.slot,
        {
          ...input,
          documentId: spec.documentId,
          frameIndex: spec.frameIndex,
          layerId: spec.layerId,
        },
        MAX_READ_PIXELS,
      );
    const from = readAt(fromSpec),
      to = readAt(toSpec);
    if (from.pixels.width !== to.pixels.width || from.pixels.height !== to.pixels.height)
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        "Diff endpoints resolved to different rect sizes",
      );
    const rect = from.rect;
    let changedPixels = 0;
    let minX = -1,
      minY = -1,
      maxX = -1,
      maxY = -1;
    const width = from.pixels.width,
      height = from.pixels.height;
    const fd = from.pixels.data,
      td = to.pixels.data;
    const CH = BATCH_EDIT_LIMITS.rgbaChannels;
    // per-pixel marker for detail grid: 0 same, 1 erased-to-empty, 2 new color
    const marks = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * CH;
        const same =
          fd[at] === td[at] &&
          fd[at + 1] === td[at + 1] &&
          fd[at + 2] === td[at + 2] &&
          fd[at + 3] === td[at + 3];
        if (same) continue;
        changedPixels++;
        marks[y * width + x] = td[at + 3] === 0 ? 1 : 2;
        if (minX < 0 || x < minX) minX = x;
        if (minY < 0 || y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    const changedBounds =
      changedPixels === 0
        ? null
        : {
            x: rect.x + minX,
            y: rect.y + minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          };
    const data: Record<string, unknown> = {
      mode: "diff",
      changedPixels,
      changedBounds,
      from: {
        documentId: fromSpec.documentId,
        frameIndex: from.frameIndex,
        layerId: fromSpec.layerId ?? null,
        revision: from.revision,
      },
      to: {
        documentId: toSpec.documentId,
        frameIndex: to.frameIndex,
        layerId: toSpec.layerId ?? null,
        revision: to.revision,
      },
      rect,
    };
    if (input.detail) {
      const legend: Record<string, string> = {};
      const colors = new Map<string, string>();
      let next = 0;
      const rows: string[] = [];
      for (let y = 0; y < height; y++) {
        let row = "";
        for (let x = 0; x < width; x++) {
          const mark = marks[y * width + x];
          if (mark === 0) {
            row += ".";
            continue;
          }
          if (mark === 1) {
            row += "-";
            continue;
          }
          const at = (y * width + x) * BATCH_EDIT_LIMITS.rgbaChannels;
          const key = `${td[at]},${td[at + 1]},${td[at + 2]},${td[at + 3]}`;
          let ch = colors.get(key);
          if (!ch) {
            if (next >= GRID_CHARACTER_ALPHABET.length)
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "Diff detail exceeds the color alphabet",
              );
            ch = GRID_CHARACTER_ALPHABET[next++];
            colors.set(key, ch);
            legend[ch] = `#${[td[at], td[at + 1], td[at + 2], td[at + 3]]
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("")}`.toUpperCase();
          }
          row += ch;
        }
        rows.push(row);
      }
      data.detail = { legend, rows };
    }
    return { ok: true, data };
  }

  /** render filmstrip — composite every listed frame into one PNG. */
  private async filmstrip(
    slot: DocumentSlot,
    input: Record<string, unknown>,
  ): Promise<AgentToolResponse> {
    const spec = inputObject(input.filmstrip);
    const doc = slot.core.getSnapshot().document!,
      t = doc.timeline!;
    const frames =
      spec.frames === undefined
        ? t.frames.map((_, index) => index)
        : (() => {
            if (!Array.isArray(spec.frames) || spec.frames.length === 0)
              throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid filmstrip.frames");
            const seen = new Set<number>();
            return spec.frames.map((value) => {
              const index = integer(value, "filmstrip.frames[]", 0, t.frames.length - 1);
              if (seen.has(index))
                throw new BatchEditError(
                  BatchEditErrorCode.InvalidInput,
                  "Duplicate filmstrip frame",
                );
              seen.add(index);
              return index;
            });
          })();
    const options = previewOptions(input, spec);
    const rect = region(input.rect, doc, BATCH_EDIT_LIMITS.pixels);
    if (
      rect.width * rect.height * frames.length * options.scale * options.scale >
      BATCH_EDIT_LIMITS.pixels
    )
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        "Filmstrip exceeds the pixel budget; reduce scale or split frames",
      );
    const previews = frames.map((frameIndex) => {
      const read = this.pixels(slot, { ...input, frameIndex }, BATCH_EDIT_LIMITS.pixels);
      return {
        pixels: convertPixelsToSrgb(read.pixels, read.profile),
        frameIndex,
        duration: t.frames[frameIndex].duration,
      };
    });
    return this.previewResponse(slot, input, previews, {}, spec);
  }

  /** render onionSkin — target frame at full alpha over ghosted neighbors, oldest first. */
  private async onionSkin(
    slot: DocumentSlot,
    input: Record<string, unknown>,
  ): Promise<AgentToolResponse> {
    const spec = inputObject(input.onionSkin);
    const doc = slot.core.getSnapshot().document!,
      t = doc.timeline!;
    const frameIndex = integer(
      input.frameIndex ?? t.activeFrame,
      "frameIndex",
      0,
      t.frames.length - 1,
    );
    const prev = integer(spec.prev ?? 1, "onionSkin.prev", 0, MAX_ONION_RANGE);
    const next = integer(spec.next ?? 0, "onionSkin.next", 0, MAX_ONION_RANGE);
    if (
      spec.alpha !== undefined &&
      (typeof spec.alpha !== "number" || spec.alpha < 0 || spec.alpha > 1)
    )
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid onionSkin.alpha");
    const alpha = Math.round((spec.alpha ?? DEFAULT_ONION_ALPHA) * 255);
    let layerIndex = -1;
    if (spec.layerId !== undefined) {
      const id = name(spec.layerId, "onionSkin.layerId");
      layerIndex = t.layers.findIndex((layer) => layer.id === id);
      if (layerIndex < 0)
        throw new BatchEditError(BatchEditErrorCode.NotFound, "Layer does not exist");
      if (t.layers[layerIndex].kind && t.layers[layerIndex].kind !== "image")
        throw new BatchEditError(
          BatchEditErrorCode.Unsupported,
          "Onion skin supports image layers only",
        );
    }
    const ghosts: number[] = [];
    for (let index = Math.max(0, frameIndex - prev); index < frameIndex; index++)
      ghosts.push(index);
    for (let index = Math.min(t.frames.length - 1, frameIndex + next); index > frameIndex; index--)
      ghosts.push(index);
    const output: PixelBuffer = {
      width: doc.width,
      height: doc.height,
      data: new Uint8ClampedArray(doc.width * doc.height * BATCH_EDIT_LIMITS.rgbaChannels),
    };
    const draw = (index: number, opacity: number) => {
      if (layerIndex < 0) {
        blendPixels(output, renderTimelineFrame(t, doc.width, doc.height, index), 0, 0, opacity);
        return;
      }
      const cel = t.frames[index].cels[layerIndex],
        active = index === t.activeFrame && layerIndex === t.activeLayer;
      const source = active ? doc.layer.pixels : cel?.pixels;
      if (!source) return;
      const origin = active
        ? { x: doc.layer.x, y: doc.layer.y }
        : { x: cel?.x ?? 0, y: cel?.y ?? 0 };
      blendPixels(output, source, origin.x, origin.y, opacity);
    };
    for (const ghost of ghosts) draw(ghost, alpha);
    draw(frameIndex, 255);
    return this.previewResponse(
      slot,
      input,
      [
        {
          pixels: convertPixelsToSrgb(output, workingColorProfile(t)),
          frameIndex,
          duration: t.frames[frameIndex].duration,
        },
      ],
      { frameIndex, layerId: spec.layerId ?? null, ghostFrames: ghosts },
    );
  }

  /** mode:"stats" — color histogram and ink bounds over the read region. */
  private stats(
    slot: DocumentSlot,
    input: Record<string, unknown>,
    read: ReturnType<AgentToolsManager["pixels"]>,
  ): AgentToolResponse {
    const counts = new Map<string, { hex: string; pixels: number; rgba: string }>();
    const data = read.pixels.data,
      channels = BATCH_EDIT_LIMITS.rgbaChannels;
    for (let at = 0; at < data.length; at += channels) {
      const a = data[at + 3];
      if (a === 0) continue;
      const key = `${data[at]},${data[at + 1]},${data[at + 2]},${a}`;
      let entry = counts.get(key);
      if (!entry) {
        entry = { hex: statHex(data[at], data[at + 1], data[at + 2], a), pixels: 0, rgba: key };
        counts.set(key, entry);
      }
      entry.pixels++;
    }
    const histogram = [...counts.values()]
      .sort((a, b) => b.pixels - a.pixels)
      .slice(0, STATS_HISTOGRAM_LIMIT)
      .map(({ hex, pixels }) => ({ hex, pixels }));
    const bounds = alphaBounds(read.pixels);
    const state = slot.core.getSnapshot(),
      doc = state.document!,
      t = doc.timeline!;
    const palette = t.frames[read.frameIndex].palette ?? doc.palette ?? state.palette;
    const onPalette = new Set(
      (palette ?? []).map((rgba) => `${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}`),
    );
    const offPalette = palette
      ? [...counts.values()]
          .filter((entry) => !onPalette.has(entry.rgba))
          .sort((a, b) => b.pixels - a.pixels)
          .slice(0, STATS_HISTOGRAM_LIMIT)
          .map(({ hex, pixels }) => ({ hex, pixels }))
      : [];
    return {
      ok: true,
      data: {
        mode: "stats",
        documentId: slot.documentId,
        revision: read.revision,
        frameIndex: read.frameIndex,
        layerId: input.layerId ?? null,
        rect: read.rect,
        colors: counts.size,
        histogram,
        bounds: bounds
          ? {
              x: read.rect.x + bounds.x,
              y: read.rect.y + bounds.y,
              width: bounds.width,
              height: bounds.height,
            }
          : null,
        offPalette,
      },
    };
  }

  /** Read and shape the document palette through the palette ops. */
  private palette(slot: DocumentSlot, input: Record<string, unknown>): AgentToolResponse {
    const doc = slot.core.getSnapshot().document!;
    const timeline = doc.timeline;
    const current = timeline?.frames[timeline.activeFrame].palette ?? doc.palette ?? [];
    const op = input.op;
    if (op === "get") {
      return {
        ok: true,
        data: {
          documentId: slot.documentId,
          revision: slot.core.getContentRevision(),
          colors: paletteUsageAcrossFrames(doc, current),
        },
      };
    }
    if (op === "ramp") {
      if (input.base === undefined)
        throw new BatchEditError(BatchEditErrorCode.InvalidInput, "op 'ramp' needs a `base` color");
      const steps = integer(input.steps ?? 5, "steps", 2, 16);
      const spread = input.spread ?? 0.55;
      if (typeof spread !== "number" || spread < 0.1 || spread > 1)
        throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid spread");
      const ramp = buildPaletteRamp(hexToRgba(name(input.base, "base")), steps, spread);
      return { ok: true, data: { ramp: ramp.map(paletteColorHex) } };
    }
    if (op === "analyze") {
      return {
        ok: true,
        data: {
          documentId: slot.documentId,
          revision: slot.core.getContentRevision(),
          ...analyzePalette(doc, current),
        },
      };
    }
    this.assertIdle(slot, input.expectedRevision === undefined ? undefined : input);
    if (op === "set") {
      if (!Array.isArray(input.colors) || !input.colors.length)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          "op 'set' needs at least one color",
        );
      const colors = input.colors.map((entry) => hexToRgba(name(entry, "colors[]")));
      const replace = input.replace === true;
      const startIndex = integer(input.startIndex ?? 0, "startIndex", 0, 255);
      let next: Rgba[];
      if (replace) {
        next = colors;
      } else {
        if (startIndex + colors.length > 256)
          throw new BatchEditError(
            BatchEditErrorCode.InvalidInput,
            "colors exceed the 256-entry palette limit",
          );
        next = current.map((color) => [...color] as unknown as Rgba);
        while (next.length < startIndex) next.push([0, 0, 0, 0]);
        colors.forEach((color, index) => {
          next[startIndex + index] = color;
        });
        if (!next.length) next = colors;
      }
      assertAgentPaletteSize(next.length);
      if (input.remapArt === true)
        throw new BatchEditError(
          BatchEditErrorCode.Unsupported,
          "remapArt has no history-aware palette remap; repaint with applyBatch instead",
        );
      slot.core.color.setPalette(next);
      return {
        ok: true,
        data: {
          documentId: slot.documentId,
          revision: slot.core.getContentRevision(),
          colors: next.map(paletteColorHex),
        },
      };
    }
    if (op === "extract") {
      const maxColors = integer(input.maxColors ?? 16, "maxColors", 2, 256);
      const frames = timeline?.frames.length ?? 1;
      const pixels = Array.from({ length: frames }, (_, frame) =>
        compositeDocumentFrame(doc, frame),
      );
      const generated = quantizePalette(
        pixels,
        maxColors,
        true,
        undefined,
        timeline?.transparentIndex ?? -1,
      );
      assertAgentPaletteSize(generated.length);
      slot.core.color.setPalette(generated);
      return {
        ok: true,
        data: {
          documentId: slot.documentId,
          revision: slot.core.getContentRevision(),
          colors: generated.map(paletteColorHex),
        },
      };
    }
    if (op === "snap") {
      if (!current.length)
        throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Palette is empty; set it first");
      const { regions, skippedLayers } = snapDocumentToPalette(doc, current);
      if (!regions.length)
        return {
          ok: true,
          data: {
            documentId: slot.documentId,
            revision: slot.core.getContentRevision(),
            snappedPixels: 0,
            changedRegions: [],
            skippedLayers,
          },
        };
      const operations: BatchEditOperation[] = regions.map((region) => ({
        type: BatchEditKind.Pixels,
        layerId: region.layerId,
        frameIndex: region.frameIndex,
        rect: region.rect,
        rgba: region.rgba,
      }));
      const result = slot.core.applyBatch(
        operations,
        input.expectedRevision === undefined
          ? slot.core.getContentRevision()
          : integer(input.expectedRevision, "expectedRevision", 0, Number.MAX_SAFE_INTEGER),
        name(input.label ?? "Snap palette", "label"),
      );
      return {
        ok: true,
        data: {
          documentId: slot.documentId,
          revision: slot.core.getContentRevision(),
          snappedPixels: result.changedRegions.length,
          changedRegions: result.changedRegions,
          skippedLayers,
        },
      };
    }
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Unknown palette op");
  }

  /** Select the frames a gif/spritesheet export covers. */
  private exportFrameIndices(doc: EditorDocument, input: Record<string, unknown>): number[] {
    const timeline = doc.timeline!;
    const count = timeline.frames.length;
    if (input.tag !== undefined) {
      const tag = timelineTags(timeline).find((entry) => entry.name === name(input.tag, "tag"));
      if (!tag) throw new BatchEditError(BatchEditErrorCode.NotFound, "Tag does not exist");
      return Array.from({ length: tag.to - tag.from + 1 }, (_, index) => tag.from + index);
    }
    if (input.frameRange !== undefined) {
      if (!Array.isArray(input.frameRange) || input.frameRange.length !== 2)
        throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid frameRange");
      const from = integer(input.frameRange[0], "frameRange[0]", 0, count - 1);
      const to = integer(input.frameRange[1], "frameRange[1]", 0, count - 1);
      if (to < from)
        throw new BatchEditError(BatchEditErrorCode.InvalidInput, "frameRange end before start");
      return Array.from({ length: to - from + 1 }, (_, index) => from + index);
    }
    return Array.from({ length: count }, (_, index) => index);
  }

  private async exportDocument(
    slot: DocumentSlot,
    raw: Record<string, unknown>,
  ): Promise<AgentToolResponse> {
    this.assertIdle(slot);
    const state = slot.core.getSnapshot(),
      revision = slot.core.getContentRevision(),
      doc = state.document!;
    let format = raw.format;
    const input = { ...raw };
    if (format === AgentFileFormat.Tag) {
      if (input.tag === undefined)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          "format 'tag' needs a `tag` name",
        );
      const tag = timelineTags(doc.timeline!).find(
        (entry) => entry.name === name(input.tag, "tag"),
      );
      if (!tag) throw new BatchEditError(BatchEditErrorCode.NotFound, "Tag does not exist");
      format = tag.to > tag.from ? AgentFileFormat.Gif : AgentFileFormat.Png;
      input.format = format;
      input.frameRange = [tag.from, tag.to];
      delete input.tag;
    }
    const baseName = doc.name.replace(/\.[^.]+$/, "");
    if (format === AgentFileFormat.Gif || format === AgentFileFormat.Spritesheet) {
      const scale = integer(input.scale ?? 1, "scale", 1, 16);
      const indices = this.exportFrameIndices(doc, input);
      assertExportPixelBudget(doc, indices.length, scale);
      const options: ExportFileOptions = {
        name: `${baseName}.gif`,
        scalePercent: scale * 100,
        area: "canvas",
        layers: "visible",
        frame: indices[0],
      };
      const frames = indices.map(
        (frameIndex) => renderExportAnimation(doc, { ...options, frame: frameIndex })[0],
      );
      if (format === AgentFileFormat.Gif) {
        const bytes = encodeGif(frames);
        return {
          ok: true,
          data: {
            documentId: slot.documentId,
            revision,
            filename: `${baseName}.gif`,
            mimeType: "image/gif",
            byteLength: bytes.byteLength,
            ...this.binaryOutput(
              bytes,
              GIF_MIME_TYPE,
              `${baseName}.gif`,
              input,
              AgentOutput.Base64,
            ),
            frames: frames.length,
            frameIndices: indices,
          },
        };
      }
      const layout = input.layout === undefined ? "strip" : name(input.layout, "layout");
      if (layout !== "strip" && layout !== "grid")
        throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid layout");
      const frameWidth = frames[0].pixels.width,
        frameHeight = frames[0].pixels.height;
      const columns = layout === "grid" ? Math.ceil(Math.sqrt(frames.length)) : frames.length;
      const rows = Math.ceil(frames.length / columns);
      const width = frameWidth * columns,
        height = frameHeight * rows;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION)
        throw new BatchEditError(
          BatchEditErrorCode.InvalidInput,
          "Sprite sheet exceeds the image dimension limit",
        );
      const output: PixelBuffer = {
        width,
        height,
        data: new Uint8ClampedArray(width * height * BATCH_EDIT_LIMITS.rgbaChannels),
      };
      const frameRects = frames.map((frame, ordinal) => {
        const x = (ordinal % columns) * frameWidth,
          y = Math.floor(ordinal / columns) * frameHeight;
        for (let row = 0; row < frameHeight; row++)
          output.data.set(
            frame.pixels.data.subarray(
              row * frameWidth * BATCH_EDIT_LIMITS.rgbaChannels,
              (row + 1) * frameWidth * BATCH_EDIT_LIMITS.rgbaChannels,
            ),
            ((y + row) * width + x) * BATCH_EDIT_LIMITS.rgbaChannels,
          );
        return { x, y, width: frameWidth, height: frameHeight, frameIndex: frame.sourceFrame };
      });
      const bytes = await this.port.encodePng(output);
      return {
        ok: true,
        data: {
          documentId: slot.documentId,
          revision,
          filename: `${baseName}-sheet.png`,
          mimeType: PNG_MIME_TYPE,
          byteLength: bytes.byteLength,
          ...this.binaryOutput(
            bytes,
            PNG_MIME_TYPE,
            `${baseName}-sheet.png`,
            input,
            AgentOutput.Base64,
          ),
          frames: frames.length,
          layout,
          columns,
          rows,
          width,
          height,
          frameRects,
        },
      };
    }
    if (format !== AgentFileFormat.Png && format !== AgentFileFormat.Aseprite)
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Unsupported export format");
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
        persisted = snapshot.document;
      bytes = await encodeAseprite(
        asepriteFromProject({
          image: { width: persisted.width, height: persisted.height },
          timeline: persisted.timeline!,
          palette: persisted.palette,
        }),
      );
    }
    return {
      ok: true,
      data: {
        documentId: slot.documentId,
        revision,
        filename: `${baseName}.${format as string}`,
        mimeType: format === AgentFileFormat.Png ? PNG_MIME_TYPE : ASEPRITE_MIME_TYPE,
        byteLength: bytes.byteLength,
        ...this.binaryOutput(
          bytes,
          format === AgentFileFormat.Png ? PNG_MIME_TYPE : ASEPRITE_MIME_TYPE,
          `${baseName}.${format as string}`,
          input,
          AgentOutput.Base64,
        ),
      },
    };
  }

  /** Decode base64 PNG/GIF bytes and paint them as one undo step. */
  private async importImage(
    slot: DocumentSlot,
    input: Record<string, unknown>,
  ): Promise<AgentToolResponse> {
    this.assertIdle(slot, input);
    if (
      typeof input.bytes !== "string" ||
      !input.bytes.length ||
      input.bytes.length > MAX_IMPORT_BASE64
    )
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid bytes");
    const bytes = this.port.decodeBase64(input.bytes);
    const format = input.format ?? "auto";
    if (format !== "auto" && format !== "png" && format !== "gif")
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Unsupported format");
    let frames: readonly { pixels: PixelBuffer; durationMs?: number }[];
    if ((format === "gif" || format === "auto") && isGifData(bytes)) {
      const animation = decodeGifAnimation(bytes, { includeStatic: true });
      if (!animation) throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid GIF");
      frames = animation.frames;
    } else if (format === "gif") {
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "bytes are not GIF data");
    } else {
      frames = [{ pixels: await this.port.decodeImage(bytes) }];
    }
    const pixelateSpec = input.pixelate;
    if (pixelateSpec !== undefined) {
      if (!this.port.pixelate)
        throw new BatchEditError(BatchEditErrorCode.Unsupported, "pixelate is unavailable");
      const spec = inputObject(pixelateSpec);
      const pixelate = this.port.pixelate;
      frames = await Promise.all(
        frames.map(async (frame) => ({
          ...frame,
          pixels: await pixelate(frame.pixels, {
            method: spec.method as string | undefined,
            colorPicker: spec.colorPicker as string | undefined,
            targetWidth: spec.targetWidth as number | undefined,
            targetHeight: spec.targetHeight as number | undefined,
            outlineStrength: spec.outlineStrength as number | undefined,
            removeNoise: spec.removeNoise as boolean | undefined,
          }),
        })),
      );
    }
    const first = frames[0].pixels;
    if (first.width > MAX_IMPORT_SIDE || first.height > MAX_IMPORT_SIDE)
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        `Image exceeds ${MAX_IMPORT_SIDE}px per side`,
      );
    const doc = slot.core.getSnapshot().document!;
    const timeline = doc.timeline!;
    const position = input.position === undefined ? { x: 0, y: 0 } : inputObject(input.position);
    const positionX = integer(position.x, "position.x", -doc.width, doc.width);
    const positionY = integer(position.y, "position.y", -doc.height, doc.height);
    const frameIndex = integer(
      input.frameIndex ?? timeline.activeFrame,
      "frameIndex",
      0,
      timeline.frames.length - 1,
    );
    if (frameIndex + frames.length > timeline.frames.length + 64)
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Too many imported frames");
    const newLayer = input.newLayer !== false;
    let layerId: string;
    if (input.layerId !== undefined) {
      layerId = name(input.layerId, "layerId");
      if (!timeline.layers.some((layer) => layer.id === layerId))
        throw new BatchEditError(BatchEditErrorCode.NotFound, "Layer does not exist");
    } else if (newLayer) {
      layerId = `import-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    } else {
      layerId = timeline.layers[timeline.activeLayer].id;
    }
    const operations: BatchEditOperation[] = [];
    if (input.layerId === undefined && newLayer) {
      const base = input.name !== undefined ? name(input.name, "name") : "Imported image";
      operations.push({ type: BatchEditKind.AddLayer, layerId, name: base });
    }
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      const target = frameIndex + index;
      if (target > timeline.frames.length - 1)
        operations.push({
          type: BatchEditKind.AddFrame,
          afterFrameIndex: target - 1,
          duplicate: false,
          ...(frame.durationMs !== undefined ? { duration: frame.durationMs } : {}),
        });
      else if (frame.durationMs !== undefined)
        operations.push({
          type: BatchEditKind.SetFrameDuration,
          frameIndex: target,
          duration: frame.durationMs,
        });
      const rect: Rect = {
        x: Math.max(positionX, 0),
        y: Math.max(positionY, 0),
        width: Math.min(
          frame.pixels.width + Math.min(positionX, 0),
          doc.width - Math.max(positionX, 0),
        ),
        height: Math.min(
          frame.pixels.height + Math.min(positionY, 0),
          doc.height - Math.max(positionY, 0),
        ),
      };
      if (rect.width <= 0 || rect.height <= 0) continue;
      const offsetX = rect.x - positionX,
        offsetY = rect.y - positionY;
      const clipped = new Uint8ClampedArray(rect.width * rect.height * 4);
      for (let row = 0; row < rect.height; row++)
        clipped.set(
          frame.pixels.data.subarray(
            ((offsetY + row) * frame.pixels.width + offsetX) * 4,
            ((offsetY + row) * frame.pixels.width + offsetX + rect.width) * 4,
          ),
          row * rect.width * 4,
        );
      // The op writes raw RGBA, so composite transparent and semi-transparent
      // source pixels over the destination here; opaque pixels pass through.
      // Frames appended past the timeline end land on empty cels — nothing to
      // composite against — and a brand-new layer starts empty too.
      const targetIsNew =
        (input.layerId === undefined && newLayer) || target > timeline.frames.length - 1;
      if (!targetIsNew) {
        const base = this.pixels(
          slot,
          { layerId, frameIndex: target, rect },
          MAX_IMPORT_SIDE * MAX_IMPORT_SIDE,
        ).pixels;
        for (let at = 0; at < clipped.length; at += 4) {
          const alpha = clipped[at + 3];
          if (alpha === 0) {
            clipped.set(base.data.subarray(at, at + 4), at);
            continue;
          }
          if (alpha === 255) continue;
          const inverse = 255 - alpha,
            baseAlpha = base.data[at + 3],
            outAlpha = alpha + (baseAlpha * inverse) / 255;
          if (outAlpha === 0) continue;
          for (let channel = 0; channel < 3; channel++)
            clipped[at + channel] = Math.round(
              (clipped[at + channel] * alpha +
                base.data[at + channel] * ((baseAlpha * inverse) / 255)) /
                outAlpha,
            );
          clipped[at + 3] = Math.round(outAlpha);
        }
      }
      operations.push({
        type: BatchEditKind.Pixels,
        layerId,
        frameIndex: target,
        rect,
        rgba: Array.from(clipped),
      });
    }
    if (!operations.length || !operations.some((op) => op.type === BatchEditKind.Pixels))
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        "position places the image fully outside the canvas",
      );
    if (operations.length > BATCH_EDIT_LIMITS.operations)
      throw new BatchEditError(
        BatchEditErrorCode.InvalidInput,
        `Import needs ${operations.length} batch operations; the limit is ${BATCH_EDIT_LIMITS.operations} — import fewer frames`,
      );
    const result = slot.core.applyBatch(
      operations,
      integer(input.expectedRevision, "expectedRevision", 0, Number.MAX_SAFE_INTEGER),
      name(input.label ?? "Import image", "label"),
    );
    return {
      ok: true,
      data: {
        documentId: slot.documentId,
        layerId,
        frameIndex,
        rect: { x: positionX, y: positionY, width: first.width, height: first.height },
        imageWidth: first.width,
        imageHeight: first.height,
        frames: frames.length,
        revision: slot.core.getContentRevision(),
        changedRegions: result.changedRegions,
      },
    };
  }

  /** Workspace lifecycle: save, close or duplicate an open document. */
  private async manageDocument(input: Record<string, unknown>): Promise<AgentToolResponse> {
    const op = input.op;
    if (op !== "save" && op !== "close" && op !== "duplicate")
      throw new BatchEditError(
        op === "open" ? BatchEditErrorCode.Unsupported : BatchEditErrorCode.InvalidInput,
        op === "open"
          ? "manageDocument does not open files; use createDocument or the file picker"
          : "op must be save, close, duplicate or open",
      );
    const slot = this.resolve(input);
    this.assertIdle(slot);
    if (op === "save") {
      if (!slot.session.canSave())
        throw new BatchEditError(BatchEditErrorCode.Busy, "Document cannot be saved right now");
      if (this.workspace.getSaveTarget(slot.id) === SaveTarget.Browser) {
        await this.workspace.saveInBrowser(slot.id);
      } else {
        const outcome = await slot.session.save(SessionSaveIntent.Save);
        if (outcome !== SessionOutcome.Created)
          throw new BatchEditError(
            BatchEditErrorCode.Busy,
            `Save was ${outcome === SessionOutcome.Cancelled ? "cancelled" : "ignored"}`,
          );
        await this.workspace.saveLocally(slot.id);
        this.workspace.linkRecentFileToWorkspaceProject(slot.id);
      }
      const doc = slot.core.getSnapshot().document;
      return {
        ok: true,
        data: { saved: true, documentId: slot.documentId, name: doc?.name ?? null },
      };
    }
    if (op === "duplicate") {
      const label = input.name === undefined ? undefined : name(input.name, "name").trim();
      const created = this.workspace.duplicateDocument(slot.id, label || undefined);
      if (!created || !created.core.getSnapshot().document)
        throw new BatchEditError(BatchEditErrorCode.Busy, "Document could not be duplicated");
      this.showDocument(automaticViewTransition(EditorViewChangeReason.DocumentOpened));
      return { ok: true, data: this.context(created) };
    }
    const modified = this.workspace.isDocumentLocallyModified(slot.id);
    const force = input.force === true;
    if (input.force !== undefined && typeof input.force !== "boolean")
      throw new BatchEditError(BatchEditErrorCode.InvalidInput, "force must be a boolean");
    if (modified && !force)
      throw new BatchEditError(
        BatchEditErrorCode.Conflict,
        "Document has unsaved changes; pass force:true to discard them",
      );
    const outcome = slot.session.requestClose(false, false);
    if (outcome !== SessionOutcome.Closed)
      throw new BatchEditError(BatchEditErrorCode.Busy, "Document could not be closed");
    this.workspace.close(slot.id);
    return { ok: true, data: { closed: true, documentId: slot.documentId } };
  }

  execute = async (tool: AgentToolName, args: unknown): Promise<AgentToolResponse> => {
    try {
      const input = inputObject(args);
      if (tool === AgentToolName.ListDocs) {
        if (!this.port.agentDocs)
          throw new BatchEditError(BatchEditErrorCode.Unsupported, "listDocs is unavailable");
        return { ok: true, data: { docs: await this.port.agentDocs.list() } };
      }
      if (tool === AgentToolName.ReadDoc) {
        if (!this.port.agentDocs)
          throw new BatchEditError(BatchEditErrorCode.Unsupported, "readDoc is unavailable");
        const path = agentDocPath(input.id);
        const content = await this.port.agentDocs.read(path);
        if (content === null)
          throw new BatchEditError(BatchEditErrorCode.NotFound, `No doc at "${path}"`);
        return { ok: true, data: { id: input.id ?? "index", path, content } };
      }
      if (tool === AgentToolName.ReleaseArtifact) {
        if (typeof input.url !== "string")
          throw new BatchEditError(BatchEditErrorCode.InvalidInput, "url must be an artifact URL");
        const released = this.artifacts.delete(input.url);
        if (released) this.port.artifacts?.revoke(input.url);
        return { ok: true, data: { released } };
      }
      if (tool === AgentToolName.GetContext) {
        previewBoolean(input.includePalette, "includePalette");
        previewBoolean(input.includeInkBounds, "includeInkBounds");
        const limits = {
          ...BATCH_EDIT_LIMITS,
          readPixels: MAX_READ_PIXELS,
          documentSide: MAX_DOCUMENT_SIDE,
        };
        if (input.documentId !== undefined)
          return {
            ok: true,
            data: {
              version: AGENT_INTERFACE_VERSION,
              document: this.context(this.resolve(input), input),
              limits,
            },
          };
        const seen = new Set<string>();
        const documents = this.slots()
          .filter((slot) => {
            if (seen.has(slot.documentId)) return false;
            seen.add(slot.documentId);
            return true;
          })
          .map((slot) => {
            const doc = slot.core.getSnapshot().document!;
            return {
              id: slot.documentId,
              name: doc.name,
              width: doc.width,
              height: doc.height,
              revision: slot.core.getContentRevision(),
              layers: doc.timeline!.layers.length,
              frames: doc.timeline!.frames.length,
            };
          });
        const active = this.workspace.active;
        return {
          ok: true,
          data: {
            version: AGENT_INTERFACE_VERSION,
            activeDocument: active?.core.getSnapshot().document
              ? this.context(active, input)
              : null,
            documents,
            limits,
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
      if (tool === AgentToolName.ManageDocument) return await this.manageDocument(input);
      const slot = this.resolve(input);
      if (tool === AgentToolName.ImportImage) return await this.importImage(slot, input);
      if (tool === AgentToolName.Validate) {
        const expect = input.expect === undefined ? undefined : inputObject(input.expect);
        const options: ValidateOptions = {};
        if (input.animationIntent !== undefined) {
          if (!Object.values(AnimationIntent).includes(input.animationIntent as AnimationIntent))
            throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid animationIntent");
          options.animationIntent = input.animationIntent as AnimationIntent;
        }
        if (input.checks !== undefined) {
          if (!Array.isArray(input.checks))
            throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid checks");
          options.checks = input.checks.map((check) => name(check, "checks[]"));
        }
        if (input.strict !== undefined) {
          if (typeof input.strict !== "boolean")
            throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid strict");
          options.strict = input.strict;
        }
        if (expect) {
          const parsed: NonNullable<ValidateOptions["expect"]> = {};
          if (expect.layerFrames !== undefined) {
            const spec = inputObject(expect.layerFrames);
            const entries = Object.entries(spec);
            if (entries.length > MAX_VALIDATE_RANGES)
              throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Too many expect layers");
            const t = slot.core.getSnapshot().document!.timeline!;
            parsed.layerFrames = Object.fromEntries(
              entries.map(([layerId, ranges]) => {
                name(layerId, "expect.layerFrames key");
                if (!Array.isArray(ranges) || ranges.length > MAX_VALIDATE_RANGES)
                  throw new BatchEditError(
                    BatchEditErrorCode.InvalidInput,
                    "Invalid expect.layerFrames ranges",
                  );
                return [
                  layerId,
                  ranges.map((range) => {
                    if (!Array.isArray(range) || range.length !== 2)
                      throw new BatchEditError(
                        BatchEditErrorCode.InvalidInput,
                        "expect.layerFrames ranges must be [from,to] pairs",
                      );
                    const from = integer(
                      range[0],
                      "expect.layerFrames from",
                      0,
                      t.frames.length - 1,
                    );
                    const to = integer(range[1], "expect.layerFrames to", 0, t.frames.length - 1);
                    if (to < from)
                      throw new BatchEditError(
                        BatchEditErrorCode.InvalidInput,
                        "expect.layerFrames range end before start",
                      );
                    return [from, to] as [number, number];
                  }),
                ];
              }),
            );
          }
          if (expect.mustNotOverlap !== undefined) {
            if (!Array.isArray(expect.mustNotOverlap))
              throw new BatchEditError(
                BatchEditErrorCode.InvalidInput,
                "Invalid expect.mustNotOverlap",
              );
            parsed.mustNotOverlap = expect.mustNotOverlap.map((pair) => {
              if (!Array.isArray(pair) || pair.length !== 2)
                throw new BatchEditError(
                  BatchEditErrorCode.InvalidInput,
                  "expect.mustNotOverlap entries must be [layerId,layerId] pairs",
                );
              return [
                name(pair[0], "expect.mustNotOverlap layer"),
                name(pair[1], "expect.mustNotOverlap layer"),
              ] as [string, string];
            });
          }
          options.expect = parsed;
        }
        const doc = slot.core.getSnapshot().document!;
        return {
          ok: true,
          data: {
            documentId: slot.documentId,
            revision: slot.core.getContentRevision(),
            ...validateDocument(doc, options),
          },
        };
      }
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
        if (tool === AgentToolName.ReadPixels && input.mode === "diff") return this.diff(input);
        if (tool === AgentToolName.Render) {
          const animation = previewBoolean(input.animation, "animation");
          if (
            [animation, input.filmstrip !== undefined, input.onionSkin !== undefined].filter(
              Boolean,
            ).length > 1
          )
            throw new BatchEditError(
              BatchEditErrorCode.InvalidInput,
              "Choose one of animation, filmstrip or onionSkin",
            );
          if (animation) return await this.animationPreview(slot, input);
          if (input.filmstrip !== undefined) return await this.filmstrip(slot, input);
        }
        if (tool === AgentToolName.Render && input.onionSkin !== undefined)
          return await this.onionSkin(slot, input);
        const read = this.pixels(
          slot,
          input,
          tool === AgentToolName.ReadPixels ? MAX_READ_PIXELS : BATCH_EDIT_LIMITS.pixels,
        );
        if (tool === AgentToolName.ReadPixels && input.mode === "stats")
          return this.stats(slot, input, read);
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
              ...(input.format === "grid"
                ? { format: "grid", ...this.grid(read) }
                : {
                    rgba: Array.from(read.pixels.data),
                  }),
              selectionMask,
            },
          };
        }
        return await this.previewResponse(
          slot,
          input,
          [
            {
              pixels: convertPixelsToSrgb(read.pixels, read.profile),
              frameIndex: read.frameIndex,
              duration:
                slot.core.getSnapshot().document!.timeline!.frames[read.frameIndex].duration,
            },
          ],
          metadata,
        );
      }
      if (tool === AgentToolName.WritePreview) {
        const directory = this.port.previewDirectory;
        if (!directory)
          throw new BatchEditError(
            BatchEditErrorCode.Unsupported,
            "Preview directory is not supported in this environment",
          );
        const read = this.pixels(slot, input, BATCH_EDIT_LIMITS.pixels);
        const bytes = await this.port.encodePng(convertPixelsToSrgb(read.pixels, read.profile));
        const filename =
          input.filename === undefined
            ? `preview-${docBaseName(slot)}-f${read.frameIndex}-r${read.revision}.png`
            : previewFileName(input.filename);
        try {
          await directory.write(filename, bytes);
        } catch (reason) {
          const code =
            reason && typeof reason === "object" && "code" in reason
              ? String((reason as { code: unknown }).code)
              : "preview_directory_write_failed";
          const message = reason instanceof Error ? reason.message : String(reason);
          return {
            ok: false,
            error: {
              code,
              message,
            },
          };
        }
        return {
          ok: true,
          data: {
            documentId: slot.documentId,
            revision: read.revision,
            frameIndex: read.frameIndex,
            rect: read.rect,
            mimeType: PNG_MIME_TYPE,
            filename,
          },
        };
      }
      if (tool === AgentToolName.ExportDocument) return await this.exportDocument(slot, input);
      if (tool === AgentToolName.Palette) return await this.palette(slot, input);
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
