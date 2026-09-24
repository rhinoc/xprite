type Glyphs = Readonly<Record<string, readonly number[]>>;

/** One shared LRU budget, including all fonts and tint colors. No eager work. */
export class ThemeTextCache {
  private readonly sources = new WeakMap<object, number>();
  private nextSource = 0;
  private readonly entries = new Map<string, HTMLCanvasElement>();
  private readonly seen = new Set<string>();
  private pixels = 0;

  constructor(
    readonly maxPixels = 262144,
    readonly maxEntries = 256,
  ) {}

  get size() {
    return this.entries.size;
  }
  get pixelCount() {
    return this.pixels;
  }

  get(source: HTMLCanvasElement | HTMLImageElement, glyphs: Glyphs, text: string) {
    // Dynamic paragraphs should not evict all the small, frequently used labels.
    if (!text || text.length > 128) return null;
    let sourceId = this.sources.get(source);
    if (sourceId === undefined) {
      sourceId = this.nextSource++;
      this.sources.set(source, sourceId);
    }
    let glyphId = this.sources.get(glyphs);
    if (glyphId === undefined) {
      glyphId = this.nextSource++;
      this.sources.set(glyphs, glyphId);
    }
    const key = `${sourceId}:${glyphId}:${text}`;
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    // First paint stays allocation-free; only repeated labels earn a bitmap.
    if (!this.seen.has(key)) {
      if (this.seen.size >= 1024) this.seen.delete(this.seen.values().next().value!);
      this.seen.add(key);
      return null;
    }
    const run = [...text].map((char) => glyphs[String(char.codePointAt(0))] ?? glyphs["63"]);
    let width = 0,
      height = 0;
    for (const glyph of run) {
      if (!glyph) continue;
      width += glyph[2];
      height = Math.max(height, glyph[3]);
    }
    const pixels = width * height;
    if (!pixels || pixels > this.maxPixels || this.maxEntries < 1) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    let x = 0;
    for (const glyph of run) {
      if (!glyph) continue;
      const [sx, sy, w, h] = glyph;
      context.drawImage(source, sx, sy, w, h, x, 0, w, h);
      x += w;
    }
    while (this.entries.size >= this.maxEntries || this.pixels + pixels > this.maxPixels) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.pixels -= oldest[1].width * oldest[1].height;
    }
    this.entries.set(key, canvas);
    this.pixels += pixels;
    return canvas;
  }
}

export const themeTextCache = new ThemeTextCache();
