import type { ShowcaseDevice } from "$/managers/showcase/showcase-device";
import type { ShowcaseLanguage } from "$/managers/showcase/showcase-language";

export type ShowcaseTrailMount = (canvas: HTMLCanvasElement, surface: HTMLElement) => () => void;
export const SHOWCASE_OVERVIEW_TOP_PROPERTY = "--film-overview-top";
export const SHOWCASE_FOCUSED_TOP_PROPERTY = "--film-focused-top";

export interface ShowcaseIntroMotion {
  dispose(): void;
}

export type ShowcaseIntroMount = (
  host: HTMLElement,
  rows: readonly HTMLElement[],
) => ShowcaseIntroMotion;

export interface ShowcaseMusic {
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  dispose(): void;
}

export interface ShowcaseScene {
  render(time: number): void;
  needsFrame(): boolean;
  observeInvalidation(callback: () => void): () => void;
  isDemoReady(): boolean;
  setDevice(device: ShowcaseDevice): void;
  previewDevice(device?: ShowcaseDevice): void;
  observeDeviceSelection(callback: (device: ShowcaseDevice) => void): () => void;
  beginDrag(): void;
  previewDrag(progress: number): void;
  setLanguage(language: ShowcaseLanguage): Promise<void>;
  dispose(): void;
}

export interface ShowcasePort {
  readMusicMuted(): boolean;
  readMusicVolume(): number | undefined;
  saveMusicVolume(volume: number): void;
  mountMusic(muted: boolean, volume: number, onUnavailable: () => void): ShowcaseMusic;
  mount(
    element: HTMLElement,
    language: ShowcaseLanguage,
    signal: AbortSignal,
  ): Promise<ShowcaseScene>;
  readLanguage(): ShowcaseLanguage;
  applyLanguage(language: ShowcaseLanguage): void;
  observeLanguage(callback: (language: ShowcaseLanguage) => void): () => void;
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  prefersReducedMotion(): boolean;
  observeVisibility(element: HTMLElement, callback: (visible: boolean) => void): () => void;
  observeDeviceNavigation(
    element: HTMLElement,
    callback: (direction: number) => void,
    enabled: () => boolean,
  ): () => void;
}

/** Screen-space geometry; all points are normalized with a top-left origin. */
export interface ShowcaseScreenContent {
  /** Artwork rectangle in normalized screen coordinates after capture containment. */
  readonly artworkBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}
