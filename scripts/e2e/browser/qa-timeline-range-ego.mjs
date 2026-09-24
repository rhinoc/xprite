const task = await taskSpace(12),
  p = task.page("p1"),
  fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
const report = [];
const check = (name, passed, data) => {
  console.log(name, passed);
  report.push({ name, passed: !!passed, data });
  if (!passed) throw Error(name + ": " + JSON.stringify(data));
};
const rect = (s) =>
  p.evaluate((s) => document.querySelector(s).getBoundingClientRect().toJSON(), s);
const cel = (f, l = 0) =>
  `button[data-timeline-kind="cels"][data-frame="${f - 1}"][data-layer="${l}"]`;
const frame = (f) => `button[data-timeline-kind="frames"][data-frame="${f - 1}"]`;
const label = (s) => p.evaluate((s) => document.querySelector(s)?.getAttribute("aria-label"), s);
const drag = async (a, b) => {
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2);
  await p.mouse.up();
};
try {
  await p.reload();
  const xpriteTab = '[role=tab][aria-label="xprite.ase"]';
  if (!(await p.evaluate((selector) => !!document.querySelector(selector), xpriteTab))) {
    await p.setInputFiles("input[type=file]", [
      `${process.cwd()}/apps/editor/assets/examples/xprite/xprite.ase`,
    ]);
    await p.waitForSelector(xpriteTab);
  }
  await p.click(xpriteTab);
  await p.keyboard.press("Shift+n");
  await p.waitForSelector('[aria-label="Select layer Layer 1"]');
  await p.waitForSelector(cel(1));
  await p.click(cel(1));
  await drag(await rect(cel(1)), await rect(cel(2)));
  await p.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute("aria-label").endsWith("empty"),
    cel(1),
  );
  check("Cel move clears source", true);
  check("Cel move fills destination", (await label(cel(2))).endsWith("keyframe"));
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute("aria-label").endsWith("keyframe"),
    cel(1),
  );
  check("Cel move undo restores source", true);
  await p.click(cel(1));
  const a = await rect(cel(1)),
    b = await rect(cel(3));
  await p.mouse.move(a.x + 8, a.y + 8);
  await p.mouse.down();
  await p.mouse.move(b.x + 8, b.y + 8);
  await p.keyboard.press("Escape");
  await p.mouse.up();
  check("Cel drag Escape leaves source", (await label(cel(1))).endsWith("keyframe"));
  check(
    "Cancel leaves document saved",
    await p.evaluate(
      () =>
        !document
          .querySelector('[role=tab][aria-label="xprite.ase"]')
          .getAttribute("aria-description"),
    ),
  );
  await p.click(cel(1));
  await p.keyboard.down("Shift");
  await p.click(cel(3, 1));
  await p.keyboard.up("Shift");
  check(
    "Rectangular cel range 2 layers × 3 frames",
    await p.evaluate(
      () =>
        document.querySelectorAll('[data-timeline-kind="cels"][aria-pressed="true"]').length === 6,
    ),
  );
  await p.click(frame(1));
  await p.dblclick(frame(1));
  await p.waitForSelector('[role=dialog][aria-label="Frame Properties"]');
  await p.fill('input[aria-label="Duration (milliseconds)"]', "137");
  await p.click('[role=dialog] button[aria-label="OK"]');
  await p.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute("aria-label").includes("137"),
    frame(1),
  );
  await p.click(frame(1));
  await drag(await rect(frame(1)), await rect(frame(6)));
  await p.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute("aria-label").includes("137"),
    frame(6),
  );
  check("Frame drag reorders duration with content", true);
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute("aria-label").includes("137"),
    frame(1),
  );
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForFunction(
    (s) => document.querySelector(s)?.getAttribute("aria-label").includes("100"),
    frame(1),
  );
  check("Frame move and property edits independently undo", true);
  await p.click(frame(1));
  const count = await p.evaluate(
    () => document.querySelectorAll('[data-timeline-kind="frames"]').length,
  );
  await p.keyboard.down("ControlOrMeta");
  await drag(await rect(frame(1)), await rect(frame(4)));
  await p.keyboard.up("ControlOrMeta");
  await p.waitForFunction(
    (count) => document.querySelectorAll('[data-timeline-kind="frames"]').length === count + 1,
    count,
  );
  check("Ctrl/Cmd drag copies frame", true);
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForFunction(
    (count) => document.querySelectorAll('[data-timeline-kind="frames"]').length === count,
    count,
  );
  check("Frame copy undo", true);
  await p.click('[aria-label="Select layer Flattened"]');
  await drag(
    await rect('[aria-label="Select layer Flattened"]'),
    await rect('[aria-label="Select layer Layer 1"]'),
  );
  await p.waitForFunction(
    () =>
      document.querySelector('[data-timeline-kind="layers"]')?.getAttribute("aria-label") ===
      "Select layer Flattened",
  );
  check("Layer drag reorder", true);
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForFunction(
    () =>
      document.querySelector('[data-timeline-kind="layers"]')?.getAttribute("aria-label") ===
      "Select layer Layer 1",
  );
  check("Layer reorder undo", true);
  const c = await rect(cel(1));
  await p.mouse.click(c.x + 8, c.y + 8, { button: "right" });
  await p.waitForSelector('[role=menuitem][aria-label="Clear"]');
  check("Cel context menu", true);
  await p.keyboard.press("Escape");
  console.log(report);
} finally {
  await fs.writeFile(
    `${process.cwd()}/.tmp/qa-timeline-range.json`,
    JSON.stringify(report, null, 2),
  );
}
