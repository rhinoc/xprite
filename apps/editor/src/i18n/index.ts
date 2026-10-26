import { useSyncExternalStore } from "react";

import en from "$/i18n/locales/en.json";
import { browserLocalStorage as localStorage } from "@xprite/bedrock/browser/localstorage";

const UI_LANGUAGES = ["en", "zh-CN", "ja", "ko", "ru", "pt-BR", "es"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
const DEFAULT_UI_LANGUAGE: UiLanguage = "en";
const LANGUAGE_STORAGE_KEY = "xse.ui.language.v1";
export type UiMessageKey = keyof typeof en;

type LocaleMessages = Record<string, string>;

const locales: Partial<Record<UiLanguage, LocaleMessages>> & { en: LocaleMessages } = {
  en,
};

const localeLoaders: Record<
  Exclude<UiLanguage, "en">,
  () => Promise<{ default: LocaleMessages }>
> = {
  "zh-CN": () => import("$/i18n/locales/zh-CN.json"),
  ja: () => import("$/i18n/locales/ja.json"),
  ko: () => import("$/i18n/locales/ko.json"),
  ru: () => import("$/i18n/locales/ru.json"),
  "pt-BR": () => import("$/i18n/locales/pt-BR.json"),
  es: () => import("$/i18n/locales/es.json"),
};

const localePending = new Map<UiLanguage, Promise<void>>();

async function ensureLocale(language: UiLanguage): Promise<void> {
  if (language === "en" || locales[language]) return;
  let pending = localePending.get(language);
  if (!pending) {
    const loader = localeLoaders[language];
    pending = loader()
      .then((module) => {
        locales[language] = module.default;
      })
      .finally(() => {
        if (localePending.get(language) === pending) localePending.delete(language);
      });
    localePending.set(language, pending);
  }
  await pending;
}

const englishMessageKeys = new Map<string, UiMessageKey>(
  Object.entries(en).map(([key, message]) => [message, key as UiMessageKey] as const),
);
const listeners = new Set<() => void>();

function initialLanguage(): UiLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (UI_LANGUAGES.includes(saved as UiLanguage)) return saved as UiLanguage;
  } catch {
    // Storage can be disabled; the browser language remains a useful default.
  }
  if (typeof navigator === "undefined") return DEFAULT_UI_LANGUAGE;
  const preferredLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const preferredLanguage of preferredLanguages) {
    const baseLanguage = preferredLanguage.split("-")[0].toLowerCase();
    const supportedLanguage = UI_LANGUAGES.find(
      (language) => language.split("-")[0].toLowerCase() === baseLanguage,
    );
    if (supportedLanguage) return supportedLanguage;
  }
  return DEFAULT_UI_LANGUAGE;
}

/** Detected preference; published only after its locale map is available. */
const detectedLanguage = initialLanguage();
let language: UiLanguage = DEFAULT_UI_LANGUAGE;
let languageReady = detectedLanguage === DEFAULT_UI_LANGUAGE;

function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function languageSnapshot() {
  return language;
}

function publishLanguage() {
  if (typeof document !== "undefined") document.documentElement.lang = language;
  for (const listener of listeners) listener();
}

if (typeof document !== "undefined") document.documentElement.lang = language;

function interpolate(message: string, values?: Record<string, string | number>): string {
  let translated = message;
  for (const [name, value] of Object.entries(values ?? {})) {
    translated = translated.split(`{${name}}`).join(String(value));
  }
  return translated;
}

function messageFor(key: UiMessageKey): string {
  return locales[language]?.[key] ?? en[key] ?? key;
}

/** Translate a stable message key from the current UI language corpus. */
export function tUi(key: UiMessageKey, values?: Record<string, string | number>): string {
  return interpolate(messageFor(key), values);
}

/** Resolve text supplied by existing dynamic label catalogs, then translate by its stable key. */
export function tUiSource(source: string, values?: Record<string, string | number>): string {
  const key = Object.prototype.hasOwnProperty.call(en, source)
    ? (source as UiMessageKey)
    : englishMessageKeys.get(source);
  return interpolate(key ? messageFor(key) : source, values);
}

export function currentUiLanguage(): UiLanguage {
  return language;
}

export function useUiLanguage() {
  return useSyncExternalStore(subscribeLanguage, languageSnapshot, languageSnapshot);
}

/**
 * Ensure the active UI language's locale map is loaded before first paint of UI strings.
 * Safe to call multiple times; resolves once the detected (or current) language is ready.
 */
export function prepareUiLanguage(): Promise<void> {
  return bootLanguage;
}

const bootLanguage = (async () => {
  await ensureLocale(detectedLanguage);
  language = detectedLanguage;
  languageReady = true;
  publishLanguage();
})();

export async function changeUiLanguage(next: UiLanguage): Promise<void> {
  await ensureLocale(next);
  if (language !== next || !languageReady) {
    language = next;
    languageReady = true;
    publishLanguage();
  }
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // The language still applies for this session when persistence is unavailable.
  }
}
