/** Called by the parent agent inside its existing Ego task space. Never creates
 * another browser/task. Prepare an empty sprite, select contrasting opaque FG/BG,
 * and supply visible screen coordinates inside it (at least 8 sprite pixels apart).
 *
 * const {qaShapeCanvas}=await import('/absolute/repo/scripts/e2e/browser/qa-shape-canvas-ego.mjs');
 * console.log(await qaShapeCanvas(page,{start:{x,y},end:{x,y},control1:{x,y},control2:{x,y}}));
 */
export async function qaShapeCanvas(page, { start, end, control1, control2 }) {
  const report = [];
  const check = (name, passed) => {
    report.push({ name, passed: !!passed });
    if (!passed) throw new Error(name);
  };
  const settled = () =>
    page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  const bounds = await page.evaluate(() =>
    document.querySelector('canvas[aria-label="Sprite canvas"]').getBoundingClientRect().toJSON(),
  );
  const leave = async () => {
    await page.mouse.move(Math.max(0, bounds.x - 4), bounds.y + 4);
    await settled();
  };
  const pixels = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('canvas[aria-label="Sprite canvas"]');
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (const value of data) {
        hash ^= value;
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    });
  const group = {
    Line: 7,
    Curve: 7,
    Rectangle: 8,
    "Filled Rectangle": 8,
    Ellipse: 8,
    "Filled Ellipse": 8,
    Polygon: 9,
    Gradient: 6,
  };
  const select = async (label) => {
    const trigger = `[role="toolbar"][aria-label="Tools"] button[data-group-index="${group[label]}"]:not([role="menuitemradio"])`;
    await page.focus(trigger);
    await page.keyboard.press("ArrowLeft");
    await page.waitForSelector(`[role="menuitemradio"][aria-label="${label}"]`);
    await page.click(`[role="menuitemradio"][aria-label="${label}"]`);
    await page.keyboard.press("Escape");
    await leave();
  };
  const undo = async (expected) => {
    await page.keyboard.press("ControlOrMeta+z");
    await settled();
    check("Single undo restores complete stroke", (await pixels()) === expected);
  };
  for (const label of ["Filled Rectangle", "Ellipse", "Filled Ellipse", "Gradient"]) {
    await select(label);
    const before = await pixels();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await settled();
    check(`${label}: pointer movement paints visible preview`, (await pixels()) !== before);
    await page.mouse.up();
    await leave();
    check(`${label}: release commits pixels`, (await pixels()) !== before);
    await undo(before);
  }
  await select("Curve");
  let before = await pixels();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await page.mouse.move(control1.x, control1.y);
  await settled();
  const firstControl = await pixels();
  await page.mouse.click(control1.x, control1.y);
  await page.mouse.move(control2.x, control2.y);
  await settled();
  check(
    "Curve: mouse hover after release updates second control preview",
    (await pixels()) !== firstControl,
  );
  await page.mouse.click(control2.x, control2.y);
  await leave();
  check("Curve: third click commits", (await pixels()) !== before);
  await undo(before);
  await select("Polygon");
  before = await pixels();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, start.y);
  await page.mouse.up();
  await page.mouse.move(end.x, end.y);
  await settled();
  check("Polygon: between-click hover extends outline", (await pixels()) !== before);
  await page.mouse.move(end.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await page.mouse.click(end.x, end.y);
  await leave();
  check(
    "Polygon: no-drag click closes and fills three anchored vertices",
    (await pixels()) !== before,
  );
  await undo(before);
  await select("Curve");
  before = await pixels();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await page.mouse.move(control1.x, control1.y);
  await page.keyboard.press("Escape");
  await leave();
  check("Curve: Escape between clicks discards whole preview", (await pixels()) === before);
  return report;
}
