// Run with ego-browser nodejs; set the authorized task id in the payload.
const task = await taskSpace(19),
  page = task.page("p1");
const cadence = await page.evaluate(async () => {
  const ts = [];
  await new Promise((resolve) => {
    function sample(t) {
      ts.push(t);
      if (ts.length === 4) resolve();
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  return ts.slice(1).map((t, i) => t - ts[i]);
});
const timingValid = cadence.every((ms) => ms < 100);
const report = {
  capturedAt: new Date().toISOString(),
  method:
    "Production UI, DPR2, sequential public input. Event-to-second-RAF includes scheduling; not compositor latency.",
  cadence,
  timingValid,
  scenarios: [],
};
for (const scenario of ["hover", "pencil", "pan", "zoom", "undo-redo", "animation"]) {
  if (scenario === "animation") {
    const xpriteTab = '[role="tab"][aria-label="xprite.ase"]';
    if (!(await page.evaluate((selector) => !!document.querySelector(selector), xpriteTab))) {
      await page.setInputFiles("input[type=file]", [
        `${process.cwd()}/apps/editor/assets/examples/xprite/xprite.ase`,
      ]);
      await page.waitForSelector(xpriteTab);
    }
    await page.click('loc=role:tab[name="xprite.ase"]');
    await page.focus('canvas[aria-label="Sprite canvas"]');
  } else {
    await page.focus('canvas[aria-label="Sprite canvas"]');
    if (scenario === "pencil") await page.keyboard.press("b");
    if (scenario === "pan") await page.keyboard.press("h");
  }
  await page.evaluate(() => {
    const samples = [],
      longTasks = [],
      counts = {};
    const original = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (...args) {
      const key =
        this.canvas.getAttribute("aria-label") ||
        this.canvas.parentElement?.className ||
        "offscreen";
      counts[key] = (counts[key] || 0) + 1;
      return original.apply(this, args);
    };
    const observe = () => {
      const start = performance.now();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => samples.push(performance.now() - start)),
      );
    };
    const canvas = document.querySelector('canvas[aria-label="Sprite canvas"]');
    canvas.addEventListener("pointermove", observe, { capture: true });
    canvas.addEventListener("wheel", observe, { capture: true });
    const observer = new PerformanceObserver((list) =>
      longTasks.push(
        ...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    );
    observer.observe({ type: "longtask" });
    window.__sweep = {
      samples,
      longTasks,
      counts,
      stop() {
        observer.disconnect();
        canvas.removeEventListener("pointermove", observe, { capture: true });
        canvas.removeEventListener("wheel", observe, { capture: true });
        CanvasRenderingContext2D.prototype.putImageData = original;
      },
    };
  });
  if (["hover", "pencil", "pan"].includes(scenario)) {
    await page.mouse.move(500, 260);
    if (scenario !== "hover") await page.mouse.down();
    for (let i = 0; i < 24; i++) await page.mouse.move(500 + i * 5, 260 + (i % 6) * 3);
    if (scenario !== "hover") await page.mouse.up();
  } else if (scenario === "zoom") {
    await page.mouse.move(700, 300);
    await page.keyboard.down("Control");
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, i < 4 ? -60 : 60);
    await page.keyboard.up("Control");
  } else if (scenario === "undo-redo") {
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("ControlOrMeta+z");
      await page.keyboard.press("ControlOrMeta+Shift+z");
    }
  } else {
    await page.keyboard.press("Enter");
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const start = performance.now();
          function tick() {
            if (performance.now() - start > 2000) resolve();
            else requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        }),
    );
    await page.keyboard.press("Escape");
  }
  const result = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const q = window.__sweep;
    q.stop();
    return { samples: q.samples, longTasks: q.longTasks, paints: q.counts };
  });
  const sorted = result.samples.toSorted((a, b) => a - b);
  report.scenarios.push({
    scenario,
    ...result,
    medianMs: !timingValid ? null : (sorted[Math.floor(sorted.length / 2)] ?? null),
    p95Ms: !timingValid
      ? null
      : (sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? null),
  });
}
console.log(report);
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(
  `${process.cwd()}/.tmp/interaction-browser-sweep.json`,
  JSON.stringify(report, null, 2),
);
