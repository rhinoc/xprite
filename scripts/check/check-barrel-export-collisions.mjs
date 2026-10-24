// Fails when a package barrel (index.ts re-export hub) would expose the same
// value export name from two different origin modules — the #102 failure mode
// (exact vs fuzzy paletteColorIndex colliding via export * / selective export).
//
// Catches:
// 1. Surface collision: two origins both contribute the same name to the barrel
//    (two export *, or explicit+star before ES skips, reported when >1 origin remains).
// 2. Latent twin: the barrel surfaces name N from module A, while another module
//    the barrel also re-exports from defines N locally but did not contribute it
//    (selective export dropped it). Callers still see N and silently get A's twin.
//
//   node scripts/check/check-barrel-export-collisions.mjs
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import babelParser from "@babel/parser";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function walkIndexFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "generated" ||
        entry.name.startsWith(".")
      )
        return [];
      return walkIndexFiles(file);
    }
    if (entry.name !== "index.ts" && entry.name !== "index.tsx") return [];
    if (/\.test\./.test(entry.name)) return [];
    return [path.resolve(file)];
  });
}

function existingModulePath(basePath) {
  const candidates = [basePath];
  const extension = path.extname(basePath);
  if (extension === ".js")
    candidates.push(basePath.slice(0, -3) + ".ts", basePath.slice(0, -3) + ".tsx");
  else if (extension === ".jsx")
    candidates.push(basePath.slice(0, -4) + ".tsx", basePath.slice(0, -4) + ".ts");
  else if (!extension) {
    for (const candidateExtension of moduleExtensions)
      candidates.push(basePath + candidateExtension);
    for (const candidateExtension of moduleExtensions)
      candidates.push(path.join(basePath, `index${candidateExtension}`));
  }
  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function packageSrcRoot(file) {
  const relative = path.relative(repositoryRoot, file).split(path.sep);
  if (relative[0] === "packages" && relative[1] === "bedrock") {
    // bedrock uses packages/bedrock/{browser,common} without a shared src/
    if (relative[2] === "browser" || relative[2] === "common")
      return path.join(repositoryRoot, "packages/bedrock", relative[2]);
    return path.join(repositoryRoot, "packages/bedrock");
  }
  if (relative[0] === "packages") return path.join(repositoryRoot, "packages", relative[1], "src");
  if (relative[0] === "apps") return path.join(repositoryRoot, "apps", relative[1], "src");
  return null;
}

function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith("$/")) {
    const srcRoot = packageSrcRoot(fromFile);
    if (!srcRoot) return null;
    return existingModulePath(path.resolve(srcRoot, specifier.slice(2)));
  }
  if (specifier.startsWith("./") || specifier.startsWith("../"))
    return existingModulePath(path.resolve(path.dirname(fromFile), specifier));
  return null;
}

function parse(file) {
  return babelParser.parse(readFileSync(file, "utf8"), {
    sourceType: "module",
    plugins: ["typescript", "jsx", "decorators-legacy", "importAttributes"],
    errorRecovery: true,
  });
}

function localValueExportNames(ast) {
  const names = new Set();
  for (const node of ast.program.body) {
    if (node.type === "ExportNamedDeclaration" && !node.source) {
      const declaration = node.declaration;
      if (declaration) {
        if (
          (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") &&
          declaration.id
        )
          names.add(declaration.id.name);
        else if (declaration.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations)
            if (declarator.id?.type === "Identifier") names.add(declarator.id.name);
        } else if (declaration.type === "TSEnumDeclaration" && declaration.id)
          names.add(declaration.id.name);
      }
      for (const specifier of node.specifiers || []) {
        if (specifier.exportKind === "type") continue;
        if (specifier.type === "ExportSpecifier" && specifier.exported.type === "Identifier")
          names.add(specifier.exported.name);
      }
    }
  }
  return names;
}

const exportCache = new Map();

/** Map of value export name -> Set of origin file paths that define it. */
function moduleValueExports(file, stack = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (stack.has(file)) return new Map();
  stack.add(file);
  const map = new Map();
  const add = (name, origin) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(origin);
  };
  let ast;
  try {
    ast = parse(file);
  } catch {
    exportCache.set(file, map);
    stack.delete(file);
    return map;
  }
  for (const name of localValueExportNames(ast)) add(name, file);
  for (const node of ast.program.body) {
    if (node.type === "ExportAllDeclaration" && node.source && node.exportKind !== "type") {
      if (node.exported) continue; // export * as ns
      const target = resolveSpecifier(file, node.source.value);
      if (!target) continue;
      for (const [name, origins] of moduleValueExports(target, stack))
        for (const origin of origins) add(name, origin);
    }
    if (node.type === "ExportNamedDeclaration" && node.source && node.exportKind !== "type") {
      const target = resolveSpecifier(file, node.source.value);
      if (!target) continue;
      const targetExports = moduleValueExports(target, stack);
      for (const specifier of node.specifiers) {
        if (specifier.type !== "ExportSpecifier" || specifier.exportKind === "type") continue;
        const exported =
          specifier.exported.type === "Identifier"
            ? specifier.exported.name
            : specifier.exported.value;
        const local =
          specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value;
        const origins = targetExports.get(local);
        if (origins) for (const origin of origins) add(exported, origin);
        else add(exported, target);
      }
    }
  }
  exportCache.set(file, map);
  stack.delete(file);
  return map;
}

function rel(file) {
  return path.relative(repositoryRoot, file).split(path.sep).join("/");
}

function analyzeBarrel(file) {
  const ast = parse(file);
  const explicit = new Map();
  const fromStar = new Map();
  const add = (map, name, origin) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(origin);
  };
  /** Direct re-export sources of this barrel (for latent-twin detection). */
  const sources = [];

  for (const node of ast.program.body) {
    if (
      node.type === "ExportAllDeclaration" &&
      node.source &&
      node.exportKind !== "type" &&
      !node.exported
    ) {
      const target = resolveSpecifier(file, node.source.value);
      if (!target) continue;
      sources.push({ file: target, kind: "star", line: node.loc?.start?.line ?? 1 });
      for (const [name, origins] of moduleValueExports(target))
        for (const origin of origins) add(fromStar, name, origin);
    }
    if (node.type === "ExportNamedDeclaration" && node.source && node.exportKind !== "type") {
      const target = resolveSpecifier(file, node.source.value);
      if (!target) continue;
      sources.push({ file: target, kind: "selective", line: node.loc?.start?.line ?? 1 });
      const targetExports = moduleValueExports(target);
      for (const specifier of node.specifiers) {
        if (specifier.type !== "ExportSpecifier" || specifier.exportKind === "type") continue;
        const exported =
          specifier.exported.type === "Identifier"
            ? specifier.exported.name
            : specifier.exported.value;
        const local =
          specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value;
        const origins = targetExports.get(local);
        if (origins) for (const origin of origins) add(explicit, exported, origin);
        else add(explicit, exported, target);
      }
    }
    if (node.type === "ExportNamedDeclaration" && !node.source) {
      for (const name of localValueExportNames({ program: { body: [node] } }))
        add(explicit, name, file);
    }
  }

  // ES modules: export * skips names already exported explicitly.
  const surface = new Map();
  for (const [name, origins] of explicit) surface.set(name, new Set(origins));
  for (const [name, origins] of fromStar) {
    if (explicit.has(name)) continue;
    surface.set(name, new Set(origins));
  }

  const surfaceCollisions = [];
  for (const [name, origins] of surface)
    if (origins.size > 1) surfaceCollisions.push({ name, origins: [...origins].map(rel).sort() });

  const latentTwins = [];
  for (const [name, origins] of surface) {
    if (origins.size !== 1) continue;
    const surfaceOrigin = path.resolve([...origins][0]);
    for (const source of sources) {
      let sourceAst;
      try {
        sourceAst = parse(source.file);
      } catch {
        continue;
      }
      if (!localValueExportNames(sourceAst).has(name)) continue;
      if (path.resolve(source.file) === surfaceOrigin) continue;
      // Source defines N locally but is not the origin that reached the surface.
      latentTwins.push({
        name,
        surfaceOrigin: rel(surfaceOrigin),
        other: rel(source.file),
        via: source.kind,
        line: source.line,
      });
    }
  }

  return { surfaceCollisions, latentTwins };
}

function collectBarrels() {
  const roots = [
    path.join(repositoryRoot, "packages"),
    path.join(repositoryRoot, "apps/editor/src"),
  ];
  return roots.flatMap((root) => {
    try {
      return walkIndexFiles(root);
    } catch {
      return [];
    }
  });
}

/** Synthetic #102 fixture: must fail the checker. */
function assertCatchesPalette102Pattern() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "xprite-barrel-102-"));
  try {
    const fuzzy = path.join(dir, "fuzzy.ts");
    const exact = path.join(dir, "exact.ts");
    const barrel = path.join(dir, "index.ts");
    writeFileSync(fuzzy, "export function paletteColorIndex() { return 1; }\n");
    writeFileSync(
      exact,
      "export function paletteColorIndex() { return -1; }\nexport function appendMissing() {}\n",
    );
    // Selective drop of exact's paletteColorIndex while star-exporting fuzzy — #102 shape.
    writeFileSync(
      barrel,
      'export * from "./fuzzy.ts";\nexport { appendMissing } from "./exact.ts";\n',
    );
    // Resolve relative .ts paths: existingModulePath handles extension.
    // Relative-only fixture (no $/ alias). analyzeBarrel resolves ./ paths.
    const result = analyzeBarrel(barrel);
    const latent = result.latentTwins.some((t) => t.name === "paletteColorIndex");
    const surface = result.surfaceCollisions.some((t) => t.name === "paletteColorIndex");
    if (!latent && !surface) {
      throw new Error(
        "barrel checker fixture failed: expected to catch #102-style paletteColorIndex twin",
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

assertCatchesPalette102Pattern();

const errors = [];
const barrels = collectBarrels();
for (const barrel of barrels) {
  let result;
  try {
    result = analyzeBarrel(barrel);
  } catch (error) {
    errors.push(`${rel(barrel)}: could not analyze barrel: ${error.message}`);
    continue;
  }
  for (const collision of result.surfaceCollisions) {
    errors.push(
      `${rel(barrel)}: export "${collision.name}" collides from ${collision.origins.join(" and ")} — rename one twin or stop star-exporting both (would have caught #102 dual export *)`,
    );
  }
  for (const twin of result.latentTwins) {
    errors.push(
      `${rel(barrel)}:${twin.line}: surfaces "${twin.name}" from ${twin.surfaceOrigin}, but ${twin.other} (also ${twin.via}-exported here) defines the same name — rename one twin so callers cannot silently get the wrong implementation (#102 selective-drop mode)`,
    );
  }
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.stderr.write(
    `\nBarrel export collision check failed with ${errors.length} issue(s) across ${barrels.length} barrels.\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Barrel export collision check passed (${barrels.length} barrels, no same-name twins).\n`,
  );
}
