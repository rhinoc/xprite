import type { ColorSamplingPort } from "$/managers/ports/color-sampling";
import type { ShortcutFilePort } from "$/managers/ports/shortcut-files";
import type { UserPresetStoragePort } from "$/managers/ports/user-presets";
import type { WebpExportPort } from "$/managers/ports/webp-export";
import type { DetectedWheelDevice, WheelDevice } from "$/managers/ports/wheel-device";
import type { EditorSnapshot, Point } from "@xprite/editor-core";
import type { BitmapFont, PixelBuffer } from "@xprite/editor-core/base";
import type { SessionProject } from "@xprite/editor-core/session";

/** Browser storage operations required by application preference managers. */
export interface PreferenceStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Input adapter command for returning keyboard focus to the editor scene. */
export enum EditorCursorName {
  HorizontalResize = "size_we",
  Move = "move",
  Normal = "normal",
}

export enum EditorPrimaryModifier {
  Control = "Ctrl",
  Command = "Cmd",
}

interface EditorInputPort {
  readonly keyboardLikelyAvailable: boolean;
  readonly primaryModifier: EditorPrimaryModifier;
  releaseEditorFocus(element: HTMLElement): void;
  cursorStyle(name: EditorCursorName, fallback?: string): string;
}

export interface CanvasViewportClip {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

/** Reference-layer drawing capability injected by the browser composition root. */
export interface CanvasReferenceCachePort {
  draw(
    context: CanvasRenderingContext2D,
    snapshot: EditorSnapshot,
    renderViewport: (clip: CanvasViewportClip) => PixelBuffer,
    origin: Point,
    viewport: { width: number; height: number },
    /** Backing-canvas pixels per logical GUI viewport unit. */
    backingScale: number,
  ): boolean;
  clear(): void;
}

/** Browser-backed rendering capability used by the canvas manager. */
interface CanvasRenderingPort {
  createReferenceCache(): CanvasReferenceCachePort;
}

export interface EditorTextFontOptions {
  family: string;
  bold: boolean;
  italic: boolean;
  antialias: boolean;
  size: number;
  fill: boolean;
  strokeWidth: number;
}

export interface EditorFontPort {
  rasterize(appearance: "light" | "dark", text: string, options: EditorTextFontOptions): BitmapFont;
}

interface EditorFilePort {
  webp?: WebpExportPort;
  decodeAsepriteBlob(blob: Blob, fileName: string): Promise<SessionProject>;
  decodeImageBlob?(blob: Blob): Promise<PixelBuffer>;
}

export enum EditorWheelAction {
  Zoom = "zoom",
  Brush = "brush",
  Frame = "frame",
  Horizontal = "horizontal",
  Vertical = "vertical",
  Foreground = "foreground",
  Background = "background",
  CellSize = "cell-size",
}

export enum EditorWheelInputKind {
  Wheel = "wheel",
  Magnify = "magnify",
}

export interface EditorWheelPreferences {
  zoomWithWheel?: boolean;
  zoomWithSlide?: boolean;
  quickZoom?: boolean;
}

export interface EditorWheelPolicyInput {
  x: number;
  y: number;
  precise: boolean;
  kind?: EditorWheelInputKind;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface EditorWheelNormalizedInput extends EditorWheelPolicyInput {
  detected: DetectedWheelDevice;
  kind: EditorWheelInputKind;
}

export interface EditorWheelDecision extends EditorWheelNormalizedInput {
  action: EditorWheelAction | null;
  axis: "x" | "y" | null;
}

export interface PaintingCursorOptions {
  scale: number;
  crosshair: boolean;
  centerDot: boolean;
  whiteBits: number;
  color?: string;
}

export interface PaintingCursorRenderer {
  prepare(options: PaintingCursorOptions): Promise<string>;
  dispose(): void;
}

interface CanvasCursorPort {
  createPaintingCursorRenderer(): PaintingCursorRenderer;
  cursorStyle(name: string, fallback?: string): string;
  editorCursor(tool: string): string;
  selectionHandleCursor(
    handle: string,
    bounds: { width: number; height: number },
    angle: number,
  ): string;
  paintingCrosshairPixels: readonly (readonly [number, number])[];
}

/** One browser event translator and device detector shared by all editor surfaces. */
export interface EditorWheelInputPort {
  connect(target: HTMLElement, handler: (event: WheelEvent) => void): () => void;
  read(
    event: WheelEvent,
    device: WheelDevice,
    controlKeyPressed: boolean,
  ): EditorWheelNormalizedInput;
}

/** Browser-specific canvas input translation, cursor assets, and diagnostic logging. */
export interface CanvasPointerSample {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  pressure: number;
  timeStamp: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface CanvasInputPort {
  /** Suppress native stylus defaults only while the canvas owns pen input. */
  connectStylusTouchDefaults?(target: HTMLElement, shouldPreventDefault: () => boolean): () => void;
  pointerSamples(event: PointerEvent): readonly CanvasPointerSample[];
  cursors: CanvasCursorPort;
  debugInput(
    kind: string,
    event?: PointerEvent | KeyboardEvent,
    details?: Record<string, unknown>,
    options?: { forceInDevelopment?: boolean; flush?: boolean },
  ): void;
}

export enum EditorPageRoute {
  Home = "/home",
  Document = "/editor",
}

export interface EditorLocationPort {
  read(): string;
  write(route: EditorPageRoute, appendHistory: boolean): void;
  subscribe(onChange: () => void): () => void;
}

export interface EditorPlatformPorts {
  startupScreen?: StartupScreenPort;
  navigation: { openExternal(url: string): void; location?: EditorLocationPort };
  colorSampling?: ColorSamplingPort;
  userPresets?: UserPresetStoragePort;
  shortcutFiles?: ShortcutFilePort;
  preferences: PreferenceStoragePort;
  input: EditorInputPort;
  canvasRendering: CanvasRenderingPort;
  canvasInput: CanvasInputPort;
  wheelInput: EditorWheelInputPort;
  font: EditorFontPort;
  files: EditorFilePort;
}

export interface StartupScreenPort {
  readonly available: boolean;
  retain(): () => void;
}
