export interface ColorSamplingPoint {
  x: number;
  y: number;
}

interface ColorDragCallbacks {
  move(point: ColorSamplingPoint): void;
  finish(point: ColorSamplingPoint): void;
  cancel(): void;
}

export interface ColorSamplingPort {
  screenAvailable(): boolean;
  pickScreen(signal: AbortSignal): Promise<string | null>;
  hitTest(point: ColorSamplingPoint): Element | null;
  /** Returns a disposer that cancels the drag and releases input capture. */
  captureDrag(element: HTMLElement, pointerId: number, callbacks: ColorDragCallbacks): () => void;
}
