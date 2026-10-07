// ego-browser nodejs payload. Prefix globalThis.alignmentQA = { root, space }.
const { root, space } = globalThis.alignmentQA;
const task = await taskSpace(space),
  page = task.page("p1");
const assert = (await import("node:assert/strict")).default;
const fs = await import("node:fs/promises");
const { pathToFileURL } = await import("node:url");
const { captureBrowserScreenshot } = await import(
  pathToFileURL(`${root}/scripts/base/screenshot.mjs`).href
);
await fs.mkdir(`${root}/.tmp`, { recursive: true });
const settle = () =>
  page.evaluate(
    () =>
      new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
      ),
  );
const inspect = () =>
  page.evaluate(() => {
    const doc = document.querySelector('canvas[aria-label="Sprite canvas"]');
    const frame = [...document.querySelectorAll(".xse-viewport canvas")].find((c) => c !== doc);
    const d = doc.getContext("2d").getImageData(0, 0, doc.width, doc.height).data;
    let x0 = doc.width,
      y0 = doc.height,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < doc.height; y++)
      for (let x = 0; x < doc.width; x++) {
        const i = (y * doc.width + x) * 4,
          v = d[i];
        if ((v === 128 || v === 192) && d[i + 1] === v && d[i + 2] === v && d[i + 3] === 255) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    const dr = doc.getBoundingClientRect(),
      fr = frame.getBoundingClientRect();
    const x = dr.x + (x0 * dr.width) / doc.width,
      y = dr.y + (y0 * dr.height) / doc.height;
    const width = ((x1 - x0 + 1) * dr.width) / doc.width,
      height = ((y1 - y0 + 1) * dr.height) / doc.height;
    const ctx = frame.getContext("2d");
    const pixel = (x, y) => [
      ...ctx.getImageData(
        Math.floor(((x - fr.x) * frame.width) / fr.width),
        Math.floor(((y - fr.y) * frame.height) / fr.height),
        1,
        1,
      ).data,
    ];
    return {
      x,
      y,
      width,
      height,
      dpr: devicePixelRatio,
      viewport: [innerWidth, innerHeight],
      edges: [
        pixel(x - 1, y + height / 2),
        pixel(x + width / 2, y - 1),
        pixel(x + width, y + height / 2),
        pixel(x + width / 2, y + height),
      ],
      canvas: { x: dr.x, y: dr.y, width: dr.width, height: dr.height },
      tool: document.querySelector('button[aria-label="Pencil"]').getBoundingClientRect().width,
    };
  });
const check = (r, zoom = 1) => {
  assert.ok(
    Math.abs(r.width - Math.trunc(41 * zoom) * 2) <= Math.max(1 / r.dpr, zoom % 1 ? 2 : 0),
    `checker width: ${JSON.stringify(r)}`,
  );
  assert.ok(
    Math.abs(r.height - Math.trunc(31 * zoom) * 2) <= Math.max(1 / r.dpr, zoom % 1 ? 2 : 0),
    `checker height: ${JSON.stringify(r)}`,
  );
  assert.equal(r.tool, 32, "Aseprite desktop tool width");
  for (const p of r.edges)
    assert.deepEqual(p, [0, 0, 0, 255], `Outline detached from image: ${JSON.stringify(r)}`);
};
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1200,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await settle();
await page.setInputFiles("input[type=file]", [`${root}/.tmp/alignment-fixture.png`]);
await page.waitForSelector('[role="tab"][aria-label="alignment-fixture.png"]');
await page.fill('input[aria-label="Zoom"]', "100");
await page.press('input[aria-label="Zoom"]', "Enter");
await settle();
const results = [];
for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 900,
    deviceScaleFactor: dpr,
    mobile: false,
  });
  await settle();
  const result = await inspect();
  check(result);
  results.push(result);
}
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1200,
  height: 900,
  deviceScaleFactor: 2.5,
  mobile: false,
});
for (const zoom of [0.75, 1.5, 1]) {
  await page.fill('input[aria-label="Zoom"]', String(zoom * 100));
  await page.press('input[aria-label="Zoom"]', "Enter");
  await settle();
  const result = await inspect();
  check(result, zoom);
  results.push({ ...result, zoom });
}
const before = await inspect();
const cx = before.canvas.x + before.canvas.width / 2,
  cy = before.canvas.y + before.canvas.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down({ button: "middle" });
await page.mouse.move(cx + 40, cy + 20, { steps: 4, label: "Check image and outline panning" });
await page.mouse.up({ button: "middle" });
await settle();
const after = await inspect();
check(after);
assert.ok(Math.abs(after.x - before.x - 40) < 1);
assert.ok(Math.abs(after.y - before.y - 20) < 1);
results.push({ ...after, pan: [40, 20] });
await page.click('button[aria-label="Hide Timeline"]');
await settle();
const hidden = await inspect();
check(hidden);
assert.ok(Math.abs(hidden.x - after.x) < 1);
assert.ok(Math.abs(hidden.y - after.y) < 1);
await page.click('button[aria-label="Show Timeline"]');
await settle();
check(await inspect());
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1200,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await settle();
const final = await inspect();
check(final);
await task.cdp("Target.activateTarget", { targetId: page.targetId });
const screenshot = await captureBrowserScreenshot(page, {
  path: `${root}/.tmp/alignment-app.png`,
  expectedDpr: 1,
});
await fs.writeFile(
  `${root}/.tmp/alignment-browser.json`,
  JSON.stringify({ passed: true, results, final, screenshot }, null, 2),
);
console.log({
  passed: true,
  dprs: [1, 1.25, 1.5, 2, 2.5, 3],
  zoom: [75, 100, 150],
  pan: [40, 20],
  timelineAnchor: true,
  final,
});
await page.click('button[aria-label="Close alignment-fixture.png"]');
await page.cdp("Emulation.clearDeviceMetricsOverride");
