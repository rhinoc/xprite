import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { assertSamePngColorSpace, preservePngColorSpace } from "../base/screenshot.mjs";
import { scenes, PIXELMATCH_THRESHOLD, MINIMUM_SIMILARITY } from "./tools-startup/scenes.mjs";
import { assertCaptureContract } from "./xprite/compare-case.mjs";
import { languageDirectory, languages, sceneIds } from "./xprite/scenes.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (filename) => {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
};
const bounds = (region) =>
  region ? `(${region.x}, ${region.y}) ${region.width} × ${region.height}` : "不存在";
const imagePath = (directory, filename) => {
  if (!filename || path.basename(filename) !== filename || !filename.endsWith(".png"))
    return undefined;
  const target = path.join(directory, filename);
  return fs.existsSync(target) ? target : undefined;
};

function sourceWarning(root, manifest) {
  if (!manifest?.sourceHashes || !Object.keys(manifest.sourceHashes).length)
    return "缺少源文件记录，不能确认截图对应当前代码。";
  const changed = Object.entries(manifest.sourceHashes).filter(([filename, hash]) => {
    const source = path.join(root, filename);
    return !fs.existsSync(source) || digest(fs.readFileSync(source)) !== hash;
  });
  return changed.length
    ? `采集后有 ${changed.length} 个源文件发生变化或被删除，图像只能用于视觉审阅，不能确认当前代码通过校验。`
    : null;
}

/** Diagnostic scoring stays separate from acceptance; invalid evidence never certifies a push. */
function inspectImages(entry, reference, candidate, output, threshold, minimumSimilarity = 0.99) {
  if (!entry.reference || !entry.candidate) {
    entry.warnings.push("缺少基线或候选图像，无法计算像素差异。");
    return;
  }
  try {
    const before = fs.readFileSync(entry.reference),
      after = fs.readFileSync(entry.candidate);
    if (digest(before) !== reference.sha256 || digest(after) !== candidate.sha256)
      throw Error("图像哈希与采集记录不一致，不能计算可信差异。");
    assertSamePngColorSpace(before, after);
    const a = PNG.sync.read(before),
      b = PNG.sync.read(after);
    if (a.width !== b.width || a.height !== b.height)
      throw Error(`图像尺寸不同：${a.width} × ${a.height} / ${b.width} × ${b.height}。`);
    const diff = new PNG({ width: a.width, height: a.height });
    let differentPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
      threshold,
      includeAA: true,
    });
    if (threshold === 0) {
      differentPixels = 0;
      for (let offset = 0; offset < a.data.length; offset += 4) {
        if (
          a.data[offset] === b.data[offset] &&
          a.data[offset + 1] === b.data[offset + 1] &&
          a.data[offset + 2] === b.data[offset + 2] &&
          a.data[offset + 3] === b.data[offset + 3]
        )
          continue;
        differentPixels++;
        diff.data[offset] = 255;
        diff.data[offset + 1] = 0;
        diff.data[offset + 2] = 0;
        diff.data[offset + 3] = 255;
      }
    }
    entry.differentPixels = differentPixels;
    entry.totalPixels = a.width * a.height;
    entry.similarity = 1 - differentPixels / entry.totalPixels;
    entry.geometrySame =
      reference.regions && candidate.regions
        ? JSON.stringify(reference.regions) === JSON.stringify(candidate.regions)
        : undefined;
    entry.changed = differentPixels > 0 || entry.geometrySame === false;
    if (entry.similarity < minimumSimilarity)
      entry.warnings.push(
        minimumSimilarity === 1
          ? "SSG 与水合后首屏存在像素差异，要求 100% 一致。"
          : "像素变化超过 1%，未达到 99% 相似度要求。",
      );
    if (entry.geometrySame === false) entry.warnings.push("区域位置或尺寸发生变化。");
    const beforeRegions = reference.regions ?? [],
      afterRegions = candidate.regions ?? [];
    entry.regions = [...new Set([...beforeRegions, ...afterRegions].map(({ name }) => name))].map(
      (name) => {
        const beforeRegion = beforeRegions.find((region) => region.name === name);
        const afterRegion = afterRegions.find((region) => region.name === name);
        return {
          name,
          before: bounds(beforeRegion),
          after: bounds(afterRegion),
          changed: JSON.stringify(beforeRegion) !== JSON.stringify(afterRegion),
        };
      },
    );
    if (differentPixels) {
      entry.diff = path.join(output, `${entry.id}-diff.png`);
      fs.writeFileSync(entry.diff, preservePngColorSpace(before, PNG.sync.write(diff)));
    }
  } catch (error) {
    entry.warnings.push(error.message);
  }
}

export function collectImageReport({ root, baselineRoot, candidateRoot, toolsRoot, output }) {
  fs.mkdirSync(output, { recursive: true });
  const cases = [];
  for (const language of languages) {
    const baselineDir = languageDirectory(baselineRoot, language);
    const candidateDir = languageDirectory(candidateRoot, language);
    const baseline = readJson(path.join(baselineDir, "manifest.json"));
    const candidate = readJson(path.join(candidateDir, "manifest.json"));
    const warning = sourceWarning(root, candidate);
    for (const id of sceneIds) {
      const before = baseline?.cases?.find((entry) => entry.id === id);
      const after = candidate?.cases?.find((entry) => entry.id === id);
      const entry = {
        id: `editor-${language}-${id}`,
        name: `编辑器 / ${language} / ${id}`,
        reference: imagePath(baselineDir, before?.file),
        candidate: imagePath(candidateDir, after?.file),
        capturedAt:
          after?.screenshot?.capturedAt ?? after?.capture?.capturedAt ?? candidate?.capturedAt,
        warnings: [],
      };
      if (warning) entry.warnings.push(warning);
      if (candidate?.captureComplete !== true)
        entry.warnings.push("本轮采集未完成，不能通过推送校验。");
      if (baseline && candidate && before && after) {
        try {
          assertCaptureContract(baseline, candidate, language, [id]);
          for (const key of ["mode", "view", "viewport", "language", "frame", "zoom", "tooltip"])
            if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
              throw Error(`采集状态变化：${key}。`);
        } catch (error) {
          entry.warnings.push(
            error.message.includes("Capture contract changed: fixture")
              ? `示例项目已更换：${path.basename(baseline.fixture.file)} → ${path.basename(candidate.fixture.file)}。此处展示图像差异，不作为验收结论。`
              : `仅供诊断：${error.message}`,
          );
        }
        inspectImages(entry, before, after, output, 0);
      } else entry.warnings.push("此场景没有完整的采集记录。");
      cases.push(entry);
    }
  }
  const failure = readJson(path.join(candidateRoot, "capture-failure.json"));
  if (failure) {
    const { language, id } = failure.scene ?? {};
    const baselineDir = languageDirectory(baselineRoot, language ?? "en");
    const baseline = readJson(path.join(baselineDir, "manifest.json"));
    const before = baseline?.cases?.find((entry) => entry.id === id);
    const entry = {
      id: "editor-capture-failure",
      name: `采集失败现场 / ${language ?? "未知语言"} / ${id ?? "未知场景"}`,
      reference: imagePath(baselineDir, before?.file),
      candidate: imagePath(candidateRoot, "capture-failure.png"),
      candidateLabel: "当前失败现场（诊断）",
      capturedAt: failure.screenshot?.capturedAt,
      warnings: [
        `采集失败：${failure.error}`,
        "未达到规定采集状态，只用于查看当前界面，不能通过推送校验。",
      ],
    };
    if (before) inspectImages(entry, before, { sha256: failure.screenshot?.sha256 }, output, 0);
    cases.unshift(entry);
  }
  const toolReport = readJson(path.join(toolsRoot, "comparison.json"));
  const toolWarning = sourceWarning(root, toolReport);
  for (const scene of scenes) {
    const pair = readJson(path.join(toolsRoot, `${scene.id}.json`));
    const entry = {
      id: `startup-${scene.id}`,
      name: `工具首屏 / ${scene.id}`,
      referenceLabel: "静态首屏 SSG",
      candidateLabel: "交互就绪首屏",
      reference: imagePath(toolsRoot, pair?.ssg?.file),
      candidate: imagePath(toolsRoot, pair?.ready?.file),
      capturedAt: pair?.ready?.screenshot?.capturedAt,
      warnings: [],
    };
    if (toolWarning) entry.warnings.push(toolWarning);
    if (toolReport?.captureComplete !== true)
      entry.warnings.push(
        `本轮工具页采集未完成：${toolReport?.captureError ?? toolReport?.error ?? "缺少完整记录"}`,
      );
    if (toolReport?.capturedAt && entry.capturedAt < toolReport.capturedAt)
      entry.warnings.push("这是先前采集保存的图像，不属于最近失败的采集。");
    if (pair?.ssg && pair?.ready)
      inspectImages(
        entry,
        { sha256: pair.ssg.screenshot?.sha256, regions: pair.ssg.regions },
        { sha256: pair.ready.screenshot?.sha256, regions: pair.ready.regions },
        output,
        PIXELMATCH_THRESHOLD,
        MINIMUM_SIMILARITY,
      );
    else entry.warnings.push("此场景没有完整的 SSG / 交互就绪图像。");
    cases.push(entry);
  }
  return cases;
}
