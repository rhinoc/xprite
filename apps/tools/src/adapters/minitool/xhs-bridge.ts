/**
 * The Xiaohongshu mini-tool container's `window.xhs.miniTool` bridge, feature-detected so the
 * same package runs in a normal browser for testing. Only the documented methods are used:
 * https://miniapp-sandbox.xiaohongshu.com/minitool/doc
 */
interface LaunchOptions {
  miniToolEnv?: { buildVersion?: number | string };
}

/** A container rect in logical pixels, origin at the container's top-left corner. */
interface WindowRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MiniToolWindowInfo {
  windowWidth?: number;
  windowHeight?: number;
  statusBarHeight?: number;
  safeArea?: WindowRect | null;
  /** Each native top button's rect, or null while that button is hidden. */
  menuButtons?: { back?: WindowRect | null; me?: WindowRect | null; share?: WindowRect | null };
}

interface MiniToolApi {
  getWindowInfo?(): Promise<MiniToolWindowInfo>;
  getLaunchOptions?(): Promise<LaunchOptions>;
  getStorage?(options: { key: string }): Promise<{ data?: string | null }>;
  setStorage?(options: { key: string; data: string }): Promise<unknown>;
  writeTempFile?(options: { data: string }): Promise<{ filePath: string }>;
  saveImageToPhotosAlbum?(options: { filePath: string }): Promise<unknown>;
  postNote?(options: {
    title?: string;
    content?: string;
    mediaInfo: { image_resources: { url: string }[] };
  }): Promise<unknown>;
}

interface XhsWindow {
  xhs?: { miniTool?: MiniToolApi; launchOptions?: LaunchOptions };
}

/** Client 9.46.0, the first with the Storage JS API (build numbers carry a 3-digit suffix). */
const STORAGE_CLIENT_VERSION = 9460;
/** Client 9.49.0, the first with getWindowInfo (window size, safe area, native top buttons). */
const WINDOW_INFO_CLIENT_VERSION = 9490;
/** The container recommends a temporary file over a long base64 string for large images. */
const INLINE_IMAGE_CHARACTERS = 512 * 1024;

class MiniToolUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MiniToolUnavailableError";
  }
}

function miniTool(): MiniToolApi | undefined {
  return (window as unknown as XhsWindow).xhs?.miniTool;
}

/** Whether the page runs inside the container, which draws its own buttons over the page top. */
export function hasMiniToolContainer(): boolean {
  return !!miniTool();
}

/** The container's window and native top-button geometry, or null when it cannot report it. */
export async function readMiniToolWindowInfo(): Promise<MiniToolWindowInfo | null> {
  const api = miniTool();
  if (typeof api?.getWindowInfo !== "function") return null;
  if ((await clientVersion()) < WINDOW_INFO_CLIENT_VERSION) return null;
  try {
    return (await api.getWindowInfo()) ?? null;
  } catch {
    return null;
  }
}

async function clientVersion(): Promise<number> {
  const xhs = (window as unknown as XhsWindow).xhs;
  let build = Number(xhs?.launchOptions?.miniToolEnv?.buildVersion) || 0;
  const api = miniTool();
  if (!build && typeof api?.getLaunchOptions === "function") {
    try {
      build = Number((await api.getLaunchOptions())?.miniToolEnv?.buildVersion) || 0;
    } catch {
      build = 0;
    }
  }
  return Math.floor(build / 1000);
}

/**
 * Synchronous key-value preferences: native Storage when the client supports it, otherwise
 * browser storage, which the container does not guarantee. Values load once before mounting.
 */
const preferences = new Map<string, string>();
let nativeStorage = false;

function readBrowserItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeBrowserItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Browser storage is only a fallback in the container; the value stays for this session.
  }
}

export async function loadMiniToolPreferences(keys: readonly string[]): Promise<void> {
  const api = miniTool();
  nativeStorage =
    typeof api?.getStorage === "function" &&
    typeof api.setStorage === "function" &&
    (await clientVersion()) >= STORAGE_CLIENT_VERSION;
  await Promise.all(
    keys.map(async (key) => {
      let value: string | null = null;
      if (nativeStorage) {
        try {
          const stored = (await api!.getStorage!({ key })).data;
          // Native values are JSON strings, so each preference is stored as a JSON string.
          value = typeof stored === "string" ? (JSON.parse(stored) as string) : null;
        } catch {
          value = null;
        }
      }
      value ??= readBrowserItem(key);
      if (value !== null) preferences.set(key, value);
    }),
  );
}

export const miniToolPreferences = {
  getItem: (key: string): string | null => preferences.get(key) ?? readBrowserItem(key),
  setItem(key: string, value: string) {
    preferences.set(key, value);
    writeBrowserItem(key, value);
    const api = miniTool();
    if (nativeStorage && api?.setStorage)
      void api.setStorage({ key, data: JSON.stringify(value) }).catch(() => undefined);
  },
};

async function localImagePath(api: MiniToolApi, dataUrl: string): Promise<string> {
  if (dataUrl.length <= INLINE_IMAGE_CHARACTERS || typeof api.writeTempFile !== "function")
    return dataUrl;
  return (await api.writeTempFile({ data: dataUrl })).filePath;
}

/** Save a PNG data URL to the system album; must run from a user gesture. */
export async function saveImageToAlbum(dataUrl: string): Promise<void> {
  const api = miniTool();
  if (typeof api?.saveImageToPhotosAlbum !== "function")
    throw new MiniToolUnavailableError("Open this tool in the Xiaohongshu app to save images.");
  await api.saveImageToPhotosAlbum({ filePath: await localImagePath(api, dataUrl) });
}

/** Open the note editor with the image attached; the user publishes or cancels there. */
export async function postImageNote(dataUrl: string): Promise<void> {
  const api = miniTool();
  if (typeof api?.postNote !== "function")
    throw new MiniToolUnavailableError("Open this tool in the Xiaohongshu app to post a note.");
  await api.postNote({
    mediaInfo: { image_resources: [{ url: await localImagePath(api, dataUrl) }] },
  });
}
