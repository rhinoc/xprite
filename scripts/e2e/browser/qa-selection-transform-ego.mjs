// Public UI gestures + real exported PNGs; compare bytes separately with verify script.
const task = await taskSpace(2);
if (task.ownership !== "agent") throw Error("Space not agent-owned");
const p = task.page("p1");
const fs = await import("node:fs/promises");
const { pathToFileURL } = await import("node:url");
const { captureBrowserScreenshot } = await import(
  pathToFileURL(`${process.cwd()}/scripts/base/screenshot.mjs`).href
);
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1405,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
});
await p.goto("http://127.0.0.1:4173/editor", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[role="tab"][aria-label="Untitled.png"]', { state: "visible" });
const key = async (k) => {
  await p.focus('canvas[aria-label="Sprite canvas"]');
  await p.keyboard.press(k);
};
const drag = async (a, b, button = "left") => {
  await p.mouse.move(...a, { label: "start selection gesture" });
  await p.mouse.down({ button });
  await p.mouse.move(...b, { label: "transform selected area" });
  await p.mouse.up({ button });
};
async function save(name) {
  await p.click('button[aria-label="File"]');
  await p.click('[role="menu"][aria-label="File"] button[aria-label="Export"]');
  const pending = p.waitForEvent("download", { timeout: 30000 });
  await p.click('[role="menu"][aria-label="Export"] button[aria-label="Export As..."]');
  const file = await pending;
  await file.saveAs(`${process.cwd()}/.tmp/qa-selection-${name}.png`);
  if (await file.failure()) throw Error("Export failed");
}
await save("original");
await key("m");
await drag([693, 291], [786, 360]);
await p.mouse.move(739, 325, { label: "hover selected content" });
const cursor = await p.evaluate(
  () => document.querySelector('canvas[aria-label="Sprite canvas"]').style.cursor,
);
if (!cursor.includes(".svg")) throw Error("Missing Aseprite selection cursor");
const screenshot = await captureBrowserScreenshot(p, {
  path: "/tmp/ase-selection-handles.png",
  expectedDpr: 1,
});
await drag([739, 325], [783, 354]);
await key("ControlOrMeta+z");
await save("cancel");
await drag([739, 325], [783, 354]);
await key("Enter");
await save("move");
await key("ControlOrMeta+z");
await save("undo");
await key("ControlOrMeta+Shift+z");
await save("redo");
await key("Escape");
await drag([693, 291], [786, 360], "right");
await save("right-selection");
await fs.writeFile(
  `${process.cwd()}/.tmp/qa-selection-transform-ui.json`,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      cursor,
      screenshot,
      files: ["original", "cancel", "move", "undo", "redo", "right-selection"],
      method:
        "Ego public mouse/keyboard/menu inputs and exported PNGs. Pixel assertions are in verify-selection-ui-exports.mjs.",
    },
    null,
    2,
  ),
);
console.log("Selection UI gestures and exports captured.");
