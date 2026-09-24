import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import babelParser from "@babel/parser";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const moduleExtensions = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".svg",
  ".png",
  ".ase",
  ".aseprite",
];
const javascriptExtensionSubstitutions = {
  ".js": [".ts", ".tsx", ".d.ts"],
  ".jsx": [".tsx", ".ts"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

const packageDefinitions = JSON.parse(
  readFileSync(path.join(repositoryRoot, "infra/package-import-scopes.json"), "utf8"),
);

const packages = packageDefinitions.map((definition) => {
  const root = path.resolve(repositoryRoot, definition.directory);
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const aliases = Object.fromEntries(
    Object.entries(definition.aliases).map(([prefix, target]) => [
      prefix,
      path.resolve(root, target),
    ]),
  );
  return { name: packageJson.name, root, source: path.resolve(root, definition.source), aliases };
});

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function stripQuery(specifier) {
  const suffixStart = specifier.search(/[?#]/);
  return suffixStart < 0 ? specifier : specifier.slice(0, suffixStart);
}

function existingModulePath(basePath) {
  const candidates = [basePath];
  const extension = path.extname(basePath);
  if (extension) {
    for (const replacement of javascriptExtensionSubstitutions[extension] ?? []) {
      candidates.push(basePath.slice(0, -extension.length) + replacement);
    }
  } else {
    for (const candidateExtension of moduleExtensions)
      candidates.push(basePath + candidateExtension);
  }
  for (const candidateExtension of moduleExtensions) {
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

function moduleTarget(scope, importerFile, specifier) {
  const cleanSpecifier = stripQuery(specifier);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const basePath = path.resolve(path.dirname(importerFile), cleanSpecifier);
    return existingModulePath(basePath) ?? basePath;
  }

  const prefix = Object.keys(scope.aliases)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => specifier.startsWith(candidate));
  if (!prefix) return undefined;

  const aliasRoot = scope.aliases[prefix];
  const basePath = path.resolve(aliasRoot, cleanSpecifier.slice(prefix.length));
  if (!isWithin(aliasRoot, basePath)) return { escapedRoot: true, target: basePath };
  return existingModulePath(basePath) ?? basePath;
}

function packageForPath(filePath) {
  return packages.find((candidate) => isWithin(candidate.root, filePath));
}

function suggestedAlias(scope, targetPath) {
  for (const [prefix, aliasRoot] of Object.entries(scope.aliases)) {
    if (!isWithin(aliasRoot, targetPath)) continue;
    let subpath = path.relative(aliasRoot, targetPath).split(path.sep).join("/");
    const extension = path.extname(subpath);
    if (
      moduleExtensions.includes(extension) &&
      ![".json", ".css", ".scss", ".svg", ".png"].includes(extension)
    ) {
      subpath = subpath.slice(0, -extension.length);
    }
    if (subpath.endsWith("/index")) subpath = subpath.slice(0, -"/index".length);
    return prefix + subpath;
  }
  return undefined;
}

function getModuleSpecifiers(ast) {
  const specifiers = [];
  const add = (node) => {
    if (node?.type === "StringLiteral")
      specifiers.push({ value: node.value, location: node.loc?.start });
  };

  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

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
      if (node.argument?.type === "TSLiteralType") add(node.argument.literal);
    } else if (node.type === "TSExternalModuleReference") {
      add(node.expression);
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

function report(errors, file, location, message) {
  const relativeFile = path.relative(repositoryRoot, file).split(path.sep).join("/");
  const line = location?.line ?? 1;
  const column = (location?.column ?? 0) + 1;
  errors.push(`${relativeFile}:${line}:${column}: ${message}`);
}

function normalizeTypeScriptPath(value) {
  return path.posix.normalize(value.replaceAll("\\", "/").replace(/^\.\//, ""));
}

function checkTypeScriptAliasMappings(errors) {
  for (const definition of packageDefinitions) {
    const packageRoot = path.resolve(repositoryRoot, definition.directory);
    const tsconfigPath = path.join(packageRoot, definition.tsconfig);
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
    const configuredPaths = tsconfig.compilerOptions?.paths ?? {};
    const expectedKeys = new Set();

    for (const [prefix, target] of Object.entries(definition.aliases)) {
      const key = `${prefix}*`;
      const expectedTarget = normalizeTypeScriptPath(path.posix.join(target, "*"));
      expectedKeys.add(key);
      const values = configuredPaths[key] ?? [];
      if (!values.some((value) => normalizeTypeScriptPath(value) === expectedTarget)) {
        report(
          errors,
          tsconfigPath,
          undefined,
          `TypeScript paths must map "${key}" to "${expectedTarget}" to match the package alias resolver`,
        );
      }
    }

    for (const key of Object.keys(configuredPaths)) {
      if (key.startsWith("$") && !expectedKeys.has(key)) {
        report(errors, tsconfigPath, undefined, `unregistered package alias "${key}"`);
      }
    }
  }
}

function findEquivalentInOtherPackages(scope, specifier) {
  const prefix = Object.keys(scope.aliases)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => specifier.startsWith(candidate));
  if (!prefix) return undefined;
  const subpath = stripQuery(specifier).slice(prefix.length);
  return packages.find((candidate) => {
    if (candidate === scope) return false;
    const aliasRoot = candidate.aliases[prefix];
    if (!aliasRoot) return false;
    return Boolean(existingModulePath(path.resolve(aliasRoot, subpath)));
  });
}

function enforceSpecifier(scope, file, specifier, location, errors) {
  if (specifier.startsWith("@xprite/")) {
    const importedPackage = packages.find(
      (candidate) => specifier === candidate.name || specifier.startsWith(`${candidate.name}/`),
    );
    if (importedPackage === scope) {
      const subpath = specifier.slice(scope.name.length).replace(/^\//, "") || "index";
      report(
        errors,
        file,
        location,
        `same-package import must use "$/${subpath}" instead of "${specifier}"`,
      );
    }
    return;
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const target = moduleTarget(scope, file, specifier);
    const targetPackage = packageForPath(target);
    if (targetPackage === scope) {
      const alias = suggestedAlias(scope, target);
      report(
        errors,
        file,
        location,
        alias
          ? `same-package import must use "${alias}" instead of "${specifier}"`
          : `same-package import "${specifier}" has no configured package alias`,
      );
    } else if (targetPackage) {
      report(
        errors,
        file,
        location,
        `cross-package relative import must use "${targetPackage.name}" instead of "${specifier}"`,
      );
    } else if (
      isWithin(repositoryRoot, target) &&
      !isWithin(path.join(repositoryRoot, "fixtures"), target)
    ) {
      report(
        errors,
        file,
        location,
        `repository-relative import "${specifier}" crosses package boundaries`,
      );
    }
    return;
  }

  if (specifier.startsWith("$")) {
    const target = moduleTarget(scope, file, specifier);
    if (!target || target.escapedRoot) {
      report(errors, file, location, `unknown or escaping package alias "${specifier}"`);
      return;
    }

    const targetPackage = packageForPath(target);
    if (targetPackage !== scope) {
      report(
        errors,
        file,
        location,
        `package alias "${specifier}" escapes its package; use "${targetPackage?.name ?? "a package import"}"`,
      );
      return;
    }

    if (!existingModulePath(target)) {
      const owner = findEquivalentInOtherPackages(scope, specifier);
      report(
        errors,
        file,
        location,
        owner
          ? `"${specifier}" belongs to ${owner.name}; import it from that package`
          : `package alias "${specifier}" does not resolve to a source or asset in this package`,
      );
    }
  }
}

const errors = [];
checkTypeScriptAliasMappings(errors);
for (const scope of packages) {
  for (const file of walk(scope.source)) {
    let ast;
    try {
      ast = babelParser.parse(readFileSync(file, "utf8"), {
        sourceType: "unambiguous",
        plugins: [
          "typescript",
          "jsx",
          "decorators-legacy",
          "importAttributes",
          "explicitResourceManagement",
        ],
        errorRecovery: true,
      });
    } catch (error) {
      report(errors, file, error.loc, `could not inspect imports: ${error.message}`);
      continue;
    }

    for (const { value, location } of getModuleSpecifiers(ast)) {
      enforceSpecifier(scope, file, value, location, errors);
    }
  }
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.stderr.write(
    `\nPackage import policy failed with ${errors.length} violation${errors.length === 1 ? "" : "s"}. Use $ aliases inside a package and @xprite package names across packages.\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write("Package import policy passed.\n");
}
