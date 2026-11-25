import { afterEach, describe, expect, it, vi } from "vitest";

import {
  changeUiLanguage,
  currentUiLanguage,
  normalizeUiLanguage,
  prepareUiLanguage,
  resolveInitialUiLanguage,
  tUi,
} from "$/i18n";

afterEach(async () => {
  vi.unstubAllGlobals();
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

  it("clears a stale ?lang query parameter when the user manually switches language", async () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "http://localhost:5173/editor?lang=en&theme=dark#hash",
        search: "?lang=en&theme=dark",
      },
      history: {
        state: { page: "editor" },
        replaceState,
      },
    });

    await changeUiLanguage("ja");

    expect(currentUiLanguage()).toBe("ja");
    expect(replaceState).toHaveBeenCalledWith({ page: "editor" }, "", "/editor?theme=dark#hash");
  });
});

describe("initial UI language resolution", () => {
  it("normalizes exact locale codes and BCP 47 language tags, rejecting invalid values", () => {
    expect(normalizeUiLanguage("en")).toBe("en");
    expect(normalizeUiLanguage("EN-us")).toBe("en");
    expect(normalizeUiLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizeUiLanguage("zh-cn")).toBe("zh-CN");
    expect(normalizeUiLanguage("zh")).toBe("zh-CN");
    expect(normalizeUiLanguage("zh_Hans")).toBe("zh-CN");
    expect(normalizeUiLanguage("pt")).toBe("pt-BR");
    expect(normalizeUiLanguage("pt-br")).toBe("pt-BR");
    expect(normalizeUiLanguage("ja-JP")).toBe("ja");
    expect(normalizeUiLanguage("ko")).toBe("ko");
    expect(normalizeUiLanguage("ru-RU")).toBe("ru");
    expect(normalizeUiLanguage("es-419")).toBe("es");

    expect(normalizeUiLanguage("")).toBeUndefined();
    expect(normalizeUiLanguage("   ")).toBeUndefined();
    expect(normalizeUiLanguage("fr")).toBeUndefined();
    expect(normalizeUiLanguage("invalid-lang!")).toBeUndefined();
    expect(normalizeUiLanguage(null)).toBeUndefined();
    expect(normalizeUiLanguage(undefined)).toBeUndefined();
  });

  it("prefers an explicit valid ?lang query parameter over persisted localStorage and navigator", () => {
    expect(
      resolveInitialUiLanguage({
        search: "?lang=en",
        storedLanguage: "zh-CN",
        navigatorLanguages: ["ja-JP"],
      }),
    ).toBe("en");
    expect(
      resolveInitialUiLanguage({
        search: "?foo=1&lang=ja",
        storedLanguage: "zh-CN",
        navigatorLanguages: ["en-US"],
      }),
    ).toBe("ja");
    expect(
      resolveInitialUiLanguage({
        search: "?lang=zh-cn",
        storedLanguage: "en",
        navigatorLanguages: ["ko-KR"],
      }),
    ).toBe("zh-CN");
  });

  it("falls back to localStorage when ?lang is absent or invalid", () => {
    expect(
      resolveInitialUiLanguage({
        search: "",
        storedLanguage: "zh-CN",
        navigatorLanguages: ["en-US"],
      }),
    ).toBe("zh-CN");
    expect(
      resolveInitialUiLanguage({
        search: "?lang=fr",
        storedLanguage: "zh-CN",
        navigatorLanguages: ["en-US"],
      }),
    ).toBe("zh-CN");
    expect(
      resolveInitialUiLanguage({
        search: "?lang=",
        storedLanguage: "ko",
        navigatorLanguages: ["ja-JP"],
      }),
    ).toBe("ko");
  });

  it("falls back to navigator languages when both ?lang and localStorage are absent or invalid", () => {
    expect(
      resolveInitialUiLanguage({
        search: "?lang=invalid",
        storedLanguage: null,
        navigatorLanguages: ["fr-FR", "pt-PT", "en-US"],
      }),
    ).toBe("pt-BR");
    expect(
      resolveInitialUiLanguage({
        search: "",
        storedLanguage: "unsupported",
        navigatorLanguages: ["zh-TW"],
      }),
    ).toBe("zh-CN");
  });

  it("falls back to English default when ?lang, localStorage, and navigator are all unsupported", () => {
    expect(
      resolveInitialUiLanguage({
        search: "?lang=de",
        storedLanguage: "fr",
        navigatorLanguages: ["de-DE", "fr-FR"],
      }),
    ).toBe("en");
    expect(
      resolveInitialUiLanguage({
        search: "",
        storedLanguage: null,
        navigatorLanguages: [],
      }),
    ).toBe("en");
  });

  it("reads window.location.search on module initialization with ?lang taking precedence over localStorage", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {
      location: {
        href: "http://localhost:5173/editor?lang=en",
        search: "?lang=en",
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "xse.ui.language.v1" ? "zh-CN" : null),
      setItem: vi.fn(),
    });
    vi.stubGlobal("navigator", {
      languages: ["zh-CN"],
      language: "zh-CN",
    });

    const freshI18n = await import("$/i18n");
    await freshI18n.prepareUiLanguage();
    expect(freshI18n.currentUiLanguage()).toBe("en");
  });
});
