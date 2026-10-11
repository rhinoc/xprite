import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectImageReport } from "./report-data.mjs";
import { writeImageReport } from "./report-html.mjs";

export function generateImageReport() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = path.join(root, ".tmp/visual-report");
  const cases = collectImageReport({
    root,
    baselineRoot: path.join(root, "scripts/visual-audit/baselines/xprite"),
    candidateRoot: path.join(root, ".tmp/xprite-visual"),
    siteBaselineRoot: path.join(root, "scripts/visual-audit/baselines/site"),
    siteCandidateRoot: path.join(root, ".tmp/site-visual"),
    toolsRoot: path.join(root, ".tmp/tools-startup-visual"),
    output,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    title: "Xprite 图像差异报告",
    notice:
      "默认只显示有像素差异或几何变化的场景。红色表示任一 RGBA 通道变化，白色表示完全一致。编辑器与网站基线验收要求至少 99% 相似度；工具 SSG 与水合后首屏要求所有 RGBA 像素完全一致（100%）。两项均要求区域几何一致。此报告仅用于查看，不修改基线或校验结果；旧采集和证据不完整的场景不能用于确认当前版本。",
    cases,
  };
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const filename = path.join(output, "index.html");
  writeImageReport(filename, report);
  console.log(`Image diff report: ${filename}`);
  return filename;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  generateImageReport();
