import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postcss from "postcss";
import ts from "typescript-compiler-api";

import { shareSourceFiles } from "../base/ts-shared-sources.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cssRoots = [
  "apps/editor/src",
  "apps/components/src",
  "apps/growth/src",
  "apps/tools/src",
  "apps/xhs-minitools/shared",
  "apps/xhs-minitools/tools",
  "packages/ui/src",
];
const sourceRoots = ["apps", "packages", "infra"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".html"]);
const ignoredDirectories = new Set(["node_modules", "dist", ".git"]);
const selectorMethods = new Set(["querySelector", "querySelectorAll", "closest", "matches"]);
const classToken = /^[A-Za-z_][\w-]*$/;
const attributeToken = /^data-[\w-]+$/;
const dynamicSegment = "\0";
const classes = new Set();
const classTemplates = [];
const classPatterns = [];
const programs = new Map();
const attributes = new Set();
const selectors = [];
const failures = new Set();

function filesUnder(directory) {
  return readdirSync(path.join(repositoryRoot, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory())
        return ignoredDirectories.has(entry.name) ? [] : filesUnder(filename);
      return /\.(?:test|spec)\.[^.]+$/.test(entry.name) ? [] : [filename];
    },
  );
}

function collectClasses(text, template, offset = 0) {
  for (const match of text.matchAll(/\S+/g)) {
    const token = match[0];
    if (classToken.test(token)) classes.add(token);
    else if (token.includes(dynamicSegment)) {
      const parts = token.split(dynamicSegment);
      if (!parts[0] || !parts.every((part) => /^[\w-]*$/.test(part))) continue;
      const firstSpan = template
        ? template.text.slice(0, offset + match.index).split(dynamicSegment).length - 1
        : 0;
      classTemplates.push({ parts, template, firstSpan });
    }
  }
}

function collectMarkup(text, template) {
  collectClasses(text, template);
  for (const match of text.matchAll(/\bclass(?:Name)?\s*=\s*["']([^"']*)["']/g))
    collectClasses(match[1], template, match.index + match[0].indexOf(match[1]));
  if (attributeToken.test(text)) attributes.add(text);
  for (const match of text.matchAll(/(?:^|[\s<])(data-[\w-]+)(?=[\s=>]|$)/g))
    attributes.add(match[1]);
}

function literalText(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node))
    return (
      node.head.text + node.templateSpans.map((span) => dynamicSegment + span.literal.text).join("")
    );
}

function location(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function collectSource(filename) {
  const text = readFileSync(path.join(repositoryRoot, filename), "utf8");
  if (filename.endsWith(".html")) {
    collectMarkup(text);
    return;
  }
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const constants = new Map();
  const findConstants = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = literalText(node.initializer);
      if (value !== undefined) constants.set(node.name.text, value);
    }
    ts.forEachChild(node, findConstants);
  };
  findConstants(source);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (selectorMethods.has(node.expression.name.text) && node.arguments[0]) {
        const argument = node.arguments[0];
        const selector = ts.isIdentifier(argument)
          ? constants.get(argument.text)
          : literalText(argument);
        if (selector !== undefined)
          selectors.push({ filename, line: location(source, node), selector });
      }
    }
    if (ts.isJsxAttribute(node) && attributeToken.test(node.name.getText(source)))
      attributes.add(node.name.getText(source));
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === "dataset")
        attributes.add(
          `data-${node.name.text.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        );
    }
    if (ts.isElementAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const key = literalText(node.argumentExpression);
      if (node.expression.name.text === "dataset" && key)
        attributes.add(`data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
    }
    const value = literalText(node);
    if (value !== undefined) {
      const parent = node.parent;
      const selectorArgument =
        ts.isCallExpression(parent) &&
        parent.arguments[0] === node &&
        ts.isPropertyAccessExpression(parent.expression) &&
        selectorMethods.has(parent.expression.name.text);
      if (!selectorArgument)
        collectMarkup(
          value,
          ts.isTemplateExpression(node) ? { filename, node, text: value } : undefined,
        );
      // Template spans are collected together, preserving dynamic class prefixes.
      if (ts.isTemplateExpression(node)) {
        for (const span of node.templateSpans) visit(span.expression);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function templateValues(filename, expression) {
  const absolute = path.join(repositoryRoot, filename);
  const configPath = ts.findConfigFile(path.dirname(absolute), ts.sys.fileExists);
  if (!configPath) return;
  let context = programs.get(configPath);
  if (!context) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
    const program = ts.createProgram(
      parsed.fileNames,
      parsed.options,
      shareSourceFiles(ts.createCompilerHost(parsed.options), parsed.options),
    );
    context = { program, checker: program.getTypeChecker() };
    programs.set(configPath, context);
  }
  const source = context.program.getSourceFile(absolute);
  if (!source) return;
  const start = expression.getStart();
  const end = expression.end;
  let target;
  const findExpression = (node) => {
    if (node.pos > start || node.end < end) return;
    if (node.kind === expression.kind && node.getStart(source) === start && node.end === end)
      target = node;
    else ts.forEachChild(node, findExpression);
  };
  findExpression(source);
  if (!target) return;
  const type = context.checker.getTypeAtLocation(target);
  const members = type.isUnion() ? type.types : [type];
  if (
    !members.every(
      (member) => member.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral),
    )
  )
    return;
  return members.map((member) => String(member.value));
}

function compileClassTemplates() {
  for (const { parts, template, firstSpan } of classTemplates) {
    let pattern = parts[0];
    for (let index = 1; index < parts.length; index += 1) {
      const expression = template?.node.templateSpans[firstSpan + index - 1]?.expression;
      const values = expression && templateValues(template.filename, expression);
      const dynamic = values
        ? `(?:${values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`
        : "[\\w-]*";
      pattern += dynamic + parts[index];
    }
    classPatterns.push(new RegExp(`^${pattern}$`));
  }
}

function checkSelector({ filename, line, selector }, checkAttributes = true) {
  const withoutAttributes = selector.replace(/\[[^\]]*\]/g, "");
  for (const match of withoutAttributes.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    const name = match[1];
    if (!classes.has(name) && !classPatterns.some((pattern) => pattern.test(name)))
      failures.add(`${filename}:${line}: class .${name} has no source markup reference`);
  }
  for (const match of checkAttributes ? selector.matchAll(/\[(data-[\w-]+)/g) : []) {
    if (!attributes.has(match[1]))
      failures.add(`${filename}:${line}: attribute ${match[1]} has no source markup reference`);
  }
}

function globalParts(selector) {
  const parts = [];
  for (
    let start = selector.indexOf(":global(");
    start >= 0;
    start = selector.indexOf(":global(", start)
  ) {
    start += ":global(".length;
    let end = start;
    let depth = 1;
    let quote;
    for (; end < selector.length && depth; end += 1) {
      const character = selector[end];
      if (character === "\\") end += 1;
      else if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    parts.push(selector.slice(start, end - 1));
    start = end;
  }
  return parts;
}

for (const directory of sourceRoots)
  for (const filename of filesUnder(directory))
    if (sourceExtensions.has(path.extname(filename))) collectSource(filename);
compileClassTemplates();

for (const directory of cssRoots) {
  for (const filename of filesUnder(directory).filter((name) => name.endsWith(".css"))) {
    const stylesheet = postcss.parse(readFileSync(path.join(repositoryRoot, filename), "utf8"), {
      from: filename,
    });
    stylesheet.walkRules((rule) => {
      const line = rule.source.start.line;
      for (const selector of globalParts(rule.selector))
        checkSelector({ filename, line, selector });
      // Attribute selectors also apply inside locally scoped CSS Modules classes.
      checkSelector({ filename, line, selector: rule.selector.replace(/\.[A-Za-z_][\w-]*/g, "") });
    });
  }
}
// Runtime queries may intentionally recognize external DOM contracts, such as privacy markers.
for (const selector of selectors) checkSelector(selector, false);

if (failures.size) {
  console.error([...failures].sort().join("\n"));
  process.exitCode = 1;
} else console.log("Global CSS classes, DOM attributes and literal selector references passed.");
