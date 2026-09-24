import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const declarationsRootArg = process.argv[2];
if (!declarationsRootArg) {
  throw new Error("Pass the generated declaration directory as the first argument.");
}

const declarationsRoot = path.resolve(process.cwd(), declarationsRootArg);
const declarationExtensions = new Set([".d.ts", ".d.mts", ".d.cts"]);
const packageAssetAliasPattern =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']\$(?:assets|locales)\/[^"']+["']/;

function isDeclarationFile(filePath) {
  return [...declarationExtensions].some((extension) => filePath.endsWith(extension));
}

async function collectDeclarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? collectDeclarationFiles(entryPath)
        : isDeclarationFile(entryPath)
          ? [entryPath]
          : [];
    }),
  );
  return nested.flat();
}

function relativeModuleSpecifier(fromFile, targetPath) {
  let specifier = path.relative(path.dirname(fromFile), targetPath).split(path.sep).join("/");
  if (!specifier.startsWith(".")) specifier = `./${specifier}`;
  return specifier;
}

const moduleSpecifierPattern = /((?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+))(["'])(\$\/[^"']+)\2/g;

for (const declarationFile of await collectDeclarationFiles(declarationsRoot)) {
  const source = await readFile(declarationFile, "utf8");
  if (packageAssetAliasPattern.test(source)) {
    throw new Error(`Package asset aliases cannot appear in declarations: ${declarationFile}`);
  }
  const rewritten = source.replace(moduleSpecifierPattern, (_match, prefix, quote, specifier) => {
    const targetPath = path.resolve(declarationsRoot, specifier.slice(2));
    const relativePath = path.relative(declarationsRoot, targetPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error(`Declaration import escapes its output root: ${specifier}`);
    }
    return `${prefix}${quote}${relativeModuleSpecifier(declarationFile, targetPath)}${quote}`;
  });
  if (rewritten !== source) await writeFile(declarationFile, rewritten);
}
