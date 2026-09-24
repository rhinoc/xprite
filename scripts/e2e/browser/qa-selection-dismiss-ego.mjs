// Run: ego-browser nodejs scripts/e2e/browser/qa-selection-dismiss-ego.mjs (set task ID via env).
const task = await taskSpace(Number(process.env.EGO_TASK_ID || 28)),
  p = task.page("p1");
if (task.ownership !== "agent") throw Error("Resume only the audit agent-owned task space");
const results = [];
const key = async (k) => {
  await p.focus('canvas[aria-label="Sprite canvas"]');
  await p.keyboard.press(k);
};
const drag = async (a, b) => {
  await p.mouse.move(...a);
  await p.mouse.down();
  await p.mouse.move(...b);
  await p.mouse.up();
};
const selected = async () => {
  await p.click('button[aria-label="Select"]');
  const value = await p.evaluate(
    () => !document.querySelector('[role="menu"] button[aria-label="Deselect"]').disabled,
  );
  await p.keyboard.press("Escape");
  return value;
};
const check = async (name, want) => {
  const actual = await selected();
  if (actual !== want) throw Error(`${name}: selection=${actual}`);
  if (!want) {
    await p.waitForFunction(
      () =>
        document.querySelector('canvas[aria-label="Sprite canvas"]')?.dataset.uiSelectionPhase ===
        undefined,
      undefined,
      { timeout: 2000 },
    );
  }
  results.push(name);
};
await p.goto(process.env.EDITOR_URL || "http://127.0.0.1:5173/");
await p.waitForSelector('canvas[aria-label="Sprite canvas"]', { state: "visible" });
await key("m");
await key("ControlOrMeta+a");
await key("Escape");
await check("Esc clears an idle selection", false);
const r = await p.evaluate(() =>
  document.querySelector('canvas[aria-label="Sprite canvas"]').getBoundingClientRect().toJSON(),
);
const a = [r.x + r.width * 0.3, r.y + r.height * 0.3],
  b = [r.x + r.width * 0.45, r.y + r.height * 0.65],
  outside = [r.x + r.width * 0.65, r.y + r.height * 0.5],
  center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
await drag(a, b);
await check("Drag creates a selection", true);
await p.mouse.click(...outside);
await check("Outside click clears Replace selection", false);
await key("ControlOrMeta+Shift+d");
await check("Outside click clears Xprite's hidden mask too", false);
await key("Escape");
await drag(a, b);
await drag(center, [center[0] + 15, center[1]]);
await key("Escape");
await check("Esc commits transform and clears selection in one press", false);
await drag(a, b);
await drag(center, [center[0] + 15, center[1]]);
await p.mouse.click(...outside);
await check("Outside click commits transform and clears selection in one click", false);
await drag(a, b);
await p.mouse.move(...outside);
await p.mouse.down();
await p.mouse.move(outside[0] - 20, outside[1] + 10);
await p.keyboard.press("Escape");
await p.mouse.up();
await check("Esc during replacement drag restores previous mask", true);
await key("Escape");
await p.click('button[aria-label="Add selection"]');
await p.mouse.click(...outside);
await check("Add mode retains single-click selection", true);
await p.click('button[aria-label="Replace selection"]');
await key("Escape");
await key("w");
await p.mouse.click(...outside);
await check("Magic wand retains single-click selection", true);
await key("Escape");
await key("m");
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(
  `${process.cwd()}/.tmp/qa-selection-dismiss.json`,
  JSON.stringify(
    { capturedAt: new Date().toISOString(), url: await p.url(), results, passed: true },
    null,
    2,
  ),
);
console.log(results);
