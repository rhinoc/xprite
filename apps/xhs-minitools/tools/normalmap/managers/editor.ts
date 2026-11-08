import { MiniToolTarget, type MiniToolOutcome } from "$/shared/bridge/output";
import { miniToolPreferences } from "$/shared/bridge/xhs-bridge";
import { ExportRatio } from "$/shared/frames/layout";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  createNormalMapGenerator,
  defaultNormalMapLightOptions,
  defaultNormalMapOptions,
  NormalMapPreset,
  prepareNormalMapLighting,
  renderPreparedNormalMapLighting,
  type NormalMapLightOptions,
  type NormalMapOptions,
  type PreparedNormalMapLighting,
} from "@xprite/lighter";

export enum View {
  Albedo = "albedo",
  Normal = "normal",
  Lit = "lit",
}

export enum ExportContent {
  Lit = "lit",
  Normal = "normal",
  Trio = "trio",
}

export interface NormalToolScene {
  /** Export ratio; the cell is cover-fitted at whole blocks. */
  ratio: ExportRatio;
  /** Export pixel columns/rows of one picture cell. */
  cell: { width: number; height: number };
  content: ExportContent;
  albedo: PixelBuffer;
  normals: PixelBuffer;
  lit: PixelBuffer;
  name: string;
}

export interface NormalToolSnapshot {
  opening: boolean;
  working: boolean;
  error: string | null;
  name: string;
  title: string;
  view: View;
  options: NormalMapOptions;
  light: NormalMapLightOptions;
  delightOn: boolean;
  ratio: ExportRatio;
  content: ExportContent;
  canUndo: boolean;
  canRedo: boolean;
  /** Ready when the preview can paint: albedo + normals + lit for this revision. */
  ready: boolean;
  exporting: MiniToolTarget | null;
}

/** One reversible settings state (options, light, delight toggle, title, content, view). */
interface HistoryEntry {
  options: NormalMapOptions;
  light: NormalMapLightOptions;
  delightOn: boolean;
  title: string;
  content: ExportContent;
  view: View;
}

const MAX_SOURCE_PIXELS = 4_000_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const LIGHT_POSITION_KEY = "xprite-normalmap-light";

function defaultTitle(name: string) {
  return name.replace(/\.[^.]+$/, "") || "xprite";
}

/**
 * The phone normal-map tool's document: the picked image, generation and lighting options, the
 * export layout, and undo. Conversions run on the main thread; each change re-renders.
 */
export class NormalToolEditor {
  private state: NormalToolSnapshot;
  private listeners = new Set<() => void>();
  private history: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private albedo: PixelBuffer | null = null;
  private normals: PixelBuffer | null = null;
  private lit: PixelBuffer | null = null;
  private prepared: PreparedNormalMapLighting | null = null;
  private generator: ReturnType<typeof createNormalMapGenerator> | null = null;
  private job = 0;
  private closed = false;
  private outputHandler:
    | ((scene: NormalToolScene, target: MiniToolTarget) => Promise<MiniToolOutcome>)
    | null = null;

  constructor() {
    const storedLight = storedLightPosition();
    this.state = {
      opening: false,
      working: false,
      error: null,
      name: "",
      title: "",
      view: View.Lit,
      options: defaultNormalMapOptions(NormalMapPreset.Character),
      light: {
        ...defaultNormalMapLightOptions(1, 1),
        ...storedLight,
      },
      // Painted-light removal mirrors the editor: it is on by default, at the preset's
      // influence (60%), so baked-in shading is divided out before the new light lands.
      delightOn: true,
      ratio: ExportRatio.Portrait,
      content: ExportContent.Lit,
      canUndo: false,
      canRedo: false,
      ready: false,
      exporting: null,
    };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<NormalToolSnapshot>) {
    if (this.closed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  setOutputHandler(handler: NonNullable<NormalToolEditor["outputHandler"]>) {
    this.outputHandler = handler;
  }

  get source() {
    return this.albedo;
  }
  get normalPixels() {
    return this.normals;
  }
  get litPixels() {
    return this.lit;
  }

  /** The scene for an export; null before the first result. */
  get scene(): NormalToolScene | null {
    if (!this.albedo || !this.normals || !this.lit) return null;
    return {
      ratio: this.state.ratio,
      cell: { width: this.albedo.width, height: this.albedo.height },
      content: this.state.content,
      albedo: this.albedo,
      normals: this.normals,
      lit: this.lit,
      name: this.state.name,
    };
  }

  async open(file: File) {
    if (file.size > MAX_FILE_BYTES) this.fail("error.size");
    if (file.type && !file.type.startsWith("image/")) this.fail("error.type");
    this.publish({ opening: true, error: null });
    try {
      const pixels = await decode(file);
      this.beginImage(pixels, file.name);
    } catch (error) {
      this.publish({
        opening: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async openExample(example: () => Promise<{ file: File; pixels: PixelBuffer }>) {
    this.publish({ opening: true, error: null });
    try {
      const { file, pixels } = await example();
      // The bundled dungeon sprite was painted with light from straight above.
      this.beginImage(pixels, file.name, 90);
    } catch (error) {
      this.publish({
        opening: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private fail(key: string): never {
    throw new Error(key);
  }

  private beginImage(pixels: PixelBuffer, name: string, angle?: number) {
    this.albedo = pixels;
    this.normals = null;
    this.lit = null;
    this.prepared = null;
    this.generator = createNormalMapGenerator(pixels);
    this.history = [];
    this.future = [];
    const options = defaultNormalMapOptions(NormalMapPreset.Architecture);
    options.shapeStrength = 160;
    options.smoothing = 3;
    options.paintedLightAngle = angle ?? this.generator.suggestPaintedLightAngle() ?? 90;
    this.publish({
      opening: false,
      name,
      title: defaultTitle(name),
      ready: false,
      canUndo: false,
      canRedo: false,
      options,
      light: {
        ...defaultNormalMapLightOptions(pixels.width, pixels.height),
        position: {
          x: Math.round(pixels.width * 0.6),
          y: Math.round(pixels.height * 0.35),
        },
      },
    });
    void this.render();
  }

  private snapshotForHistory() {
    const { options, light, delightOn, title, content, view } = this.state;
    return {
      options: { ...options },
      light: {
        ...light,
        position: { ...light.position },
        color: [...light.color] as NormalMapLightOptions["color"],
      },
      delightOn,
      title,
      content,
      view,
    };
  }

  private pushHistory() {
    this.history.push(this.snapshotForHistory());
    if (this.history.length > 50) this.history.shift();
    this.future = [];
    this.publish({ canUndo: true, canRedo: false });
  }

  undo = () => {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(this.snapshotForHistory());
    this.publish({ ...previous, canUndo: this.history.length > 0, canRedo: true });
    void this.render();
  };

  redo = () => {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.snapshotForHistory());
    this.publish({ ...next, canUndo: true, canRedo: this.future.length > 0 });
    void this.render();
  };

  setView = (view: View) => this.publish({ view });

  changeOptions = (patch: Partial<NormalMapOptions>) => {
    this.pushHistory();
    this.publish({ options: { ...this.state.options, ...patch } });
    void this.renderNormals();
  };

  changePreset = (preset: NormalMapPreset) => {
    this.pushHistory();
    const current = this.state.options;
    const options = defaultNormalMapOptions(preset);
    // Architecture reads taller and cleaner with a stronger shape pass and more smoothing.
    if (preset === NormalMapPreset.Architecture) {
      options.shapeStrength = 160;
      options.smoothing = 3;
    }
    // Keep the painted-light estimate and outline/Y choices; the preset only owns the shape knobs.
    options.invertY = current.invertY;
    options.mergeOutlines = current.mergeOutlines;
    options.paintedLightAngle = current.paintedLightAngle;
    options.paintedLightInfluence = current.paintedLightInfluence;
    this.publish({ options });
    void this.renderNormals();
  };

  changeLight = (patch: Partial<NormalMapLightOptions>) => {
    this.pushHistory();
    this.applyLight(patch);
  };

  /** The light following a finger mid-drag; the drag's start already recorded its history. */
  trackLight = (patch: Partial<NormalMapLightOptions>) => {
    this.applyLight(patch);
  };

  private applyLight(patch: Partial<NormalMapLightOptions>) {
    const light = { ...this.state.light, ...patch };
    this.publish({ light });
    if (patch.position) {
      miniToolPreferences.setItem(
        LIGHT_POSITION_KEY,
        JSON.stringify({ x: patch.position.x, y: patch.position.y, height: light.height }),
      );
    }
    this.renderLit();
  }

  setDelightOn = (delightOn: boolean) => {
    this.pushHistory();
    this.publish({ delightOn });
    this.renderLit();
  };

  setContent = (content: ExportContent) => this.publish({ content });

  /** Regenerate the normal map, then the lit picture. */
  private async renderNormals() {
    await this.render();
  }

  /** Re-render only the lit picture (normals unchanged). */
  private renderLit() {
    if (!this.prepared || !this.normals) return;
    const job = ++this.job;
    const lit = renderPreparedNormalMapLighting(this.prepared, this.lightOptions());
    if (job !== this.job) return;
    this.lit = lit;
    this.publish({ ready: true });
  }

  private lightOptions(): NormalMapLightOptions {
    const { light, delightOn, options } = this.state;
    return {
      ...light,
      invertY: options.invertY,
      delight: delightOn
        ? { angle: options.paintedLightAngle, influence: options.paintedLightInfluence }
        : undefined,
    };
  }

  private async render() {
    const job = ++this.job;
    const albedo = this.albedo;
    const generator = this.generator;
    if (!albedo || !generator) return;
    this.publish({ working: true });
    try {
      await yieldToPaint();
      if (job !== this.job) return;
      const options = this.state.options;
      const normals = generator.generate(options);
      const prepared = prepareNormalMapLighting(albedo, normals, null);
      if (job !== this.job) return;
      const lit = renderPreparedNormalMapLighting(prepared, this.lightOptions());
      if (job !== this.job) return;
      this.normals = normals;
      this.prepared = prepared;
      this.lit = lit;
      this.publish({ working: false, ready: true });
    } catch (error) {
      if (job === this.job)
        this.publish({
          working: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }

  output = async (target: MiniToolTarget) => {
    const scene = this.scene;
    if (!scene || !this.outputHandler) return;
    this.publish({ exporting: target });
    try {
      const outcome = await this.outputHandler(scene, target);
      this.publish({ exporting: null });
      return outcome;
    } catch (error) {
      this.publish({ exporting: null });
      throw error;
    }
  };

  dispose() {
    this.closed = true;
    this.listeners.clear();
  }
}

/** Keep the light position across sessions like the other preferences. */
function storedLightPosition(): { position?: { x: number; y: number }; height?: number } {
  try {
    const raw = miniToolPreferences.getItem(LIGHT_POSITION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { x?: number; y?: number; height?: number };
    return {
      position:
        typeof parsed.x === "number" && typeof parsed.y === "number"
          ? { x: parsed.x, y: parsed.y }
          : undefined,
      height: typeof parsed.height === "number" ? parsed.height : undefined,
    };
  } catch {
    return {};
  }
}

/** Let the busy state paint before a synchronous step takes the main thread. */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function canvasOf(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("error.read");
  return { element, context };
}

/** A decoded image's pixels, reduced to a size a phone can shade quickly. */
async function decode(file: Blob): Promise<PixelBuffer> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("error.read"));
      element.src = url;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("error.read");
    const scale = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (width * height)));
    const target = {
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
    };
    const { context } = canvasOf(target.width, target.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, target.width, target.height);
    const data = context.getImageData(0, 0, target.width, target.height).data;
    return { ...target, data: new Uint8ClampedArray(data) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
