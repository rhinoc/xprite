import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript-compiler-api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checkedDirs = ["apps/editor/src/components/dialogs", "apps/tools/src/components"];
const sourcePattern = /\.[cm]?[jt]sx?$/;
const testPattern = /\.test\.[cm]?[jt]sx?$/;
const failures = [];

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (entry.isFile() && sourcePattern.test(entry.name) && !testPattern.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stringLiteralValue(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function calledMethodName(expression) {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) {
    return stringLiteralValue(expression.argumentExpression);
  }
  return null;
}

for (const relativeDir of checkedDirs) {
  const dir = path.join(root, relativeDir);
  for (const filename of collectFiles(dir)) {
    const text = fs.readFileSync(filename, "utf8");
    const kind =
      filename.endsWith(".tsx") || filename.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, kind);
    const report = (node, detail) => {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      failures.push(
        `${path.relative(root, filename)}:${position.line + 1}:${position.character + 1}: ${detail}`,
      );
    };
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const method = calledMethodName(node.expression);
        if (method === "addEventListener" && stringLiteralValue(node.arguments[0]) === "focusin") {
          report(
            node,
            'Raw addEventListener("focusin", ...) is forbidden in dialog components; use useModalFocus from @xprite/ui.',
          );
        } else if (
          (ts.isIdentifier(node.expression) && node.expression.text === "createModalFocusScope") ||
          method === "createModalFocusScope"
        ) {
          report(
            node,
            "Direct createModalFocusScope(...) is forbidden in dialog components; use useModalFocus from @xprite/ui.",
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

if (failures.length) {
  console.error([...new Set(failures)].sort().join("\n"));
  process.exitCode = 1;
} else {
  console.log("Dialog modal focus containment uses @xprite/ui useModalFocus.");
}
