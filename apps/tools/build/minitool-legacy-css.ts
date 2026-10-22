import postcss, { type Declaration, type Rule } from "postcss";

/**
 * Chrome 61 equivalents for the bundled stylesheet, applied after minification. Modern browsers
 * keep using the original declarations; Chrome 61 skips them and uses the inserted fallbacks.
 */
const VIEWPORT_UNITS = /(\d*\.?\d+)(dvh|svh|lvh)\b/g;
const COMPARISON = /\b(min|max|clamp|color-mix)\(/;
const MODERN_SUPPORTS = "(width:min(1px,100%))";
const FLEX_DISPLAY = /^(inline-)?flex$/;
const UNSUPPORTED_SELECTOR = /:has\(|:focus-visible|:where\(|:is\(/;
const MINITOOL_COMPACT_CLASS = "minitool-compact";
const MINITOOL_NO_FLEX_GAP_CLASS = "minitool-no-flex-gap";
/** `:has()` uses that the runtime mirrors as classes on the root element. */
const HAS_CLASSES: readonly (readonly [string, string])[] = [
  [":root:has([data-ui-compact=true])", `:root.${MINITOOL_COMPACT_CLASS}`],
];

/** Split on a separator at parenthesis depth 0. */
function splitTopLevel(value: string, separator: RegExp): string[] {
  const parts = [""];
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && separator.test(character)) {
      if (parts[parts.length - 1]) parts.push("");
    } else parts[parts.length - 1] += character;
  }
  return parts.filter(Boolean);
}

/** Closing parenthesis matching the one at `open`. */
function closing(value: string, open: number): number {
  let depth = 0;
  for (let index = open; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    if (value[index] === ")" && --depth === 0) return index;
  }
  return -1;
}

/** `a :where(b, c)` becomes `a b` and `a c` (outside `:not()`, where expansion changes meaning). */
function expandSelector(selector: string): string[] {
  let depth = 0;
  for (let index = 0; index < selector.length; index += 1) {
    if (selector[index] === "(") depth += 1;
    if (selector[index] === ")") depth -= 1;
    if (depth !== 0) continue;
    const match = /^:(where|is)\(/.exec(selector.slice(index));
    if (!match) continue;
    const open = index + match[0].length - 1;
    const end = closing(selector, open);
    if (end < 0) return [selector];
    const before = selector.slice(0, index);
    const after = selector.slice(end + 1);
    return splitTopLevel(selector.slice(open + 1, end), /,/).flatMap((option) =>
      expandSelector(`${before}${option.trim()}${after}`),
    );
  }
  return [selector];
}

/** The argument a Chrome 61 fallback uses: the fluid bound of `min()`, the base of `max()`. */
function comparisonFallback(value: string): string {
  let result = value;
  for (let guard = 0; guard < 20; guard += 1) {
    const match = COMPARISON.exec(result);
    if (!match) return result;
    const open = match.index + match[0].length - 1;
    const end = closing(result, open);
    if (end < 0) return result;
    const options = splitTopLevel(result.slice(open + 1, end), /,/).map((part) => part.trim());
    const choice =
      match[1] === "color-mix"
        ? "transparent"
        : match[1] === "min"
          ? (options.find((option) => /%|vw|vh/.test(option)) ?? options[0])
          : match[1] === "max"
            ? (options.find((option) => !option.includes("env(")) ?? options[0])
            : options[0];
    result = `${result.slice(0, match.index)}${choice}${result.slice(end + 1)}`;
  }
  return result;
}

function insetSides(value: string) {
  const [top, right = top, bottom = top, left = right] = splitTopLevel(value, /\s/);
  return { top, right, bottom, left };
}

function flexGapFallback(rule: Rule, gap: Declaration) {
  const column = rule.nodes.some(
    (node) =>
      node.type === "decl" && node.prop === "flex-direction" && node.value.startsWith("column"),
  );
  if ((gap.prop === "row-gap" && !column) || (gap.prop === "column-gap" && column)) return;
  const parts = splitTopLevel(gap.value, /\s/);
  const size = gap.prop === "gap" ? (column ? parts[0] : (parts[1] ?? parts[0])) : gap.value;
  const selectors = rule.selectors.filter((selector) => !selector.includes("::"));
  if (!selectors.length) return;
  rule
    .cloneAfter({
      selectors: selectors.map((selector) => `.${MINITOOL_NO_FLEX_GAP_CLASS} ${selector}>*+*`),
      nodes: [],
    })
    .append({ prop: column ? "margin-top" : "margin-left", value: size });
}

function lowerRule(rule: Rule) {
  let selectors = rule.selectors.map((selector) => {
    for (const [from, to] of HAS_CLASSES) selector = selector.split(from).join(to);
    return selector;
  });
  selectors = [...new Set(selectors.flatMap(expandSelector))];
  // One unsupported selector drops the whole rule in Chrome 61, so keep those in their own rule.
  const unsupported = selectors.filter((selector) => UNSUPPORTED_SELECTOR.test(selector));
  const supported = selectors.filter((selector) => !UNSUPPORTED_SELECTOR.test(selector));
  if (unsupported.length && supported.length) {
    rule.cloneBefore({ selectors: unsupported });
    rule.selectors = supported;
  } else rule.selectors = selectors;
  const display = rule.nodes.find(
    (node): node is Declaration => node.type === "decl" && node.prop === "display",
  );
  // Fallbacks are inserted while iterating, so walk a copy of the declarations.
  for (const node of rule.nodes.slice()) {
    if (node.type !== "decl") continue;
    if (["gap", "row-gap", "column-gap"].includes(node.prop)) {
      if (display && FLEX_DISPLAY.test(display.value)) flexGapFallback(rule, node);
      else node.cloneBefore({ prop: `grid-${node.prop}` });
    }
  }
}

function lowerDeclaration(declaration: Declaration) {
  const { prop, value } = declaration;
  const scope = declaration.parent?.parent;
  if (scope?.type === "atrule" && (scope as { params: string }).params === MODERN_SUPPORTS) return;
  if (prop === "inset") {
    const sides = insetSides(comparisonFallback(value));
    for (const side of ["top", "right", "bottom", "left"] as const)
      declaration.cloneBefore({ prop: side, value: sides[side] });
    return;
  }
  if (prop.startsWith("overflow") && value === "clip") declaration.cloneBefore({ value: "hidden" });
  let fallback = value.replace(VIEWPORT_UNITS, "$1vh");
  if (COMPARISON.test(fallback)) fallback = comparisonFallback(fallback);
  if (fallback === value) return;
  if (!prop.startsWith("--")) {
    declaration.cloneBefore({ value: fallback });
    return;
  }
  // A custom property is valid with any value, so the modern value moves behind @supports.
  const rule = declaration.parent;
  if (rule?.type !== "rule") return;
  const modern = postcss.atRule({ name: "supports", params: MODERN_SUPPORTS });
  modern.append(postcss.rule({ selectors: (rule as Rule).selectors }).append(declaration.clone()));
  declaration.value = fallback;
  rule.after(modern);
}

export function lowerMiniToolCss(css: string): string {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (
      rule.parent?.type === "atrule" &&
      (rule.parent as { name: string }).name.endsWith("keyframes")
    )
      return;
    lowerRule(rule);
  });
  root.walkDecls(lowerDeclaration);
  return root.toString();
}
