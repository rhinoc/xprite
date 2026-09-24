import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import babelParser from "@babel/parser";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(repositoryRoot, "packages/editor-core/src");
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const moduleExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(file);
    if (!sourceExtensions.has(path.extname(entry.name)) || /\.test\.[^.]+$/.test(entry.name))
      return [];
    return [path.resolve(file)];
  });
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
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

function getModuleSpecifiers(ast) {
  const specifiers = [];
  const add = (node) => {
    if (node?.type === "StringLiteral")
      specifiers.push({ value: node.value, location: node.loc?.start });
  };
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      (node.type === "ImportDeclaration" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") &&
      node.source
    ) {
      add(node.source);
    } else if (
      node.type === "CallExpression" &&
      (node.callee?.type === "Import" ||
        (node.callee?.type === "Identifier" && node.callee.name === "require"))
    ) {
      add(node.arguments?.[0]);
    } else if (node.type === "ImportExpression") {
      add(node.source);
    } else if (node.type === "TSImportType") {
      add(node.argument);
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "extra", "errors", "comments", "tokens"].includes(key)) continue;
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
      } else if (value && typeof value === "object" && typeof value.type === "string") {
        visit(value);
      }
    }
  }
  visit(ast);
  return specifiers;
}

const files = walk(sourceRoot);
const fileSet = new Set(files);
const graph = new Map(files.map((file) => [file, new Set()]));
const errors = [];
function report(file, location, message) {
  const relativeFile = path.relative(repositoryRoot, file).split(path.sep).join("/");
  errors.push(`${relativeFile}:${location?.line ?? 1}:${(location?.column ?? 0) + 1}: ${message}`);
}

for (const file of files) {
  let ast;
  try {
    ast = babelParser.parse(readFileSync(file, "utf8"), {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "decorators-legacy", "importAttributes"],
      errorRecovery: true,
    });
  } catch (error) {
    report(file, error.loc, `could not inspect imports: ${error.message}`);
    continue;
  }

  const relativeFile = path.relative(sourceRoot, file);
  const domain = relativeFile.split(path.sep)[0];
  const isPackageEntry = relativeFile === "index.ts";
  for (const { value, location } of getModuleSpecifiers(ast)) {
    if (
      !isPackageEntry &&
      domain !== "editor" &&
      domain !== "session" &&
      /^\$\/(editor|session)(\/|$)/.test(value)
    )
      report(file, location, `feature domain must not depend on editor/session layer "${value}"`);

    let target;
    if (value.startsWith("$/")) target = path.resolve(sourceRoot, value.slice(2));
    else if (value.startsWith("./") || value.startsWith("../"))
      target = path.resolve(path.dirname(file), value);
    else continue;

    if (!isWithin(sourceRoot, target)) {
      report(file, location, `local import escapes editor-core source: "${value}"`);
      continue;
    }
    const resolved = existingModulePath(target);
    if (!resolved) {
      report(file, location, `unresolved editor-core import "${value}"`);
      continue;
    }
    const resolvedFile = path.resolve(resolved);
    if (fileSet.has(resolvedFile)) graph.get(file).add(resolvedFile);
  }
}

let nextIndex = 0;
const indexes = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();
const cycles = [];
function connect(node) {
  indexes.set(node, nextIndex);
  lowLinks.set(node, nextIndex++);
  stack.push(node);
  onStack.add(node);
  for (const dependency of graph.get(node)) {
    if (!indexes.has(dependency)) {
      connect(dependency);
      lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
    } else if (onStack.has(dependency)) {
      lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(dependency)));
    }
  }
  if (lowLinks.get(node) !== indexes.get(node)) return;
  const component = [];
  let member;
  do {
    member = stack.pop();
    onStack.delete(member);
    component.push(member);
  } while (member !== node);
  if (component.length > 1 || graph.get(node).has(node)) cycles.push(component);
}

for (const file of graph.keys()) if (!indexes.has(file)) connect(file);
for (const cycle of cycles) {
  const chain = cycle.map((file) => path.relative(repositoryRoot, file).split(path.sep).join("/"));
  errors.push(`circular editor-core dependency: ${chain.join(" -> ")}`);
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.stderr.write(`\nEditor-core graph failed with ${errors.length} violation(s).\n`);
  process.exitCode = 1;
} else {
  const edgeCount = [...graph.values()].reduce((count, edges) => count + edges.size, 0);
  process.stdout.write(
    `Editor-core graph passed (${files.length} modules, ${edgeCount} edges, no cycles).\n`,
  );
}
