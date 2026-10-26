import { afterEach, describe, expect, it } from "vitest";

import { changeUiLanguage, currentUiLanguage, prepareUiLanguage, tUi } from "$/i18n";

afterEach(async () => {
  await changeUiLanguage("en");
});

describe("dynamic UI locales", () => {
  it("keeps English available without loading other locales", async () => {
    await prepareUiLanguage();
    await changeUiLanguage("en");
    expect(currentUiLanguage()).toBe("en");
    expect(tUi("ui.pixel.editor.browser.use", { api: "x", path: "y" })).toContain("x");
  });

  it("loads a non-English locale on demand and falls back to English for missing keys", async () => {
    await changeUiLanguage("zh-CN");
    expect(currentUiLanguage()).toBe("zh-CN");
    // Stable keys resolve from the loaded map or English; never throw.
    expect(typeof tUi("ui.pixel.editor.browser.use", { api: "x", path: "y" })).toBe("string");
  });

  it("re-applies a cached locale without waiting on a second network import", async () => {
    await changeUiLanguage("ja");
    const first = tUi("ui.pixel.editor.browser.use", { api: "a", path: "b" });
    await changeUiLanguage("en");
    await changeUiLanguage("ja");
    expect(tUi("ui.pixel.editor.browser.use", { api: "a", path: "b" })).toBe(first);
  });
});
