import { useSyncExternalStore } from "react";

import en from "$/i18n/locales/en.json";
import { browserLocalStorage as localStorage } from "@xprite/bedrock/browser/localstorage";

const UI_LANGUAGES = ["en", "zh-CN", "ja", "ko", "ru", "pt-BR", "es"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
const DEFAULT_UI_LANGUAGE: UiLanguage = "en";
const LANGUAGE_STORAGE_KEY = "xse.ui.language.v1";
const LANGUAGE_QUERY_PARAM = "lang";
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i;
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

/** Normalize an exact locale code or BCP 47 language tag to a supported UiLanguage. */
export function normalizeUiLanguage(value: string | null | undefined): UiLanguage | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !LANGUAGE_TAG_PATTERN.test(trimmed)) return undefined;
  const lower = trimmed.toLowerCase();
  const exact = UI_LANGUAGES.find((candidate) => candidate.toLowerCase() === lower);
  if (exact) return exact;
  const baseLanguage = lower.split(/[-_]/)[0];
  return UI_LANGUAGES.find((candidate) => candidate.split("-")[0].toLowerCase() === baseLanguage);
}

export interface UiLanguageResolutionSources {
  search?: string;
  storedLanguage?: string | null;
  navigatorLanguages?: readonly string[];
}

/**
 * Resolve the initial UI language with precedence:
 * explicit `?lang=` query parameter > persisted `localStorage` > browser `navigator` > default.
 */
export function resolveInitialUiLanguage(sources?: UiLanguageResolutionSources): UiLanguage {
  const search =
    sources?.search ?? (typeof window !== "undefined" ? window.location?.search : undefined);
  if (search) {
    const queryLanguage = normalizeUiLanguage(
      new URLSearchParams(search).get(LANGUAGE_QUERY_PARAM),
    );
    if (queryLanguage) return queryLanguage;
  }

  let saved: string | null | undefined;
  if (sources && "storedLanguage" in sources) {
    saved = sources.storedLanguage;
  } else {
    try {
      saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      // Storage can be disabled; the browser language remains a useful default.
    }
  }
  if (UI_LANGUAGES.includes(saved as UiLanguage)) return saved as UiLanguage;

  const preferredLanguages =
    sources?.navigatorLanguages ??
    (typeof navigator !== "undefined"
      ? navigator.languages?.length
        ? navigator.languages
        : navigator.language
          ? [navigator.language]
          : []
      : []);
  for (const preferredLanguage of preferredLanguages) {
    const supportedLanguage = normalizeUiLanguage(preferredLanguage);
    if (supportedLanguage) return supportedLanguage;
  }
  return DEFAULT_UI_LANGUAGE;
}

/** Detected preference; published only after its locale map is available. */
const detectedLanguage = resolveInitialUiLanguage();
let language: UiLanguage = DEFAULT_UI_LANGUAGE;
let languageReady = detectedLanguage === DEFAULT_UI_LANGUAGE;
let languageVersion = 0;

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

function clearLanguageQueryParam() {
  if (typeof window === "undefined" || !window.location || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(LANGUAGE_QUERY_PARAM)) return;
    url.searchParams.delete(LANGUAGE_QUERY_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    // Embedded or restricted origins can disallow history updates; the in-memory switch still applies.
  }
}

const bootLanguage = (async () => {
  const bootVersion = languageVersion;
  await ensureLocale(detectedLanguage);
  if (languageVersion !== bootVersion) return;
  language = detectedLanguage;
  languageReady = true;
  publishLanguage();
})();

export async function changeUiLanguage(next: UiLanguage): Promise<void> {
  const changeVersion = ++languageVersion;
  await ensureLocale(next);
  if (languageVersion !== changeVersion) return;
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
  clearLanguageQueryParam();
}
