// Public-input browser checks. Run with ego-browser nodejs < this file against built preview.
const task = await taskSpace(2);
if (task.ownership !== "agent") throw Error("Space2 must remain agent-owned");
const p = task.page("p1");
const fs = await import("node:fs/promises"),
  results = [];
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
const check = async (name, fn) => {
  if (!(await p.evaluate(fn))) throw Error(name);
  results.push(name);
};
const key = async (value) => {
  await p.focus('canvas[aria-label="Sprite canvas"]');
  await p.keyboard.press(value);
};
const drag = async (a, b, button = "left") => {
  await p.mouse.move(...a, { label: "start editor gesture" });
  await p.mouse.down({ button });
  await p.mouse.move(...b, { label: "drag editor gesture" });
  await p.mouse.up({ button });
};
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1405,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
});
await p.goto("http://127.0.0.1:4173/editor", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[role="tab"][aria-label="Untitled.png"]', { state: "visible" });
await p.waitForFunction(
  () =>
    document.querySelectorAll('[role="listbox"][aria-label="Palette colors"] [role="option"]')
      .length === 5,
);
await drag([16, 98], [70, 98]);
await check(
  "Palette handle grows 5 to 8",
  () =>
    document.querySelectorAll('[role="listbox"][aria-label="Palette colors"] [role="option"]')
      .length === 8,
);
await key("ControlOrMeta+z");
await check(
  "Palette resize undo restores five colors",
  () =>
    document.querySelectorAll('[role="listbox"][aria-label="Palette colors"] [role="option"]')
      .length === 5,
);
await key("ControlOrMeta+Shift+z");
await check(
  "Palette resize redo restores eight colors",
  () =>
    document.querySelectorAll('[role="listbox"][aria-label="Palette colors"] [role="option"]')
      .length === 8,
);
await drag([70, 98], [70, 80]);
await check(
  "Palette handle shrinks to three colors",
  () =>
    document.querySelectorAll('[role="listbox"][aria-label="Palette colors"] [role="option"]')
      .length === 3,
);
await key("ControlOrMeta+z");
await key("ControlOrMeta+z");
await key("t");
await drag([650, 310], [780, 350]);
await check(
  "Text tool uses inline entry, no dialog",
  () =>
    !!document.querySelector('input[aria-label="Canvas text"]') &&
    !document.querySelector('[role="dialog"]'),
);
await p.fill('input[aria-label="Canvas text"]', "Hi");
await p.screenshot({ raw: true, path: "/tmp/ase-qa-inline-text.png" });
await p.press('input[aria-label="Canvas text"]', "Escape");
await check(
  "Escape cancels inline text",
  () => !document.querySelector('input[aria-label="Canvas text"]'),
);
await drag([650, 310], [780, 350]);
await p.fill('input[aria-label="Canvas text"]', "Hi");
await p.press('input[aria-label="Canvas text"]', "Enter");
await check(
  "Enter commits inline text",
  () => !document.querySelector('input[aria-label="Canvas text"]'),
);
await key("ControlOrMeta+z");
await check(
  "Text undo leaves no active draft",
  () => !document.querySelector('input[aria-label="Canvas text"]'),
);
await key("ControlOrMeta+Shift+z");
await p.click('button[aria-label="Close Untitled.png"]');
if (await p.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Warning"]'))) {
  await check(
    "Pending local save asks Save / Don’t Save / Cancel",
    () =>
      !!document.querySelector('[role="dialog"] button[aria-label="Save"]') &&
      !!document.querySelector('[role="dialog"] button[aria-label="Don\'t Save"]') &&
      !!document.querySelector('[role="dialog"] button[aria-label="Cancel"]'),
  );
  await p.click('button[aria-label="Cancel"]');
  await check(
    "Cancel keeps document open",
    () => !!document.querySelector('[role="tab"][aria-label="Untitled.png"]'),
  );
  await p.click('button[aria-label="Close Untitled.png"]');
  if (await p.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Warning"]')))
    await p.click('button[aria-label="Don\'t Save"]');
}
await check(
  "Close removes the document tab",
  () => !document.querySelector('[role="tab"][aria-label="Untitled.png"]'),
);
await p.click('[role="tab"][aria-label="Home"]');
await check(
  "Home omits recent folders",
  () => !document.querySelector('[aria-label="Recent folders"]'),
);
await fs.writeFile(
  `${process.cwd()}/.tmp/qa-remaining-interactions.json`,
  JSON.stringify(
    { capturedAt: new Date().toISOString(), url: await p.url(), results, passed: true },
    null,
    2,
  ),
);
console.log(results);
