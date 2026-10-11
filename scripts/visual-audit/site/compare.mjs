import fs from "node:fs";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  inspectPng,
  assertSamePngColorSpace,
  preservePngColorSpace,
} from "../../base/screenshot.mjs";

const MINIMUM_SIMILARITY = 0.99;
const REGIONS = ["page"];

export function assertCompleteCapture(manifest, scenes) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.captureComplete !== true ||
    !manifest.browser ||
    !manifest.sourceDigest
  )
    throw Error("Site capture is incomplete or has no provenance.");
  const ids = manifest.cases?.map((entry) => entry.id) ?? [];
  if (
    ids.length !== scenes.length ||
    new Set(ids).size !== ids.length ||
    scenes.some((scene) => !ids.includes(scene.id))
  )
    throw Error("Every canonical growth/tools scene must be captured exactly once.");
  for (const scene of scenes) {
    const entry = manifest.cases.find((item) => item.id === scene.id);
    if (
      JSON.stringify(entry.contract) !== JSON.stringify(scene) ||
      entry.file !== `${scene.id}.png` ||
      entry.runId !== manifest.runId ||
      entry.path !== scene.page.path ||
      !entry.platform ||
      !entry.screenshot ||
      !entry.regions ||
      !REGIONS.every((name) => entry.regions.some((region) => region.name === name))
    )
      throw Error(`${scene.id}: capture contract or evidence is missing.`);
  }
}

export function readSiteImage(directory, scene, entry) {
  const bytes = fs.readFileSync(path.join(directory, entry.file));
  const metadata = inspectPng(bytes);
  const viewport = entry.screenshot.viewport;
  if (
    metadata.sha256 !== entry.screenshot.sha256 ||
    entry.screenshot.method !== "Chromium CDP native PNG" ||
    metadata.width !== scene.layout.width ||
    metadata.height !== scene.layout.height ||
    viewport?.width !== scene.layout.width ||
    viewport?.height !== scene.layout.height ||
    viewport?.dpr !== 1
  )
    throw Error(`${scene.id}: native PNG provenance or dimensions changed.`);
  const expectedNames = ["page", ...scene.page.regions.map((region) => region.name)];
  if (
    JSON.stringify(entry.regions.map((region) => region.name)) !== JSON.stringify(expectedNames) ||
    entry.regions.some(
      ({ x, y, width, height }) =>
        ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0,
    )
  )
    throw Error(`${scene.id}: region geometry is incomplete.`);
  return { bytes, image: PNG.sync.read(bytes) };
}

export function compareSiteCase(scene, reference, current, baselineRoot, candidateRoot) {
  if (reference.platform !== current.platform)
    throw Error(`${scene.id}: browser platform changed.`);
  const before = readSiteImage(baselineRoot, scene, reference);
  const after = readSiteImage(candidateRoot, scene, current);
  assertSamePngColorSpace(before.bytes, after.bytes, scene.id);
  let differentPixels = 0;
  for (let offset = 0; offset < before.image.data.length; offset += 4) {
    if (
      before.image.data[offset] !== after.image.data[offset] ||
      before.image.data[offset + 1] !== after.image.data[offset + 1] ||
      before.image.data[offset + 2] !== after.image.data[offset + 2] ||
      before.image.data[offset + 3] !== after.image.data[offset + 3]
    )
      differentPixels++;
  }
  const totalPixels = scene.layout.width * scene.layout.height;
  const similarity = 1 - differentPixels / totalPixels;
  const geometrySame = JSON.stringify(reference.regions) === JSON.stringify(current.regions);
  const diffFile = `${scene.id}-diff.png`;
  if (differentPixels) {
    const diff = new PNG({ width: scene.layout.width, height: scene.layout.height });
    pixelmatch(
      before.image.data,
      after.image.data,
      diff.data,
      scene.layout.width,
      scene.layout.height,
      { threshold: 0, includeAA: true },
    );
    fs.writeFileSync(
      path.join(candidateRoot, diffFile),
      preservePngColorSpace(before.bytes, PNG.sync.write(diff)),
    );
  }
  return {
    id: scene.id,
    similarity,
    differentPixels,
    totalPixels,
    geometrySame,
    passed: similarity >= MINIMUM_SIMILARITY && geometrySame,
    ...(differentPixels ? { diffFile } : {}),
  };
}
