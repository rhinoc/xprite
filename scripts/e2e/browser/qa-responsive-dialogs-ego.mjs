// Run inside ego-browser nodejs with an existing agent-owned task space.
const task = await taskSpace(captureConfig.spaceId);
const page = task.page("p1");
const fs = await import("node:fs/promises");
await fs.mkdir(`${captureConfig.root}/.tmp`, { recursive: true });
const sizes = captureConfig.sizes ?? [
  [320, 360],
  [390, 844],
  [844, 390],
  [1024, 768],
  [1405, 768],
  [1920, 1080],
];
const checks = [];
const button = (label) => `button[aria-label=${JSON.stringify(label)}]`;
const settle = () =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
const measure = async (name) => {
  await settle();
  const result = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    panels: [...document.querySelectorAll('[role="dialog"],[role="menu"]')].map((n) => {
      const r = n.getBoundingClientRect(),
        c = n.querySelector("[data-ui-window-client]");
      return {
        label: n.getAttribute("aria-label"),
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        client: c
          ? {
              width: c.clientWidth,
              height: c.clientHeight,
              scrollWidth: c.scrollWidth,
              scrollHeight: c.scrollHeight,
            }
          : null,
      };
    }),
  }));
  if (!result.panels.length) throw Error(`No panel: ${name}`);
  for (const r of result.panels)
    if (r.x < 0 || r.y < 0 || r.right > result.width + 0.01 || r.bottom > result.height + 0.01)
      throw Error(`${name} outside viewport: ${JSON.stringify(result)}`);
  if (result.scrollWidth > result.width || result.scrollHeight > result.height)
    throw Error(`${name} document overflow`);
  if (result.width === 1405 && result.height === 768) {
    for (const panel of result.panels) {
      const state = {
        "New Sprite": "new-sprite",
        "Insert Text": "insert-text",
        Preferences: "preferences",
      }[panel.label];
      if (!state) continue;
      const file = `${captureConfig.root}/.tmp/alignment-aseprite-light-${state}-widgets.json`;
      const inventory = JSON.parse(await fs.readFile(file, "utf8"));
      const [x, y, w, h] = inventory.tree.children[0].bounds.map((n) => n * 2);
      const expected = {
        x: Math.floor((x * 1405) / 1920),
        y: Math.floor((y * 768) / 1050),
        right: Math.ceil(((x + w) * 1405) / 1920),
        bottom: Math.ceil(((y + h) * 768) / 1050),
      };
      for (const key of Object.keys(expected))
        if (panel[key] !== expected[key])
          throw Error(
            `${panel.label} differs from Aseprite inventory: ${key} ${panel[key]} != ${expected[key]}`,
          );
      panel.asepriteGeometryReference = file;
    }
  }
  checks.push({ name, ...result });
};
for (const [width, height] of sizes) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await settle();
  for (const [menu, item] of [
    ["File", "New..."],
    ["Edit", "Preferences..."],
    ["Edit", "Insert Text"],
    ["Layer", "Properties..."],
    ["Frame", "Frame Properties..."],
  ]) {
    console.log(`CHECK ${width}x${height} ${menu}/${item}`);
    await page.click(button(menu));
    await measure(`${width}x${height} ${menu} menu`);
    const scrollTarget = await page.evaluate((label) => {
      const node = document.querySelector(`button[aria-label="${label}"]`),
        panel = node.closest('[role="menu"]');
      const b = node.getBoundingClientRect(),
        r = panel.getBoundingClientRect();
      return b.bottom > r.bottom - 16
        ? { x: r.x + r.width / 2, y: r.y + r.height / 2, delta: b.bottom - r.bottom + 60 }
        : null;
    }, item);
    if (scrollTarget) {
      await page.mouse.move(scrollTarget.x, scrollTarget.y);
      await page.mouse.wheel(0, scrollTarget.delta);
    }
    await page.click(button(item));
    await measure(`${width}x${height} ${menu}/${item}`);
    if (item === "Insert Text") {
      await page.click(button("Text Color"));
      await measure(`${width}x${height} nested text color`);
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");
  }
  const foreground = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((n) => n.getAttribute("aria-label")?.startsWith("Foreground color #"))
      ?.getAttribute("aria-label"),
  );
  await page.click(button(foreground));
  await measure(`${width}x${height} foreground color`);
  await page.keyboard.press("Escape");
  await page.click(button("Pencil"));
  for (const name of ["Brush type", "Dynamics"]) {
    if (
      await page.evaluate(
        (label) => document.querySelector(`button[aria-label="${label}"]`)?.disabled,
        name,
      )
    ) {
      checks.push({
        name: `${width}x${height} ${name}`,
        skipped: "Disabled by editor capabilities",
      });
      continue;
    }
    await page.click(button(name));
    await measure(`${width}x${height} ${name}`);
    await page.keyboard.press("Escape");
  }
  console.log(`DIALOG_QA ${width}x${height}: passed`);
}
await fs.writeFile(
  `${captureConfig.root}/.tmp/responsive-dialogs-${sizes[0][0]}.json`,
  JSON.stringify({ checks, passed: true }, null, 2) + "\n",
);
