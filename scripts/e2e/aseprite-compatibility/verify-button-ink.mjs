import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { transform } from "esbuild";

const source = await readFile("packages/ui/src/base/controls/control-policy.ts", "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { buttonInkRole } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const themes = await Promise.all(
  ["aseprite-light-theme.json", "aseprite-dark-theme.json"].map(async (file) =>
    JSON.parse(await readFile(`packages/ui/assets/themes/aseprite/${file}`, "utf8")),
  ),
);
const base = {
  buttonSet: true,
  selected: false,
  hovered: false,
  pressed: false,
  disabled: false,
};
assert.equal(buttonInkRole(base), "button_normal_text");
assert.equal(
  buttonInkRole({ ...base, selected: true }),
  "button_hot_text",
  "selected source button-set uses hot ink",
);
assert.equal(buttonInkRole({ ...base, hovered: true }), "button_hot_text");
assert.equal(buttonInkRole({ ...base, selected: true, pressed: true }), "button_selected_text");
assert.equal(buttonInkRole({ ...base, hovered: true, pressed: true }), "button_selected_text");
assert.equal(
  buttonInkRole({ ...base, buttonSet: false, selected: true }),
  "button_selected_text",
  "regular source button uses selected ink",
);
for (const buttonSet of [false, true])
  for (const selected of [false, true])
    for (const hovered of [false, true])
      for (const pressed of [false, true])
        assert.equal(
          buttonInkRole({ buttonSet, selected, hovered, pressed, disabled: true }),
          "disabled",
        );
for (const theme of themes)
  assert.equal(
    theme.colors[buttonInkRole({ ...base, selected: true })],
    theme.colors.button_hot_text,
  );
console.log("Button ink role and both package theme definitions verified.");
