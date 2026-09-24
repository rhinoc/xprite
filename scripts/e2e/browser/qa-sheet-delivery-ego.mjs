// Ego payload only: root runs this in its EXISTING owned space/page.
// Prepend const qaConfig={space,page,root,url?,output?,fixture?,screenshotPrefix?}.
// This script never creates a task space, closes unrelated tabs, touches app
// internals, or performs synthetic editor events. Canvas reads are observations.
const c = qaConfig,
  task = await taskSpace(c.space),
  page = task.page(c.page);
if (task.ownership !== "agent") throw Error("Sheet QA requires the existing agent-owned space");
const fs = await import("node:fs/promises"),
  crypto = await import("node:crypto");
const root = c.root ?? process.cwd();
const output = c.output ?? `${root}/.tmp/features-7-12/qa-sheet-delivery.json`;
const report = {
  startedAt: new Date().toISOString(),
  space: task.spaceId,
  page: page.label,
  method:
    "Public menus, entries, pointer ruler drag, undo/redo; DOM and canvas pixel observations only",
  checks: [],
  passed: false,
};
const assert = (condition, message) => {
  if (!condition) throw Error(message);
};
const main = 'canvas[aria-label="Sprite canvas"]';
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
const observe = async (label) => {
  console.log("SHEET_QA_STATE", label);
  console.log(await page.snapshot());
};
const menu = async (...labels) => {
  for (const label of labels)
    await page.click(`[role^="menuitem"][aria-label=${JSON.stringify(label)}]`);
};
const canvasHash = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas[aria-label="Sprite canvas"]');
    if (!canvas) throw Error("Sprite canvas missing");
    let hash = 2166136261;
    for (const byte of canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data)
      hash = Math.imul(hash ^ byte, 16777619);
    return hash >>> 0;
  });
const state = () =>
  page.evaluate(() => ({
    timeline: document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description"),
    tabs: [...document.querySelectorAll('.xse-document-tab[role="tab"]')].map((n) => ({
      name: n.getAttribute("aria-label"),
      selected: n.getAttribute("aria-selected"),
      dirty: n.getAttribute("aria-description"),
    })),
    frame: document.querySelector('input[aria-label="Current frame"]')?.value,
  }));
const waitHash = async (before, different) =>
  page.waitForFunction(
    ({ before, different }) => {
      const canvas = document.querySelector('canvas[aria-label="Sprite canvas"]');
      if (!canvas) return false;
      let h = 2166136261;
      for (const b of canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data)
        h = Math.imul(h ^ b, 16777619);
      return different ? h >>> 0 !== before : h >>> 0 === before;
    },
    { before, different },
    { timeout: 10000 },
  );
const check = async (name, run) => {
  try {
    const detail = await run();
    report.checks.push({ name, passed: true, detail });
    console.log("SHEET_QA_PASS", name);
  } catch (error) {
    report.checks.push({ name, passed: false, error: String(error) });
    throw error;
  } finally {
    await fs.writeFile(output, JSON.stringify(report, null, 2));
  }
};
const shot = async (label) => {
  if (c.screenshotPrefix) await page.screenshot({ path: `${c.screenshotPrefix}-${label}.png` });
};
let failure;
try {
  if (c.url) await page.goto(c.url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  await observe("before task-owned fixture import");
  assert(
    await page.evaluate(() => !document.querySelector('[role="dialog"]')),
    "Close the existing modal through the root workflow before starting this QA",
  );
  const fixture = c.fixture ?? `${root}/.tmp/features-7-12/animation-fixture.aseprite`,
    bytes = await fs.readFile(fixture);
  const owned = `${root}/.tmp/features-7-12/sheet-delivery-fixture.aseprite`;
  await fs.mkdir(`${root}/.tmp/features-7-12`, { recursive: true });
  await fs.writeFile(owned, bytes);
  report.fixture = {
    source: fixture,
    path: owned,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
  await page.setInputFiles('input[type="file"]', [owned]);
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
      "1 layers, 3 frames",
  );
  await page.fill('input[aria-label="Zoom"]', "800");
  await page.press('input[aria-label="Zoom"]', "Enter");
  await page.mouse.move(1, 1);
  await settle();
  const before = await state(),
    originalHash = await canvasHash();
  report.original = { ...before, canvasHash: originalHash };
  await observe("fixture loaded");
  await check("Sheet Preview changes canvas; Cancel restores the exact source", async () => {
    await menu("File", "Export", "Export Sprite Sheet");
    await page.waitForSelector('[role="dialog"][aria-label="Export Sprite Sheet"]');
    await page.mouse.move(1, 1);
    await waitHash(originalHash, true);
    const horizontal = await canvasHash();
    await page.click('[role="dialog"] [role="combobox"][aria-label="Sheet Type:"]');
    await page.waitForSelector('[role="option"][aria-label="Vertical Strip"]');
    await page.click('[role="option"][aria-label="Vertical Strip"]');
    await page.mouse.move(1, 1);
    await waitHash(horizontal, true);
    const vertical = await canvasHash();
    await shot("preview-vertical");
    await page.click(
      '[role="dialog"][aria-label="Export Sprite Sheet"] button[aria-label="Cancel"]',
    );
    await page.waitForSelector('[role="dialog"][aria-label="Export Sprite Sheet"]', {
      state: "detached",
    });
    await page.mouse.move(1, 1);
    await waitHash(originalHash, false);
    const after = await state();
    assert(
      JSON.stringify(after) === JSON.stringify(before),
      "Preview changed source timeline, tabs, active frame or dirty state",
    );
    return {
      sourceHash: originalHash,
      horizontalPreviewHash: horizontal,
      verticalPreviewHash: vertical,
      restored: after,
    };
  });
  await check("Import rulers update draft geometry without editing the source", async () => {
    await menu("File", "Import", "Import Sprite Sheet");
    await page.waitForSelector('[aria-label="Import sprite sheet rulers"]');
    await observe("import rulers and form");
    // Move the Xprite floating window out of the fixture's canvas projection.
    const title = await page.evaluate(() => {
      const r = document
        .querySelector(
          '[role="dialog"][aria-label="Import Sprite Sheet"] [data-window-handle="move"]',
        )
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(title.x, title.y);
    await page.mouse.down();
    await page.mouse.move(160, 105);
    await page.mouse.up();
    await settle();
    // Locate the ACTUALLY rendered blue rules. Deriving a position from the
    // underlying editor canvas assumes zero pan and identical CSS/backing grids;
    // a subpixel error at8x can miss the narrow rule and move the whole box.
    const drag = await page.evaluate(() => {
      const host = document.querySelector('[aria-label="Import sprite sheet rulers"]'),
        canvas = host?.querySelector("canvas");
      if (!canvas) throw Error("Rendered import overlay canvas missing");
      const r = canvas.getBoundingClientRect(),
        w = canvas.width,
        h = canvas.height,
        pixels = canvas.getContext("2d").getImageData(0, 0, w, h).data,
        columns = new Uint32Array(w),
        rows = new Uint32Array(h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] > 200 && pixels[i + 3] > 200) {
            columns[x]++;
            rows[y]++;
          }
        }
      const groups = (counts, minimum) => {
        const out = [];
        let start = -1;
        for (let i = 0; i <= counts.length; i++) {
          if (i < counts.length && counts[i] > minimum) {
            if (start < 0) start = i;
          } else if (start >= 0) {
            out.push({ start, end: i, center: (start + i) / 2 });
            start = -1;
          }
        }
        return out;
      };
      const vertical = groups(columns, h * 0.5),
        horizontal = groups(rows, w * 0.5);
      if (vertical.length < 2 || horizontal.length < 2)
        throw Error("Need two visible rendered X/Y rulers before edge-drag QA");
      const first = vertical[0],
        second = vertical[1],
        top = horizontal[0],
        bottom = horizontal[1],
        width = Number(document.querySelector('[role="dialog"] input[aria-label="Width:"]').value);
      const x = r.x + (first.center * r.width) / w,
        y = r.y + ((top.center + (bottom.center - top.center) / 4) * r.height) / h;
      return {
        x,
        y,
        dx: (4 * (second.center - first.center) * r.width) / w / width,
        candidates: [
          x,
          r.x + ((first.start + 0.25) * r.width) / w,
          r.x + ((first.end - 0.25) * r.width) / w,
        ],
        vertical: vertical.map((g) => ({ start: g.start, end: g.end })),
        overlay: { width: w, height: h, css: r.toJSON() },
        hit: !!document
          .elementFromPoint(x, y)
          ?.closest('[aria-label="Import sprite sheet rulers"]'),
      };
    });
    assert(
      drag.hit,
      "The measured blue ruler is occluded; inspect current modal position instead of guessing coordinates",
    );
    let hover;
    for (const x of drag.candidates) {
      await page.mouse.move(x, drag.y);
      await settle();
      hover = await page.evaluate(
        () => document.querySelector('[aria-label="Import sprite sheet rulers"]').style.cursor,
      );
      if (hover === "ew-resize") {
        drag.x = x;
        break;
      }
    }
    assert(
      hover === "ew-resize",
      `Measured first X ruler must show ew-resize before dragging (got ${hover}; ${JSON.stringify(drag)})`,
    );
    await page.mouse.down();
    await page.mouse.move(drag.x + drag.dx, drag.y);
    await page.mouse.up();
    await settle();
    const draft = await page.evaluate(() =>
      Object.fromEntries(
        [
          ...document.querySelectorAll('[role="dialog"][aria-label="Import Sprite Sheet"] input'),
        ].map((n) => [n.getAttribute("aria-label"), Number(n.value)]),
      ),
    );
    assert(draft["X:"] > 0 && draft["X:"] < 16, "Dragging the first vertical ruler did not move X");
    assert(draft["Width:"] === 16 - draft["X:"], "First-ruler drag must retain the opposite edge");
    assert(
      (await canvasHash()) === originalHash,
      "Ruler draft changed underlying source pixels before Import",
    );
    await shot("ruler-draft");
    return { drag, draft };
  });
  let importedHash;
  await check(
    "Import 8×8 tiles produces four frames; Undo and Redo restore complete state",
    async () => {
      for (const [label, value] of [
        ["X:", "0"],
        ["Y:", "0"],
        ["Width:", "8"],
        ["Height:", "8"],
      ]) {
        const input = `[role="dialog"][aria-label="Import Sprite Sheet"] input[aria-label=${JSON.stringify(label)}]`;
        await page.fill(input, value);
        await page.press(input, "Tab");
      }
      const counts = await page.evaluate(() => ({
        columns: document.querySelector('[role="dialog"] input[aria-label="Columns:"]').value,
        rows: document.querySelector('[role="dialog"] input[aria-label="Rows:"]').value,
      }));
      assert(
        counts.columns === "2" && counts.rows === "2",
        "Tile settings did not calculate the Aseprite complete spans",
      );
      await page.click(
        '[role="dialog"][aria-label="Import Sprite Sheet"] button[aria-label="Import"]',
      );
      await page.waitForSelector('[role="dialog"]', { state: "detached" });
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
          "1 layers, 4 frames",
      );
      await page.mouse.move(1, 1);
      await settle();
      importedHash = await canvasHash();
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="tab"][aria-selected="true"]')
            ?.getAttribute("aria-description") !== "Unsaved changes",
      );
      const after = await state();
      await shot("imported");
      await page.focus(main);
      await page.keyboard.press("ControlOrMeta+z");
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
          "1 layers, 3 frames",
      );
      await page.mouse.move(1, 1);
      await waitHash(originalHash, false);
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="tab"][aria-selected="true"]')
            ?.getAttribute("aria-description") !== "Unsaved changes",
      );
      const restored = await state();
      assert(
        JSON.stringify(restored) === JSON.stringify(before),
        "One Undo did not restore original layers/frames/active tab/state",
      );
      await page.focus(main);
      await page.keyboard.press("ControlOrMeta+Shift+z");
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
          "1 layers, 4 frames",
      );
      await page.mouse.move(1, 1);
      await waitHash(importedHash, false);
      // Leave the task-owned fixture clean for later root capture work.
      await page.focus(main);
      await page.keyboard.press("ControlOrMeta+z");
      await page.mouse.move(1, 1);
      await waitHash(originalHash, false);
      return {
        counts,
        imported: after,
        importedHash,
        undoRestored: restored,
        redoMatched: true,
        finalClean: true,
      };
    },
  );
  report.passed = true;
} catch (error) {
  failure = error;
  report.error = String(error);
  await observe("failure");
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log("SHEET_QA_REPORT", JSON.stringify(report));
}
if (failure) throw failure;
console.log(await page.snapshot());
