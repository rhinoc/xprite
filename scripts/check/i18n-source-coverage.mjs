import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse } from "@babel/parser";

const sourceDirectories = ["apps/editor/src", "packages/ui/src"];
const labelCatalogFiles = [
  "apps/editor/assets/commands/libresprite-main-menu.json",
  "apps/editor/assets/commands/aseprite-tool-tips.json",
];
const messageFields = new Set([
  "label",
  "title",
  "text",
  "description",
  "placeholder",
  "tooltip",
  "alt",
  "heading",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "emptyText",
  "buttonLabel",
  "tabListLabel",
  "confirm",
  "cancel",
  "search",
  "message",
  "messageLines",
  "notice",
  "directory",
  "detail",
]);
const sourceTranslators = new Set(["tUiSource", "translateSource"]);
const keyTranslators = new Set(["tUi", "translateKey"]);
const messageSetters = new Set(["setNotice", "setError", "alert", "confirm"]);
// Identifiers and file format names are intentionally language independent.
const invariantMessages = new Set([
  "Xprite",
  "rhinoc",
  "Aseprite",
  "PNG",
  "GIF",
  "APNG",
  "RGB",
  "RGBA",
  "HSV",
  "HSL",
  "CMYK",
  "sRGB",
  "GitHub",
  "px",
]);
const sourceExceptions = new Map([
  ["apps/editor/src/components/canvas/editor-canvas.tsx", new Set(["crosshair"])],
  ["apps/editor/src/managers/menus/shortcut-availability.ts", new Set(["text"])],
  // Developer preconditions are diagnostic identifiers, not product messages.
  [
    "apps/editor/src/adapters/workers/import-client.ts",
    new Set([
      "Provide worker or workerFactory, not both",
      "Worker is unavailable; provide workerFactory in this environment",
    ]),
  ],
  [
    "apps/editor/src/adapters/workers/recovery-codec-client.ts",
    new Set(["Provide worker or workerFactory, not both"]),
  ],
  [
    "apps/editor/src/managers/workspace/use-editor-runtime.ts",
    new Set(["Editor runtime requires platform ports"]),
  ],
  [
    "apps/editor/src/managers/workspace/use-editor-workflows.ts",
    new Set([
      "Editor workflow manager requires platform ports",
      "Editor workflow manager requires an active RasterEditor",
    ]),
  ],
  [
    "apps/editor/src/managers/workspace/editor-runtime-context.tsx",
    new Set(["Workspace manager hooks require EditorRuntimeManagerProvider"]),
  ],
]);

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(filename);
    return /\.[cm]?[jt]sx?$/.test(filename) &&
      !/\.(test|spec)\./.test(filename) &&
      !entry.name.startsWith("generated")
      ? [filename]
      : [];
  });
}

function children(node) {
  return Object.entries(node).flatMap(([key, value]) => {
    if (
      ["loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(
        key,
      )
    )
      return [];
    return (Array.isArray(value) ? value : [value]).filter(
      (child) => child && typeof child === "object" && typeof child.type === "string",
    );
  });
}

function callName(node) {
  return node.callee?.name ?? node.callee?.property?.name;
}

/** Inspect user-facing message sinks; never treat arbitrary IDs or user content as translations. */
export function inspectI18nSources(repositoryRoot, catalog) {
  const knownMessages = new Set([...Object.keys(catalog), ...Object.values(catalog)]);
  const problems = [];
  let fileCount = 0;
  let messageCount = 0;
  for (const directory of sourceDirectories) {
    for (const filename of filesIn(path.join(repositoryRoot, directory))) {
      const relative = path.relative(repositoryRoot, filename).split(path.sep).join("/");
      if (relative.startsWith("apps/editor/src/i18n/")) continue;
      fileCount++;
      let ast;
      try {
        ast = parse(readFileSync(filename, "utf8"), {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
        });
      } catch (error) {
        problems.push(`${relative}: ${error.message}`);
        continue;
      }
      const report = (node, message) =>
        problems.push(
          `${relative}:${node.loc.start.line}:${node.loc.start.column + 1}: ${message}`,
        );
      const isMessage = (value) =>
        /[a-zA-Z]{2}|[\u3400-\u9fff]/.test(value) &&
        !/^\.[a-z0-9]+$/i.test(value) &&
        !invariantMessages.has(value) &&
        !sourceExceptions.get(relative)?.has(value);
      const inspectMessage = (node, native = false, seen = new Set()) => {
        if (!node) return;
        if (node.type === "Identifier" && bindings.get(node.name) && !seen.has(node.name)) {
          inspectMessage(bindings.get(node.name), native, new Set([...seen, node.name]));
          return;
        }
        if (
          ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"].includes(node.type)
        ) {
          inspectMessage(node.expression, native, seen);
          return;
        }
        if (node.type === "StringLiteral" || node.type === "JSXText") {
          const value = node.value.trim();
          if (!isMessage(value)) return;
          messageCount++;
          if (!knownMessages.has(value))
            report(node, `Message is absent from the English catalog: ${JSON.stringify(value)}`);
          else if (native)
            report(node, `Native DOM text must call tUi/tUiSource: ${JSON.stringify(value)}`);
        } else if (node.type === "TemplateLiteral") {
          if (node.quasis.some((part) => isMessage(part.value.cooked ?? "")))
            report(
              node,
              "Interpolate a translated message with tUi(key, values) instead of assembling display text.",
            );
        } else if (node.type === "ConditionalExpression") {
          inspectMessage(node.consequent, native, seen);
          inspectMessage(node.alternate, native, seen);
        } else if (node.type === "LogicalExpression") {
          inspectMessage(node.left, native, seen);
          inspectMessage(node.right, native, seen);
        } else if (node.type === "BinaryExpression" && node.operator === "+") {
          inspectMessage(node.left, native, seen);
          inspectMessage(node.right, native, seen);
          if (
            [node.left, node.right].some(
              (part) => part.type === "StringLiteral" && isMessage(part.value),
            )
          )
            report(node, "Use translation placeholders instead of concatenating display text.");
        } else if (node.type === "ArrayExpression") {
          node.elements.forEach((element) => inspectMessage(element, native, seen));
        } else if (node.type === "JSXExpressionContainer")
          inspectMessage(node.expression, native, seen);
      };
      const inspectKeys = (node) => {
        if (node?.type === "StringLiteral" && !Object.hasOwn(catalog, node.value))
          report(node, `Unknown translation key: ${node.value}`);
        else if (node?.type === "ConditionalExpression") {
          inspectKeys(node.consequent);
          inspectKeys(node.alternate);
        }
      };
      const bindings = new Map();
      const collectBindings = (node) => {
        if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init) {
          const name = node.id.name;
          bindings.set(name, bindings.has(name) ? null : node.init);
        }
        children(node).forEach(collectBindings);
      };
      collectBindings(ast);
      const sourceCalls = new Set(sourceTranslators);
      const keyCalls = new Set(keyTranslators);
      const textComponents = new Set(["Text"]);
      const translatedTextComponents = new Set();
      const textVariants = new Set();
      for (const declaration of ast.program.body) {
        if (declaration.type !== "ImportDeclaration") continue;
        for (const specifier of declaration.specifiers) {
          const imported = specifier.imported?.name;
          if (sourceTranslators.has(imported)) sourceCalls.add(specifier.local.name);
          if (keyTranslators.has(imported)) keyCalls.add(specifier.local.name);
          if (declaration.source.value === "@xprite/ui") {
            if (imported === "Text") {
              textComponents.add(specifier.local.name);
              translatedTextComponents.add(specifier.local.name);
            }
            if (imported === "TextVariant") textVariants.add(specifier.local.name);
          }
        }
      }
      const translatesControlText = (opening) => {
        if (!translatedTextComponents.has(opening?.name?.name)) return false;
        const variant = opening.attributes.find(
          (attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "variant",
        )?.value?.expression;
        // ControlText translates its text through the UI provider; inline/pixel text does not.
        return (
          variant?.type === "MemberExpression" &&
          textVariants.has(variant.object.name) &&
          variant.property.name === "Control"
        );
      };
      const inspectLabels = (node) => {
        if (node?.type === "ObjectExpression")
          node.properties.forEach((property) => {
            if (property.type === "ObjectProperty") inspectLabels(property.value);
          });
        else inspectMessage(node);
      };
      const visit = (node, parent) => {
        if (
          relative.startsWith("apps/editor/src/components/") &&
          node.type === "VariableDeclarator" &&
          /(?:Labels|Names|Titles)$|^(?:LABELS|NAMES|TITLES)$/.test(node.id.name ?? "")
        )
          inspectLabels(node.init);
        if (node.type === "CallExpression") {
          const name = callName(node);
          // Translation aliases are collected from imports below as well as provider callbacks.
          if (keyCalls.has(name)) {
            inspectKeys(node.arguments[0]);
            const key = node.arguments[0];
            const values = node.arguments[1];
            if (
              name !== "translateKey" &&
              key?.type === "StringLiteral" &&
              typeof catalog[key.value] === "string" &&
              (!values || values.type === "ObjectExpression")
            ) {
              const required = [...catalog[key.value].matchAll(/\{([^{}]+)\}/g)].map(
                (match) => match[1],
              );
              const supplied =
                values?.properties.map((property) => property.key?.name ?? property.key?.value) ??
                [];
              if (!values?.properties.some((property) => property.type === "SpreadElement")) {
                const missing = required.filter((placeholder) => !supplied.includes(placeholder));
                if (missing.length)
                  report(
                    node,
                    `Missing interpolation values for ${key.value}: ${missing.join(", ")}`,
                  );
              }
            }
          }
          if (sourceCalls.has(name) || messageSetters.has(name)) inspectMessage(node.arguments[0]);
          if (name === "paintUiText") inspectMessage(node.arguments[2], true);
        } else if (
          node.type === "NewExpression" &&
          /^apps\/editor\/src\/(adapters\/(files|session|storage|workers)|managers\/(files|workspace|palette|user-data))\//.test(
            relative,
          )
        ) {
          const constructor = node.callee.name;
          if (["Error", "TypeError", "RangeError"].includes(constructor))
            inspectMessage(node.arguments[0]);
          else if (constructor === "ProjectStorageError") inspectMessage(node.arguments[1]);
        } else if (node.type === "JSXAttribute" && messageFields.has(node.name.name)) {
          const native =
            parent?.name?.type === "JSXIdentifier" &&
            (/^[a-z]/.test(parent.name.name) ||
              (textComponents.has(parent.name.name) &&
                node.name.name === "text" &&
                !translatesControlText(parent)));
          inspectMessage(node.value, native);
        } else if (node.type === "JSXElement" || node.type === "JSXFragment") {
          for (const child of node.children)
            if (child.type === "JSXText" || child.type === "JSXExpressionContainer")
              inspectMessage(child, true);
        } else if (
          node.type === "ObjectProperty" &&
          messageFields.has(node.key.name ?? node.key.value)
        ) {
          inspectMessage(node.value);
        } else if (node.type === "AssignmentPattern" && messageFields.has(node.left.name)) {
          inspectMessage(node.right);
        }
        children(node).forEach((child) => visit(child, node));
      };
      visit(ast);
    }
  }
  for (const relative of labelCatalogFiles) {
    fileCount++;
    const inspectCatalog = (value, location) => {
      if (Array.isArray(value))
        value.forEach((entry, index) => inspectCatalog(entry, `${location}[${index}]`));
      else if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
          const entryLocation = `${location}.${key}`;
          if (["label", "text"].includes(key) && typeof entry === "string" && entry.trim()) {
            messageCount++;
            if (!knownMessages.has(entry))
              problems.push(
                `${relative}:${entryLocation}: Message is absent from the English catalog: ${JSON.stringify(entry)}`,
              );
          }
          inspectCatalog(entry, entryLocation);
        }
      }
    };
    try {
      inspectCatalog(JSON.parse(readFileSync(path.join(repositoryRoot, relative), "utf8")), "$");
    } catch (error) {
      problems.push(`${relative}: ${error.message}`);
    }
  }
  return { problems: [...new Set(problems)], fileCount, messageCount };
}
