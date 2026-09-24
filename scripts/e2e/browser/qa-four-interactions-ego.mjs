const task = await taskSpace(28);
if (task.ownership !== "agent") throw Error("Use agent-owned audit space");
const p = task.page("p1"),
  results = [];
const check = async (name, fn) => {
  if (!(await p.evaluate(fn))) throw Error(name);
  results.push(name);
};
const key = async (value) => {
  await p.focus('canvas[aria-label="Sprite canvas"]');
  await p.keyboard.press(value);
};
if (
  !(await p.evaluate(
    () => !!document.querySelector('[role="dialog"][aria-label="Cel Properties"]'),
  ))
)
  await p.dblclick('button[aria-label="Layer 1, frame 1 keyframe"]');
await check(
  "Cel double click opens nonmodal properties",
  () =>
    document
      .querySelector('[role="dialog"][aria-label="Cel Properties"]')
      .getAttribute("aria-modal") === "false",
);
await p.fill('input[aria-label="Cel Z-Index"]', "7");
await p.keyboard.press("Escape");
await check(
  "Esc applies and closes Cel Properties",
  () => !document.querySelector('[role="dialog"][aria-label="Cel Properties"]'),
);
await p.dblclick('button[aria-label="Layer 1, frame 1 keyframe"]');
await check(
  "Reopening retains cel Z-index",
  () => document.querySelector('input[aria-label="Cel Z-Index"]').value === "7",
);
await p.keyboard.press("Escape");
await key("ControlOrMeta+z");
await p.dblclick('button[aria-label="Layer 1, frame 1 keyframe"]');
await check(
  "Cel property undo restores old value",
  () => document.querySelector('input[aria-label="Cel Z-Index"]').value === "0",
);
await p.focus('[aria-label="Cel opacity"]');
await p.keyboard.press("Home");
await p.keyboard.press("Escape");
await p.dblclick('button[aria-label="Layer 1, frame 1 keyframe"]');
await check(
  "Cel opacity commits through keyboard",
  () => document.querySelector('[aria-label="Cel opacity"]').getAttribute("aria-valuenow") === "0",
);
await p.keyboard.press("Escape");
await key("ControlOrMeta+z");
const tabRect = await p.evaluate(() => {
  const r = [...document.querySelectorAll('[role="tab"]')].at(-1).getBoundingClientRect();
  return { x: r.right + 40, y: r.top + r.height / 2 };
});
await p.mouse.click(tabRect.x, tabRect.y, { clickCount: 2 });
await p.waitForSelector('[role="dialog"][aria-label="New Sprite"]', { state: "visible" });
await check(
  "Empty tab strip double click opens New Sprite",
  () => !!document.querySelector('[role="dialog"][aria-label="New Sprite"]'),
);
await p.keyboard.press("Escape");
await key("m");
await key("Escape");
const r = await p.evaluate(() =>
  document.querySelector('canvas[aria-label="Sprite canvas"]').getBoundingClientRect().toJSON(),
);
await p.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5);
await p.mouse.down();
const before = await p.evaluate(() =>
  document.querySelector('[aria-label="Vertical editor scroll"]').getAttribute("aria-valuenow"),
);
await p.mouse.move(r.x + r.width * 0.55, r.bottom + 10);
await p.mouse.move(r.x + r.width * 0.55, r.bottom + 30);
const after = await p.evaluate(() =>
  document.querySelector('[aria-label="Vertical editor scroll"]').getAttribute("aria-valuenow"),
);
if (after === before) throw Error("No edge scrolling");
results.push(`Selection auto scroll ${before} -> ${after}`);
await p.keyboard.press("Escape");
await p.mouse.up();
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(
  `${process.cwd()}/.tmp/qa-four-interactions.json`,
  JSON.stringify({ capturedAt: new Date().toISOString(), url: await p.url(), results }, null, 2),
);
console.log(results);
