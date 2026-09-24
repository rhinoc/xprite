import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript-compiler-api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const boundary = path.join(root, "packages/ui/src/base/utils/dom-geometry.ts");
const aliasScopes = JSON.parse(
  ts.sys.readFile(path.join(root, "infra/package-import-scopes.json")),
).map((scope) => ({
  root: path.join(root, scope.directory, scope.source),
  aliases: Object.entries(scope.aliases).map(([prefix, destination]) => [
    prefix,
    path.resolve(root, scope.directory, destination),
  ]),
}));
const configs = [
  "apps/editor/tsconfig.json",
  "apps/gallery/tsconfig.json",
  "packages/ui/tsconfig.json",
  "packages/bedrock/tsconfig.browser.json",
  "packages/bedrock/tsconfig.common.json",
  "packages/editor-core/tsconfig.json",
];
const restricted = new Set([
  "getBoundingClientRect",
  "getClientRects",
  "getComputedStyle",
  "elementFromPoint",
  "elementsFromPoint",
  "scrollIntoView",
  "scrollTo",
  "scrollBy",
  "clientWidth",
  "clientHeight",
  "clientLeft",
  "clientTop",
  "offsetWidth",
  "offsetHeight",
  "offsetLeft",
  "offsetTop",
  "offsetParent",
  "scrollWidth",
  "scrollHeight",
  "scrollLeft",
  "scrollTop",
  "innerWidth",
  "innerHeight",
  "devicePixelRatio",
  "visualViewport",
  "screen",
  "scrollX",
  "scrollY",
  "offsetX",
  "offsetY",
  "clientX",
  "clientY",
  "pageX",
  "pageY",
  "screenX",
  "screenY",
  "movementX",
  "movementY",
  "contentRect",
  "contentBoxSize",
  "borderBoxSize",
  "devicePixelContentBoxSize",
  "ResizeObserver",
  "x",
  "y",
  "width",
  "height",
  "scale",
  "pageLeft",
  "pageTop",
  "getBBox",
  "getCTM",
  "getScreenCTM",
]);
const alwaysRestricted = new Set([
  "getBoundingClientRect",
  "getClientRects",
  "getComputedStyle",
  "elementFromPoint",
  "elementsFromPoint",
  "clientWidth",
  "clientHeight",
  "clientLeft",
  "clientTop",
  "offsetWidth",
  "offsetHeight",
  "offsetLeft",
  "offsetTop",
  "offsetParent",
  "scrollWidth",
  "scrollHeight",
  "scrollLeft",
  "scrollTop",
  "clientX",
  "clientY",
  "getBBox",
  "getCTM",
  "getScreenCTM",
]);
const failures = new Set();

function nativeSymbol(checker, symbol) {
  if (!symbol) return false;
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return (symbol.declarations ?? []).some((declaration) => {
    const filename = declaration.getSourceFile().fileName.replaceAll("\\", "/");
    return (
      /\/lib\.dom(?:\.iterable)?\.d\.ts$/.test(filename) ||
      /\/@types\/react\/[^/]*\.d\.ts$/.test(filename)
    );
  });
}

function specificNativeProperty(checker, symbol, parents) {
  return (
    nativeSymbol(checker, symbol) &&
    (symbol.declarations ?? []).some((declaration) =>
      parents.includes(declaration.parent?.name?.text),
    )
  );
}

function forbiddenProperty(checker, symbol, name) {
  if (name === "x" || name === "y")
    return specificNativeProperty(checker, symbol, ["MouseEvent", "PointerEvent"]);
  if (["width", "height", "scale", "pageLeft", "pageTop"].includes(name))
    return specificNativeProperty(checker, symbol, ["VisualViewport", "Screen"]);
  return alwaysRestricted.has(name) || nativeSymbol(checker, symbol);
}

for (const relative of configs) {
  const config = path.join(root, relative);
  const read = ts.readConfigFile(config, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config));
  const paths = {
    ...parsed.options.paths,
    "@xprite/ui": [path.join(root, "packages/ui/src/index.ts")],
    "@xprite/ui/*": [path.join(root, "packages/ui/src/*")],
  };
  const files = parsed.fileNames.filter((file) => !/\.test\.[cm]?tsx?$/.test(file));
  const options = { ...parsed.options, paths, noEmit: true };
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (names, importer) =>
    names.map((name) => {
      const scope = aliasScopes.find((candidate) => {
        const relative = path.relative(candidate.root, importer);
        return !relative.startsWith("..") && !path.isAbsolute(relative);
      });
      const alias = scope?.aliases.find(([prefix]) => name.startsWith(prefix));
      const target = alias ? path.join(alias[1], name.slice(alias[0].length)) : name;
      return ts.resolveModuleName(target, importer, options, ts.sys).resolvedModule;
    });
  const program = ts.createProgram({
    rootNames: files,
    options,
    host,
  });
  const checker = program.getTypeChecker();
  for (const filename of files) {
    if (path.resolve(filename) === boundary) continue;
    const source = program.getSourceFile(filename);
    if (!source) continue;
    const report = (node, name) => {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      failures.add(
        `${path.relative(root, filename)}:${position.line + 1}:${position.character + 1}: Native geometry ${name} must use @xprite/ui/utils (dom-geometry).`,
      );
    };
    const visit = (node) => {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "ResizeObserver"
      ) {
        report(node, "ResizeObserver");
      } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const name = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : ts.isStringLiteralLike(node.argumentExpression)
            ? node.argumentExpression.text
            : checker.getTypeAtLocation(node.argumentExpression).isStringLiteral()
              ? checker.getTypeAtLocation(node.argumentExpression).value
              : null;
        if (name && restricted.has(name)) {
          const type = checker.getTypeAtLocation(node.expression);
          const symbol = checker.getPropertyOfType(checker.getNonNullableType(type), name);
          if (forbiddenProperty(checker, symbol, name)) report(node, name);
        }
      } else if (
        ts.isIdentifier(node) &&
        [
          "getComputedStyle",
          "ResizeObserver",
          "innerWidth",
          "innerHeight",
          "devicePixelRatio",
          "visualViewport",
          "screen",
          "scrollX",
          "scrollY",
        ].includes(node.text) &&
        !ts.isPropertyAccessExpression(node.parent) &&
        !ts.isTypeReferenceNode(node.parent) &&
        !ts.isNewExpression(node.parent) &&
        nativeSymbol(checker, checker.getSymbolAtLocation(node))
      ) {
        report(node, node.text);
      } else if (ts.isObjectBindingPattern(node)) {
        const type = checker.getTypeAtLocation(node);
        for (const element of node.elements) {
          const property = element.propertyName ?? element.name;
          if (!ts.isIdentifier(property) && !ts.isStringLiteralLike(property)) continue;
          const name = property.text;
          if (
            restricted.has(name) &&
            (name === "clientX" ||
              name === "clientY" ||
              (alwaysRestricted.has(name) && type.flags & ts.TypeFlags.Any) ||
              (alwaysRestricted.has(name)
                ? nativeSymbol(checker, checker.getPropertyOfType(type, name))
                : forbiddenProperty(checker, checker.getPropertyOfType(type, name), name)))
          )
            report(element, name);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
if (failures.size) {
  console.error([...failures].sort().join("\n"));
  process.exitCode = 1;
} else console.log("DOM geometry access is contained in the shared boundary.");
