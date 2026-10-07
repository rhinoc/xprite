import type { PixelBuffer } from "@xprite/editor-core";

/** Actual cursor artwork and hotspot at its recorded native display size. */
export interface ReplayCursorAppearance {
  source: string;
  width: number;
  height: number;
  hotspot: { x: number; y: number };
}
export interface ReplayPointerOverlay {
  point: { x: number; y: number };
  cursor: ReplayCursorAppearance;
}

export interface ReplayCursorPresentation extends ReplayCursorAppearance {
  point: { x: number; y: number };
}

export interface ReplayPort {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  yieldTask(): Promise<void>;
  setTimer(callback: () => void, milliseconds: number): number;
  clearTimer(id: number): void;
  onSuspend(callback: () => void): () => void;
  onResume(callback: () => void): () => void;
  observeInput(onKeys: (keys: string) => void, onCursorChange: () => void): () => void;
  cursor(): ReplayCursorAppearance | null;
  modifiers(): string | null;
  pointerPlacement(
    canvas: HTMLCanvasElement,
    pixels: PixelBuffer,
    pointer: ReplayPointerOverlay,
  ): ReplayCursorPresentation | null;
  pick(): Promise<Uint8Array | null>;
  download(bytes: Uint8Array, name: string, mime: string): void;
  paint(canvas: HTMLCanvasElement, pixels: PixelBuffer): void;
}
