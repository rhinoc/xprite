#!/usr/bin/env node
// Classifies which pre-push buckets to run from the commits being pushed (git pre-push stdin
// ranges), not the dirty working tree. Used by scripts/check/pre-push.mjs.
//
// Buckets:
//   always  — static `pnpm run check` (site-build skipped there; see pre-push.mjs)
//   unit    — `pnpm run test:ci`
//   site    — `check:deploy --build` / `--prepare` and `check:site-output`
//   visual  — `pnpm run visual --prebuilt` (implies site)
//
// Force every bucket with XPRITE_PREPUSH_FULL=1 or `pnpm run pre-push:full`.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { stdin } from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ZERO = "0".repeat(40);

/** Path prefixes that need a production site build and deploy prep. */
const SITE_PREFIXES = [
  "apps/",
  "packages/ui/",
  "packages/editor-ui/",
  "packages/site-shell/",
  "packages/palette-assets/",
  "scripts/build/",
  "scripts/deploy/",
  "scripts/dev/",
  "scripts/visual-audit/",
  "scripts/generate-components.mjs",
  "scripts/generate-ui-theme.mjs",
  "scripts/check/check-deploy.mjs",
  "scripts/check/check-growth-ssr.mjs",
  "scripts/check/check-page-metadata.mjs",
  "scripts/check/check-asset-versions.mjs",
  "scripts/check/check-public-docs.mjs",
  "infra/",
  "services/",
];

const SITE_EXACT = new Set([
  "edgeone.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
]);

/** Rendering / Playwright surfaces. editor-core algorithm-only pushes are excluded on purpose. */
const VISUAL_PREFIXES = [
  "apps/",
  "packages/ui/",
  "packages/editor-ui/",
  "packages/site-shell/",
  "packages/palette-assets/",
  "scripts/visual-audit/",
  "infra/",
];

const VISUAL_EXACT = new Set(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]);

/** Code the unit suite covers. Pure docs / license pushes skip this. */
const UNIT_PREFIXES = ["packages/", "apps/", "services/", "scripts/", "infra/"];

const UNIT_EXACT = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
]);

function matches(file, prefixes, exact) {
  if (exact.has(file)) return true;
  return prefixes.some((prefix) => file === prefix || file.startsWith(prefix));
}

export function classifyFiles(files) {
  const list = [...new Set(files.filter(Boolean))];
  const visual = list.some((file) => matches(file, VISUAL_PREFIXES, VISUAL_EXACT));
  const site = visual || list.some((file) => matches(file, SITE_PREFIXES, SITE_EXACT));
  const unit = list.some((file) => matches(file, UNIT_PREFIXES, UNIT_EXACT));
  return { always: true, unit, site, visual, files: list };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function filesBetween(remoteSha, localSha) {
  if (localSha === ZERO) return [];
  if (!remoteSha || remoteSha === ZERO) {
    let base;
    try {
      base = git(["merge-base", "origin/main", localSha]);
    } catch {
      try {
        base = git(["merge-base", "main", localSha]);
      } catch {
        return git(["diff-tree", "--no-commit-id", "--name-only", "-r", localSha])
          .split("\n")
          .filter(Boolean);
      }
    }
    if (base === localSha) return [];
    return git(["diff", "--name-only", `${base}...${localSha}`])
      .split("\n")
      .filter(Boolean);
  }
  return git(["diff", "--name-only", `${remoteSha}...${localSha}`])
    .split("\n")
    .filter(Boolean);
}

/** Husky/git pre-push stdin: `<localRef> <localSha> <remoteRef> <remoteSha>` per line. */
export async function readPushRangesFromStdin() {
  if (stdin.isTTY) return null;
  const lines = [];
  for await (const line of createInterface({ input: stdin })) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines.length ? lines : null;
}

export function collectFilesFromRanges(rangeLines) {
  const files = new Set();
  for (const line of rangeLines) {
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const localSha = parts[1];
    const remoteSha = parts[3];
    for (const file of filesBetween(remoteSha, localSha)) files.add(file);
  }
  return [...files];
}

/** Fallback when not invoked via `git push` (e.g. `pnpm run pre-push`). */
export function collectFilesVsUpstream() {
  let base;
  try {
    base = git(["merge-base", "HEAD", "origin/main"]);
  } catch {
    try {
      base = git(["rev-parse", "HEAD~1"]);
    } catch {
      return [];
    }
  }
  return git(["diff", "--name-only", `${base}...HEAD`])
    .split("\n")
    .filter(Boolean);
}

export async function resolvePrePushScope({ full = false, rangeLines } = {}) {
  if (full || process.env.XPRITE_PREPUSH_FULL === "1") {
    return {
      always: true,
      unit: true,
      site: true,
      visual: true,
      full: true,
      files: null,
      source: "XPRITE_PREPUSH_FULL",
    };
  }

  let files;
  let source;
  if (rangeLines?.length) {
    files = collectFilesFromRanges(rangeLines);
    source = "push-ranges";
  } else {
    const stdinRanges = await readPushRangesFromStdin();
    if (stdinRanges?.length) {
      files = collectFilesFromRanges(stdinRanges);
      source = "push-ranges";
    } else {
      files = collectFilesVsUpstream();
      source = "upstream-diff";
    }
  }

  return { ...classifyFiles(files), full: false, source };
}

export function formatBuckets(scope) {
  const bit = (name, on) => `${on ? "run" : "skip"} ${name}`;
  return [
    bit("check", scope.always),
    bit("test:ci", scope.unit),
    bit("site-build/deploy", scope.site),
    bit("visual", scope.visual),
  ].join("; ");
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const asFiles = process.argv.includes("--files");
  const fileArgs = [];
  if (asFiles) {
    const idx = process.argv.indexOf("--files");
    for (let i = idx + 1; i < process.argv.length && !process.argv[i].startsWith("-"); i++) {
      fileArgs.push(process.argv[i]);
    }
  }
  const scope = fileArgs.length
    ? { ...classifyFiles(fileArgs), full: false, source: "argv" }
    : await resolvePrePushScope({ full: process.argv.includes("--full") });
  console.log(`pre-push-scope: source=${scope.source}; ${formatBuckets(scope)}`);
  if (scope.files?.length) {
    console.log(`pre-push-scope: ${scope.files.length} file(s)`);
    for (const file of scope.files) console.log(`  ${file}`);
  }
}
