const task = await taskSpace(captureConfig.spaceId),
  page = task.page("p1");
const fs = await import("node:fs/promises");
await fs.mkdir(`${captureConfig.root}/.tmp`, { recursive: true });
const button = (label) => `button[aria-label=${JSON.stringify(label)}]`;
const settle = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const resize = async (width, height) => {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await settle();
};
const checks = [];
const measure = async (name) => {
  await settle();
  const value = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    panels: [
      ...document.querySelectorAll(
        '[role="dialog"],[role="menu"],[role="listbox"][aria-label="Method"]',
      ),
    ].map((n) => ({ label: n.getAttribute("aria-label"), ...n.getBoundingClientRect().toJSON() })),
  }));
  if (!value.panels.length) throw Error(`Missing ${name}`);
  for (const r of value.panels)
    if (r.x < 0 || r.y < 0 || r.right > value.width + 0.01 || r.bottom > value.height + 0.01)
      throw Error(`${name}: ${JSON.stringify(value)}`);
  checks.push({ name, ...value });
};
await page.reload();
await page.waitForSelector(button("File"));
await resize(1405, 768);
await page.click(button("Edit"));
await page.click(button("Preferences..."));
await page.click(button("Dark"));
const handle = await page.evaluate(() => {
  const r = document.querySelector('[data-window-handle="move"]').getBoundingClientRect();
  return { x: r.x + 40, y: r.y + r.height / 2 };
});
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(1300, 700);
await page.mouse.up();
await measure("Dragged dark preferences");
await resize(320, 360);
await measure("Dragged preferences recovered after shrink");
const c = await page.evaluate(() => {
  const r = document.querySelector("[data-window-client]").getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(c.x, c.y);
await page.mouse.wheel(1200, 1200);
await settle();
const cancel = await page.evaluate(() => {
  const b = document.querySelector('button[aria-label="Cancel"]'),
    r = b.getBoundingClientRect();
  return {
    ...r.toJSON(),
    reachable: b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
  };
});
if (!cancel.reachable) throw Error(`Scrolled Cancel unreachable: ${JSON.stringify(cancel)}`);
checks.push({ name: "Dark preferences Cancel reachable by wheel scroll", cancel });
await page.screenshot({
  path: `${captureConfig.root}/.tmp/responsive-dark-preferences-320.png`,
});
await page.click(button("Cancel"));
// An invalid file exercises the ordinary error form without replacing the document.
const invalid = "/tmp/aseprite-responsive-invalid.aseprite";
await fs.writeFile(invalid, "invalid fixture");
await page.setInputFiles('input[type="file"]', [invalid]);
await page.waitForSelector('[role="dialog"][aria-label="Image Editor"]');
await measure("Generic error form");
await page.keyboard.press("Escape");
await resize(844, 390);
await page.click(button("Edit"));
const menu = await page.evaluate(() => {
  const n = document.querySelector('[role="menu"][aria-label="Edit"]'),
    r = n.getBoundingClientRect();
  return {
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
    horizontalScrollbar: n.offsetHeight - n.clientHeight,
    overflowX: getComputedStyle(n).overflowX,
  };
});
if (menu.horizontalScrollbar > 1)
  throw Error(`Unexpected horizontal menu scrollbar: ${JSON.stringify(menu)}`);
await page.mouse.move(menu.x, menu.y);
await page.mouse.wheel(0, 500);
await page.click(button("Insert Text"));
await measure("Short-window scrolled Edit menu opens Text");
await page.keyboard.press("Escape");
await resize(320, 360);
await page.setInputFiles('input[type="file"]', [captureConfig.fixture]);
await page.waitForSelector('[role="dialog"][aria-label="Pixelate Image"]');
await measure("Oversized import form");
console.log(
  (await page.snapshot())
    .split("\n")
    .filter((l) => /Method|Pixelate|Cancel/.test(l))
    .join("\n"),
);
await page.click(button("Method"));
await measure("Import Method dropdown on narrow scene");
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await fs.writeFile(
  `${captureConfig.root}/.tmp/responsive-dialogs-extra.json`,
  JSON.stringify({ passed: true, checks }, null, 2) + "\n",
);
console.log(
  "Responsive supplemental checks passed:",
  checks.map((c) => c.name),
);
