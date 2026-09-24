/** PNG output naming shared by file adapters; preserve non-format dotted names. */
export function pngFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "untitled.png";
  if (/\.png$/i.test(trimmed)) return trimmed;
  const stem = trimmed.replace(/\.(?:jpe?g|gif|bmp|webp|avif|tiff?|ico|aseprite|ase)$/i, "");
  return `${stem || "untitled"}.png`;
}

/** Lightweight Aseprite filename check shared by file and session adapters. */
export function isAsepriteFileName(name: string): boolean {
  return /\.(?:ase|aseprite)$/i.test(name);
}

export function asepriteFileName(name: string): string {
  const clean = name.trim() || "Untitled.aseprite";
  return isAsepriteFileName(clean)
    ? clean
    : `${clean.replace(/\.[^./\\]*$/, "") || "Untitled"}.aseprite`;
}
