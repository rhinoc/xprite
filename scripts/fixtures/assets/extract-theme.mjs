import { createHash } from "node:crypto";
/** Extract both complete upstream themes, never screenshot regions.
 * Run: node scripts/fixtures/assets/extract-theme.mjs [source/theme.xml]. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
import { encodeLosslessWebp } from "../../base/webp-assets.mjs";
const source = resolve(
  process.argv[2] ?? join(resolveAsepriteSource(), "data/extensions/aseprite-theme/theme.xml"),
);
async function extract(path, provenance) {
  const xml = await readFile(path, "utf8");
  const attrs = (str) =>
    Object.fromEntries(
      [...str.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [
        key,
        /^-?\d+$/.test(value) ? Number(value) : value,
      ]),
    );
  const section = (name) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] || "";
  const entries = (name, tag) =>
    [...section(name).matchAll(new RegExp(`<${tag}\\s+([^>]+?)/>`, "g"))].map(([, raw]) =>
      attrs(raw),
    );
  const parts = Object.fromEntries(
    entries("parts", "part").map(({ id, ...part }) => {
      const sliced = "w1" in part;
      return [
        id,
        {
          ...part,
          width: sliced ? part.w1 + part.w2 + part.w3 : part.w,
          height: sliced ? part.h1 + part.h2 + part.h3 : part.h,
          slices: sliced ? [part.w1, part.w2, part.w3, part.h1, part.h2, part.h3] : null,
        },
      ];
    }),
  );
  const sheet = await readFile(join(dirname(path), "sheet.png"));
  return {
    provenance: {
      source: provenance,
      sha256: createHash("sha256").update(xml).digest("hex"),
      sheetSha256: createHash("sha256").update(sheet).digest("hex"),
    },
    sheet: { width: sheet.readUInt32BE(16), height: sheet.readUInt32BE(20) },
    dimensions: Object.fromEntries(
      entries("dimensions", "dim").map(({ id, value }) => [id, value]),
    ),
    colors: Object.fromEntries(entries("colors", "color").map(({ id, value }) => [id, value])),
    parts,
  };
}
const light = await extract(source, "aseprite/data/extensions/aseprite-theme/theme.xml");
const dark = await extract(
  join(dirname(source), "dark/theme.xml"),
  "aseprite/data/extensions/aseprite-theme/dark/theme.xml",
);
const themeSourceDirectory = new URL(
  "../../../packages/ui/assets/themes/aseprite/",
  import.meta.url,
);
await mkdir(themeSourceDirectory, { recursive: true });
await Promise.all([
  encodeLosslessWebp(
    join(dirname(source), "sheet.png"),
    new URL("aseprite-theme-sheet.webp", themeSourceDirectory),
  ),
  encodeLosslessWebp(
    join(dirname(source), "dark/sheet.png"),
    new URL("aseprite-dark-sheet.webp", themeSourceDirectory),
  ),
]);
for (const [output, theme] of [
  [new URL("aseprite-light-theme.json", themeSourceDirectory), light],
  [new URL("aseprite-dark-theme.json", themeSourceDirectory), dark],
])
  await writeFile(output, JSON.stringify(theme, null, 2) + "\n");
console.log(
  `Extracted full light and dark source manifests with ${Object.keys(light.parts).length} light parts and ${Object.keys(dark.parts).length} dark parts.`,
);
