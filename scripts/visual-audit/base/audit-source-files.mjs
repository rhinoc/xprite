import fs from "node:fs";
import path from "node:path";

// Source inventory for the editor app and every workspace it consumes. Gallery
// sources are intentionally separate because they do not enter the editor build.
const visualSource = /\.(?:[cm]?[jt]sx?|css|svg|png|jpe?g|gif|webp|avif|json|woff2?|ttf|otf)$/i;
const workspaceRoots = [
  "apps/editor/assets",
  "apps/editor/src",
  "packages/editor-core/src",
  "packages/bedrock/browser",
  "packages/ui/src",
  "packages/ui/assets",
];
const workspaceFiles = [
  "apps/editor/index.html",
  "apps/editor/package.json",
  "apps/editor/tsconfig.json",
  "apps/editor/tsconfig.node.json",
  "apps/editor/vite.config.ts",
  "packages/editor-core/package.json",
  "packages/bedrock/package.json",
  "packages/ui/package.json",
  "packages/ui/tsconfig.json",
  "packages/ui/vite.config.ts",
];

export function collectVisualSources(root = process.cwd()) {
  const files = [];
  function walk(directory) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (visualSource.test(entry.name)) files.push(file);
    }
  }
  for (const directory of workspaceRoots) walk(directory);
  for (const file of workspaceFiles) if (fs.existsSync(path.join(root, file))) files.push(file);
  return [...new Set(files)].sort();
}
