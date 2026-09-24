const c = qaConfig,
  task = await taskSpace(c.space),
  page = task.page(c.page),
  fs = await import("node:fs/promises");
const report = { startedAt: new Date().toISOString(), url: c.url, checks: [] };
const settle = () =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const check = async (name, run) => {
  try {
    const detail = await run();
    report.checks.push({ name, passed: true, detail });
    console.log("PASS", name);
  } catch (error) {
    report.checks.push({ name, passed: false, error: String(error) });
    throw error;
  } finally {
    await fs.writeFile(c.output, JSON.stringify(report, null, 2));
  }
};
const hash = (selector) =>
  page.evaluate((selector) => {
    const canvas = document.querySelector(selector);
    if (!canvas) throw Error("Missing canvas " + selector);
    let h = 2166136261;
    for (const v of canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data)
      h = Math.imul(h ^ v, 16777619);
    return h >>> 0;
  }, selector);
const main = 'canvas[aria-label="Sprite canvas"]',
  preview = 'canvas[aria-label="Animation preview canvas"]';
const assert = (value, message) => {
  if (!value) throw Error(message);
};
const focus = () => page.focus(main);
const menu = async (...labels) => {
  for (const label of labels) await page.click(`[role^="menuitem"][aria-label="${label}"]`);
};
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1405,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.goto(c.url);
await page.waitForSelector(main);
const oldNames = await page.evaluate(() =>
  [...document.querySelectorAll("[role=tab]")]
    .map((e) => e.getAttribute("aria-label"))
    .filter((n) => n !== "Home"),
);
if (
  oldNames.some(
    (n) =>
      ![
        "Untitled.png",
        "xprite.ase",
        "animation-fixture.aseprite",
        "sheet-delivery-fixture.aseprite",
      ].includes(n),
  )
)
  throw Error("QA refuses to clear unexpected documents " + oldNames);
await menu("File", "Close All");
for (let i = 0; i < 32; i++) {
  const info = await page.evaluate(() => ({
    count: [...document.querySelectorAll("[role=tab]")].filter(
      (e) => e.getAttribute("aria-label") !== "Home",
    ).length,
    warning: !!document.querySelector('[role=dialog][aria-label="Warning"]'),
  }));
  if (!info.count) break;
  if (!info.warning) throw Error("Unexpected CloseAll pending state");
  await page.click('[role=dialog][aria-label="Warning"] button[aria-label="Don\'t Save"]');
}
await page.setInputFiles("input[type=file]", [
  c.root + "/.tmp/features-7-12/animation-fixture.aseprite",
]);
await page.waitForFunction(
  () =>
    document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
    "1 layers, 3 frames",
);
await settle();
await check("Onion skin and editable previous-frame range", async () => {
  await page.click('button[aria-label="Select frame 2, duration 150 milliseconds"]');
  await page.mouse.move(1, 1);
  await settle();
  const before = await hash(main);
  await focus();
  await page.keyboard.press("F3");
  await page.waitForSelector('button[aria-label="Onion skin"][aria-pressed="true"]');
  await page.mouse.move(1, 1);
  await settle();
  assert((await hash(main)) !== before, "Onion did not change visible frame composition");
  const previous = '[role=slider][aria-label="Previous onion skin frames"]';
  await page.focus(previous);
  await page.keyboard.press("ArrowLeft");
  await page.waitForSelector(previous + '[aria-valuenow="2"]');
  const value = await page.evaluate(
    (selector) => document.querySelector(selector)?.getAttribute("aria-valuenow"),
    previous,
  );
  assert(value === "2", "Range keyboard control did not update count");
  return { range: value, pixelsChanged: true };
});
await check("Independent preview playback leaves main frame unchanged", async () => {
  await focus();
  await page.keyboard.press("F7");
  await page.waitForSelector(preview);
  const before = await hash(preview);
  await page.click('button[aria-label="Play preview"]');
  await page.waitForFunction(
    ({ selector, before }) => {
      const canvas = document.querySelector(selector);
      if (!canvas) return false;
      let h = 2166136261;
      for (const v of canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data)
        h = Math.imul(h ^ v, 16777619);
      return h >>> 0 !== before;
    },
    { selector: preview, before },
    { timeout: 5000 },
  );
  await page.click('button[aria-label="Stop preview"]');
  const frame = await page.evaluate(
    () => document.querySelector('input[aria-label="Current frame"]').value,
  );
  assert(frame === "2", "Preview scrubbed the main document");
  await page.click('button[aria-label="Close Preview"]');
  await focus();
  await page.keyboard.press("F3");
  return { mainFrame: frame, previewPixelsChanged: true };
});
await check("Effect preview Cancel and Apply undo through real controls", async () => {
  await page.mouse.move(1, 1);
  await settle();
  const before = await hash(main);
  await focus();
  await page.keyboard.press("ControlOrMeta+u");
  await page.waitForSelector('[role=dialog][aria-label="Hue/Saturation"]');
  console.log(
    "EFFECT_INPUTS",
    await page.evaluate(() =>
      [...document.querySelectorAll("[role=dialog] input")].map((e) => ({
        label: e.getAttribute("aria-label"),
        value: e.value,
      })),
    ),
  );
  await page.fill('input[aria-label="Hue value"]', "90");
  await page.press('input[aria-label="Hue value"]', "Tab");
  await settle();
  assert((await hash(main)) !== before, "Hue preview did not render");
  await page.click('[role=dialog] button[aria-label="Cancel"]');
  await page.mouse.move(1, 1);
  await settle();
  assert((await hash(main)) === before, "Cancel kept preview pixels");
  await focus();
  await page.keyboard.press("ControlOrMeta+u");
  await page.waitForSelector('[role=dialog][aria-label="Hue/Saturation"]');
  await page.fill('input[aria-label="Hue value"]', "90");
  await page.click('[role=dialog] button[aria-label="OK"]');
  await page.mouse.move(1, 1);
  await settle();
  assert((await hash(main)) !== before, "OK did not commit effect");
  await focus();
  await page.keyboard.press("ControlOrMeta+z");
  await page.mouse.move(1, 1);
  await settle();
  assert((await hash(main)) === before, "One Undo did not restore effect");
  return { preview: true, cancel: true, commit: true, undo: true };
});
await check("Grid settings commit and undo preserve Aseprite bounds", async () => {
  await menu("View", "Grid", "Grid Settings");
  await page.waitForSelector('[role=dialog][aria-label="Grid Settings"]');
  for (const [name, value] of [
    ["X", "2"],
    ["Y", "3"],
    ["Width", "4"],
    ["Height", "5"],
  ])
    await page.fill(`[role=dialog] input[aria-label="Grid ${name}"]`, value);
  await page.click('[role=dialog] button[aria-label="OK"]');
  await focus();
  await page.keyboard.press("ControlOrMeta+z");
  await menu("View", "Grid", "Grid Settings");
  await page.waitForSelector('[role=dialog][aria-label="Grid Settings"]');
  const values = await page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("[role=dialog] input")].map((e) => [
        e.getAttribute("aria-label"),
        e.value,
      ]),
    ),
  );
  assert(
    values["Grid X"] === "0" &&
      values["Grid Y"] === "0" &&
      values["Grid Width"] === "16" &&
      values["Grid Height"] === "16",
    "Grid undo did not restore bounds " + JSON.stringify(values),
  );
  await page.click('[role=dialog] button[aria-label="Cancel"]');
  return values;
});
await check("Symmetry stroke paints both sides and one Undo restores both", async () => {
  await menu("View", "Symmetry Options");
  await page.click('button[aria-label="Toggle Horizontal Symmetry"]');
  await page.click('[role=option][data-palette-index="1"]');
  await page.fill('input[aria-label="Zoom"]', "800");
  await page.press('input[aria-label="Zoom"]', "Enter");
  await focus();
  await page.keyboard.press("Shift+z");
  await page.keyboard.press("b");
  const point = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
      r = c.getBoundingClientRect(),
      w = Number(c.dataset.uiWidth) / 2,
      h = Number(c.dataset.uiHeight) / 2;
    return {
      x: r.x + ((Math.trunc(w / 2) - 64 + 12) * r.width) / w,
      y: r.y + ((Math.trunc(h / 2) - 64 + 12) * r.height) / h,
    };
  });
  await page.mouse.move(1, 1);
  await settle();
  const before = await hash(main);
  await page.mouse.click(point.x, point.y);
  await page.mouse.move(1, 1);
  await settle();
  const pixels = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
      w = Number(c.dataset.uiWidth) / 2,
      h = Number(c.dataset.uiHeight) / 2,
      ctx = c.getContext("2d");
    return [1, 14].map((x) =>
      Array.from(
        ctx.getImageData(
          Math.floor(((Math.trunc(w / 2) - 64 + (x + 0.5) * 8) * c.width) / w),
          Math.floor(((Math.trunc(h / 2) - 64 + 12) * c.height) / h),
          1,
          1,
        ).data,
      ),
    );
  });
  assert(
    pixels.every((p) => p[0] === 230 && p[1] === 70 && p[2] === 50),
    "Missing mirrored paint " + JSON.stringify(pixels),
  );
  await focus();
  await page.keyboard.press("ControlOrMeta+z");
  await page.mouse.move(1, 1);
  await settle();
  assert((await hash(main)) === before, "Symmetry required more than one Undo");
  return { pixels };
});
await check("Tiled drawing wraps the adjacent tile and undoes as one stroke", async () => {
  await menu("View", "Symmetry Options");
  await menu("View", "Tiled Mode", "Tiled in Both Axes");
  await page.mouse.move(1, 1);
  await settle();
  const before = await hash(main);
  const point = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
      r = c.getBoundingClientRect(),
      w = Number(c.dataset.uiWidth) / 2,
      h = Number(c.dataset.uiHeight) / 2;
    return {
      x: r.x + ((Math.trunc(w / 2) - 64 + 17.5 * 8) * r.width) / w,
      y: r.y + ((Math.trunc(h / 2) - 64 + 12) * r.height) / h,
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.mouse.move(1, 1);
  await settle();
  const pixels = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
      w = Number(c.dataset.uiWidth) / 2,
      h = Number(c.dataset.uiHeight) / 2;
    return [1, 17].map((x) =>
      Array.from(
        c
          .getContext("2d")
          .getImageData(
            Math.floor(((Math.trunc(w / 2) - 64 + (x + 0.5) * 8) * c.width) / w),
            Math.floor(((Math.trunc(h / 2) - 64 + 12) * c.height) / h),
            1,
            1,
          ).data,
      ),
    );
  });
  assert(
    pixels.every((p) => p[0] === 230 && p[1] === 70 && p[2] === 50),
    "Wrapped pixels do not match " + JSON.stringify(pixels),
  );
  await focus();
  await page.keyboard.press("ControlOrMeta+z");
  await page.mouse.move(1, 1);
  await settle();
  assert((await hash(main)) === before, "Tile stroke not atomic");
  return { pixels };
});
await check("Shading Ink consumes the actual palette ramp in the canvas", async () => {
  await menu("View", "Tiled Mode", "None");
  await page.click('[role=option][data-palette-index="1"]');
  await page.keyboard.down("Shift");
  await page.click('[role=option][data-palette-index="2"]');
  await page.keyboard.up("Shift");
  await page.click('button[aria-label="Ink"]');
  await page.click('[role^="menuitem"][aria-label="Shading"]');
  await page.mouse.move(1, 1);
  await settle();
  const before = await hash(main);
  const point = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
      r = c.getBoundingClientRect(),
      w = Number(c.dataset.uiWidth) / 2,
      h = Number(c.dataset.uiHeight) / 2;
    return {
      x: r.x + ((Math.trunc(w / 2) - 64 + 6.5 * 8) * r.width) / w,
      y: r.y + ((Math.trunc(h / 2) - 64 + 6.5 * 8) * r.height) / h,
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.mouse.move(1, 1);
  await settle();
  const pixel = await page.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
      w = Number(c.dataset.uiWidth) / 2,
      h = Number(c.dataset.uiHeight) / 2;
    return Array.from(
      c
        .getContext("2d")
        .getImageData(
          Math.floor(((Math.trunc(w / 2) - 64 + 6.5 * 8) * c.width) / w),
          Math.floor(((Math.trunc(h / 2) - 64 + 6.5 * 8) * c.height) / h),
          1,
          1,
        ).data,
    );
  });
  assert(
    pixel[0] === 230 && pixel[1] === 70 && pixel[2] === 50,
    "Shading did not step blue to red " + JSON.stringify(pixel),
  );
  await focus();
  await page.keyboard.press("ControlOrMeta+z");
  await page.mouse.move(1, 1);
  await settle();
  assert((await hash(main)) === before, "Shading Undo failed");
  return { pixel };
});
report.passed = report.checks.every((x) => x.passed);
report.finishedAt = new Date().toISOString();
await fs.writeFile(c.output, JSON.stringify(report, null, 2));
