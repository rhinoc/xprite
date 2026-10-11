import type { LocalFontsPort } from "$/managers/ports/local-fonts";
import { TextFontFamily } from "$/managers/tools/text-font";

export enum LocalFontCatalogStatus {
  Unavailable = "unavailable",
  PermissionRequired = "permission-required",
  Loading = "loading",
  Ready = "ready",
  Failed = "failed",
}

export interface FontCatalogState {
  readonly families: readonly string[];
  readonly bitmapSizes: ReadonlyMap<string, readonly number[]>;
  readonly status: LocalFontCatalogStatus;
}

const BUNDLED_FONT_FAMILIES = [
  TextFontFamily.Aseprite,
  TextFontFamily.AsepriteMini,
  TextFontFamily.FusionPixel,
];

function catalogFamilies(localFamilies: readonly string[]): readonly string[] {
  const seen = new Set(BUNDLED_FONT_FAMILIES.map((family) => family.toLowerCase()));
  const local: string[] = [];
  for (const name of localFamilies) {
    const family = name.trim();
    const key = family.toLowerCase();
    if (!family || seen.has(key)) continue;
    seen.add(key);
    local.push(family);
  }
  local.sort((left, right) => left.localeCompare(right));
  return [...BUNDLED_FONT_FAMILIES, ...local];
}

/** One permission and font catalog shared by every font picker in an editor. */
export class FontCatalogManager {
  private readonly listeners = new Set<() => void>();
  private state: FontCatalogState;
  private requestVersion = 0;
  private lifetime = 0;
  private readonly pendingBitmapReads = new Map<string, Promise<void>>();

  constructor(private readonly port?: LocalFontsPort) {
    this.state = {
      families: BUNDLED_FONT_FAMILIES,
      bitmapSizes: new Map(),
      status: port?.available()
        ? LocalFontCatalogStatus.PermissionRequired
        : LocalFontCatalogStatus.Unavailable,
    };
  }

  getState = (): FontCatalogState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Read an existing grant on startup without opening a permission prompt. */
  start(): () => void {
    this.pendingBitmapReads.clear();
    const lifetime = ++this.lifetime;
    const version = ++this.requestVersion;
    if (this.port?.available()) {
      void this.port
        .readGrantedFamilies()
        .then((families) => {
          if (lifetime === this.lifetime && version === this.requestVersion && families !== null)
            this.publish({
              families: catalogFamilies(families),
              bitmapSizes: new Map(),
              status: LocalFontCatalogStatus.Ready,
            });
        })
        .catch(() => {
          if (lifetime === this.lifetime && version === this.requestVersion)
            this.publish({ ...this.state, status: LocalFontCatalogStatus.Failed });
        });
    }
    return () => {
      if (lifetime === this.lifetime) this.lifetime++;
    };
  }

  /** Opening a font picker supplies the activation needed for its first grant. */
  requestLocalFonts = (): void => {
    if (
      !this.port?.available() ||
      this.state.status === LocalFontCatalogStatus.Loading ||
      this.state.status === LocalFontCatalogStatus.Ready
    )
      return;
    const version = ++this.requestVersion;
    const lifetime = this.lifetime;
    this.publish({ ...this.state, status: LocalFontCatalogStatus.Loading });
    void this.port
      .requestFamilies()
      .then((families) => {
        if (lifetime === this.lifetime && version === this.requestVersion)
          this.publish({
            families: catalogFamilies(families),
            bitmapSizes: new Map(),
            status: LocalFontCatalogStatus.Ready,
          });
      })
      .catch(() => {
        if (lifetime === this.lifetime && version === this.requestVersion)
          this.publish({ ...this.state, status: LocalFontCatalogStatus.Failed });
      });
  };

  readBitmapSizes = (family: string): void => {
    const key = family.trim().toLowerCase();
    if (
      !this.port ||
      this.state.status !== LocalFontCatalogStatus.Ready ||
      this.state.bitmapSizes.has(key) ||
      this.pendingBitmapReads.has(key) ||
      BUNDLED_FONT_FAMILIES.some((bundled) => bundled.toLowerCase() === key) ||
      !this.state.families.some((name) => name.toLowerCase() === key)
    )
      return;
    const version = this.requestVersion;
    const lifetime = this.lifetime;
    const pending: Promise<void> = this.port
      .readBitmapSizes(family)
      .then((sizes) => {
        if (version !== this.requestVersion || lifetime !== this.lifetime) return;
        const bitmapSizes = new Map(this.state.bitmapSizes);
        bitmapSizes.set(key, sizes);
        this.publish({ ...this.state, bitmapSizes });
      })
      .catch(() => {
        // Metadata access can fail independently of font enumeration. Keep free sizing.
      })
      .finally(() => {
        if (this.pendingBitmapReads.get(key) === pending) this.pendingBitmapReads.delete(key);
      });
    this.pendingBitmapReads.set(key, pending);
  };

  private publish(state: FontCatalogState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
