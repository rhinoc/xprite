import type { HelloSpriteProject } from "$/adapters/showcase/hello-sprite-project";
import {
  createIphoneHome,
  drawIphoneAppIcon,
  drawIphoneStatus,
  drawIphoneHomeIndicator,
  IPHONE_HOME_ICON,
} from "$/adapters/showcase/iphone-chrome";
import { drawMacBrowserChrome } from "$/adapters/showcase/mac-browser-chrome";
import {
  DEVICE_DEMO_TIME as TIME,
  DEVICE_DISPLAY,
  MAC_BROWSER_LAYOUT,
} from "$/managers/ports/device-demo";
import type { CapturedDevice, DemoPoint, DeviceCaptureLayout } from "$/managers/ports/device-demo";
import { CREATE_TIMING, LAUNCH_TIMING, launchFrame } from "$/managers/ports/ipad-launch-motion";
import { ACTIVE_WALLPAPER } from "$/managers/ports/ipad-wallpapers";
import { ShowcaseDevice } from "$/managers/showcase/showcase-device";
import { ShowcaseLanguage } from "$/managers/showcase/showcase-language";
import { getCursorArtwork } from "@xprite/ui/cursor";

const ASSET_ROOT = "/showcase/devices";
const FRAME_COUNT = 8;
const MILLISECONDS = 1000;
const CURSOR_SCALE = 3;
const CURSOR_CENTER_OFFSET = Math.floor(CURSOR_SCALE / 2);
const APP_BACKGROUND = "#8499a2";
const PHONE_STATUS_BACKGROUND = "#cbc7b8";
const BROWSER_BACKGROUND = "#f7f7f8";
const ADDRESS = "xprite.cc";
const ADDRESS_POINT = {
  x: 0.5,
  y: MAC_BROWSER_LAYOUT.toolbarCenterY / DEVICE_DISPLAY[ShowcaseDevice.Computer].height,
} as const;
const POINTER_START = { x: 0.82, y: 0.54 } as const;
const PLAY_APPROACH = 26.25;
const POINTER_EXIT = 28.25;
enum CaptureView {
  Home = "home",
  Create = "create",
  Editor = "editor",
  Animation = "animation",
}
const CAPTURE_NAMES = Object.values(CaptureView);
const smooth = (start: number, end: number, time: number) => {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
};
const between = (a: DemoPoint, b: DemoPoint, t: number): DemoPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export interface DemoPointer {
  point: DemoPoint;
  visible: boolean;
  contact: number;
  lift: number;
  drawing: boolean;
}

/** Device-sized native editor captures, with authored browser/system chrome and input motion. */
export class DeviceDemoScreen {
  readonly canvas = document.createElement("canvas");
  readonly ready: Promise<void>;
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly layouts = new Map<ShowcaseLanguage, DeviceCaptureLayout>();
  private readonly cancelImages = new Set<() => void>();
  private readonly abort = new AbortController();
  private readonly languageLoads = new Map<ShowcaseLanguage, Promise<void>>();
  private requestedLanguage: ShowcaseLanguage;
  private readonly display: (typeof DEVICE_DISPLAY)[CapturedDevice];
  private lastTime = -Infinity;
  private lastPaintKey: string | undefined;
  private phoneHome?: HTMLCanvasElement;
  private computerBackground?: HTMLCanvasElement;
  private computerBackgroundContext?: CanvasRenderingContext2D;
  private lastBackgroundKey?: string;
  private loaded = false;
  private disposed = false;

  constructor(
    readonly device: CapturedDevice,
    private language: ShowcaseLanguage,
    private readonly project: HelloSpriteProject,
  ) {
    this.requestedLanguage = language;
    this.display = DEVICE_DISPLAY[device];
    this.canvas.width = this.display.width;
    this.canvas.height = this.display.height;
    const context = this.canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Device display needs a 2D canvas");
    this.context = context;
    this.ready = this.load().then(() => {
      this.loaded = true;
    });
  }

  private loadLanguage(language: ShowcaseLanguage): Promise<void> {
    const existing = this.languageLoads.get(language);
    if (existing) return existing;
    const load = (async () => {
      const root = `${ASSET_ROOT}/${this.device}/${language}`;
      const response = await fetch(`${root}/layout.json`, { signal: this.abort.signal });
      if (!response.ok) throw new Error(`Missing ${this.device} capture layout`);
      const layout = (await response.json()) as DeviceCaptureLayout;
      if (layout.width !== this.display.width || layout.height !== this.display.appHeight)
        throw new Error("Device capture aspect ratio differs from the display");
      this.layouts.set(language, layout);
      await Promise.all(
        [
          ...CAPTURE_NAMES,
          ...Array.from({ length: FRAME_COUNT }, (_, i) => `playback/${i + 1}`),
        ].map((name) => this.loadImage(`${language}/${name}`, `${root}/${name}.png`, true)),
      );
    })();
    this.languageLoads.set(language, load);
    return load;
  }

  private async load() {
    await Promise.all([
      this.project.ready,
      this.loadLanguage(this.language),
      this.loadImage("icon", "/icon.svg"),
      ...(this.device === ShowcaseDevice.Phone
        ? [this.loadImage("wallpaper", ACTIVE_WALLPAPER.url)]
        : (["normal", "crosshair"] as const).map((role) =>
            this.loadImage(
              role,
              `data:image/svg+xml,${encodeURIComponent(getCursorArtwork(role).svg)}`,
            ),
          )),
    ]);
  }

  get isReady(): boolean {
    return this.loaded && this.language === this.requestedLanguage;
  }

  private loadImage(key: string, url: string, capture = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        this.cancelImages.delete(cancel);
      };
      const cancel = () => {
        cleanup();
        image.removeAttribute("src");
        reject(new DOMException("Disposed", "AbortError"));
      };
      image.onload = () => {
        cleanup();
        if (
          capture &&
          (image.naturalWidth !== this.display.width ||
            image.naturalHeight !== this.display.appHeight)
        )
          reject(new Error(`Incorrect native capture dimensions: ${url}`));
        else resolve();
      };
      image.onerror = () => {
        cleanup();
        reject(new Error(`Unable to load device display: ${url}`));
      };
      if (this.disposed) return cancel();
      this.cancelImages.add(cancel);
      this.images.set(key, image);
      image.src = url;
    });
  }

  private point(point: DemoPoint): DemoPoint {
    return {
      x: point.x / this.display.width,
      y: (point.y + this.display.appTop) / this.display.height,
    };
  }

  pointer(time: number): DemoPointer {
    const layout = this.layouts.get(this.language)!;
    const start = this.device === ShowcaseDevice.Phone ? IPHONE_HOME_ICON : ADDRESS_POINT;
    let point: DemoPoint = start;
    let contact = 0;
    let lift = 0;
    let visible = time >= TIME.address && time < POINTER_EXIT;
    const drawing = time >= TIME.writing && time < TIME.written;
    if (time < TIME.opened) {
      if (this.device === ShowcaseDevice.Phone) {
        const launch = launchFrame(time);
        visible = launch.handVisible;
        contact = launch.handPress * (1 - launch.handLift);
        lift = 1 - launch.handApproach + launch.handRetreat;
      } else {
        point = between(POINTER_START, start, smooth(TIME.address - 0.25, TIME.address, time));
        contact =
          smooth(TIME.address - 0.1, TIME.address, time) *
          (1 - smooth(TIME.address, TIME.typing, time));
      }
    } else if (time < CREATE_TIMING.dialog) {
      point = between(
        start,
        this.point(layout.targets.newSprite),
        smooth(CREATE_TIMING.enter, CREATE_TIMING.hover, time),
      );
      contact =
        smooth(CREATE_TIMING.press, CREATE_TIMING.touch, time) *
        (1 - smooth(CREATE_TIMING.release, CREATE_TIMING.lifted, time));
      lift =
        this.device === ShowcaseDevice.Phone
          ? 1 - smooth(CREATE_TIMING.enter, CREATE_TIMING.hover, time)
          : 0;
    } else if (time < TIME.created) {
      point = between(
        this.point(layout.targets.newSprite),
        this.point(layout.targets.create),
        smooth(CREATE_TIMING.move, CREATE_TIMING.arrive, time),
      );
      contact =
        smooth(CREATE_TIMING.confirmPress, CREATE_TIMING.confirmTouch, time) *
        (1 - smooth(CREATE_TIMING.confirmRelease, CREATE_TIMING.confirmLifted, time));
      if (this.device === ShowcaseDevice.Phone)
        lift = smooth(CREATE_TIMING.confirmRelease, TIME.created, time);
    } else if (time < TIME.written) {
      const pen = this.point(
        this.project.pencilPosition(
          Math.max(0, time - TIME.writing) * MILLISECONDS,
          layout.artwork,
        ),
      );
      point = between(this.point(layout.targets.create), pen, smooth(13, TIME.writing, time));
      lift = 1 - smooth(13, TIME.writing, time);
      contact = drawing ? 1 : 0;
      visible = time >= 13;
    } else {
      const pen = this.point(
        this.project.pencilPosition((TIME.written - TIME.writing) * MILLISECONDS, layout.artwork),
      );
      point = between(
        pen,
        this.point(layout.targets.play),
        smooth(TIME.written, PLAY_APPROACH, time),
      );
      contact =
        smooth(PLAY_APPROACH, TIME.play, time) * (1 - smooth(TIME.play, TIME.play + 0.2, time));
      lift = smooth(TIME.play + 0.25, POINTER_EXIT, time);
      if (this.device === ShowcaseDevice.Computer)
        point = between(point, { x: 1.08, y: 1.04 }, lift);
    }
    return { point, contact, lift, visible, drawing };
  }

  render(time: number): boolean {
    if (!this.loaded || this.disposed || time === this.lastTime) return false;
    const paintKey = this.paintKey(time);
    this.lastTime = time;
    if (paintKey !== undefined && paintKey === this.lastPaintKey) return false;
    this.lastPaintKey = paintKey;
    const c = this.context;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.device === ShowcaseDevice.Computer) this.drawComputerBackground(time);
    else this.drawPhone(time);
    if (this.device === ShowcaseDevice.Computer) this.drawCursor(this.pointer(time));
    return true;
  }

  private paintKey(time: number): string | undefined {
    if (time >= POINTER_EXIT)
      return `playback:${this.project.animationFrameAt((time - TIME.play) * MILLISECONDS)}`;
    // The phone's hand is a separate 3D layer; its motion does not change the screen pixels.
    if (this.device !== ShowcaseDevice.Phone) return time < TIME.address ? "browser" : undefined;
    if (time < LAUNCH_TIMING.press) return "desktop";
    if (time < TIME.opened) return undefined;
    return this.applicationPaintKey(time);
  }

  private applicationPaintKey(time: number): string {
    if (time < TIME.dialog) return CaptureView.Home;
    if (time < TIME.created) return CaptureView.Create;
    if (time < TIME.written)
      return `writing:${this.project.writingFrameIndexAt((time - TIME.writing) * MILLISECONDS)}`;
    if (time < TIME.play) return CaptureView.Animation;
    return `playback:${this.project.animationFrameAt((time - TIME.play) * MILLISECONDS)}`;
  }

  private drawApplication(time: number, c = this.context) {
    const layout = this.layouts.get(this.language)!;
    let name: string =
      time < TIME.dialog
        ? CaptureView.Home
        : time < TIME.created
          ? CaptureView.Create
          : time < TIME.written
            ? CaptureView.Editor
            : CaptureView.Animation;
    if (time >= TIME.play)
      name = `playback/${this.project.animationFrameAt((time - TIME.play) * MILLISECONDS) + 1}`;
    // Captured at these exact viewport dimensions: no contain/cover, cropping, or letterboxing.
    c.drawImage(this.images.get(`${this.language}/${name}`)!, 0, this.display.appTop);
    if (time >= TIME.created && time < TIME.written)
      this.project.drawWriting(
        c,
        { ...layout.artwork, y: layout.artwork.y + this.display.appTop },
        (time - TIME.writing) * MILLISECONDS,
      );
  }

  private drawComputerBackground(time: number) {
    if (!this.computerBackground) {
      this.computerBackground = document.createElement("canvas");
      this.computerBackground.width = this.canvas.width;
      this.computerBackground.height = this.canvas.height;
      const context = this.computerBackground.getContext("2d", { alpha: false });
      if (!context) throw new Error("Computer display needs a background canvas");
      this.computerBackgroundContext = context;
    }
    const typed = Math.floor(smooth(TIME.typing, TIME.typed, time) * ADDRESS.length);
    const active = time >= TIME.typing && time < TIME.opened;
    const application = time >= TIME.opened ? this.applicationPaintKey(time) : "browser";
    const key = `${this.language}:${typed}:${active}:${application}`;
    if (key !== this.lastBackgroundKey) {
      this.lastBackgroundKey = key;
      this.drawComputer(time, this.computerBackgroundContext!);
    }
    this.context.drawImage(this.computerBackground, 0, 0);
  }

  private drawComputer(time: number, c: CanvasRenderingContext2D) {
    const { width, height } = this.display;
    c.fillStyle = BROWSER_BACKGROUND;
    c.fillRect(0, 0, width, height);
    const typed = Math.floor(smooth(TIME.typing, TIME.typed, time) * ADDRESS.length);
    drawMacBrowserChrome(
      c,
      width,
      this.language,
      ADDRESS.slice(0, typed),
      time >= TIME.typing && time < TIME.opened,
    );
    if (time >= TIME.opened) this.drawApplication(time, c);
  }

  private drawPhone(time: number) {
    const c = this.context;
    const { width, height } = this.display;
    const launch = launchFrame(time);
    const size = IPHONE_HOME_ICON.size * launch.iconScale;
    const x = IPHONE_HOME_ICON.x * width;
    const y = IPHONE_HOME_ICON.y * height;
    this.phoneHome ??= createIphoneHome(this.images.get("wallpaper")!, this.language);
    c.save();
    c.translate(width / 2, height / 2);
    c.scale(launch.desktopScale, launch.desktopScale);
    c.translate(-width / 2, -height / 2);
    c.globalAlpha = 1 - launch.progress * 0.25;
    c.drawImage(this.phoneHome, 0, 0);
    drawIphoneAppIcon(c, this.images.get("icon")!, size);
    c.restore();
    if (time >= LAUNCH_TIMING.open) {
      const progress = launch.progress;
      c.save();
      c.translate(
        (x - IPHONE_HOME_ICON.size / 2) * (1 - progress),
        (y - IPHONE_HOME_ICON.size / 2) * (1 - progress),
      );
      // The reveal window grows from the icon; the app itself always keeps its aspect ratio.
      const contentScale =
        (IPHONE_HOME_ICON.size + (width - IPHONE_HOME_ICON.size) * progress) / width;
      const revealHeight =
        (IPHONE_HOME_ICON.size + (height - IPHONE_HOME_ICON.size) * progress) / contentScale;
      c.scale(contentScale, contentScale);
      c.beginPath();
      c.roundRect(0, 0, width, revealHeight, (14 * (1 - progress)) / contentScale);
      c.clip();
      c.fillStyle = APP_BACKGROUND;
      c.fillRect(0, 0, width, height);
      c.fillStyle = PHONE_STATUS_BACKGROUND;
      c.fillRect(0, 0, width, this.display.appTop);
      this.drawApplication(Math.max(time, TIME.opened));
      c.restore();
    }
    drawIphoneStatus(c, time < TIME.opened);
    if (time >= TIME.opened) drawIphoneHomeIndicator(c);
  }

  private drawCursor(pointer: DemoPointer) {
    if (!pointer.visible) return;
    const role = pointer.drawing ? "crosshair" : "normal";
    const artwork = getCursorArtwork(role);
    const x = pointer.point.x * this.canvas.width;
    const y = pointer.point.y * this.canvas.height;
    const c = this.context;
    if (pointer.contact > 0 && !pointer.drawing) {
      c.strokeStyle = `rgba(255,85,85,${pointer.contact})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 18 - pointer.contact * 4, 0, Math.PI * 2);
      c.stroke();
    }
    c.imageSmoothingEnabled = false;
    c.drawImage(
      this.images.get(role)!,
      x - artwork.hotspot.x * CURSOR_SCALE - CURSOR_CENTER_OFFSET,
      y - artwork.hotspot.y * CURSOR_SCALE - CURSOR_CENTER_OFFSET,
      artwork.width * CURSOR_SCALE,
      artwork.height * CURSOR_SCALE,
    );
  }

  async setLanguage(language: ShowcaseLanguage): Promise<void> {
    this.requestedLanguage = language;
    await Promise.all([this.ready, this.loadLanguage(language)]);
    if (this.disposed || this.requestedLanguage !== language || this.language === language) return;
    this.language = language;
    this.phoneHome = undefined;
    this.lastTime = -Infinity;
    this.lastPaintKey = undefined;
    this.lastBackgroundKey = undefined;
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    for (const cancel of this.cancelImages) cancel();
    this.images.clear();
    this.phoneHome = undefined;
    if (this.computerBackground) this.computerBackground.width = this.computerBackground.height = 1;
    this.computerBackground = undefined;
    this.computerBackgroundContext = undefined;
    this.languageLoads.clear();
    this.canvas.width = this.canvas.height = 1;
  }
}
