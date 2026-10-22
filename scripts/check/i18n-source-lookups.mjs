// Finds English-text translation lookups (tUiSource/translateSource calls) in a TypeScript source
// file. It parses the file instead of scanning lines, so a lookup is found however its arguments
// are wrapped, spaced or commented.
import ts from "typescript-compiler-api";

const lookupNames = new Set(["tUiSource", "translateSource"]);

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

/** Text fixed at authoring time: a string, a template without substitutions, or a choice of them. */
function isLiteralText(node) {
  if (ts.isParenthesizedExpression(node)) return isLiteralText(node.expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true;
  if (ts.isConditionalExpression(node))
    return isLiteralText(node.whenTrue) && isLiteralText(node.whenFalse);
  return false;
}

/**
 * Lists the English-text lookups in `text`. `literal` marks calls whose text argument is fixed at
 * authoring time and should therefore be translated by key instead.
 */
export function findSourceLookups(text, fileName = "source.tsx") {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, scriptKind);
  const lookups = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && lookupNames.has(calleeName(node.expression))) {
      const start = node.getStart(sourceFile);
      const argument = node.arguments[0];
      lookups.push({
        line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
        literal: argument !== undefined && isLiteralText(argument),
        text: node.getText(sourceFile).replace(/\s+/gu, " "),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return lookups;
}
