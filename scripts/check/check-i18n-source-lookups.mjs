// Blocks new English-text translation lookups. UI text should be translated by stable key with
// tUi(key) before it reaches a component. tUiSource/translateSource remain only for dynamic label
// catalogs (Aseprite menu and widget labels, panel names) that are keyed by their English text.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const roots = ["apps", "packages"];
const skipDirectories = new Set(["node_modules", "dist", "generated", ".turbo"]);
const sourcePattern = /\.(?:ts|tsx)$/u;
// @xprite/ui cannot import the editor catalog; its injected translator keeps a few literal labels.
const literalAllowlist = new Set(["packages/ui/src/components/panel/note-surface.tsx"]);
const lookupCall = /\b(tUiSource|translateSource)\(/gu;
const literalArgument =
  /\b(?:tUiSource|translateSource)\(\s*(?:["'`]|[^()]*\?\s*["'`][^"'`]*["'`]\s*:\s*["'`])/u;
// Remaining dynamic call sites. Lower this number as callers move to tUi(key); never raise it.
const MAX_SOURCE_LOOKUPS = Number(
  readFileSync(new URL("./i18n-source-lookups.baseline", import.meta.url), "utf8").trim(),
);

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skipDirectories.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (sourcePattern.test(entry.name) && !/\.test\.tsx?$/u.test(entry.name)) yield file;
  }
}

let total = 0;
const literalViolations = [];
for (const root of roots)
  for (const file of sourceFiles(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const calls = line.match(lookupCall)?.length ?? 0;
      if (!calls || /^\s*(?:\/\/|\*)/u.test(line) || /function tUiSource\(/u.test(line)) return;
      total += calls;
      if (literalArgument.test(line) && !literalAllowlist.has(file.split(path.sep).join("/")))
        literalViolations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }

let failed = false;
if (literalViolations.length) {
  failed = true;
  console.error(
    'English-text lookups with literal text; use tUi("<key>") from the locale catalog instead:',
  );
  for (const violation of literalViolations) console.error(`  ${violation}`);
}
if (total > MAX_SOURCE_LOOKUPS) {
  failed = true;
  console.error(
    `English-text lookups grew to ${total} (baseline ${MAX_SOURCE_LOOKUPS}). Translate new text with tUi(key).`,
  );
}
if (failed) process.exit(1);
console.log(
  `English-text lookups: ${total} dynamic call sites (baseline ${MAX_SOURCE_LOOKUPS}), no literal lookups.`,
);
