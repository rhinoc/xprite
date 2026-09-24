// Run: ego-browser nodejs < scripts/e2e/browser/qa-interaction-parity-ego.mjs
// Resume the task-owned space; never claim a user space.
const task = await taskSpace(12),
  p = task.page("p1");
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
const report = [];
const check = (label, condition, data) => {
  console.log(label, condition);
  report.push({ label, passed: !!condition, data });
  if (!condition) throw new Error(label + ": " + JSON.stringify(data));
};
const rect = (selector) =>
  p.evaluate((s) => document.querySelector(s)?.getBoundingClientRect().toJSON(), selector);
const value = (selector) =>
  p.evaluate((s) => document.querySelector(s)?.getAttribute("aria-valuenow"), selector);
const labels = (selector) =>
  p.evaluate(
    (s) => [...document.querySelectorAll(s)].map((e) => e.getAttribute("aria-label")),
    selector,
  );
const drag = async (a, b, button = "left") => {
  await p.mouse.move(a.x, a.y);
  await p.mouse.down({ button });
  await p.mouse.move(b.x, b.y);
  await p.mouse.up({ button });
};
const frame = (n) => `button[data-timeline-kind="frames"][data-frame="${n - 1}"]`;
const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
try {
  await p.goto("http://127.0.0.1:5187/editor");
  await p.waitForSelector('[aria-label="Horizontal editor scroll"]');
  const xpriteTab = '[role="tab"][aria-label="xprite-second.ase"]';
  await fs.mkdir("/tmp/aseprite-project-qa", { recursive: true });
  await fs.copyFile(
    `${process.cwd()}/apps/editor/assets/examples/xprite/xprite.ase`,
    "/tmp/aseprite-project-qa/xprite-second.ase",
  );
  if (!(await p.evaluate((selector) => !!document.querySelector(selector), xpriteTab))) {
    await p.setInputFiles("input[type=file]", ["/tmp/aseprite-project-qa/xprite-second.ase"]);
    await p.waitForSelector(xpriteTab);
  }
  for (const axis of ["Horizontal", "Vertical"]) {
    const s = `[aria-label="${axis} editor scroll"]`,
      r = await rect(s),
      before = Number(await value(s));
    await p.mouse.click(
      axis === "Horizontal" ? r.right - 3 : r.x + r.width / 2,
      axis === "Horizontal" ? r.y + r.height / 2 : r.bottom - 3,
    );
    await p.waitForFunction(
      ({ s, before }) =>
        Number(document.querySelector(s)?.getAttribute("aria-valuenow")) !== before,
      { s, before },
    );
    const after = Number(await value(s));
    check(axis + " track paging", after > before, { before, after });
    await p.focus(s);
    await p.keyboard.press("Home");
    check(axis + " Home", Number(await value(s)) === 0);
    await p.keyboard.press("End");
    check(axis + " End", Number(await value(s)) > 0);
  }
  const tabs = '[role="tab"]';
  let from = await rect('[role="tab"][aria-label="xprite-second.ase"]'),
    to = await rect('[role="tab"][aria-label="xprite.ase"]');
  await drag({ x: from.x + 30, y: from.y + 7 }, { x: to.x + 25, y: to.y + 7 });
  await p.waitForFunction(
    () =>
      document.querySelectorAll('[role="tab"]')[1]?.getAttribute("aria-label") ===
      "xprite-second.ase",
  );
  check(
    "Document tab reorder",
    (await labels(tabs))[1] === "xprite-second.ase",
    await labels(tabs),
  );
  from = await rect('[role="tab"][aria-label="xprite-second.ase"]');
  to = await rect('[role="tab"][aria-label="xprite.ase"]');
  await p.mouse.move(from.x + 30, from.y + 7);
  await p.mouse.down();
  await p.mouse.move(to.x + 25, to.y + 7);
  await p.keyboard.press("Escape");
  await p.mouse.up();
  check("Tab drag Escape restores order", (await labels(tabs))[1] === "xprite-second.ase");
  await p.mouse.click(from.x + 30, from.y + 7, { button: "right" });
  await p.waitForSelector('[role="menu"][aria-label="Document tab menu"]');
  check("Document tab context menu", true);
  await p.keyboard.press("Escape");
  await p.click('[role="tab"][aria-label="xprite-second.ase"]');
  await p.waitForSelector(frame(5));
  await p.click(frame(1));
  await p.keyboard.down("Shift");
  await p.click(frame(5));
  await p.keyboard.up("Shift");
  await p.waitForFunction(
    () =>
      document.querySelectorAll('[data-timeline-kind="frames"][aria-pressed="true"]').length === 5,
  );
  check("Shift frame range selects 1–5", true);
  const f5 = await rect(frame(5));
  await p.mouse.click(f5.x + 5, f5.y + 5, { button: "right" });
  await p.waitForSelector('[role="menu"][aria-label="Timeline menu"]');
  await p.click('[role="menuitem"][aria-label="Frame Properties..."]');
  await p.waitForSelector('[role="dialog"][aria-label="Frame Properties"]');
  await p.fill('input[aria-label="Duration (milliseconds)"]', "137");
  await p.click('[role="dialog"] button[aria-label="OK"]');
  await p.waitForFunction(() =>
    document.querySelector('[data-frame="0"]')?.getAttribute("aria-label")?.includes("137"),
  );
  check(
    "Range properties apply all selected frames",
    (await labels('[data-timeline-kind="frames"]')).slice(0, 5).every((x) => x.includes("137")),
  );
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForFunction(() =>
    document.querySelector('[data-frame="0"]')?.getAttribute("aria-label")?.includes("100"),
  );
  check("Batch duration undo", true);
  await p.dblclick('button[aria-label="Select layer Flattened"]');
  await p.waitForSelector('[role="dialog"][aria-label="Layer Properties"]');
  check("Layer double-click preserved", true);
  await p.keyboard.press("Escape");
  const layer = await rect('button[aria-label="Select layer Flattened"]');
  await p.mouse.click(layer.x + 20, layer.y + 5, { button: "right" });
  await p.waitForSelector('[role="menuitem"][aria-label="Layer Properties..."]');
  check("Layer context menu", true);
  await p.keyboard.press("Escape");
  const sep = '[aria-label="Timeline layer column width"]',
    sr = await rect(sep);
  await drag(center(sr), { x: sr.x + 82, y: sr.y + sr.height / 2 });
  const resized = await rect(sep);
  check("Timeline column resize", resized.x > sr.x + 60, { before: sr.x, after: resized.x });
  await p.mouse.move(resized.x + 2, resized.y + 25);
  await p.mouse.down();
  await p.mouse.move(resized.x + 62, resized.y + 25);
  await p.keyboard.press("Escape");
  await p.mouse.up();
  check("Column resize Escape restores width", Math.abs((await rect(sep)).x - resized.x) < 2);
  await p.click('button[aria-label="Tag loading, frames 1 to 10"]');
  await p.waitForSelector('[role="dialog"][aria-label="Tag Properties"]');
  await p.fill('input[aria-label="Name:"]', "Idle QA");
  await p.click('[role="dialog"] button[aria-label="Cancel"]');
  await p.waitForSelector('button[aria-label="Tag loading, frames 1 to 10"]');
  check("Tag draft Cancel", true);
  await p.click('button[aria-label="Tag loading, frames 1 to 10"]');
  await p.waitForSelector('[role="dialog"][aria-label="Tag Properties"]');
  await p.fill('input[aria-label="Name:"]', "Idle QA");
  await p.click('[role="dialog"] button[aria-label="OK"]');
  await p.waitForSelector('button[aria-label="Tag Idle QA, frames 1 to 10"]');
  check("Tag properties commit", true);
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForSelector('button[aria-label="Tag loading, frames 1 to 10"]');
  check("Tag properties undo", true);
  const edge = await rect('[aria-label="Idle start frame"]');
  await drag(center(edge), { x: edge.x + edge.width / 2 + 18, y: edge.y + edge.height / 2 });
  await p.waitForSelector('button[aria-label="Tag loading, frames 2 to 10"]');
  check("Tag start edge drag", true);
  await p.keyboard.press("ControlOrMeta+z");
  await p.waitForSelector('button[aria-label="Tag loading, frames 1 to 10"]');
  await p.mouse.click(
    (await rect('button[aria-label="Tag loading, frames 1 to 10"]')).x + 8,
    edge.y - 10,
    { button: "right" },
  );
  await p.waitForSelector('[role="menuitem"][aria-label="Tag Properties..."]');
  check("Tag context menu", true);
  await p.keyboard.press("Escape");
  console.log(report);
} finally {
  await fs.writeFile(
    `${process.cwd()}/.tmp/qa-interaction-parity.json`,
    JSON.stringify(report, null, 2),
  );
}
