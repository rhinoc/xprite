import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";

import ts from "typescript";
const root = resolve("packages/editor-core/src");
const files = [];
function walk(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const p = resolve(path, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.[cm]?[jt]sx?$/.test(e.name)) files.push(p);
  }
}
walk(root);
const errors = [];
for (const file of files) {
  if (!file.endsWith(".ts")) errors.push(`${file}: only platform-neutral TypeScript allowed`);
  const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  if (
    ast.libReferenceDirectives.length ||
    ast.typeReferenceDirectives.length ||
    ast.referencedFiles.length
  )
    errors.push(`${file}: ambient/reference directives may bypass the isolated compiler boundary`);
  function module(spec) {
    if (!ts.isStringLiteralLike(spec)) {
      errors.push(`${file}: computed import is not auditable`);
      return;
    }
    const name = spec.text;
    if (!name.startsWith(".")) {
      // Tilemap zlib is the one audited, platform-neutral package dependency.
      if (!(name === "fflate" && relative(root, file) === "formats/ase/tilemap-compression.ts"))
        errors.push(`${file}: external dependency ${name}`);
    } else {
      const p = resolve(dirname(file), name);
      if (p !== root && !p.startsWith(root + "/"))
        errors.push(`${file}: dependency escapes core: ${name}`);
    }
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
      module(node.moduleSpecifier);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      module(node.arguments[0]);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      module(node.argument.literal);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
      errors.push(`${file}: JSX detected`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
if (errors.length) throw new Error(errors.join("\n"));
execFileSync("pnpm", ["exec", "tsgo", "-p", "packages/editor-core/tsconfig.json"], {
  stdio: "inherit",
});
console.log(
  `Editor boundary passed: ${files.length} files import within ${relative(process.cwd(), root)} except audited tilemap fflate, no JSX, independent ES2020 compile without DOM.`,
);
