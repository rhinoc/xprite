const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("@babel/parser");
function filesIn(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesIn(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
}
module.exports = function (source) {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const edits = [],
    imports = [];
  let sequence = 0;
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.object?.type === "MetaProperty" &&
      node.callee.property?.name === "glob"
    ) {
      const pattern = node.arguments[0]?.value;
      if (typeof pattern !== "string")
        throw new Error("Native asset globs must be literal strings");
      const options = Object.fromEntries(
        (node.arguments[1]?.properties ?? []).map((property) => [
          property.key.name ?? property.key.value,
          property.value.value,
        ]),
      );
      if (options.eager !== true || options.import !== "default")
        throw new Error("Native asset globs require eager default imports");
      const prefix = pattern.slice(0, pattern.indexOf("*")).replace(/[^/]*$/, "");
      const directory = path.resolve(this.context, prefix);
      const regex = new RegExp(
        "^" +
          pattern
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*\*\//g, "__RECURSIVE__")
            .replace(/\*/g, "[^/]*")
            .replace(/__RECURSIVE__/g, "(?:.*/)?") +
          "$",
      );
      const matches = filesIn(directory)
        .map((filename) => ({
          filename,
          relative: "./" + path.relative(this.context, filename).split(path.sep).join("/"),
        }))
        .map((entry) => ({
          ...entry,
          relative: pattern.startsWith("../")
            ? path.relative(this.context, entry.filename).split(path.sep).join("/")
            : entry.relative,
        }))
        .filter((entry) => regex.test(entry.relative));
      const entries = matches.map(({ filename, relative }) => {
        this.addDependency(filename);
        const name = `__xprite_asset_${sequence++}`;
        imports.push(`import ${name} from ${JSON.stringify(filename + (options.query ?? ""))};`);
        return `${JSON.stringify(relative)}: ${name}`;
      });
      edits.push({ start: node.start, end: node.end, value: "{" + entries.join(",") + "}" });
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  return imports.join("\n") + "\n" + source;
};
