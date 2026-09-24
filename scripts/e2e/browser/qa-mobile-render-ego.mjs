const task = await taskSpace(29);
if (task.ownership !== "agent") throw Error("Use agent-owned audit space");
const p = task.page("p1"),
  results = [];
for (const [width, height, dpr] of [
  [393, 852, 3],
  [980, 1900, 3],
  [1900, 980, 2],
  [980, 1900, 1],
]) {
  await p.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: true,
  });
  await p.waitForFunction(
    ({ width, height, dpr }) => {
      const c = document.querySelector('canvas[aria-label="Sprite canvas"]');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return (
        innerWidth === width &&
        innerHeight === height &&
        devicePixelRatio === dpr &&
        r.height > height - 300 &&
        r.width > width - 170 &&
        c.width === Math.round(r.width * dpr) &&
        c.height === Math.round(r.height * dpr) &&
        c.getContext("2d").getImageData(8, 8, 1, 1).data[3] === 255
      );
    },
    { width, height, dpr },
  );
  const coverage = await p.evaluate(() => {
    const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
      d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let missing = 0;
    for (let y = 4; y < c.height - 4; y++)
      for (let x = 4; x < c.width - 4; x++) if (d[(y * c.width + x) * 4 + 3] !== 255) missing++;
    return { canvas: [c.width, c.height], missing };
  });
  if (coverage.missing) throw Error(JSON.stringify({ width, height, dpr, coverage }));
  results.push({ width, height, dpr, ...coverage });
}
await p.cdp("Emulation.setDeviceMetricsOverride", {
  width: 980,
  height: 1900,
  deviceScaleFactor: 2,
  mobile: true,
});
const fs = await import("node:fs/promises");
await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
await fs.writeFile(
  `${process.cwd()}/.tmp/qa-mobile-render-matrix.json`,
  JSON.stringify(results, null, 2),
);
console.log(results);
