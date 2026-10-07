import type { HelloSpriteProject } from "$/adapters/showcase/hello-sprite-project";
import { drawIpadStatusBar } from "$/adapters/showcase/ipad-system-chrome";
import { DEVICE_DEMO_TIME } from "$/managers/ports/device-demo";
import { CREATE_TIMING, LAUNCH_TIMING, launchFrame } from "$/managers/ports/ipad-launch-motion";
import { SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_TARGETS } from "$/managers/ports/ipad-screen-layout";
import { ACTIVE_WALLPAPER } from "$/managers/ports/ipad-wallpapers";
import type { ShowcaseScreenContent } from "$/managers/ports/showcase";
import { SHOWCASE_COPY, ShowcaseLanguage } from "$/managers/showcase/showcase-language";

const FILM = {
  unlock: 4.4,
  desktop: 5.5,
  open: LAUNCH_TIMING.open,
  opened: LAUNCH_TIMING.opened,
  dialog: CREATE_TIMING.dialog,
  created: 11.35,
  draw: 16,
  drawn: 26,
  play: DEVICE_DEMO_TIME.play,
} as const;
const MILLISECONDS_PER_SECOND = 1000;
const APP_ICON_SIZE = (60 / 1389) * SCREEN_WIDTH;
const APP_ICON_LABEL_SIZE = 12;
const APP_ICON_LABEL_OFFSET = 16;
const APP_ICON_PRESSED_SCALE = 0.95;
const UI_SCALE = SCREEN_WIDTH / 1194;
const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';
const SCREEN_FOREGROUND = "#fff";
const LOCK_TIME = "9:41";
const ICON_BACKGROUND = "#f9fafc";
const APP_BACKGROUND = "#242331";
const CAPTURE_ROOTS = {
  [ShowcaseLanguage.Chinese]: `${import.meta.env.BASE_URL}showcase/ipad/screenshots/display/`,
  [ShowcaseLanguage.English]: `${import.meta.env.BASE_URL}showcase/ipad/screenshots/en/display/`,
} as const;
const CAPTURE_REVISION = "color-managed-2026-10-04";
enum ScreenAsset {
  Home = "home",
  Create = "create",
  Editor = "editor",
  Animation = "animation",
  Icon = "icon",
  Wallpaper = "wallpaper",
}
function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
function smooth(start: number, end: number, time: number): number {
  const t = clamp((time - start) / (end - start));
  return t * t * (3 - 2 * t);
}
function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

/** Licensed wallpaper, editable device UI, and native Xprite product captures. */
export class IpadScreen {
  readonly canvas = document.createElement("canvas");
  readonly ready: Promise<void>;
  private readonly context: CanvasRenderingContext2D;
  private readonly languageLoads = new Map<ShowcaseLanguage, Promise<void>>();
  private requestedLanguage: ShowcaseLanguage;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly pendingImageLoads = new Set<() => void>();
  private disposed = false;
  private loaded = false;
  private lastPaintKey: string | undefined;
  private readonly artworkBounds: ShowcaseScreenContent["artworkBounds"];

  constructor(
    content: ShowcaseScreenContent,
    private language: ShowcaseLanguage,
    private readonly project: HelloSpriteProject,
  ) {
    this.requestedLanguage = language;
    this.artworkBounds = content.artworkBounds;
    this.canvas.width = SCREEN_WIDTH;
    this.canvas.height = SCREEN_HEIGHT;
    const context = this.canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("The iPad film needs a 2D canvas.");
    this.context = context;
    this.ready = Promise.all([
      this.project.ready,
      this.loadLanguage(language),
      this.loadImage(ScreenAsset.Icon, `${import.meta.env.BASE_URL}icon.svg`),
      this.loadImage(ScreenAsset.Wallpaper, ACTIVE_WALLPAPER.url),
    ]).then(() => {
      this.loaded = true;
    });
  }

  private loadLanguage(language: ShowcaseLanguage): Promise<void> {
    const existing = this.languageLoads.get(language);
    if (existing) return existing;
    const load = Promise.all([
      ...[ScreenAsset.Home, ScreenAsset.Create, ScreenAsset.Editor, ScreenAsset.Animation].map(
        (asset) =>
          this.loadImage(
            `${language}/${asset}`,
            `${CAPTURE_ROOTS[language]}${asset}.png?v=${CAPTURE_REVISION}`,
          ),
      ),
      this.project.ready.then(() =>
        Promise.all(
          Array.from({ length: this.project.frameCount }, (_, index) =>
            this.loadImage(
              `${language}/${this.playbackKey(index)}`,
              `${CAPTURE_ROOTS[language]}playback/${index + 1}.png?v=${CAPTURE_REVISION}`,
            ),
          ),
        ),
      ),
    ]).then(() => {});
    this.languageLoads.set(language, load);
    return load;
  }

  get isReady(): boolean {
    return this.loaded && this.language === this.requestedLanguage;
  }

  private loadImage(asset: string, source: string): Promise<void> {
    if (this.disposed) return Promise.reject(new DOMException("Screen disposed", "AbortError"));
    return new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        this.pendingImageLoads.delete(cancel);
        image.onload = null;
        image.onerror = null;
      };
      const cancel = () => {
        cleanup();
        image.removeAttribute("src");
        reject(new DOMException("The iPad screen was disposed.", "AbortError"));
      };
      image.onload = () => {
        cleanup();
        resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error(`Unable to load iPad showcase asset: ${source}`));
      };
      this.pendingImageLoads.add(cancel);
      this.images.set(asset, image);
      image.src = source;
    });
  }

  private paintKey(time: number): string | undefined {
    if (time < FILM.opened) return undefined;
    if (time < FILM.dialog) return ScreenAsset.Home;
    if (time < FILM.created) return ScreenAsset.Create;
    if (time < FILM.drawn)
      return `writing:${this.project.writingFrameIndexAt((time - FILM.draw) * MILLISECONDS_PER_SECOND)}`;
    if (time < FILM.play) return ScreenAsset.Animation;
    return this.playbackKey(
      this.project.animationFrameAt((time - FILM.play) * MILLISECONDS_PER_SECOND),
    );
  }

  render(time: number): boolean {
    if (!this.loaded || this.disposed) return false;
    const key = this.paintKey(time);
    if (key !== undefined && key === this.lastPaintKey) return false;
    this.lastPaintKey = key;
    const c = this.context;
    c.globalAlpha = 1;
    c.filter = "none";
    c.fillStyle = APP_BACKGROUND;
    c.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    if (time < FILM.opened) {
      c.save();
      if (time < FILM.desktop) this.drawWallpaper(time);
      if (time > FILM.unlock) this.drawDesktop(time);
      if (time < FILM.desktop) this.drawLockScreen(time);
      c.restore();
    }
    if (time >= FILM.open) this.drawApplication(time);
    return true;
  }

  private drawWallpaper(time: number): void {
    const c = this.context;
    const wallpaper = this.images.get(ScreenAsset.Wallpaper);
    const unlock = smooth(FILM.unlock, FILM.desktop, time);
    const zoom = 1.065 - unlock * 0.065;
    const offsetY = (1 - unlock) * 12 * UI_SCALE;
    c.save();
    c.filter = `blur(${Math.sin(unlock * Math.PI) * 3}px)`;
    if (wallpaper?.complete && wallpaper.naturalWidth) {
      const scale =
        Math.max(SCREEN_WIDTH / wallpaper.naturalWidth, SCREEN_HEIGHT / wallpaper.naturalHeight) *
        zoom;
      const width = wallpaper.naturalWidth * scale;
      const height = wallpaper.naturalHeight * scale;
      c.drawImage(
        wallpaper,
        (SCREEN_WIDTH - width) / 2,
        (SCREEN_HEIGHT - height) * ACTIVE_WALLPAPER.positionY + offsetY,
        width,
        height,
      );
    }
    c.restore();
    const shade = c.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    shade.addColorStop(0, "rgba(3,12,29,0.17)");
    shade.addColorStop(0.65, "rgba(3,12,29,0)");
    shade.addColorStop(1, "rgba(3,12,29,0.17)");
    c.fillStyle = shade;
    c.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  private drawLockScreen(time: number): void {
    const c = this.context;
    const progress = smooth(FILM.unlock, FILM.desktop, time);
    c.save();
    c.globalAlpha *= 1 - smooth(FILM.unlock + 0.1, FILM.desktop - 0.1, time);
    c.translate(0, -progress * SCREEN_HEIGHT * 0.84);
    c.textAlign = "center";
    c.fillStyle = SCREEN_FOREGROUND;
    c.shadowColor = "rgba(6,17,34,.16)";
    c.shadowBlur = 12 * UI_SCALE;
    c.font = `500 ${24 * UI_SCALE}px ${SYSTEM_FONT}`;
    c.fillText(SHOWCASE_COPY[this.language].lockDate, SCREEN_WIDTH / 2, SCREEN_HEIGHT * 0.205);
    c.font = `600 ${122 * UI_SCALE}px ${SYSTEM_FONT}`;
    c.fillText(LOCK_TIME, SCREEN_WIDTH / 2, SCREEN_HEIGHT * 0.345);
    c.shadowColor = "transparent";
    const lockX = SCREEN_WIDTH / 2;
    const lockY = SCREEN_HEIGHT * 0.117;
    c.strokeStyle = SCREEN_FOREGROUND;
    c.lineWidth = 3.2 * UI_SCALE;
    c.lineCap = "round";
    roundedRect(c, lockX - 9 * UI_SCALE, lockY, 18 * UI_SCALE, 15 * UI_SCALE, 4 * UI_SCALE);
    c.fill();
    c.save();
    c.translate(lockX + 7 * UI_SCALE, lockY - 4 * UI_SCALE);
    c.beginPath();
    c.moveTo(-6 * UI_SCALE, 0);
    c.lineTo(-6 * UI_SCALE, -6 * UI_SCALE);
    c.arc(0, -6 * UI_SCALE, 6 * UI_SCALE, Math.PI, 0);
    c.lineTo(6 * UI_SCALE, -4 * UI_SCALE);
    c.stroke();
    c.restore();
    c.font = `400 ${18 * UI_SCALE}px ${SYSTEM_FONT}`;
    c.fillText(
      SHOWCASE_COPY[this.language].unlock,
      SCREEN_WIDTH / 2,
      SCREEN_HEIGHT - 54 * UI_SCALE,
    );
    this.drawHomeIndicator(SCREEN_FOREGROUND);
    c.restore();
    c.save();
    c.globalAlpha *= 1 - progress;
    drawIpadStatusBar(c, SCREEN_WIDTH, SCREEN_HEIGHT, {
      showTime: false,
      time: LOCK_TIME,
      date: SHOWCASE_COPY[this.language].lockDate,
    });
    c.restore();
  }

  private drawDesktop(time: number): void {
    const c = this.context;
    const launch = launchFrame(time);
    const opening = launch.progress;
    const reveal = smooth(FILM.unlock + 0.08, FILM.desktop - 0.2, time);
    const scale = launch.desktopScale + (1 - reveal) * 0.055;
    c.save();
    c.globalAlpha *= reveal * (1 - opening * 0.7);
    c.filter = `blur(${(1 - reveal) * 2 + launch.desktopBlur}px)`;
    c.translate(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    c.scale(scale, scale);
    c.translate(-SCREEN_WIDTH / 2, -SCREEN_HEIGHT / 2);
    this.drawWallpaper(time);
    this.drawXpriteIcon(time);
    drawIpadStatusBar(c, SCREEN_WIDTH, SCREEN_HEIGHT, {
      showTime: true,
      time: LOCK_TIME,
      date: SHOWCASE_COPY[this.language].statusDate,
    });
    this.drawHomeIndicator(SCREEN_FOREGROUND);
    c.restore();
  }

  private drawXpriteIcon(time: number): void {
    const image = this.images.get(ScreenAsset.Icon);
    if (!image?.complete || !image.naturalWidth) return;
    const c = this.context;
    const x = SCREEN_TARGETS.app.x * SCREEN_WIDTH;
    const y = SCREEN_TARGETS.app.y * SCREEN_HEIGHT;
    const size = APP_ICON_SIZE * launchFrame(time).iconScale;
    c.save();
    roundedRect(c, x - size / 2, y - size / 2, size, size, size * 0.225);
    c.clip();
    c.drawImage(image, x - size / 2, y - size / 2, size, size);
    c.restore();
    c.save();
    c.fillStyle = SCREEN_FOREGROUND;
    c.textAlign = "center";
    c.font = `400 ${APP_ICON_LABEL_SIZE}px ${SYSTEM_FONT}`;
    c.shadowColor = "rgba(0,0,0,.35)";
    c.shadowBlur = 2;
    c.shadowOffsetY = 1;
    c.fillText("Xprite", x, y + APP_ICON_SIZE / 2 + APP_ICON_LABEL_OFFSET);
    c.restore();
  }

  private drawHomeIndicator(color: string): void {
    const c = this.context;
    c.fillStyle = color;
    const width = 186 * UI_SCALE;
    roundedRect(
      c,
      (SCREEN_WIDTH - width) / 2,
      SCREEN_HEIGHT - 13 * UI_SCALE,
      width,
      4 * UI_SCALE,
      2 * UI_SCALE,
    );
    c.fill();
  }

  private playbackKey(index: number): string {
    return `playback:${index}`;
  }

  pencilPosition(time: number) {
    return this.project.pencilPosition(
      (time - FILM.draw) * MILLISECONDS_PER_SECOND,
      this.artworkBounds,
    );
  }

  private drawApplication(time: number): void {
    const c = this.context;
    const launch = launchFrame(time);
    const startSize = APP_ICON_SIZE * APP_ICON_PRESSED_SCALE;
    const width = startSize + (SCREEN_WIDTH - startSize) * launch.progress;
    const height = startSize + (SCREEN_HEIGHT - startSize) * launch.progress;
    const x = (SCREEN_TARGETS.app.x * SCREEN_WIDTH - startSize / 2) * (1 - launch.progress);
    const y = (SCREEN_TARGETS.app.y * SCREEN_HEIGHT - startSize / 2) * (1 - launch.progress);
    c.save();
    roundedRect(c, x, y, width, height, startSize * 0.225 * (1 - launch.progress));
    c.clip();
    c.fillStyle = ICON_BACKGROUND;
    c.fillRect(x, y, width, height);
    const icon = this.images.get(ScreenAsset.Icon);
    if (launch.iconOpacity > 0 && icon?.complete) {
      c.globalAlpha = launch.iconOpacity;
      c.drawImage(
        icon,
        x + (width - startSize) / 2,
        y + (height - startSize) / 2,
        startSize,
        startSize,
      );
    }
    c.globalAlpha = launch.contentOpacity;
    c.translate(x, y);
    c.scale(width / SCREEN_WIDTH, height / SCREEN_HEIGHT);
    c.fillStyle = APP_BACKGROUND;
    c.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    let asset: string = ScreenAsset.Home;
    if (time >= FILM.dialog) asset = ScreenAsset.Create;
    if (time >= FILM.created)
      asset = time >= FILM.drawn ? ScreenAsset.Animation : ScreenAsset.Editor;
    if (time >= FILM.play) {
      const frame = this.project.animationFrameAt((time - FILM.play) * MILLISECONDS_PER_SECOND);
      asset = this.playbackKey(frame);
    }
    const capture = this.images.get(`${this.language}/${asset}`);
    if (capture?.complete && capture.naturalWidth)
      c.drawImage(capture, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    // Writing is exported from a real ASE process document. Playback captures
    // contain both the actual sprite and native timeline state for the same frame.
    if (time >= FILM.created && time < FILM.drawn)
      this.project.drawWriting(
        c,
        {
          x: this.artworkBounds.x * SCREEN_WIDTH,
          y: this.artworkBounds.y * SCREEN_HEIGHT,
          width: this.artworkBounds.width * SCREEN_WIDTH,
          height: this.artworkBounds.height * SCREEN_HEIGHT,
        },
        (time - FILM.draw) * MILLISECONDS_PER_SECOND,
      );
    c.restore();
  }

  async setLanguage(language: ShowcaseLanguage): Promise<void> {
    this.requestedLanguage = language;
    await Promise.all([this.ready, this.loadLanguage(language)]);
    if (this.disposed || this.requestedLanguage !== language || this.language === language) return;
    this.language = language;
    this.lastPaintKey = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.pendingImageLoads) cancel();
    for (const image of this.images.values()) {
      image.onload = null;
      image.onerror = null;
    }
    this.images.clear();
    this.languageLoads.clear();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
