import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { collectVisualSources } from "../base/audit-source-files.mjs";

export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function siteSourceHashes(root) {
  const files = new Set(collectVisualSources(root));
  const walk = (directory) => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(?:[cm]?[jt]sx?|css|html|md|json|png|webp|gif|svg)$/.test(entry.name))
        files.add(file);
    }
  };
  for (const directory of [
    "apps/growth/src",
    "apps/growth/build",
    "apps/growth/content",
    "apps/tools/src",
    "apps/tools/build",
    "packages/site-shell/src",
    "infra",
    "scripts/visual-audit/site",
  ])
    walk(directory);
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    ".husky/pre-push",
    "apps/growth/vite.config.ts",
    "apps/tools/vite.config.ts",
    "scripts/base/screenshot.mjs",
    "scripts/visual-audit/tools-startup/scenes.mjs",
  ])
    files.add(file);
  return Object.fromEntries(
    [...files].sort().map((file) => [file, digest(fs.readFileSync(path.join(root, file)))]),
  );
}
