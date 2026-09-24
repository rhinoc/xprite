const task = await taskSpace(29);
if (task.ownership !== "agent") throw Error("Use agent-owned task");
const p = task.page("p1"),
  results = [];
await p.reload();
await p.waitForSelector('canvas[aria-label="Sprite canvas"]', { state: "visible" });
await p.click('button[aria-label="Rectangular Marquee"]');
await p.waitForSelector('button[aria-label="Replace selection"]', { state: "visible" });
await p.focus('canvas[aria-label="Sprite canvas"]');
await p.keyboard.press("Escape");
const r = await p.evaluate(() =>
  document.querySelector('canvas[aria-label="Sprite canvas"]').getBoundingClientRect().toJSON(),
);
const send = async (type, x, y, t) =>
  p.cdp("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }],
    timestamp: t,
  });
const select = async () => {
  const t = Date.now() / 1000;
  await send("touchStart", r.x + r.width * 0.4, r.y + r.height * 0.46, t);
  await send("touchMove", r.x + r.width * 0.5, r.y + r.height * 0.52, t + 0.08);
  await send("touchEnd", 0, 0, t + 0.12);
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
  results.push(name);
};
await select();
await check("Real touch drag creates selection", true);
const x = r.x + r.width * 0.7,
  y = r.y + r.height * 0.5;
for (const [distance, delay] of [
  [0.4, 0.45],
  [7, 0.45],
  [11, 1.2],
]) {
  const t = Date.now() / 1000;
  await send("touchStart", x, y, t);
  await send("touchMove", x + distance, y, t + delay);
  await send("touchEnd", 0, 0, t + delay + 0.02);
  await check(`Finger tap ${distance}px / ${delay}s clears selection`, false);
  await select();
}
await p.focus('canvas[aria-label="Sprite canvas"]');
await p.keyboard.press("Escape");
const coverage = await p.evaluate(() => {
  const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
    d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let missing = 0;
  for (let y = 4; y < c.height - 4; y++)
    for (let x = 4; x < c.width - 4; x++) if (d[(y * c.width + x) * 4 + 3] !== 255) missing++;
  return { width: c.width, height: c.height, missingInteriorPixels: missing };
});
if (coverage.missingInteriorPixels) throw Error(JSON.stringify(coverage));
results.push("Tall DPR2 canvas has no missing interior rows");
const data = await p.evaluate(() =>
  document.querySelector('canvas[aria-label="Sprite canvas"]').toDataURL(),
);
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(
  `${process.cwd()}/.tmp/mobile-portrait-canvas.png`,
  Buffer.from(data.split(",")[1], "base64"),
);
await fs.writeFile(
  `${process.cwd()}/.tmp/qa-mobile-dismiss.json`,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      method:
        "Chromium mobile emulation and CDP touchStart/touchMove/touchEnd, not physical phone hardware",
      results,
      coverage,
    },
    null,
    2,
  ),
);
console.log({ results, coverage });
