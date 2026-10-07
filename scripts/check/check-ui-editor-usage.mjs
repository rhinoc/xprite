import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript-compiler-api";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const uiDir = path.join(rootDir, "packages/ui/src");
const uiEntryPath = path.join(uiDir, "index.ts");
const pageApplications = [
  {
    directory: "apps/editor",
    entries: ["src/main.tsx", "src/adapters/minitool/main.tsx"],
  },
  {
    directory: "apps/tools",
    entries: [
      "src/main.tsx",
      "src/tools-main.tsx",
      "src/gif-main.tsx",
      "src/animal-crossing-main.tsx",
      "src/ssg.tsx",
    ],
  },
  {
    directory: "apps/growth",
    entries: ["src/main.tsx", "src/public-main.tsx", "src/public-ssg.tsx"],
  },
  {
    directory: "apps/gallery",
    entries: ["src/main.tsx"],
  },
];
// Gallery chrome is real UI, but its configuration-driven component cards are demos.
const componentPreviewBoundary = {
  filename: path.join(rootDir, "apps/gallery/src/Gallery.tsx"),
  name: "GalleryCard",
};
const pageDirectories = pageApplications.map(({ directory }) =>
  path.join(rootDir, directory, "src"),
);
const renderDirectories = [
  ...pageDirectories,
  uiDir,
  path.join(rootDir, "packages/editor-ui/src"),
  path.join(rootDir, "packages/site-shell/src"),
];
const aliasScopes = JSON.parse(
  fs.readFileSync(path.join(rootDir, "infra/package-import-scopes.json"), "utf8"),
).map(({ directory, source, aliases }) => ({
  source: path.join(rootDir, directory, source),
  aliases: Object.entries(aliases)
    .sort(([left], [right]) => right.length - left.length)
    .map(([prefix, target]) => [prefix, path.resolve(rootDir, directory, target)]),
}));

const configurations = pageApplications.map(({ directory }) => {
  const configPath = path.join(rootDir, directory, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  return ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
    {},
    configPath,
  );
});
const paths = {
  ...configurations[0].options.paths,
  "@xprite/ui": [uiEntryPath],
  "@xprite/ui/*": [path.join(uiDir, "*")],
  "@xprite/editor-ui": [path.join(rootDir, "packages/editor-ui/src/index.ts")],
  "@xprite/editor-ui/*": [path.join(rootDir, "packages/editor-ui/src/*")],
  "@xprite/editor-core": [path.join(rootDir, "packages/editor-core/src/index.ts")],
  "@xprite/editor-core/*": [path.join(rootDir, "packages/editor-core/src/*")],
  "@xprite/bedrock/*": [path.join(rootDir, "packages/bedrock/*")],
};
const options = { ...configurations[0].options, noEmit: true, paths };
const host = ts.createCompilerHost(options);
const resolveModule = (name, importer) => {
  const scope = aliasScopes.find(({ source }) => isWithin(source, importer));
  const alias = scope?.aliases.find(([prefix]) => name.startsWith(prefix));
  const target = alias ? path.join(alias[1], name.slice(alias[0].length)) : name;
  return ts.resolveModuleName(target, importer, options, ts.sys).resolvedModule;
};
host.resolveModuleNames = (names, importer) => names.map((name) => resolveModule(name, importer));
const program = ts.createProgram({
  rootNames: [
    ...configurations.flatMap(({ fileNames }) =>
      fileNames.filter((file) => !/\.(?:test|spec)\.[cm]?tsx?$/.test(file)),
    ),
    uiEntryPath,
  ],
  options,
  host,
});
const checker = program.getTypeChecker();

function canonicalSymbol(symbol) {
  if (!symbol || !(symbol.flags & ts.SymbolFlags.Alias)) return symbol;
  try {
    return checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
}

function isWithin(directory, filename) {
  const relative = path.relative(directory, path.resolve(filename));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function getJsxTagSymbol(tagName) {
  if (ts.isPropertyAccessExpression(tagName)) {
    return canonicalSymbol(checker.getSymbolAtLocation(tagName.name));
  }
  if (!ts.isIdentifier(tagName)) return undefined;
  return canonicalSymbol(checker.getSymbolAtLocation(tagName));
}

function hasJsx(node) {
  let found = false;
  const visit = (child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function findLazyTargets(symbol) {
  const targets = new Set();
  for (const declaration of canonicalSymbol(symbol)?.declarations ?? []) {
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) continue;
    const imports = [];
    const memberNames = new Set();
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        imports.push(node.arguments[0].text);
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
        memberNames.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(declaration.initializer);
    for (const specifier of imports) {
      const resolved = resolveModule(
        specifier,
        declaration.getSourceFile().fileName,
      )?.resolvedFileName;
      const moduleFile = resolved && program.getSourceFile(resolved);
      const moduleSymbol = moduleFile && checker.getSymbolAtLocation(moduleFile);
      if (!moduleSymbol) continue;
      for (const exported of checker.getExportsOfModule(moduleSymbol)) {
        if (
          !memberNames.has(exported.getName()) &&
          !(memberNames.size === 0 && exported.getName() === "default")
        )
          continue;
        const target = canonicalSymbol(exported);
        if (findFunctionLike(target)) targets.add(target);
      }
    }
  }
  return [...targets];
}

function findFunctionLike(symbol) {
  const declarations = canonicalSymbol(symbol)?.declarations ?? [];
  for (const declaration of declarations) {
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
      if (hasJsx(declaration)) return declaration;
    }
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) continue;
    const initializer = declaration.initializer;
    if (
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
      hasJsx(initializer)
    ) {
      return initializer;
    }

    let candidate;
    const visit = (node) => {
      if (
        !candidate &&
        (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        hasJsx(node)
      ) {
        candidate = node;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(initializer);
    if (candidate) return candidate;
  }
  return undefined;
}

function typeLiteralValues(type) {
  if (!type) return [];
  const constrained = checker.getBaseConstraintOfType(type) ?? type;
  const members = constrained.isUnion() ? constrained.types : [constrained];
  const values = new Set();
  for (const member of members) {
    if (member.flags & ts.TypeFlags.StringLiteral) values.add(member.value);
    else if (member.flags & ts.TypeFlags.NumberLiteral) values.add(String(member.value));
    else if (member.flags & ts.TypeFlags.EnumLiteral && typeof member.value === "string")
      values.add(member.value);
  }
  return [...values];
}

function getComponentPropsType(symbol) {
  const declaration =
    canonicalSymbol(symbol)?.valueDeclaration ?? canonicalSymbol(symbol)?.declarations?.[0];
  if (!declaration) return undefined;
  const componentType = checker.getTypeOfSymbolAtLocation(canonicalSymbol(symbol), declaration);
  const propsTypes = componentType.getCallSignatures().flatMap((signature) => {
    const propsParameter = signature.getParameters()[0];
    return propsParameter
      ? [
          checker.getTypeOfSymbolAtLocation(
            propsParameter,
            propsParameter.valueDeclaration ?? declaration,
          ),
        ]
      : [];
  });
  return propsTypes.length ? checker.getUnionType(propsTypes) : undefined;
}

function getVariantDefaults(functionNode, propsType, variantValues) {
  const parameter = functionNode?.parameters[0];
  const patterns = [];
  if (parameter && ts.isObjectBindingPattern(parameter.name)) patterns.push(parameter.name);
  if (
    parameter &&
    ts.isIdentifier(parameter.name) &&
    functionNode.body &&
    ts.isBlock(functionNode.body)
  ) {
    const parameterSymbol = checker.getSymbolAtLocation(parameter.name);
    for (const statement of functionNode.body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isObjectBindingPattern(declaration.name) &&
          declaration.initializer &&
          ts.isIdentifier(declaration.initializer) &&
          checker.getSymbolAtLocation(declaration.initializer) === parameterSymbol
        )
          patterns.push(declaration.name);
      }
    }
  }
  for (const pattern of patterns) {
    for (const binding of pattern.elements) {
      const propertyName = binding.propertyName ?? binding.name;
      if (!ts.isIdentifier(propertyName) || propertyName.text !== "variant" || !binding.initializer)
        continue;
      const values = typeLiteralValues(checker.getTypeAtLocation(binding.initializer));
      if (values.length) return values;
    }
  }

  // A theme-dependent default can be computed in the component body, e.g.
  // suppliedVariant ?? theme.areaVariant ?? "mini". Omitted props are empty here.
  const context = makeComponentContext(functionNode, []);
  if (context.variantSymbols.size && functionNode.body && ts.isBlock(functionNode.body)) {
    for (const statement of functionNode.body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer) continue;
        let usesVariant = false;
        const visit = (node) => {
          if (
            ts.isIdentifier(node) &&
            context.variantSymbols.has(canonicalSymbol(checker.getSymbolAtLocation(node)))
          )
            usesVariant = true;
          ts.forEachChild(node, visit);
        };
        visit(declaration.initializer);
        if (!usesVariant) continue;
        const defaults = literalValuesFromExpression(declaration.initializer, context);
        if (defaults.length && defaults.every((value) => variantValues.includes(value)))
          return defaults;
      }
    }
  }

  if (!propsType) return [];
  const constituents = propsType.isUnion() ? propsType.types : [propsType];
  for (const constituent of constituents) {
    const property = checker.getPropertyOfType(constituent, "variant");
    if (!property || !(property.flags & ts.SymbolFlags.Optional)) continue;
    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      property.valueDeclaration ?? functionNode ?? uiEntryPath,
    );
    const defaults = typeLiteralValues(propertyType);
    if (defaults.length === 1 && variantValues.includes(defaults[0])) return defaults;
  }
  return [];
}

const uiEntry = program.getSourceFile(uiEntryPath);
const uiModule = uiEntry && checker.getSymbolAtLocation(uiEntry);
if (!uiModule)
  throw new Error("Could not load packages/ui/src/index.ts with the TypeScript program.");

const publicComponents = new Map();
for (const exportedSymbol of checker.getExportsOfModule(uiModule)) {
  const symbol = canonicalSymbol(exportedSymbol);
  const functionNode = findFunctionLike(symbol);
  if (!functionNode) continue;
  const propsType = getComponentPropsType(symbol);
  const variantProperty = propsType && checker.getPropertyOfType(propsType, "variant");
  let variants = [];
  if (variantProperty) {
    const variantType = checker.getTypeOfSymbolAtLocation(
      variantProperty,
      variantProperty.valueDeclaration ?? functionNode,
    );
    variants = typeLiteralValues(variantType);
  }
  const name = exportedSymbol.getName();
  publicComponents.set(symbol, {
    name,
    functionNode,
    propsType,
    variants,
    defaultVariants: getVariantDefaults(functionNode, propsType, variants),
  });
}

function sourceKind(symbol) {
  const declarations = canonicalSymbol(symbol)?.declarations ?? [];
  if (
    declarations.some(
      (declaration) =>
        path.resolve(declaration.getSourceFile().fileName) === componentPreviewBoundary.filename &&
        declaration.name?.text === componentPreviewBoundary.name,
    )
  )
    return undefined;
  if (declarations.some((declaration) => isWithin(uiDir, declaration.getSourceFile().fileName)))
    return "ui";
  if (
    declarations.some((declaration) =>
      renderDirectories.some((directory) =>
        isWithin(directory, declaration.getSourceFile().fileName),
      ),
    )
  )
    return "page";
  return undefined;
}

function literalValuesFromExpression(expression, context, seen = new Set()) {
  if (!expression) return [];
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return literalValuesFromExpression(expression.expression, context, seen);
  }
  if (ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression))
    return [String(expression.text)];
  if (ts.isPropertyAccessExpression(expression)) {
    const constant = checker.getConstantValue(expression);
    if (constant !== undefined) return [String(constant)];
    if (expression.name.text === "variant") {
      const receiver = checker.getSymbolAtLocation(expression.expression);
      if (receiver && context.propsSymbols.has(canonicalSymbol(receiver)))
        return context.variantValues ?? [];
    }
  }
  if (ts.isElementAccessExpression(expression)) {
    const constant = checker.getConstantValue(expression);
    if (constant !== undefined) return [String(constant)];
  }
  if (ts.isIdentifier(expression)) {
    const symbol = canonicalSymbol(checker.getSymbolAtLocation(expression));
    if (symbol && context.variantSymbols.has(symbol)) return context.variantValues ?? [];
    if (symbol && context.propsSymbols.has(symbol)) return context.variantValues ?? [];
    if (symbol && !seen.has(symbol)) {
      seen.add(symbol);
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer)
          return literalValuesFromExpression(declaration.initializer, context, seen);
        if (ts.isBindingElement(declaration) && declaration.initializer)
          return literalValuesFromExpression(declaration.initializer, context, seen);
      }
    }
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...new Set([
        ...literalValuesFromExpression(expression.whenTrue, context, seen),
        ...literalValuesFromExpression(expression.whenFalse, context, seen),
      ]),
    ];
  }
  if (ts.isBinaryExpression(expression)) {
    if (
      expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [
        ...new Set([
          ...literalValuesFromExpression(expression.left, context, seen),
          ...literalValuesFromExpression(expression.right, context, seen),
        ]),
      ];
    }
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const values = [];
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property))
        values.push(...literalValuesFromExpression(property.expression, context, seen));
      else if (
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
        property.name.text === "variant"
      ) {
        values.push(...literalValuesFromExpression(property.initializer, context, seen));
      }
    }
    if (values.length) return [...new Set(values)];
  }

  const expressionType = checker.getTypeAtLocation(expression);
  return typeLiteralValues(expressionType);
}

function makeComponentContext(functionNode, variantValues) {
  const context = {
    functionNode,
    variantValues,
    propsSymbols: new Set(),
    variantSymbols: new Set(),
  };
  const parameter = functionNode?.parameters[0];
  if (!parameter) return context;
  if (ts.isIdentifier(parameter.name)) {
    const symbol = canonicalSymbol(checker.getSymbolAtLocation(parameter.name));
    if (symbol) context.propsSymbols.add(symbol);
    return context;
  }
  if (!ts.isObjectBindingPattern(parameter.name)) return context;
  for (const binding of parameter.name.elements) {
    const property = binding.propertyName ?? binding.name;
    if (!ts.isIdentifier(property) || !ts.isIdentifier(binding.name)) continue;
    const symbol = canonicalSymbol(checker.getSymbolAtLocation(binding.name));
    if (!symbol) continue;
    if (property.text === "variant") context.variantSymbols.add(symbol);
    if (property.text === "props") context.propsSymbols.add(symbol);
  }
  return context;
}

function jsxVariantValues(attributes, context) {
  let hasVariant = false;
  let values = [];
  for (const attribute of attributes.properties) {
    if (
      ts.isJsxAttribute(attribute) &&
      ts.isIdentifier(attribute.name) &&
      attribute.name.text === "variant"
    ) {
      hasVariant = true;
      if (attribute.initializer && ts.isJsxExpression(attribute.initializer))
        values = literalValuesFromExpression(attribute.initializer.expression, context);
      else if (attribute.initializer && ts.isStringLiteralLike(attribute.initializer))
        values = [attribute.initializer.text];
      continue;
    }
    if (ts.isJsxSpreadAttribute(attribute)) {
      const spreadValues = literalValuesFromExpression(attribute.expression, context);
      if (spreadValues.length) {
        hasVariant = true;
        values = [...new Set([...values, ...spreadValues])];
      }
    }
  }
  return { hasVariant, values };
}

function getComponentCallVariant(component, attributes, parentContext) {
  const { hasVariant, values } = jsxVariantValues(attributes, parentContext);
  if (hasVariant && values.length) return values;
  if (!hasVariant && component?.defaultVariants.length) return component.defaultVariants;
  if (!hasVariant && component?.variants.length === 1) return [component.variants[0]];
  if (!hasVariant) return undefined;
  return values;
}

function serialForSymbol(symbol) {
  return (canonicalSymbol(symbol)?.declarations ?? [])
    .map((declaration) => {
      const start = declaration.getStart();
      return declaration.getSourceFile().fileName + ":" + start;
    })
    .join("|");
}

function getJsxNameSymbol(tagName) {
  if (ts.isIdentifier(tagName)) return getJsxTagSymbol(tagName);
  if (ts.isPropertyAccessExpression(tagName)) return getJsxTagSymbol(tagName);
  return undefined;
}

function getJsxParts(node) {
  if (ts.isJsxElement(node))
    return { tagName: node.openingElement.tagName, attributes: node.openingElement.attributes };
  return { tagName: node.tagName, attributes: node.attributes };
}

function findPageRoots(mainFile) {
  const roots = new Set();
  const addRoot = (symbol) => {
    if (symbol && sourceKind(symbol) && findFunctionLike(symbol)) roots.add(symbol);
  };
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const symbol = getJsxNameSymbol(getJsxParts(node).tagName);
      addRoot(symbol);
    }
    // Tool entry points pass a JSX-producing application factory to the bootstrap.
    if (ts.isCallExpression(node)) {
      addRoot(getJsxNameSymbol(node.expression));
      for (const argument of node.arguments) addRoot(getJsxNameSymbol(argument));
    }
    ts.forEachChild(node, visit);
  };
  visit(mainFile);
  return [...roots];
}

const entryPaths = pageApplications.flatMap(({ directory, entries }) =>
  entries.map((entry) => path.join(rootDir, directory, entry)),
);
const entryFiles = entryPaths.map((filename) => {
  const file = program.getSourceFile(filename);
  if (!file) throw new Error(`Could not load page entry: ${path.relative(rootDir, filename)}.`);
  return file;
});
const missingEntries = entryFiles.filter((file) => !findPageRoots(file).length);
const roots = [...new Set(entryFiles.flatMap(findPageRoots))];
const usedComponents = new Set();
const usedVariants = new Map();
const unresolvedVariantUses = [];
const queue = roots.map((symbol) => ({ symbol, variantValues: undefined }));
const visited = new Set();

while (queue.length) {
  const task = queue.shift();
  const symbol = canonicalSymbol(task.symbol);
  if (!sourceKind(symbol)) continue;
  const functionNode = findFunctionLike(symbol);
  if (!functionNode) {
    for (const target of findLazyTargets(symbol))
      queue.push({ symbol: target, variantValues: task.variantValues });
    continue;
  }
  const publicComponent = publicComponents.get(symbol);
  let variantValues = task.variantValues;
  if (!variantValues?.length && publicComponent?.defaultVariants.length)
    variantValues = publicComponent.defaultVariants;
  const visitKey = serialForSymbol(symbol) + "::" + [...(variantValues ?? [])].sort().join(",");
  if (visited.has(visitKey)) continue;
  visited.add(visitKey);

  const context = makeComponentContext(functionNode, variantValues);
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const jsx = getJsxParts(node);
      const tagSymbol = getJsxNameSymbol(jsx.tagName);
      if (tagSymbol) {
        const childPublicComponent = publicComponents.get(tagSymbol);
        const childKind = sourceKind(tagSymbol);
        if (childPublicComponent) {
          usedComponents.add(childPublicComponent.name);
          if (childPublicComponent.variants.length) {
            let values = getComponentCallVariant(childPublicComponent, jsx.attributes, context);
            if (!values?.length) {
              const loc =
                node.getSourceFile().fileName +
                ":" +
                (node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1);
              unresolvedVariantUses.push(
                loc + " <" + childPublicComponent.name + ">: could not resolve the variant value",
              );
            } else {
              for (const value of values) {
                if (!childPublicComponent.variants.includes(value)) {
                  const loc =
                    node.getSourceFile().fileName +
                    ":" +
                    (node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1);
                  unresolvedVariantUses.push(
                    loc +
                      " <" +
                      childPublicComponent.name +
                      ">: " +
                      value +
                      " is outside the component's declared variant type",
                  );
                  continue;
                }
                if (!usedVariants.has(childPublicComponent.name))
                  usedVariants.set(childPublicComponent.name, new Set());
                usedVariants.get(childPublicComponent.name).add(value);
              }
              values = values.filter((value) => childPublicComponent.variants.includes(value));
            }
            queue.push({ symbol: tagSymbol, variantValues: values });
          } else {
            queue.push({ symbol: tagSymbol, variantValues: undefined });
          }
        } else if (childKind) {
          queue.push({
            symbol: tagSymbol,
            variantValues: getComponentCallVariant(undefined, jsx.attributes, context),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(functionNode.body ?? functionNode);
}

const missingComponents = [...publicComponents.values()]
  .filter((component) => !usedComponents.has(component.name))
  .map((component) => component.name)
  .sort();
const missingVariants = [];
for (const component of publicComponents.values()) {
  for (const variant of component.variants) {
    if (!usedVariants.get(component.name)?.has(variant))
      missingVariants.push(component.name + "." + variant);
  }
}
missingVariants.sort();

if (roots.length && missingVariants.length) {
  console.warn("\nOptional public variants not used by production pages (informational):");
  for (const name of missingVariants) console.warn("  - " + name);
}

console.log(
  "UI usage scope: editor, tools, growth and gallery chrome; configuration-driven gallery cards excluded.",
);
if (!roots.length || missingEntries.length) {
  console.error("UI usage check failed: page entries without a reachable rendering component:");
  for (const file of missingEntries) console.error("  - " + path.relative(rootDir, file.fileName));
  process.exitCode = 1;
} else if (missingComponents.length || unresolvedVariantUses.length) {
  console.error("UI usage check failed.");
  if (missingComponents.length) {
    console.error("\nPublic components not reachable from production page render graphs:");
    for (const name of missingComponents) console.error("  - " + name);
  }
  if (unresolvedVariantUses.length) {
    console.error("\nVariant usages the checker could not prove:");
    for (const usage of unresolvedVariantUses) console.error("  - " + usage);
  }
  process.exitCode = 1;
} else {
  console.log(
    "UI usage check passed: " +
      publicComponents.size +
      " public components are reachable; " +
      [...usedVariants.values()].reduce((sum, variants) => sum + variants.size, 0) +
      "/" +
      [...publicComponents.values()].reduce(
        (sum, component) => sum + component.variants.length,
        0,
      ) +
      " declared variants are used by page UI (component previews excluded).",
  );
}
