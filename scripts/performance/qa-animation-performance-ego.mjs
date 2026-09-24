// Existing Ego task space 2 / p1 only; observes the real frame UI at DPR 1 and 2.
const task = await taskSpace(2);
if (task.ownership !== "agent") throw Error("Space 2 is not agent-owned");
const page = task.page("p1");
const fs = await import("node:fs/promises"),
  reports = [];
for (const dpr of [1, 2]) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1405,
    height: 768,
    deviceScaleFactor: dpr,
    mobile: false,
  });
  await page.goto("http://127.0.0.1:4173/editor", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  const xpriteTab = '[role="tab"][aria-label="xprite.ase"]';
  if (!(await page.evaluate((selector) => !!document.querySelector(selector), xpriteTab))) {
    await page.setInputFiles('input[type="file"]', [
      `${process.cwd()}/apps/editor/assets/examples/xprite/xprite.ase`,
    ]);
    await page.waitForSelector(xpriteTab, { state: "visible" });
  }
  await page.fill('input[aria-label="Current frame"]', "2");
  await page.press('input[aria-label="Current frame"]', "Enter");
  await page.focus('canvas[aria-label="Sprite canvas"]');
  await page.keyboard.press("Enter");
  const report = await page.evaluate(async () => {
    const longTasks = [],
      changes = [],
      start = performance.now();
    let previous = -1;
    const observer = new PerformanceObserver((list) =>
      longTasks.push(
        ...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    );
    observer.observe({ type: "longtask" });
    await new Promise((resolve) => {
      function sample() {
        const now = performance.now(),
          frame = Number(document.querySelector('input[aria-label="Current frame"]').value);
        if (frame !== previous) {
          changes.push({ frame, elapsed: now - start });
          previous = frame;
        }
        if (now - start >= 3000) resolve();
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    observer.disconnect();
    return { dpr: devicePixelRatio, elapsed: performance.now() - start, changes, longTasks };
  });
  await page.keyboard.press("Escape");
  const intervals = report.changes
    .slice(2)
    .map((v, i) => v.elapsed - report.changes[i + 1].elapsed)
    .sort((a, b) => a - b);
  if (report.changes.length < 20 || !report.changes.every((v) => v.frame >= 1 && v.frame <= 10))
    throw Error("Tag playback did not advance correctly");
  reports.push({
    ...report,
    medianIntervalMs: intervals[Math.floor(intervals.length / 2)],
    p95IntervalMs:
      intervals[Math.min(intervals.length - 1, Math.ceil(intervals.length * 0.95) - 1)],
  });
}
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(
  `${process.cwd()}/.tmp/browser-animation-performance.json`,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      method:
        "Visible current-frame changes sampled on RAF over 3 seconds; source frames are 100 ms. Scheduling observation, not compositor timing.",
      reports,
    },
    null,
    2,
  ),
);
console.log(reports);
