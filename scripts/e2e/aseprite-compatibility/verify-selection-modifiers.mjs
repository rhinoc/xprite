import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { build } from "esbuild";

const bindings = JSON.parse(
  readFileSync("apps/editor/assets/commands/libresprite-keyboard-shortcuts.json", "utf8"),
);
const expectedBindings = {
  AddSelection: ["Shift", "Selection"],
  SubtractSelection: ["Alt+Shift", "Selection"],
  IntersectSelection: ["Ctrl+Shift", "Selection"],
};
for (const [id, [shortcut, context]] of Object.entries(expectedBindings))
  assert(
    bindings.actions.some(
      (row) => row.id === id && row.shortcut === shortcut && row.context === context,
    ),
    `${id} product modifier ${shortcut}`,
  );

const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/selection/operations.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const { selectionModeForInput } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
let cases = 0;
for (let bits = 0; bits < 8; bits++)
  for (const stored of ["replace", "add", "subtract", "intersect"])
    for (const button of [0, 2]) {
      const input = { shift: !!(bits & 1), alt: !!(bits & 2), ctrl: !!(bits & 4), button };
      const expected =
        button === 2 || (input.shift && input.alt)
          ? "subtract"
          : input.shift && input.ctrl
            ? "intersect"
            : input.shift
              ? "add"
              : stored;
      assert.equal(
        selectionModeForInput(stored, input),
        expected,
        `${JSON.stringify(input)} stored=${stored}`,
      );
      cases++;
    }
console.log(
  `${cases} product selection-modifier cases match the binding catalog and editor policy`,
);
