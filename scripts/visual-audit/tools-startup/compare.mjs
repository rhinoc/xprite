import fs from "node:fs";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  assertSamePngColorSpace,
  inspectPng,
  preservePngColorSpace,
} from "../../base/screenshot.mjs";
import { MINIMUM_SIMILARITY, PIXELMATCH_THRESHOLD } from "./scenes.mjs";

/** Score untouched whole-viewport PNGs; geometry remains an independent gate. */
export function compareStartupPair(directory, scene, pair) {
  if (pair.id !== scene.id) throw Error(`Unexpected startup capture: ${pair.id}`);
  const expectedRegions = [
    "header",
    "main",
    "headline",
    ...(scene.page.name === "tools"
      ? ["viewer", "gifSheet", "editor", "animalCrossing"]
      : ["examples"]),
  ];
  const read = (entry, phase) => {
    if (entry.phase !== phase || entry.file !== `${scene.id}-${phase}.png`)
      throw Error(`${scene.id}: missing ${phase} capture.`);
    const bytes = fs.readFileSync(path.join(directory, entry.file));
    const metadata = inspectPng(bytes);
    if (
      metadata.sha256 !== entry.screenshot.sha256 ||
      entry.screenshot.method !== "Chromium CDP native PNG"
    )
      throw Error(`${scene.id}/${phase}: capture provenance changed.`);
    const { width, height } = scene.layout;
    if (
      metadata.width !== width ||
      metadata.height !== height ||
      entry.screenshot.viewport?.width !== width ||
      entry.screenshot.viewport?.height !== height ||
      entry.screenshot.viewport?.dpr !== 1 ||
      entry.appearance !== scene.appearance.resolved ||
      entry.url !== pair.url ||
      new URL(entry.url).pathname !== scene.page.path ||
      entry.language !== "en" ||
      JSON.stringify(entry.regions?.map(({ name }) => name)) !== JSON.stringify(expectedRegions)
    )
      throw Error(
        `${scene.id}/${phase}: capture dimensions, theme, URL, language or regions changed.`,
      );
    if (
      entry.regions.some(
        ({ x, y, width, height }) =>
          ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0,
      )
    )
      throw Error(`${scene.id}/${phase}: invalid region geometry.`);
    return { bytes, image: PNG.sync.read(bytes) };
  };
  const ssg = read(pair.ssg, "ssg");
  const ready = read(pair.ready, "ready");
  assertSamePngColorSpace(ssg.bytes, ready.bytes, scene.id);
  const { width, height } = ready.image;
  const diff = new PNG({ width, height });
  pixelmatch(ssg.image.data, ready.image.data, diff.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
    includeAA: true,
  });
  let differentPixels = 0;
  for (let offset = 0; offset < ssg.image.data.length; offset += 4) {
    if (
      ssg.image.data[offset] === ready.image.data[offset] &&
      ssg.image.data[offset + 1] === ready.image.data[offset + 1] &&
      ssg.image.data[offset + 2] === ready.image.data[offset + 2] &&
      ssg.image.data[offset + 3] === ready.image.data[offset + 3]
    )
      continue;
    differentPixels++;
    diff.data[offset] = 255;
    diff.data[offset + 1] = 0;
    diff.data[offset + 2] = 0;
    diff.data[offset + 3] = 255;
  }
  const totalPixels = width * height;
  const similarity = 1 - differentPixels / totalPixels;
  const geometrySame = JSON.stringify(pair.ssg.regions) === JSON.stringify(pair.ready.regions);
  const diffFile = `${scene.id}-diff.png`;
  if (differentPixels)
    fs.writeFileSync(
      path.join(directory, diffFile),
      preservePngColorSpace(ssg.bytes, PNG.sync.write(diff)),
    );
  else fs.rmSync(path.join(directory, diffFile), { force: true });
  return {
    id: scene.id,
    passed: similarity >= MINIMUM_SIMILARITY && geometrySame,
    similarity,
    differentPixels,
    totalPixels,
    geometrySame,
    ssgFile: pair.ssg.file,
    readyFile: pair.ready.file,
    ...(differentPixels ? { diffFile } : {}),
    regions: { ssg: pair.ssg.regions, ready: pair.ready.regions },
  };
}
