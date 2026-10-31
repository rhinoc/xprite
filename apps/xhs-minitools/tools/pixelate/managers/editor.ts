import { MiniToolTarget, type MiniToolOutcome } from "$/shared/bridge/output";
import {
  composeLayout,
  DEFAULT_LAYOUT,
  type Composition,
  type LayoutState,
} from "$/shared/frames/layout";
import {
  gridForLongSide,
  longSide,
  outputGrid,
  PIXEL_PRESETS,
  PixelPreset,
  presetPlan,
  sizePatch,
  type GridSize,
} from "$/tools/pixelate/managers/pixel-presets";
import type { MiniToolPort } from "$/tools/pixelate/managers/ports";
import { defaultTitle, ExportContent, TITLE_MAX } from "$/tools/pixelate/managers/scene";
import { DEFAULT_SPLIT, type SplitState } from "$/tools/pixelate/managers/split-geometry";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  PixelationAlgorithm,
  PixelationMode,
  pixelationSettingsOptions,
  type PixelGridAnalysis,
  type PixelationSettings,
} from "@xprite/pixelate";
import type { PixelationManager, PixelationSnapshot } from "@xprite/tools-app/pixelation";

type PixelState = Pick<PixelationSnapshot, "algorithm" | "grid" | "settings">;

interface HistoryEntry {
  split: SplitState;
  layout: LayoutState;
  title: string;
  preset: PixelPreset | null;
  pixels: PixelState | null;
}

export interface MiniToolSnapshot {
  split: SplitState;
  layout: LayoutState;
  /** The window title or caption titled frames show; the file name without extension at first. */
  title: string;
  content: ExportContent;
  /** The preset the settings came from; null after a manual change. */
  preset: PixelPreset | null;
  /** The last finished result for this photo, kept on screen while a new one converts. */
  shown: PixelBuffer | null;
  /**
   * A photo or the example is opening: from the read through its first result, so the empty state
   * never shows between the file being read and the first conversion finishing. Clears on failure.
   */
  opening: boolean;
  /** The engine's own block count for this photo (shown as 自动识别). */
  automatic: GridSize | null;
  thumbnails: Partial<Record<PixelPreset, PixelBuffer>>;
  canUndo: boolean;
  exporting: MiniToolTarget | null;
}

const HISTORY_LIMIT = 50;
/** Thumbnails come from a copy of the photo this size, which keeps them fast on phones. */
const THUMBNAIL_SOURCE = 384;

/**
 * The phone layout's document: the split, the export layout and the preset, with undo. Pixel
 * settings stay in {@link PixelationManager}; this keeps their history and applies presets.
 */
export class MiniToolEditor {
  private state: MiniToolSnapshot = {
    split: DEFAULT_SPLIT,
    layout: DEFAULT_LAYOUT,
    title: "",
    content: ExportContent.Split,
    preset: PixelPreset.Default,
    shown: null,
    opening: false,
    automatic: null,
    thumbnails: {},
    canUndo: false,
    exporting: null,
  };
  private listeners = new Set<() => void>();
  private history: HistoryEntry[] = [];
  /** Split before the running drag, recorded once it ends. */
  private gesture: HistoryEntry | null = null;
  private identity = -1;
  private autoGrid: PixelGridAnalysis | null = null;
  private thumbnailRun = 0;
  private thumbnailIdentity = -1;
  private closed = false;
  private readonly unsubscribe: () => void;

  constructor(
    readonly pixelation: PixelationManager,
    private readonly port: MiniToolPort,
  ) {
    this.unsubscribe = pixelation.subscribe(this.sync);
    this.sync();
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<MiniToolSnapshot>) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private sync = () => {
    const pixels = this.pixelation.getSnapshot();
    this.syncPhoto(pixels);
    // Reading the file, then (source set, no result yet) its first conversion: one opening state.
    const opening = pixels.loading || (!!pixels.source && !this.state.shown && !pixels.error);
    if (opening !== this.state.opening) this.publish({ opening });
  };

  private syncPhoto(pixels: PixelationSnapshot) {
    if (!pixels.source) {
      if (this.identity !== -1 || this.state.shown) {
        this.identity = -1;
        this.history = [];
        this.publish({ shown: null, automatic: null, thumbnails: {}, canUndo: false });
      }
      return;
    }
    if (pixels.identity !== this.identity) {
      // A new photo: the engine's settings, a straight vertical split at the centre.
      this.identity = pixels.identity;
      this.autoGrid = pixels.grid;
      this.history = [];
      this.gesture = null;
      ++this.thumbnailRun;
      this.publish({
        split: {
          ...this.state.split,
          angle: DEFAULT_SPLIT.angle,
          position: DEFAULT_SPLIT.position,
          swapped: false,
        },
        title: defaultTitle(pixels.name),
        preset: PixelPreset.Default,
        shown: pixels.result,
        automatic: outputGrid(pixels.settings, pixels.grid),
        thumbnails: {},
        canUndo: false,
      });
    }
    if (pixels.result && pixels.result !== this.state.shown) {
      this.publish({ shown: pixels.result });
      if (this.thumbnailIdentity !== this.identity) {
        this.thumbnailIdentity = this.identity;
        void this.renderThumbnails();
      }
    }
  }

  /** The layout the preview and export use for the current result. */
  composition(layout = this.state.layout): Composition | null {
    const shown = this.state.shown;
    return shown ? composeLayout(layout, shown) : null;
  }

  private entry(): HistoryEntry {
    const pixels = this.pixelation.getSnapshot();
    return {
      split: this.state.split,
      layout: this.state.layout,
      title: this.state.title,
      preset: this.state.preset,
      pixels: pixels.source
        ? { algorithm: pixels.algorithm, grid: pixels.grid, settings: pixels.settings }
        : null,
    };
  }

  private record(entry = this.entry()) {
    this.history.push(entry);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  private ready() {
    const pixels = this.pixelation.getSnapshot();
    return !!pixels.source && !pixels.loading && !pixels.downloading && !this.closed;
  }

  // ---- 像素 ----

  applyPreset = (preset: PixelPreset) => {
    if (!this.ready()) return;
    this.record();
    this.usePreset(preset);
    this.publish({ canUndo: true });
  };

  private usePreset(preset: PixelPreset) {
    const source = this.pixelation.getSnapshot().source!;
    const plan = presetPlan(preset, source, this.autoGrid);
    this.pixelation.restore({
      algorithm: PixelationAlgorithm.Auto,
      grid: this.autoGrid,
      settings: plan.settings,
    });
    if (plan.customGrid)
      void this.pixelation.changeAlgorithm(PixelationAlgorithm.CustomSize, plan.customGrid);
    this.publish({ preset });
  }

  /** Commit a block count for the longer side (the 大块 ↔ 精细 slider). */
  setLongSide = (long: number) => {
    if (!this.ready()) return;
    const pixels = this.pixelation.getSnapshot();
    const current = outputGrid(pixels.settings, pixels.grid);
    if (Math.round(long) === longSide(current)) return;
    this.record();
    this.publish({ preset: null, canUndo: true });
    if (pixels.settings.mode === PixelationMode.Convert)
      this.pixelation.changeSettings(sizePatch(pixels.source!, long));
    else
      void this.pixelation.changeAlgorithm(
        PixelationAlgorithm.CustomSize,
        gridForLongSide(current, long),
      );
  };

  changeSettings = (patch: Partial<PixelationSettings>) => {
    if (!this.ready()) return;
    this.record();
    this.publish({ preset: null, canUndo: true });
    this.pixelation.changeSettings(patch);
  };

  changeAlgorithm = (algorithm: PixelationAlgorithm) => {
    if (!this.ready()) return;
    const pixels = this.pixelation.getSnapshot();
    this.record();
    this.publish({ preset: null, canUndo: true });
    void this.pixelation.changeAlgorithm(
      algorithm,
      algorithm === PixelationAlgorithm.CustomSize
        ? outputGrid(pixels.settings, pixels.grid)
        : undefined,
    );
  };

  // ---- 对比 ----

  /** A committed split change (chips, buttons, toggles). */
  changeSplit = (patch: Partial<SplitState>) => {
    this.record();
    this.publish({ split: { ...this.state.split, ...patch }, canUndo: true });
  };

  /**
   * Start a drag (handle, knob or slider) or a title edit: live updates, one undo step when it
   * ends.
   */
  beginGesture = () => {
    this.gesture ??= this.entry();
  };
  previewSplit = (patch: Partial<SplitState>) => {
    this.publish({ split: { ...this.state.split, ...patch } });
  };
  endGesture = () => {
    const before = this.gesture;
    this.gesture = null;
    if (!before) return;
    const { split, title } = this.state;
    const changed =
      title !== before.title ||
      (Object.keys(split) as (keyof SplitState)[]).some((key) => split[key] !== before.split[key]);
    if (!changed) return;
    this.record(before);
    this.publish({ canUndo: true });
  };

  // ---- 版式 ----

  changeLayout = (patch: Partial<LayoutState>) => {
    const layout = { ...this.state.layout, ...patch };
    if (layout.ratio === this.state.layout.ratio && layout.frame === this.state.layout.frame)
      return;
    this.record();
    this.publish({ layout, canUndo: true });
  };

  /** The title while it is typed; wrap edits in {@link beginGesture} and {@link endGesture}. */
  previewTitle = (title: string) => {
    this.publish({ title: title.slice(0, TITLE_MAX) });
  };

  /** A committed title change, such as going back to the file name. */
  changeTitle = (title: string) => {
    const next = title.slice(0, TITLE_MAX);
    if (next === this.state.title) return;
    this.record();
    this.publish({ title: next, canUndo: true });
  };

  /** The title a photo opens with. */
  defaultTitle = () => defaultTitle(this.pixelation.getSnapshot().name);

  setContent = (content: ExportContent) => this.publish({ content });

  // ---- 撤销 / 重置 ----

  undo = () => {
    const entry = this.history.pop();
    if (!entry) return;
    this.gesture = null;
    const current = this.pixelation.getSnapshot();
    if (
      entry.pixels &&
      current.source &&
      (entry.pixels.settings !== current.settings ||
        entry.pixels.grid !== current.grid ||
        entry.pixels.algorithm !== current.algorithm)
    )
      this.pixelation.restore(entry.pixels);
    this.publish({
      split: entry.split,
      layout: entry.layout,
      title: entry.title,
      preset: entry.preset,
      canUndo: this.history.length > 0,
    });
  };

  /** Everything back to how a new photo opens; undoable. */
  reset = () => {
    if (!this.ready()) return;
    this.record();
    this.publish({
      split: DEFAULT_SPLIT,
      layout: DEFAULT_LAYOUT,
      title: this.defaultTitle(),
      canUndo: true,
    });
    this.usePreset(PixelPreset.Default);
  };

  // ---- 导出 ----

  output = async (
    target: MiniToolTarget,
    labels: { original: string; pixels: string },
  ): Promise<MiniToolOutcome | null> => {
    const pixels = this.pixelation.getSnapshot();
    const composition = this.composition();
    if (!pixels.source || !pixels.result || !composition || this.state.exporting) return null;
    this.publish({ exporting: target });
    try {
      return await this.port.output(
        {
          composition,
          split: this.state.split,
          content: this.state.content,
          original: pixels.source,
          pixels: pixels.result,
          name: pixels.name,
          title: this.state.title,
          labels,
        },
        target,
      );
    } finally {
      this.publish({ exporting: null });
    }
  };

  /** Preset thumbnails, one at a time after the first result so they never delay it. */
  private async renderThumbnails() {
    const run = this.thumbnailRun;
    const source = this.pixelation.getSnapshot().source;
    if (!source) return;
    const grid = this.autoGrid;
    // A recovered grid belongs to the full-size photo; photos get a small copy.
    const image = grid?.reliable ? source : this.port.shrink(source, THUMBNAIL_SOURCE);
    const thumbnails: Partial<Record<PixelPreset, PixelBuffer>> = {};
    for (const preset of PIXEL_PRESETS) {
      const plan = presetPlan(preset, source, grid);
      let settings = plan.settings;
      if (plan.customGrid)
        settings = {
          ...settings,
          mode: PixelationMode.Convert,
          targetWidth: plan.customGrid.width,
          targetHeight: plan.customGrid.height,
        };
      try {
        const options = pixelationSettingsOptions(settings, image, grid ?? undefined);
        thumbnails[preset] = await this.port.preview(image, options);
      } catch {
        continue;
      }
      if (run !== this.thumbnailRun || this.closed) return;
      this.publish({ thumbnails: { ...thumbnails } });
    }
  }

  dispose() {
    this.closed = true;
    ++this.thumbnailRun;
    this.unsubscribe();
    this.listeners.clear();
  }
}
