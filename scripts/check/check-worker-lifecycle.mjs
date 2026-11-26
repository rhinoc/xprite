import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript-compiler-api";

import { shareSourceFiles } from "../base/ts-shared-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
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
  "apps/growth/tsconfig.json",
  "apps/editor/tsconfig.json",
  "apps/components/tsconfig.json",
  "apps/tools/tsconfig.json",
  "apps/xhs-minitools/tsconfig.json",
  "packages/editor-ui/tsconfig.json",
  "packages/ui/tsconfig.json",
  "packages/bedrock/tsconfig.browser.json",
  "packages/bedrock/tsconfig.common.json",
  "packages/editor-core/tsconfig.json",
];

/** Low-level Bedrock worker transport modules that own listener attachment. */
const transportBoundaryFiles = new Set([
  path.join(root, "packages/bedrock/browser/managed-worker.ts"),
  path.join(root, "packages/bedrock/browser/worker-request-channel.ts"),
  path.join(root, "packages/bedrock/browser/worker-job.ts"),
]);

/** Nested WASM worker factories registered inside workers via setAcRlBrowserWorkerFactory. */
const nestedWasmWorkerFiles = new Set([
  path.join(root, "apps/editor/src/adapters/workers/import-worker.ts"),
  path.join(root, "apps/editor/src/adapters/workers/video-frame-processing.ts"),
]);

/**
 * Package-isolated worker client that cannot import @xprite/bedrock/browser under the
 * editor-ui dependency-cruiser boundary; it encapsulates matching startup retry inside its own factory.
 */
const standaloneManagedClientFiles = new Set([
  path.join(root, "packages/editor-ui/src/animal-crossing/preview-client.ts"),
]);

const managedWorkerSpecifiers = new Set([
  "@xprite/bedrock/browser/managed-worker",
  "$/managed-worker",
]);

const workerEventProperties = new Set(["onmessage", "onerror", "onmessageerror"]);
const workerEventTypes = new Set(["message", "error", "messageerror"]);

const failures = new Set();

function isNativeWorkerConstructor(checker, expression) {
  if (!ts.isIdentifier(expression) || expression.text !== "Worker") return false;
  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol) return true;
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return (target.declarations ?? []).some((declaration) => {
    const filename = declaration.getSourceFile().fileName.replaceAll("\\", "/");
    return /\/lib\.(?:dom|webworker)(?:\.iterable)?\.d\.ts$/.test(filename);
  });
}

function isWorkerInstanceType(checker, type) {
  const nonNullable = checker.getNonNullableType(type);
  if (nonNullable.isUnion()) {
    return nonNullable.types.some((member) => isWorkerInstanceType(checker, member));
  }
  const symbol = nonNullable.getSymbol();
  if (!symbol || symbol.name !== "Worker") return false;
  return (symbol.declarations ?? []).some((declaration) => {
    const filename = declaration.getSourceFile().fileName.replaceAll("\\", "/");
    return /\/lib\.(?:dom|webworker)(?:\.iterable)?\.d\.ts$/.test(filename);
  });
}

function isInsideFactoryFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isArrowFunction(current) ||
      ts.isFunctionExpression(current) ||
      ts.isFunctionDeclaration(current)
    ) {
      // Ensure the factory directly returns or constructs the worker without attaching listeners.
      if (ts.isArrowFunction(current) && !ts.isBlock(current.body)) return true;
      if (
        (ts.isArrowFunction(current) ||
          ts.isFunctionExpression(current) ||
          ts.isFunctionDeclaration(current)) &&
        current.body &&
        ts.isBlock(current.body) &&
        current.body.statements.length === 1 &&
        ts.isReturnStatement(current.body.statements[0])
      ) {
        return true;
      }
      return false;
    }
    current = current.parent;
  }
  return false;
}

function isInsideNestedWasmFactoryRegistration(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "setAcRlBrowserWorkerFactory"
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function importsManagedWorker(source) {
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      managedWorkerSpecifiers.has(statement.moduleSpecifier.text)
    ) {
      return true;
    }
  }
  return false;
}

for (const relative of configs) {
  const config = path.join(root, relative);
  const read = ts.readConfigFile(config, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config));
  const paths = {
    ...parsed.options.paths,
    "@xprite/bedrock/*": [path.join(root, "packages/bedrock/*")],
  };
  const files = parsed.fileNames.filter((file) => !/\.test\.[cm]?tsx?$/.test(file));
  const options = { ...parsed.options, paths, noEmit: true };
  const host = shareSourceFiles(ts.createCompilerHost(options), options);
  host.resolveModuleNames = (names, importer) =>
    names.map((name) => {
      const scope = aliasScopes.find((candidate) => {
        const rel = path.relative(candidate.root, importer);
        return !rel.startsWith("..") && !path.isAbsolute(rel);
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
    const resolved = path.resolve(filename);
    const source = program.getSourceFile(filename);
    if (!source) continue;
    const hasManagedImport = importsManagedWorker(source);
    const isTransportBoundary = transportBoundaryFiles.has(resolved);
    const isNestedWasm = nestedWasmWorkerFiles.has(resolved);
    const isStandaloneClient = standaloneManagedClientFiles.has(resolved);

    const report = (node, message) => {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      failures.add(
        `${path.relative(root, filename)}:${position.line + 1}:${position.character + 1}: ${message}`,
      );
    };

    const visit = (node) => {
      if (ts.isNewExpression(node) && isNativeWorkerConstructor(checker, node.expression)) {
        if (isNestedWasm) {
          if (!isInsideFactoryFunction(node) || !isInsideNestedWasmFactoryRegistration(node)) {
            report(
              node,
              "Nested WASM Worker must be constructed inside a factory passed to setAcRlBrowserWorkerFactory.",
            );
          }
        } else if (isStandaloneClient) {
          if (!isInsideFactoryFunction(node)) {
            report(
              node,
              "Standalone managed Worker client must isolate `new Worker(...)` inside a factory function.",
            );
          }
        } else {
          if (!hasManagedImport) {
            report(
              node,
              "Raw `new Worker(...)` must be managed through @xprite/bedrock/browser/managed-worker.",
            );
          } else if (!isInsideFactoryFunction(node)) {
            report(
              node,
              "`new Worker(...)` must be isolated inside a worker factory function passed to @xprite/bedrock/browser/managed-worker.",
            );
          }
        }
      } else if (!isTransportBoundary && !isStandaloneClient) {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          workerEventProperties.has(node.left.name.text) &&
          isWorkerInstanceType(checker, checker.getTypeAtLocation(node.left.expression))
        ) {
          report(
            node,
            `Direct Worker.${node.left.name.text} listener attachment must go through @xprite/bedrock/browser/managed-worker.`,
          );
        } else if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "addEventListener" &&
          node.arguments.length >= 1 &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          workerEventTypes.has(node.arguments[0].text) &&
          isWorkerInstanceType(checker, checker.getTypeAtLocation(node.expression.expression))
        ) {
          report(
            node,
            `Direct Worker.addEventListener("${node.arguments[0].text}") must go through @xprite/bedrock/browser/managed-worker.`,
          );
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
} else {
  console.log("Worker lifecycle boundaries are enforced.");
}
