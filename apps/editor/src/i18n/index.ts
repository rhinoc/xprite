import { useSyncExternalStore } from "react";

import en from "$/i18n/locales/en.json";
import zhCN from "$/i18n/locales/zh-CN.json";
import { browserLocalStorage as localStorage } from "@xprite/bedrock/browser/localstorage";

const UI_LANGUAGES = ["en", "zh-CN"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
const DEFAULT_UI_LANGUAGE: UiLanguage = "en";
const LANGUAGE_STORAGE_KEY = "xse.ui.language.v1";
export type UiMessageKey = keyof typeof en;
const locales: Record<UiLanguage, Record<string, string>> = {
  en,
  "zh-CN": zhCN,
};
const englishMessageKeys = new Map<string, UiMessageKey>(
  Object.entries(en).map(([key, message]) => [message, key as UiMessageKey] as const),
);
const listeners = new Set<() => void>();

function initialLanguage(): UiLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "en" || saved === "zh-CN") return saved;
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

let language = initialLanguage();

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

/** Translate a stable message key from the current UI language corpus. */
export function tUi(key: UiMessageKey, values?: Record<string, string | number>): string {
  return interpolate(locales[language][key] ?? en[key], values);
}

/** Resolve text supplied by existing dynamic label catalogs, then translate by its stable key. */
export function tUiSource(source: string, values?: Record<string, string | number>): string {
  const key = Object.prototype.hasOwnProperty.call(en, source)
    ? (source as UiMessageKey)
    : englishMessageKeys.get(source);
  return interpolate(key ? (locales[language][key] ?? en[key]) : source, values);
}

export function currentUiLanguage(): UiLanguage {
  return language;
}

export function useUiLanguage() {
  return useSyncExternalStore(subscribeLanguage, languageSnapshot, languageSnapshot);
}

export async function changeUiLanguage(next: UiLanguage): Promise<void> {
  if (language !== next) {
    language = next;
    publishLanguage();
  }
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // The language still applies for this session when persistence is unavailable.
  }
}
