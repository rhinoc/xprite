const task = await taskSpace(27);
if (task.ownership !== "agent") throw Error("Resume only the audit agent-owned task space");
const p = task.page("p1");
const results = [];
await p.dblclick('button[aria-label="Layer 1, frame 1 keyframe"]');
results.push({
  interaction: "cel double click",
  dialog: await p.evaluate(() => !!document.querySelector('[role="dialog"]')),
});
const geom = await p.evaluate(() => ({
  group: document
    .querySelector('[aria-label="Document tabs and workspace controls"]')
    .getBoundingClientRect()
    .toJSON(),
  tabs: [...document.querySelectorAll('[role="tab"]')].map((e) =>
    e.getBoundingClientRect().toJSON(),
  ),
  canvas: document
    .querySelector('canvas[aria-label="Sprite canvas"]')
    .getBoundingClientRect()
    .toJSON(),
}));
const last = geom.tabs.at(-1),
  x = last.right + 40,
  y = last.y + last.height / 2;
await p.mouse.click(x, y, { clickCount: 2 });
results.push({
  interaction: "empty tab strip double click",
  dialog: await p.evaluate(() => !!document.querySelector('[role="dialog"]')),
  at: [x, y],
});
await p.focus('canvas[aria-label="Sprite canvas"]');
await p.keyboard.press("m");
await p.keyboard.press("Escape");
const r = geom.canvas;
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
await p.keyboard.press("Escape");
await p.mouse.up();
results.push({ interaction: "selection drag beyond viewport bottom", before, after });
const controls = await p.evaluate(() =>
  ["Timeline configuration", "Onion skin"].map((label) => ({
    label,
    disabled: [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === label,
    ).disabled,
  })),
);
results.push({ interaction: "explicitly unavailable controls", controls });
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(
  `${process.cwd()}/.tmp/interaction-audit-2026-09-23.json`,
  JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2),
);
console.log(results);
