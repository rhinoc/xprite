import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseExpression } from "@babel/parser";

import { inspectI18nSources } from "./i18n-source-coverage.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localesDirectory = path.join(repositoryRoot, "apps/editor/src/i18n/locales");
const sourceLocaleName = "en";
const localeFiles = readdirSync(localesDirectory)
  .filter((filename) => filename.endsWith(".json"))
  .sort();
const sourceFilename = `${sourceLocaleName}.json`;

if (!localeFiles.includes(sourceFilename)) {
  process.stderr.write(`Missing source locale: ${path.join(localesDirectory, sourceFilename)}\n`);
  process.exit(1);
}

function readCatalog(filename) {
  const fullPath = path.join(localesDirectory, filename);
  let value;
  try {
    const contents = readFileSync(fullPath, "utf8");
    value = JSON.parse(contents);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = new Set();
      for (const property of parseExpression(contents).properties) {
        const key = property.key.value;
        if (keys.has(key)) {
          process.stderr.write(`${filename}: duplicate message key: ${key}\n`);
          process.exitCode = 1;
        }
        keys.add(key);
      }
    }
  } catch (error) {
    process.stderr.write(`${filename}: ${error.message}\n`);
    process.exitCode = 1;
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    process.stderr.write(`${filename}: expected a JSON object of message keys to strings.\n`);
    process.exitCode = 1;
    return null;
  }
  return value;
}

function placeholders(message) {
  return [...message.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
}

const source = readCatalog(sourceFilename);
if (!source) process.exit(1);

const sourceKeys = Object.keys(source).sort();
const invalidSourceValues = sourceKeys.filter(
  (key) => typeof source[key] !== "string" || !source[key].trim(),
);
if (invalidSourceValues.length) {
  process.stderr.write(
    `${sourceLocaleName}: non-string message values: ${invalidSourceValues.join(", ")}\n`,
  );
  process.exitCode = 1;
}

let localeCount = 0;
let totalKeys = 0;
let coveredKeys = 0;

for (const filename of localeFiles) {
  if (filename === sourceFilename) continue;
  localeCount++;
  const locale = readCatalog(filename);
  if (!locale) continue;

  const localeName = path.basename(filename, ".json");
  const localeKeys = Object.keys(locale).sort();
  const missingKeys = sourceKeys.filter(
    (key) => typeof locale[key] !== "string" || !locale[key].trim(),
  );
  const extraKeys = localeKeys.filter((key) => !Object.hasOwn(source, key));
  const covered = sourceKeys.length - missingKeys.length;
  const coverage = sourceKeys.length ? (covered / sourceKeys.length) * 100 : 100;
  totalKeys += sourceKeys.length;
  coveredKeys += covered;

  process.stdout.write(
    `${localeName}: ${covered}/${sourceKeys.length} keys (${coverage.toFixed(1)}% coverage)` +
      `${missingKeys.length ? `; ${missingKeys.length} missing` : ""}` +
      `${extraKeys.length ? `; ${extraKeys.length} extra` : ""}\n`,
  );

  if (missingKeys.length) {
    process.stderr.write(`${localeName}: missing or non-string keys: ${missingKeys.join(", ")}\n`);
    process.exitCode = 1;
  }
  if (extraKeys.length) {
    process.stderr.write(
      `${localeName}: keys absent from ${sourceLocaleName}: ${extraKeys.join(", ")}\n`,
    );
    process.exitCode = 1;
  }

  for (const key of sourceKeys) {
    if (typeof source[key] !== "string" || typeof locale[key] !== "string") continue;
    const sourcePlaceholders = placeholders(source[key]);
    const localePlaceholders = placeholders(locale[key]);
    if (JSON.stringify(sourcePlaceholders) === JSON.stringify(localePlaceholders)) continue;
    process.stderr.write(
      `${localeName}: placeholder mismatch for ${key} ` +
        `(en: {${sourcePlaceholders.join("}, {")}}; ${localeName}: {${localePlaceholders.join("}, {")}})\n`,
    );
    process.exitCode = 1;
  }
}

const sourceCoverage = inspectI18nSources(repositoryRoot, source);
process.stdout.write(
  `Source coverage: ${sourceCoverage.fileCount} files, ${sourceCoverage.messageCount} message references, ${sourceCoverage.problems.length} violations\n`,
);
for (const problem of sourceCoverage.problems) process.stderr.write(`${problem}\n`);
if (sourceCoverage.problems.length) process.exitCode = 1;

if (!localeCount) {
  process.stderr.write("No translation locales found beside the English source catalog.\n");
  process.exitCode = 1;
} else if (process.exitCode !== 1) {
  const overallCoverage = totalKeys ? (coveredKeys / totalKeys) * 100 : 100;
  process.stdout.write(`Overall translated-key coverage: ${overallCoverage.toFixed(1)}%\n`);
}
