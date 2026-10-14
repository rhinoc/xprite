const MAX_FILE_STEM = 120;
// Path separators, characters Windows/macOS reject, and control characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]+/g;

export enum BeadFileFormat {
  Png = "png",
  Pdf = "pdf",
}

/** A portable file stem: no folders, reserved characters, output extension or edge dots. */
export function sanitizeBeadFileStem(name: string): string {
  return name
    .replace(UNSAFE_FILE_CHARACTERS, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.(png|pdf)$/i, "")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, MAX_FILE_STEM)
    .trim();
}

/** Default output stem for a source file or sprite name, e.g. "hero.aseprite" → "hero-beads". */
export function defaultBeadFileStem(sourceName: string, fallback: string): string {
  return `${sanitizeBeadFileStem(sourceName.replace(/\.[^.]+$/, "")) || fallback}-beads`;
}

export function beadFileName(name: string, format: `${BeadFileFormat}`, fallback: string): string {
  return `${sanitizeBeadFileStem(name) || `${fallback}-beads`}.${format}`;
}
