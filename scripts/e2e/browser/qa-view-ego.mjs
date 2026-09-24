// Existing-space public UI QA; run through ego-browser nodejs.
const task = await taskSpace(2);
if (task.ownership !== "agent") throw Error("Space not agent-owned");
const p = task.page("p1");
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1405,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
});
await p.goto("http://127.0.0.1:4173/editor", { waitUntil: "networkidle" });
await p.setInputFiles('input[type="file"]', ["/tmp/aseprite-view-qa/pixel.png"]);
await p.waitForFunction(() =>
  document.querySelector(
    '[role="tablist"][aria-label="Documents"] [role="tab"][aria-label="pixel.png"]',
  ),
);
await p.fill('input[aria-label="Zoom"]', "800");
await p.press('input[aria-label="Zoom"]', "Enter");
async function sample(x, y) {
  await p.mouse.move(600, 12);
  return p.evaluate(
    async ({ x, y }) => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
        r = c.getBoundingClientRect();
      return [
        ...c
          .getContext("2d")
          .getImageData(
            Math.floor(((x - r.left) * c.width) / r.width),
            Math.floor(((y - r.top) * c.height) / r.height),
            1,
            1,
          ).data,
      ];
    },
    { x, y },
  );
}
const point = { x: 690, y: 200 };
const before = await sample(point.x, point.y);
await p.click('button[aria-label="Zoom"]');
await p.mouse.click(point.x, point.y, { label: "zoom at image point" });
const afterZoom = await sample(point.x, point.y);
const zoom = await p.evaluate(() => document.querySelector('input[aria-label="Zoom"]').value);
if (JSON.stringify(before) !== JSON.stringify(afterZoom) || Number(zoom) <= 800)
  throw Error("Zoom did not preserve anchored image point");
await p.focus('canvas[aria-label="Sprite canvas"]');
await p.keyboard.down("Space");
await p.mouse.move(point.x, point.y);
await p.mouse.down();
await p.mouse.move(point.x + 40, point.y + 30, { label: "pan image view" });
await p.mouse.up();
await p.keyboard.up("Space");
const afterPan = await sample(point.x + 40, point.y + 30);
if (JSON.stringify(before) !== JSON.stringify(afterPan))
  throw Error("Pan did not retain image point");
await p.click('button[aria-label="Hide Timeline"]');
const timelineHidden = await sample(point.x + 40, point.y + 30);
if (JSON.stringify(afterPan) !== JSON.stringify(timelineHidden))
  throw Error("Timeline hide shifted image origin");
await p.click('button[aria-label="Show Timeline"]');
const timelineRestored = await sample(point.x + 40, point.y + 30);
if (JSON.stringify(afterPan) !== JSON.stringify(timelineRestored))
  throw Error("Timeline restore shifted image origin");
const report = {
  capturedAt: new Date().toISOString(),
  method: "Ego user input and visible canvas point sampling",
  before,
  afterZoom,
  zoom,
  afterPan,
  timelineHidden,
  timelineRestored,
  passed: true,
};
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(`${process.cwd()}/.tmp/qa-view-ui.json`, JSON.stringify(report, null, 2));
console.log(report);
