export interface LocalFontMetadata {
  readonly family: string;
  blob(): Promise<Blob>;
}

type LocalFontWindow = Window & {
  queryLocalFonts?: () => Promise<readonly LocalFontMetadata[]>;
};

const LOCAL_FONTS_PERMISSION = "local-fonts";

/** Local font enumeration requires a secure context and browser permission. */
export const browserLocalFonts = {
  available(): boolean {
    return (
      typeof window !== "undefined" &&
      window.isSecureContext &&
      typeof (window as LocalFontWindow).queryLocalFonts === "function"
    );
  },
  async permissionGranted(): Promise<boolean> {
    if (!this.available() || !navigator.permissions) return false;
    try {
      const permission = await navigator.permissions.query({
        name: LOCAL_FONTS_PERMISSION as PermissionName,
      });
      return permission.state === "granted";
    } catch {
      return false;
    }
  },
  /** Call directly from a user activation when permission has not been granted. */
  async query(): Promise<readonly LocalFontMetadata[]> {
    if (!this.available()) throw new Error("Local fonts unavailable");
    const query = (window as LocalFontWindow).queryLocalFonts;
    if (!query) throw new Error("Local fonts unavailable");
    return query.call(window);
  },
};
