import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve, join } from "node:path";

/** Verify checked-in light/dark theme JSON, atlases, and cursor provenance against Aseprite source. */
import { build } from "esbuild";
import { PNG } from "pngjs";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
import { readWebpPixels } from "../../base/webp-assets.mjs";

const repo = resolve(new URL("../../..", import.meta.url).pathname);
const sourceRoot = resolveAsepriteSource(process.argv[2]);
const themeRoot = join(sourceRoot, "data/extensions/aseprite-theme");
const files = {
  lightXml: join(themeRoot, "theme.xml"),
  darkXml: join(themeRoot, "dark/theme.xml"),
  lightSheet: join(themeRoot, "sheet.png"),
  darkSheet: join(themeRoot, "dark/sheet.png"),
  lightJson: join(repo, "packages/ui/assets/themes/aseprite/aseprite-light-theme.json"),
  darkJson: join(repo, "packages/ui/assets/themes/aseprite/aseprite-dark-theme.json"),
  lightAsset: join(repo, "packages/ui/assets/themes/aseprite/aseprite-theme-sheet.webp"),
  darkAsset: join(repo, "packages/ui/assets/themes/aseprite/aseprite-dark-sheet.webp"),
  cursorManifest: join(repo, "packages/ui/assets/cursors/aseprite/manifest.json"),
};

const bytes = async (path) => readFile(path);
const sha256 = async (path) =>
  createHash("sha256")
    .update(await bytes(path))
    .digest("hex");
const numeric = (value) => (/^-?\d+$/.test(value) ? Number(value) : value);
const attrs = (raw) =>
  Object.fromEntries(
    [...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, numeric(value)]),
  );
const section = (xml, name) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] || "";
const entries = (xml, name, tag) =>
  [...section(xml, name).matchAll(new RegExp(`<${tag}\\s+([^>]+?)/>`, "g"))].map(([, raw]) =>
    attrs(raw),
  );
const extract = async (xmlPath, sheetPath) => {
  const xml = (await bytes(xmlPath)).toString("utf8");
  const partEntries = entries(xml, "parts", "part");
  const parts = Object.fromEntries(
    partEntries.map(({ id, ...part }) => {
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
  return {
    xml,
    sha256: createHash("sha256").update(xml).digest("hex"),
    sheetSha256: await sha256(sheetPath),
    sheet: {
      width: (await bytes(sheetPath)).readUInt32BE(16),
      height: (await bytes(sheetPath)).readUInt32BE(20),
    },
    dimensions: Object.fromEntries(
      entries(xml, "dimensions", "dim").map(({ id, value }) => [id, value]),
    ),
    colors: Object.fromEntries(entries(xml, "colors", "color").map(({ id, value }) => [id, value])),
    parts,
  };
};

const fail = (message) => {
  throw new Error(message);
};
const canonical = (value) =>
  value && typeof value === "object"
    ? Array.isArray(value)
      ? value.map(canonical)
      : Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
    : value;
const equal = (label, actual, expected) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    fail(`${label} mismatch`);
};

const [light, dark, lightJson, darkJson, manifest] = await Promise.all([
  extract(files.lightXml, files.lightSheet),
  extract(files.darkXml, files.darkSheet),
  bytes(files.lightJson).then((raw) => JSON.parse(raw)),
  bytes(files.darkJson).then((raw) => JSON.parse(raw)),
  bytes(files.cursorManifest).then((raw) => JSON.parse(raw)),
]);
for (const [name, source, checkedIn] of [
  ["light", light, lightJson],
  ["dark", dark, darkJson],
]) {
  if (checkedIn.provenance.sha256 !== source.sha256) fail(`${name} XML SHA mismatch`);
  if (checkedIn.provenance.sheetSha256 !== source.sheetSha256) fail(`${name} atlas SHA mismatch`);
  equal(`${name} dimensions`, checkedIn.dimensions, source.dimensions);
  equal(`${name} colors`, checkedIn.colors, source.colors);
  equal(`${name} parts`, checkedIn.parts, source.parts);
  if (
    checkedIn.sheet.width !== source.sheet.width ||
    checkedIn.sheet.height !== source.sheet.height
  )
    fail(`${name} sheet dimensions mismatch`);
}
for (const [name, assetPath, sourcePath] of [
  ["light", files.lightAsset, files.lightSheet],
  ["dark", files.darkAsset, files.darkSheet],
]) {
  const asset = await readWebpPixels(assetPath);
  const source = PNG.sync.read(await bytes(sourcePath));
  if (
    asset.width !== source.width ||
    asset.height !== source.height ||
    !asset.data.equals(source.data)
  )
    fail(`checked-in ${name} atlas pixels differ from source`);
}
if (
  manifest.provenance.lightSheetSha256 !== light.sheetSha256 ||
  manifest.provenance.darkSheetSha256 !== dark.sheetSha256
)
  fail("cursor manifest atlas SHA mismatch");
for (const [name, cursor] of Object.entries(manifest.cursors)) {
  const part = light.parts[cursor.sourcePart];
  if (!part) fail(`cursor ${name} source part missing`);
  equal(`cursor ${name} atlas`, cursor.atlas, {
    x: part.x,
    y: part.y,
    width: part.width,
    height: part.height,
  });
  equal(`cursor ${name} Aseprite hotspot`, cursor.sourceHotspot, {
    x: part.focusx,
    y: part.focusy,
  });
}
console.log(
  `Verified light/dark XML, ${Object.keys(light.parts).length} parts, ${Object.keys(light.colors).length}/${Object.keys(dark.colors).length} color roles, both atlases, and ${Object.keys(manifest.cursors).length} cursor roles.`,
);

// Verify generated theme modules against their complete source manifests.
const runtimeBundle = await build({
  absWorkingDir: repo,
  entryPoints: {
    "aseprite-light": "packages/ui/src/base/theme/generated/themes/aseprite-light.ts",
    "aseprite-dark": "packages/ui/src/base/theme/generated/themes/aseprite-dark.ts",
  },
  bundle: true,
  write: false,
  outdir: ".theme-verification",
  format: "esm",
  platform: "node",
  loader: { ".webp": "dataurl" },
  plugins: [
    {
      name: "ui-theme-assets",
      setup(build) {
        build.onResolve({ filter: /^\$assets\// }, ({ path }) => ({
          path: join(repo, "packages/ui/assets", path.slice("$assets/".length)),
        }));
      },
    },
  ],
});
const runtimeModules = new Map(
  await Promise.all(
    runtimeBundle.outputFiles.map(async (output) => [
      basename(output.path),
      await import(`data:text/javascript;base64,${Buffer.from(output.text).toString("base64")}`),
    ]),
  ),
);
equal(
  "generated light definition",
  runtimeModules.get("aseprite-light.js").themeDefinition,
  lightJson,
);
equal(
  "generated dark definition",
  runtimeModules.get("aseprite-dark.js").themeDefinition,
  darkJson,
);
console.log("Generated light and dark theme modules match their complete source manifests.");
