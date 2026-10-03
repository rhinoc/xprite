import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const helpDirectory = "apps/editor/assets/help";
const publicDirectories = [helpDirectory, "apps/editor/assets/public"];
const textExtensions = new Set([
  ".md",
  ".mdx",
  ".html",
  ".json",
  ".jsonc",
  ".webmanifest",
  ".svg",
  ".txt",
  ".xml",
  ".yml",
  ".yaml",
  ".css",
]);
const forbiddenPlatform =
  /小\s*红\s*书|xiao[\s_-]*hong[\s_-]*shu|\bred[\s_-]*note\b|\b(?:xhs|xhslink|xhscdn)\b/iu;
const forbiddenHelpDistribution = /\bitch(?:[\s._-]*io)?\b|\bmini[\s_-]*tool\b|小工具/iu;
const invisibleCharacters = /[\u200b-\u200d\ufeff]/gu;
const lineEnding = /\r?\n/u;

// Root Markdown is public repository documentation; AGENTS.md is agent policy.
const publicFiles = readdirSync(repositoryRoot)
  .filter((filename) => /\.mdx?$/iu.test(filename) && filename !== "AGENTS.md")
  .concat("apps/editor/index.html");

function collectPublicFiles(directory) {
  const entries = readdirSync(path.join(repositoryRoot, directory), { withFileTypes: true });
  for (const entry of entries) {
    const filename = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      collectPublicFiles(filename);
    } else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) {
      publicFiles.push(filename);
    }
  }
}

for (const directory of publicDirectories) collectPublicFiles(directory);

let violationCount = 0;
for (const filename of publicFiles.sort()) {
  const lines = readFileSync(path.join(repositoryRoot, filename), "utf8").split(lineEnding);
  for (const [index, line] of lines.entries()) {
    const normalizedLine = line.normalize("NFKC").replace(invisibleCharacters, "");
    const match =
      normalizedLine.match(forbiddenPlatform) ??
      (filename.startsWith(`${helpDirectory}/`)
        ? normalizedLine.match(forbiddenHelpDistribution)
        : null);
    if (!match) continue;
    violationCount++;
    process.stderr.write(`${filename}:${index + 1}: forbidden platform reference: ${match[0]}\n`);
  }
}

if (violationCount) {
  process.stderr.write(
    "Public documentation must not mention Xiaohongshu, RedNote, XHS or their links. " +
      "The user guide is for xprite.cc only and must not include itch.io or mini tool editions. " +
      "Keep platform-specific instructions in developer documentation or the platform runtime.\n",
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`Public documentation: ${publicFiles.length} text files, no violations.\n`);
}
