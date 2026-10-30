import {
  ClipboardPasteIntent,
  ClipboardPasteSource,
  resolveClipboardPasteSource,
  type ClipboardPasteRequest,
} from "$/managers/clipboard/paste-source";
import { browserClipboard, type ClipboardItemPayload } from "@xprite/bedrock/browser/clipboard";
import {
  decodeImageBlob as decodeImage,
  encodePngBlob as encodePng,
} from "@xprite/bedrock/browser/images";
import { convertPixelsToSrgb } from "@xprite/editor-core";
import type { RasterEditor } from "@xprite/editor-core";
import {
  cloneClipboardImage,
  clipboardPastePosition,
  type ClipboardImage,
} from "@xprite/editor-core";
import {
  cloneTimelineClipboard,
  type TimelineClipboard,
  type TimelineRange,
} from "@xprite/editor-core";
import { effectiveLayerVisible, MAX_TIMELINE_LAYERS } from "@xprite/editor-core";
import { validTimelineRange } from "@xprite/editor-core";
import { UINT8_MAX } from "@xprite/editor-core";
import {
  canPastePaletteEntries,
  clonePaletteClipboard,
  pastePaletteEntries,
  selectedPaletteEntries,
  type PaletteClipboard,
} from "@xprite/editor-core";

export type { ClipboardImage } from "@xprite/editor-core";

export interface ClipboardPort {
  read(): Promise<Blob | null>;
  write(item: ClipboardItemPayload): Promise<boolean | void>;
  clear?(): Promise<void>;
  canRead?(): boolean;
  /** true only when Permissions API already reports clipboard-read granted. */
  isClipboardReadGranted?(): Promise<boolean>;
  /** true/false when the OS clipboard was readable; null when the API or permission cannot tell. */
  peekImage?(): Promise<boolean | null>;
}
const browserClipboardPort: ClipboardPort = {
  canRead: browserClipboard.canRead,
  clear: browserClipboard.clear,
  isClipboardReadGranted: () => browserClipboard.isClipboardReadGranted(),
  peekImage: () => browserClipboard.peekImage(["image/png", "image/*"]),
  read: () => browserClipboard.read(["image/png", "image/*"]),
  write: (item) => browserClipboard.write(item),
};

/** Workspace-wide memory clipboard retains selection holes and original origin. */
export class ImageClipboard {
  private image: ClipboardImage | null = null;
  private appImageCopy = false;
  /** Last successful observation of an image MIME on the system clipboard (not mere API presence). */
  private systemImagePresent = false;
  /**
   * True after a definitive OS clipboard peek/read (not permission-denied).
   * Until then, Open from Clipboard / Paste as New Sprite stay enabled so the
   * first click can trigger the browser permission prompt.
   */
  private systemClipboardReadable = false;
  private timeline: TimelineClipboard | null = null;
  private timelineCopySource: {
    core: RasterEditor;
    documentId: number | undefined;
    range: TimelineRange;
    layerIds: string;
    frames: readonly object[];
  } | null = null;
  private unsubscribeTimelineCopySource: (() => void) | null = null;
  private palette: PaletteClipboard | null = null;
  private timelineSourceCleared = false;
  private listeners = new Set<() => void>();
  private version = 0;
  getVersion = () => this.version;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  get hasTimeline() {
    return this.timeline !== null;
  }
  get hasPalette() {
    return this.palette !== null;
  }
  getPalette() {
    return this.palette ? clonePaletteClipboard(this.palette) : null;
  }
  canPastePalette(paletteSize: number, selected: readonly number[]): boolean {
    return (
      !!this.palette && canPastePaletteEntries(paletteSize, selected, this.palette.selected.length)
    );
  }
  copyPalette(value: PaletteClipboard): boolean {
    const owned = clonePaletteClipboard(value);
    if (!owned.selected.length) return false;
    this.palette = owned;
    this.timeline = null;
    this.clearTimelineCopySource();
    this.image = null;
    this.appImageCopy = false;
    this.publish();
    return this.palette === owned;
  }
  get canReadExternal() {
    return this.port.canRead?.() ?? false;
  }
  /** True only after a successful peek/read/write observed a system image (never from canRead alone). */
  get hasSystemImage() {
    return this.systemImagePresent;
  }
  /** True after a definitive OS peek/read succeeded (permission already usable). */
  get hasSystemClipboardAccess() {
    return this.systemClipboardReadable;
  }
  /**
   * Best-effort OS clipboard image check for menu enablement.
   * Peeks only when clipboard-read is already granted (Permissions API) or a prior
   * peek/read already succeeded — never forces the first permission prompt on File/Edit open.
   * Does not decode or adopt clipboard contents into the workspace clipboard.
   */
  async probeSystemImage(): Promise<void> {
    if (!this.port.peekImage) return;
    const granted =
      this.systemClipboardReadable || (await this.port.isClipboardReadGranted?.()) === true;
    if (!granted) return;
    const result = await this.port.peekImage();
    if (result === null) return;
    const wasReadable = this.systemClipboardReadable;
    this.systemClipboardReadable = true;
    if (result === this.systemImagePresent && wasReadable) return;
    this.systemImagePresent = result;
    this.publish();
  }
  private setSystemImagePresent(value: boolean) {
    if (this.systemImagePresent === value) return;
    this.systemImagePresent = value;
  }
  getTimeline() {
    return this.timeline ? cloneTimelineClipboard(this.timeline) : null;
  }
  getTimelineCopyRange(core: RasterEditor | null): TimelineRange | undefined {
    const source = this.timelineCopySource;
    const document = core?.getSnapshot().document;
    const timeline = document?.timeline;
    if (
      !this.timeline ||
      !source ||
      source.core !== core ||
      source.documentId !== document?.id ||
      !timeline ||
      source.frames.length !== timeline.frames.length ||
      source.frames.some((frame, index) => frame !== timeline.frames[index]) ||
      source.layerIds !== timeline.layers.map((layer) => layer.id).join() ||
      !validTimelineRange(timeline, source.range)
    )
      return undefined;
    return source.range;
  }
  dismissTimelineCopyRange() {
    if (!this.timelineCopySource) return;
    this.clearTimelineCopySource();
    this.publish();
  }
  private clearTimelineCopySource() {
    this.unsubscribeTimelineCopySource?.();
    this.unsubscribeTimelineCopySource = null;
    this.timelineCopySource = null;
  }
  async copyTimeline(data: TimelineClipboard, core?: RasterEditor) {
    this.clearTimelineCopySource();
    const owned = cloneTimelineClipboard(data);
    const document = core?.getSnapshot().document;
    const timeline = document?.timeline;
    const range = timeline?.range;
    this.timelineCopySource =
      core && timeline && range
        ? {
            core,
            documentId: document?.id,
            range: { ...range, layers: [...range.layers], frames: [...range.frames] },
            layerIds: timeline.layers.map((layer) => layer.id).join(),
            frames: [...timeline.frames],
          }
        : null;
    if (this.timelineCopySource && core) {
      // A changed immutable frame graph can move the copied positions. Once
      // invalidated, undo must not revive the old clipboard decoration.
      this.unsubscribeTimelineCopySource = core.subscribe(() => {
        if (!this.getTimelineCopyRange(core)) this.dismissTimelineCopyRange();
      });
    }
    this.timeline = owned;
    this.palette = null;
    this.image = null;
    this.appImageCopy = false;
    this.setSystemImagePresent(false);
    this.timelineSourceCleared = false;
    this.publish();
    try {
      if (this.port.clear) {
        await this.port.clear();
        if (this.timeline === owned) this.timelineSourceCleared = true;
      }
    } catch {
      /* exact workspace range stays available */
    }
    return this.timeline === owned;
  }
  constructor(private readonly port: ClipboardPort = browserClipboardPort) {}
  get hasImage() {
    return this.image !== null;
  }
  get hasAppImageCopy() {
    return this.image !== null && this.appImageCopy;
  }
  getImage() {
    return this.image ? cloneClipboardImage(this.image) : null;
  }
  async copy(image: ClipboardImage): Promise<boolean> {
    this.timeline = null;
    this.clearTimelineCopySource();
    this.palette = null;
    const owned = cloneClipboardImage(image);
    this.image = owned;
    this.appImageCopy = true;
    this.publish();
    // Browser permission denial must not break same-workspace copying. The owned
    // internal payload is already safely stored before a caller can cut pixels.
    try {
      const png = encodePng(convertPixelsToSrgb(image.pixels, image.sourceProfile));
      // ClipboardItem accepts promises so the write call can remain in the
      // original user-activation stack. A failed encoder is handled by the
      // write promise when supported and must never become an unhandled reject.
      void png.catch(() => {});
      await this.port.write({ "image/png": png });
      if (this.image === owned) {
        const changed = !this.systemClipboardReadable || !this.hasSystemImage;
        this.systemClipboardReadable = true;
        this.setSystemImagePresent(true);
        if (changed) this.publish();
      }
    } catch {
      /* internal clipboard remains available */
    }
    return this.image === owned;
  }
  async read(blob?: Blob): Promise<ClipboardImage | null> {
    const version = this.version;
    let source = blob;
    if (!source && this.palette) return null;
    if (!source && this.timeline && !this.timelineSourceCleared) return null;
    if (!source) {
      try {
        source = (await this.port.read()) ?? undefined;
      } catch {
        return version === this.version ? this.getImage() : null;
      }
    }
    if (version !== this.version) return null;
    if (!source) {
      // OS read returned no image. Only treat as a confirmed empty clipboard when
      // clipboard.read exists (unavailable API also yields null without throwing).
      if (this.canReadExternal) {
        const changed = !this.systemClipboardReadable || this.systemImagePresent;
        this.systemClipboardReadable = true;
        this.setSystemImagePresent(false);
        if (changed) this.publish();
      }
      return this.getImage();
    }
    const pixels = await decodeImage(source);
    if (version !== this.version) return null;
    const previous = this.image
      ? convertPixelsToSrgb(this.image.pixels, this.image.sourceProfile)
      : undefined;
    if (
      previous &&
      previous.width === pixels.width &&
      previous.height === pixels.height &&
      previous.data.every((v, i) => {
        if (i % 4 === 3) return v === pixels.data[i];
        const alpha = previous.data[i - (i % 4) + 3];
        // Canvas PNG exchange can quantize straight RGB during premultiplication.
        // Compare visible premultiplied bytes, preserving the exact owned RGBA/mask.
        return (
          Math.round((v * alpha) / UINT8_MAX) === Math.round((pixels.data[i] * alpha) / UINT8_MAX)
        );
      })
    ) {
      return this.getImage();
    }
    this.timeline = null;
    this.palette = null;
    this.image = { pixels, mask: null };
    this.clearTimelineCopySource();
    this.appImageCopy = false;
    this.systemClipboardReadable = true;
    this.setSystemImagePresent(true);
    this.publish();
    return this.getImage();
  }
  async readForPaste(request: ClipboardPasteRequest, eventImage?: Blob) {
    switch (resolveClipboardPasteSource(request, this.hasAppImageCopy)) {
      case ClipboardPasteSource.System:
        return this.read();
      case ClipboardPasteSource.Event:
        return eventImage ? this.read(eventImage) : this.getImage();
      case ClipboardPasteSource.Workspace:
        return this.getImage();
      default:
        return this.getImage();
    }
  }
}
export enum ClipboardRegion {
  Canvas = "canvas",
  Timeline = "timeline",
  Palette = "palette",
  Tileset = "tileset",
}

export interface ClipboardCapabilities {
  canCopy: boolean;
  canCopyMerged: boolean;
  canCut: boolean;
  canPaste: boolean;
  canPasteNewLayer: boolean;
  canPasteNewSprite: boolean;
}
export interface ClipboardActionOptions {
  preferTimeline?(): boolean;
  getRegion?(): ClipboardRegion;
  palette?: {
    getOwnerCore(): RasterEditor | null;
    getSelection(): readonly number[];
    deleteSelection(): number | null;
    getWorkingIndices(): { foreground: number | null; background: number | null };
  };
  isDocumentActive?(): boolean;
  getCore(): RasterEditor | null;
  createDocument(image: ClipboardImage): void | Promise<void>;
  getViewport?(): { width: number; height: number };
  onError?(message: string): void;
  clipboard?: ImageClipboard;
}
export function createClipboardActions(options: ClipboardActionOptions) {
  const clipboard = options.clipboard ?? new ImageClipboard();
  const current = () => options.getCore();
  const ownsPalette = (core: RasterEditor | null) =>
    !!core && options.palette?.getOwnerCore() === core;
  const region = () =>
    options.getRegion?.() ??
    (options.preferTimeline?.() ? ClipboardRegion.Timeline : ClipboardRegion.Canvas);
  const paletteSelection = () =>
    selectedPaletteEntries(
      ownsPalette(current()) ? (options.palette?.getSelection() ?? []) : [],
      current()?.getSnapshot().palette.length ?? 0,
    );
  const fail = (error: unknown) => {
    options.onError?.(error instanceof Error ? error.message : String(error));
    return false;
  };
  const canCopyImage = () => {
    const state = current()?.getSnapshot(),
      doc = state?.document;
    const layer = doc?.timeline?.layers[doc.timeline.activeLayer];
    const visible = doc?.timeline
      ? effectiveLayerVisible(doc.timeline, doc.timeline.activeLayer)
      : doc?.layer.visible;
    return (
      !!doc &&
      (!!state?.floatingPaste ||
        (!!doc.selection?.data.some(Boolean) &&
          !!visible &&
          !doc.layer.emptyCel &&
          layer?.kind !== "group" &&
          !((layer?.flags ?? 0) & 64)))
    );
  };
  const getCapabilities = (): ClipboardCapabilities => {
    const state = current()?.getSnapshot(),
      doc = options.isDocumentActive?.() === false ? null : state?.document;
    const imageAvailable =
      !clipboard.hasPalette && (clipboard.hasImage || clipboard.canReadExternal);
    // Open from Clipboard / Paste as New Sprite: stay enabled until the OS clipboard has been
    // peeked/read under already-granted permission (or a prior successful read). Menu open only
    // peeks when clipboard-read is already granted so the first click can still trigger the
    // permission prompt; after that, empty/non-image disables the items.
    const knownImageForNewSprite =
      !clipboard.hasPalette &&
      (clipboard.hasImage || clipboard.hasSystemImage || !clipboard.hasSystemClipboardAccess);
    const pending = !!state?.inlineText || !!state?.floatingPaste || !!state?.preview;
    if (region() === ClipboardRegion.Palette || region() === ClipboardRegion.Tileset) {
      const selectedIndices = region() === ClipboardRegion.Palette ? paletteSelection() : [];
      const selected = selectedIndices.length > 0;
      return {
        canCopy: !!doc && selected,
        canCopyMerged: false,
        canCut: !!doc && selected && !pending,
        canPaste:
          !!doc &&
          selected &&
          !pending &&
          clipboard.canPastePalette(state!.palette.length, selectedIndices),
        canPasteNewLayer:
          !!doc && imageAvailable && (doc.timeline?.layers.length ?? 1) < MAX_TIMELINE_LAYERS,
        canPasteNewSprite: knownImageForNewSprite,
      };
    }
    const mask = !!doc?.selection?.data.some(Boolean);
    const range = !!doc?.timeline?.range && validTimelineRange(doc.timeline, doc.timeline.range);
    const activeLayer = doc?.timeline?.layers[doc.timeline.activeLayer];
    const visible = doc?.timeline
      ? effectiveLayerVisible(doc.timeline, doc.timeline.activeLayer)
      : doc?.layer.visible;
    const editableImage =
      !!doc &&
      !!visible &&
      !doc.layer.locked &&
      activeLayer?.kind !== "group" &&
      !((activeLayer?.flags ?? 0) & 64);
    return {
      canCopy: !!doc && (region() === ClipboardRegion.Timeline ? range : canCopyImage() || range),
      canCopyMerged: !!doc && mask,
      // Aseprite Timeline::onCanCut explicitly returns false; Cut is an image-mask operation.
      canCut: region() !== ClipboardRegion.Timeline && !!doc && canCopyImage() && !doc.layer.locked,
      canPaste:
        !!doc &&
        !clipboard.hasPalette &&
        (clipboard.hasTimeline ? !pending : imageAvailable && editableImage),
      canPasteNewLayer:
        !!doc && imageAvailable && (doc.timeline?.layers.length ?? 1) < MAX_TIMELINE_LAYERS,
      canPasteNewSprite: knownImageForNewSprite,
    };
  };
  const copy = async (merged = false) => {
    const capability = getCapabilities();
    if (merged ? !capability.canCopyMerged : !capability.canCopy) return false;
    try {
      const core = current();
      if (!merged && region() === ClipboardRegion.Palette && core) {
        return clipboard.copyPalette({
          colors: core.getSnapshot().palette,
          selected: paletteSelection(),
        });
      }
      if (!merged && region() === ClipboardRegion.Timeline) {
        const range = core?.clipboard.copyTimelineSelection();
        return range && core ? await clipboard.copyTimeline(range, core) : false;
      }
      const image = merged || canCopyImage() ? core?.clipboard.copySelection(merged) : null;
      if (image) return await clipboard.copy(image);
      if (!merged) {
        const range = core?.clipboard.copyTimelineSelection();
        if (range && core) return await clipboard.copyTimeline(range, core);
      }
      return false;
    } catch (error) {
      return fail(error);
    }
  };
  const cut = async () => {
    const core = current(),
      snapshot = core?.getSnapshot(),
      initialRegion = region();
    if (!core || !snapshot?.document || !getCapabilities().canCut) return false;
    try {
      if (region() === ClipboardRegion.Palette) {
        const selected = paletteSelection();
        if (!clipboard.copyPalette({ colors: snapshot.palette, selected })) return false;
        // The palette payload is owned synchronously, with no permission sheet.
        if (
          current() !== core ||
          !ownsPalette(core) ||
          core.getSnapshot().revision !== snapshot.revision ||
          selected.join() !== paletteSelection().join()
        )
          return false;
        return !!options.palette && options.palette.deleteSelection() !== null;
      }
      const image = core.clipboard.copySelection();
      if (!image) return false;
      const revision = core.getSnapshot().revision;
      if (!(await clipboard.copy(image))) return false;
      // Permission UI is asynchronous; never cut a changed selection or document.
      if (
        current() !== core ||
        core.getSnapshot().revision !== revision ||
        region() !== initialRegion ||
        options.isDocumentActive?.() === false
      )
        return false;
      core.selection.clearSelectionPixels();
      return true;
    } catch (error) {
      return fail(error);
    }
  };
  const paste = async (
    target: "current" | "layer" | "sprite" = "current",
    request: ClipboardPasteRequest = {
      intent: ClipboardPasteIntent.Menu,
      hasEventImage: false,
    },
    eventImage?: Blob,
  ) => {
    const core = current(),
      snapshot = core?.getSnapshot(),
      id = snapshot?.document?.id,
      initialRegion = region();
    try {
      if (target === "current" && region() === ClipboardRegion.Palette) {
        if (!core || !ownsPalette(core) || !getCapabilities().canPaste) return false;
        const data = clipboard.getPalette();
        const next = data
          ? pastePaletteEntries(core.getSnapshot().palette, paletteSelection(), data)
          : null;
        if (!next) return false;
        const indices = options.palette?.getWorkingIndices();
        core.color.setPalette(next);
        if (indices) {
          core.drawing.settings.setSettings({
            ...(indices.foreground !== null && next[indices.foreground]
              ? {
                  foregroundIndex: indices.foreground,
                  foreground: next[indices.foreground],
                }
              : {}),
            ...(indices.background !== null && next[indices.background]
              ? {
                  backgroundIndex: indices.background,
                  background: next[indices.background],
                }
              : {}),
          });
        }
        return true;
      }
      if (target === "current" && region() === ClipboardRegion.Tileset) return false;
      const image = await clipboard.readForPaste(request, eventImage);
      // The OS permission sheet may have yielded while the active tab changed.
      if (
        current() !== core ||
        core?.getSnapshot().document?.id !== id ||
        core?.getSnapshot().revision !== snapshot?.revision ||
        region() !== initialRegion ||
        (target !== "sprite" && options.isDocumentActive?.() === false)
      )
        return false;
      const timeline =
        !image && !request.hasEventImage && target === "current" ? clipboard.getTimeline() : null;
      if (timeline) {
        clipboard.dismissTimelineCopyRange();
        const accepted = core?.clipboard.pasteTimelineClipboard(timeline) ?? false;
        if (!accepted)
          options.onError?.("This timeline range cannot be pasted at the current layer or frame.");
        return accepted;
      }
      if (!image) return false;
      if (target === "sprite" || !core?.getSnapshot().document) {
        await options.createDocument(image);
        return true;
      }
      if (target === "current" && !getCapabilities().canPaste) return false;
      if (target === "layer") {
        const count = core.getSnapshot().document?.timeline?.layers.length ?? 1;
        core.timeline.addLayer();
        if ((core.getSnapshot().document?.timeline?.layers.length ?? 1) <= count) return false;
      }
      const state = core.getSnapshot(),
        doc = state.document!;
      const viewport = options.getViewport?.() ?? { width: doc.width, height: doc.height };
      return core.clipboard.beginImagePaste(
        image,
        clipboardPastePosition(image, doc, viewport, state.view),
      );
    } catch (error) {
      return fail(error);
    }
  };
  const pasteNewReferenceLayer = async () => {
    const core = current(),
      id = core?.getSnapshot().document?.id;
    if (!core || !getCapabilities().canPasteNewLayer) return false;
    try {
      const image = await clipboard.read();
      if (!image || current() !== core || core.getSnapshot().document?.id !== id) return false;
      return core.sprite.addReferenceLayer(image.pixels);
    } catch (error) {
      return fail(error);
    }
  };
  return {
    dismissTimelineCopyRange: () => clipboard.dismissTimelineCopyRange(),
    probeSystemImage: () => {
      void clipboard.probeSystemImage();
    },
    getCapabilities,
    subscribe: clipboard.subscribe,
    getVersion: clipboard.getVersion,
    copy: () => copy(false),
    copyMerged: () => copy(true),
    cut,
    paste: () => paste(),
    pasteNewLayer: () => paste("layer"),
    pasteNewSprite: () => paste("sprite"),
    pasteNewReferenceLayer,
    /** The event adapter only supplies a candidate; clipboard policy chooses its source. */
    handlePasteEvent(event: ClipboardEvent): Promise<boolean> {
      const target = event.target;
      if (
        event.defaultPrevented ||
        (typeof Element !== "undefined" &&
          target instanceof Element &&
          target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false])"))
      )
        return Promise.resolve(false);
      const item = Array.from(event.clipboardData?.items ?? []).find((value) =>
        value.type.startsWith("image/"),
      );
      const blob = item?.getAsFile() ?? undefined;
      if (!blob && !clipboard.hasImage && !clipboard.hasTimeline && !clipboard.hasPalette)
        return Promise.resolve(false);
      if (options.isDocumentActive?.() === false) return Promise.resolve(false);
      event.preventDefault();
      return paste(
        "current",
        { intent: ClipboardPasteIntent.Keyboard, hasEventImage: !!blob },
        blob,
      );
    },
  };
}
