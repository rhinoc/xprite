import { fileURLToPath } from "node:url";

// Browser-only regression check. Import and call with an ego-browser Page on Vite.
export async function verifyXpriteTextCache(page, outputDirectory) {
  const modules = {
    controls: `/@fs${fileURLToPath(new URL("../../../packages/ui/src/base/components/theme-controls.tsx", import.meta.url))}`,
    cache: `/@fs${fileURLToPath(new URL("../../../packages/ui/src/base/theme/theme-text-cache.ts", import.meta.url))}`,
    assets: `/@fs${fileURLToPath(new URL("../../../packages/ui/src/base/theme/theme-assets.ts", import.meta.url))}`,
  };
  const result = await page.evaluate(async (modules) => {
    const { paintThemeText, preloadThemeAssets } = await import(modules.controls);
    const { ThemeTextCache } = await import(modules.cache);
    const { themeGlyphAssets } = await import(modules.assets);
    const glyphs = {
      default: themeGlyphAssets.defaultGlyphMetrics,
      mini: themeGlyphAssets.miniGlyphMetrics,
    };
    const canvas = (w = 384, h = 36) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };
    const reference = canvas(),
      candidate = canvas();
    const r = reference.getContext("2d", { willReadFrequently: true });
    const c = candidate.getContext("2d", { willReadFrequently: true });
    const referenceSheet = canvas(384, 36 * 64),
      candidateSheet = canvas(384, 36 * 64);
    const rs = referenceSheet.getContext("2d"),
      cs = candidateSheet.getContext("2d");
    const tint = (source, color) => {
      const out = canvas(source.width, source.height),
        ctx = out.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, out.width, out.height);
      return out;
    };
    // The original per-glyph implementation is the independent pixel oracle.
    const oldPaint = (ctx, image, data, text, x, y, scale) => {
      ctx.imageSmoothingEnabled = false;
      let cursor = Math.floor(x);
      for (const char of text) {
        const glyph = data[String(char.codePointAt(0))] ?? data["63"];
        if (!glyph) continue;
        const [sx, sy, w, h] = glyph;
        ctx.drawImage(image, sx, sy, w, h, cursor, Math.floor(y), w * scale, h * scale);
        cursor += w * scale;
      }
    };
    const setup = (ctx, mode) => {
      ctx.reset();
      ctx.fillStyle = "#c6c6c6";
      ctx.fillRect(0, 0, 384, 36);
      if (mode === "clip") {
        ctx.beginPath();
        ctx.rect(13, 5, 139, 19);
        ctx.clip();
      }
      if (mode === "translate") ctx.translate(3, 2);
      if (mode === "fractional") ctx.translate(0.3, 0.7);
      if (mode === "alpha") ctx.globalAlpha = 0.5;
      if (mode === "shadow") {
        ctx.shadowColor = "black";
        ctx.shadowBlur = 2;
      }
      if (mode === "blend") ctx.globalCompositeOperation = "xor";
    };
    let cases = 0,
      copied = 0;
    for (const theme of ["light", "dark"]) {
      const assets = await preloadThemeAssets(theme);
      for (const font of ["default", "mini"])
        for (const color of ["#123456", "rgba(21, 78, 169, .5)"]) {
          const source = tint(font === "mini" ? assets.miniFont : assets.defaultFont, color);
          for (const scale of [1, 2, 1.5])
            for (const text of ["File: 123", "i W ? 中文 😀", "", "Long text ".repeat(16)]) {
              for (const mode of [
                "plain",
                "clip",
                "translate",
                "fractional",
                "alpha",
                "shadow",
                "blend",
              ]) {
                for (let pass = 0; pass < 3; pass++) {
                  setup(r, mode);
                  setup(c, mode);
                  oldPaint(r, source, glyphs[font], text, 7.7, 5.2, scale);
                  paintThemeText(c, assets, text, 7.7, 5.2, { font, color, scale });
                  const a = r.getImageData(0, 0, 384, 36).data,
                    b = c.getImageData(0, 0, 384, 36).data;
                  const mismatch = a.findIndex((v, i) => v !== b[i]);
                  if (mismatch >= 0)
                    throw Error(
                      JSON.stringify({
                        theme,
                        font,
                        color,
                        scale,
                        text,
                        mode,
                        pass,
                        mismatch,
                        a: a[mismatch],
                        b: b[mismatch],
                      }),
                    );
                }
                if (copied < 64 && text && mode === "plain") {
                  rs.drawImage(reference, 0, copied * 36);
                  cs.drawImage(candidate, 0, copied * 36);
                  copied++;
                }
                cases++;
              }
            }
        }
    }
    const assets = await preloadThemeAssets("light");
    const counter = canvas().getContext("2d");
    const drawImage = counter.drawImage.bind(counter);
    let calls = 0;
    counter.drawImage = (...args) => {
      calls++;
      return drawImage(...args);
    };
    const counts = [];
    for (let i = 0; i < 3; i++) {
      calls = 0;
      paintThemeText(counter, assets, "Repeated label cache QA", 0, 0);
      counts.push(calls);
    }
    if (counts[1] !== 1 || counts[2] !== 1) throw Error(`Cache missed: ${counts}`);
    const cache = new ThemeTextCache(40, 2),
      source = canvas(4, 4);
    const smallGlyphs = { 65: [0, 0, 4, 4], 66: [0, 0, 4, 4], 67: [0, 0, 4, 4] };
    if (cache.get(source, smallGlyphs, "A") !== null) throw Error("First paint allocated a bitmap");
    const first = cache.get(source, smallGlyphs, "A");
    for (const text of ["B", "C"]) {
      cache.get(source, smallGlyphs, text);
      cache.get(source, smallGlyphs, text);
    }
    if (cache.size > 2 || cache.pixelCount > 40 || cache.get(source, smallGlyphs, "A") === first)
      throw Error("LRU budget failed");
    if (cache.get(source, smallGlyphs, "A".repeat(129)) !== null) throw Error("Long text cached");
    return {
      cases,
      comparedPasses: cases * 3,
      differingBytes: 0,
      drawCalls: counts,
      cachePixelLimit: 262144,
      reference: referenceSheet.toDataURL("image/png"),
      candidate: candidateSheet.toDataURL("image/png"),
    };
  }, modules);
  const fs = await import("node:fs/promises");
  await fs.mkdir(outputDirectory, { recursive: true });
  for (const name of ["reference", "candidate"]) {
    await fs.writeFile(
      `${outputDirectory}/${name}.png`,
      Buffer.from(result[name].split(",")[1], "base64"),
    );
    delete result[name];
  }
  await fs.writeFile(`${outputDirectory}/report.json`, JSON.stringify(result, null, 2));
  return result;
}
