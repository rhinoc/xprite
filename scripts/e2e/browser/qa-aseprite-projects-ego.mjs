// Home, bundled recent project, Aseprite project save, and IndexedDB reopen.
const task = await taskSpace(2);
if (task.ownership !== "agent") throw Error("Space2 not agent-owned");
const page = task.page("p1");
const fs = await import("node:fs/promises");
const results = [];
const check = async (name, evaluate) => {
  if (!(await page.evaluate(evaluate))) throw Error(name);
  results.push(name);
  console.log(`PASS: ${name}`);
};
const recentButton = '[role="group"][aria-label="Recent files"] button[aria-label="xprite.ase"]';
const openSample = async () => {
  await page.waitForSelector(recentButton, { state: "visible" });
  await page.click(recentButton);
  await page.waitForSelector('[role="tab"][aria-label="xprite.ase"]', { state: "visible" });
};

await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1920,
  height: 1050,
  deviceScaleFactor: 2,
  mobile: false,
});
await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(recentButton, { state: "visible" });
await check(
  "Root opens Home and lists the bundled xprite.ase project",
  () =>
    !!document.querySelector('[aria-label="Home"]') &&
    !!document.querySelector(
      '[role="group"][aria-label="Recent files"] button[aria-label="xprite.ase"]',
    ),
);
await openSample();
await check(
  "Opening the bundled recent restores its ten-frame ASE project",
  () =>
    document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
    "1 layers, 10 frames",
);

await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
const download = page.waitForEvent("download", { timeout: 30000 });
await page.focus('canvas[aria-label="Sprite canvas"]');
await page.keyboard.press("ControlOrMeta+Shift+s");
const file = await download;
await file.saveAs(`${process.cwd()}/.tmp/qa-xprite-web-edited.aseprite`);
if (await file.failure()) throw Error("xprite.ase save failed");
results.push("Browser saves the bundled sample as an Aseprite project");

await page.goto("http://127.0.0.1:4173/home", { waitUntil: "domcontentloaded" });
await openSample();
await check(
  "IndexedDB recent reopening retains the complete sample project",
  () =>
    document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
    "1 layers, 10 frames",
);

await fs.writeFile(
  `${process.cwd()}/.tmp/qa-xprite-project-ui.json`,
  JSON.stringify({ capturedAt: new Date().toISOString(), passed: true, results }, null, 2),
);
console.log(results);
