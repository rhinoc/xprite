import { readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface PackageAliasScopeDefinition {
  directory: string;
  source: string;
  aliases: Record<string, string>;
}

interface PackageAliasScope {
  source: string;
  aliases: Record<string, string>;
}

const scopeDefinitions = JSON.parse(
  readFileSync(new URL("./package-import-scopes.json", import.meta.url), "utf8"),
) as PackageAliasScopeDefinition[];
const packageScopes: PackageAliasScope[] = scopeDefinitions.map((definition) => {
  const packageRoot = resolve(repositoryRoot, definition.directory);
  return {
    source: resolve(packageRoot, definition.source),
    aliases: Object.fromEntries(
      Object.entries(definition.aliases).map(([prefix, target]) => [
        prefix,
        resolve(packageRoot, target),
      ]),
    ),
  };
});

function containsPath(root: string, filePath: string): boolean {
  const pathFromRoot = relative(root, filePath);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
}

export function packageLocalAliases(): Plugin {
  return {
    name: "xprite-package-local-aliases",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer || !isAbsolute(importer)) return null;
      const importerPath = importer.split(/[?#]/, 1)[0];
      let resolvedImporterPath = importerPath;
      try {
        resolvedImporterPath = realpathSync.native(importerPath);
      } catch {
        // Vite can pass virtual or not-yet-written files to this hook.
      }
      const scope = packageScopes.find((candidate) =>
        containsPath(candidate.source, resolvedImporterPath),
      );
      if (!scope) return null;

      const suffixStart = source.search(/[?#]/);
      const alias = suffixStart < 0 ? source : source.slice(0, suffixStart);
      const suffix = suffixStart < 0 ? "" : source.slice(suffixStart);
      const prefix = Object.keys(scope.aliases)
        .sort((left, right) => right.length - left.length)
        .find((candidate) => alias.startsWith(candidate));
      if (!prefix) return null;
      const aliasRoot = scope.aliases[prefix];
      const aliasPath = alias.slice(prefix.length);

      const targetPath = resolve(aliasRoot, aliasPath);
      if (!containsPath(aliasRoot, targetPath)) {
        throw new Error(`Package alias escapes its root: ${source}`);
      }

      const resolved = await this.resolve(targetPath + suffix, importer, { skipSelf: true });
      if (!resolved) {
        throw new Error(`Cannot resolve package-local import "${source}" from "${importer}"`);
      }
      return resolved;
    },
  };
}
