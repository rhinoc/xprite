// Checks that build one TypeScript program per tsconfig parse the same files (ui, editor-core,
// lib.d.ts) again and again. A host wrapped here shares parsed and bound source files across those
// programs when their parse/bind settings match, as TypeScript's own DocumentRegistry does. Only
// for read-only checks that never emit.
const sourceFileCache = new Map();
const PARSE_SETTINGS = [
  "target",
  "module",
  "moduleResolution",
  "moduleDetection",
  "jsx",
  "jsxFactory",
  "jsxFragmentFactory",
  "jsxImportSource",
  "allowJs",
  "checkJs",
  "strict",
  "alwaysStrict",
  "isolatedModules",
  "verbatimModuleSyntax",
  "experimentalDecorators",
  "useDefineForClassFields",
  "preserveConstEnums",
  "allowUnreachableCode",
  "allowUnusedLabels",
];
export function shareSourceFiles(host, options) {
  const settings = JSON.stringify(PARSE_SETTINGS.map((name) => options[name] ?? null));
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const key = `${settings}|${JSON.stringify(languageVersion)}|${fileName}`;
    if (!shouldCreate && sourceFileCache.has(key)) return sourceFileCache.get(key);
    const file = getSourceFile(fileName, languageVersion, onError, shouldCreate);
    if (file) sourceFileCache.set(key, file);
    return file;
  };
  return host;
}
