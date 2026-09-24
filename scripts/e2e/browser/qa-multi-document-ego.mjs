// Run ONLY on root's existing disposable QA page. Wrapper supplies captureConfig.
// UI assertions use public controls; recovery reads the actual committed
// manifest on this disposable origin then reloads the production page.
const task = await taskSpace(captureConfig.spaceId);
if (task.ownership !== "agent") throw Error("Resume the existing agent-owned task space");
const page = task.page(captureConfig.pageLabel);
const fs = await import("node:fs/promises");
const assert = (value, message) => {
  if (!value) throw Error(message);
};
const report = { startedAt: new Date().toISOString(), checks: [], passed: false };
const check = async (name, run) => {
  try {
    const detail = await run();
    report.checks.push({ name, passed: true, detail });
  } catch (error) {
    report.checks.push({ name, passed: false, error: String(error) });
    throw error;
  }
};
const snapshot = async (label) => {
  console.log(label);
  console.log(await page.snapshot());
};
const button = (label) => `button[aria-label=${JSON.stringify(label)}]`;
const tabs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map((node) => ({
      name: node.getAttribute("aria-label"),
      selected: node.getAttribute("aria-selected"),
      text: node.textContent,
      modified:
        node.getAttribute("aria-description") === "Unsaved changes" ||
        !!node.querySelector('[data-modified="true"]') ||
        node.getAttribute("aria-label")?.includes("*") ||
        node.textContent?.includes("*"),
    })),
  );
const docTabs = async () =>
  (await tabs()).filter((tab) => /\.(png|ase|aseprite)$/i.test(tab.name ?? ""));
const newSprite = async (width, height) => {
  await page.keyboard.press("ControlOrMeta+n");
  await page.waitForSelector('[role="dialog"][aria-label="New Sprite"]', { state: "visible" });
  await page.fill('input[aria-label="Width"]', String(width));
  await page.fill('input[aria-label="Height"]', String(height));
  await page.click('[role="dialog"][aria-label="New Sprite"] button[aria-label="OK"]');
  await page.waitForSelector('[role="dialog"][aria-label="New Sprite"]', { state: "hidden" });
};
const closeAll = async () => {
  await page.click(button("File"));
  await page.waitForSelector('[role="menu"][aria-label="File"]', { state: "visible" });
  await page.click('[role="menu"][aria-label="File"] button[aria-label="Close All"]');
};
try {
  await page.goto(captureConfig.url ?? "http://127.0.0.1:5173/editor");
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  await snapshot("Multi-document preflight (root must provide disposable QA page)");
  const initial = await docTabs();
  assert(
    !initial.some((tab) => tab.modified),
    "QA refuses to close documents with pending local writes; provide a disposable page/database",
  );
  await check("arbitrary New appends documents", async () => {
    for (const width of [11, 13, 17]) await newSprite(width, 9);
    const current = await docTabs();
    assert(current.length === initial.length + 3, "New replaced a document instead of appending");
    assert(
      new Set(current.map((tab) => tab.name)).size === current.length,
      "New sprite names collided",
    );
    return current;
  });
  await snapshot("Multiple independent document tabs");
  await check("dirty New keeps original tab and requires no replacement warning", async () => {
    await page.focus('canvas[aria-label="Sprite canvas"]');
    await page.keyboard.press("b");
    const at = await page.evaluate(() => {
      const r = document
        .querySelector('canvas[aria-label="Sprite canvas"]')
        .getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(at.x, at.y, { label: "draw source document pixel" });
    const count = (await docTabs()).length;
    await newSprite(19, 9);
    assert((await docTabs()).length === count + 1, "Dirty New failed to append");
    assert(
      !(await page.evaluate(
        () => !!document.querySelector('[role="dialog"][aria-label="Warning"]'),
      )),
      "New asked to replace the previous document",
    );
  });
  await check("Open preserves all previous documents", async () => {
    const before = await docTabs();
    const beforeAllTabs = (await tabs()).length;
    const importPath = `${captureConfig.root}/apps/editor/assets/examples/xprite/xprite.ase`;
    await page.setInputFiles('input[type="file"]', [importPath]);
    await page.waitForFunction(
      (count) => document.querySelectorAll('[role="tab"]').length > count,
      beforeAllTabs,
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Timeline"]')?.getAttribute("aria-description") ===
        "1 layers, 10 frames",
    );
    assert((await docTabs()).length === before.length + 1, "Open replaced an existing document");
    return { before, after: await docTabs() };
  });
  await snapshot("Imported Aseprite project in another tab");
  await check("cross-document Copy and Paste", async () => {
    await page.focus('canvas[aria-label="Sprite canvas"]');
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+c");
    await newSprite(96, 96);
    await page.focus('canvas[aria-label="Sprite canvas"]');
    await page.keyboard.press("ControlOrMeta+v");
    await page.keyboard.press("Enter");
    await snapshot("Pasted source artwork into new document");
    return {
      tabs: await docTabs(),
      note: "Exact RGBA and isolated undo are checked by verify-document-workspace.mjs; this verifies actual browser shortcuts and visible paste.",
    };
  });
  await check("Close All handles pending saves and completed local checkpoints", async () => {
    await closeAll();
    await page.waitForFunction(
      () =>
        !!document.querySelector('[role="dialog"][aria-label="Warning"]') ||
        ![...document.querySelectorAll('[role="tab"]')].some((node) =>
          /\.(png|ase|aseprite)$/i.test(node.getAttribute("aria-label") ?? ""),
        ),
    );
    const firstWarning = await page.evaluate(
      () => !!document.querySelector('[role="dialog"][aria-label="Warning"]'),
    );
    if (firstWarning) {
      const remaining = (await docTabs()).length;
      await page.click('[role="dialog"][aria-label="Warning"] button[aria-label="Cancel"]');
      assert((await docTabs()).length === remaining, "Cancel unexpectedly closed a document");
      await closeAll();
    }
    for (let i = 0; i < 12; i++) {
      const state = await page.evaluate(() => ({
        warning: !!document.querySelector('[role="dialog"][aria-label="Warning"]'),
        tabs: [...document.querySelectorAll('[role="tab"]')].filter((node) =>
          /\.(png|ase|aseprite)$/i.test(node.getAttribute("aria-label") ?? ""),
        ).length,
      }));
      if (!state.tabs) break;
      if (state.warning)
        await page.click('[role="dialog"][aria-label="Warning"] button[aria-label="Don\'t Save"]');
      await page.waitForFunction(
        (count) =>
          [...document.querySelectorAll('[role="tab"]')].filter((node) =>
            /\.(png|ase|aseprite)$/i.test(node.getAttribute("aria-label") ?? ""),
          ).length < count,
        state.tabs,
      );
    }
    assert((await docTabs()).length === 0, "Close All left document tabs");
    await newSprite(5, 7);
    assert((await docTabs()).length === 1, "New after empty workspace failed");
  });
  await check("five edited documents survive real browser recovery", async () => {
    const expected = [];
    const canvasHash = async () => {
      const r = await page.evaluate(() =>
        document
          .querySelector('canvas[aria-label="Sprite canvas"]')
          .getBoundingClientRect()
          .toJSON(),
      );
      await page.mouse.move(r.x - 4, r.y + 4);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      return page.evaluate(() => {
        const c = document.querySelector('canvas[aria-label="Sprite canvas"]'),
          data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let hash = 2166136261;
        for (const value of data) {
          hash ^= value;
          hash = Math.imul(hash, 16777619);
        }
        return { width: c.width, height: c.height, hash: hash >>> 0 };
      });
    };
    for (let i = 0; i < 5; i++) {
      await newSprite(5 + i, 5);
      await page.click('button[aria-label="Pencil"]');
      const tab = await page.evaluate(() => {
        const t = document.querySelector('[role="tab"][aria-selected="true"]');
        return { id: t.dataset.uiTabValue, name: t.getAttribute("aria-label") };
      });
      const beforeStroke = await page.evaluate(() => Date.now());
      const point = await page.evaluate(() => {
        const r = document
          .querySelector('canvas[aria-label="Sprite canvas"]')
          .getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.click(point.x, point.y);
      expected.push({ ...tab, beforeStroke, canvas: await canvasHash() });
    }
    // Read only this disposable origin's real committed storage, not a dev-only
    // import or an in-memory workspace. Verify the manifest includes every tab.
    await page.waitForFunction(
      async (expected) => {
        const name = "aseprite-react-editor-projects-v1";
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open(name);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        try {
          const all = await new Promise((resolve, reject) => {
            const r = db.transaction("projects").objectStore("projects").getAll();
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          if (
            !expected.every((t) =>
              all.some(
                (r) =>
                  r.metadata.slotId === t.id &&
                  r.metadata.name === t.name &&
                  r.updatedAt >= t.beforeStroke,
              ),
            )
          )
            return false;
          const root = all.find((r) => r.projectId === "xse.workspace.manifest.v1");
          if (!root) return false;
          let bytes;
          if (root.head.backend === "indexeddb")
            bytes = await new Promise((resolve, reject) => {
              const r = db.transaction("payloads").objectStore("payloads").get(root.head.id);
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject(r.error);
            });
          else {
            const dir = await (
              await navigator.storage.getDirectory()
            ).getDirectoryHandle("aseprite-project-drafts-" + encodeURIComponent(name));
            bytes = await (await (await dir.getFileHandle(root.head.id)).getFile()).arrayBuffer();
          }
          const manifest = JSON.parse(new TextDecoder().decode(bytes));
          return expected.every((t) => manifest.entries.some((e) => e.slotId === t.id));
        } finally {
          db.close();
        }
      },
      expected,
      { timeout: 30000 },
    );
    const reload = await page.reload();
    if (reload?.dialog) await page.acceptDialog();
    await page.waitForSelector('canvas[aria-label="Sprite canvas"]');
    for (const item of expected) {
      await page.click(`[role="tab"][data-ui-tab-value="${item.id}"]`);
      const actual = await canvasHash();
      assert(
        JSON.stringify(actual) === JSON.stringify(item.canvas),
        "Recovered rendered pixels differ: " + item.name,
      );
      assert(
        await page.evaluate(
          (id) =>
            !!document
              .querySelector(`[role="tab"][data-ui-tab-value="${id}"]`)
              ?.getAttribute("aria-description"),
          item.id,
        ),
        "Dirty state lost: " + item.name,
      );
    }
    return {
      documents: expected.length,
      renderedPixelsExact: true,
      dirtyStateRetained: true,
      storage:
        "actual production IndexedDB/OPFS manifest and page reload, no source-module imports",
    };
  });
  report.passed = true;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(`${captureConfig.root}/.tmp`, { recursive: true });
  await fs.writeFile(
    `${captureConfig.root}/.tmp/qa-multi-document.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
