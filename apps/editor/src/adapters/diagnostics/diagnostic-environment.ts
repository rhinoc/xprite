import {
  viewportSize,
  getVisualViewport,
  visualViewportRect,
  displayPixelRatio,
  screenMetrics,
} from "@xprite/ui/utils";
const OPTIONAL_DIAGNOSTIC_TIMEOUT_MS = 1000;
const CLIENT_HINT_FIELDS = ["platformVersion", "fullVersionList"];

enum DiagnosticBuildMode {
  Development = "development",
  Production = "production",
}

interface BrowserClientHints {
  readonly brands: readonly { readonly brand: string; readonly version: string }[];
  readonly mobile: boolean;
  readonly platform: string;
  getHighEntropyValues(hints: string[]): Promise<{
    readonly platformVersion?: string;
    readonly fullVersionList?: readonly { readonly brand: string; readonly version: string }[];
  }>;
}

type DiagnosticNavigator = Navigator & {
  readonly userAgentData?: BrowserClientHints;
  readonly standalone?: boolean;
};

/** Optional browser APIs must not prevent a user from exporting a report. */
async function readOptionalDiagnosticValue<T>(read: () => T | PromiseLike<T>): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), OPTIONAL_DIAGNOSTIC_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Captures export-time support information without document contents or URL parameters. */
export async function collectDiagnosticEnvironment() {
  const browser = navigator as DiagnosticNavigator;
  const hints = browser.userAgentData;
  const matches = (query: string) => window.matchMedia(query).matches;
  const visual = getVisualViewport(window);
  const visualRect = visual ? visualViewportRect(visual) : null;
  const environment = {
    application: {
      version: __XPRITE_VERSION__,
      release: __XPRITE_RELEASE__,
      mode: import.meta.env.DEV ? DiagnosticBuildMode.Development : DiagnosticBuildMode.Production,
      url: `${window.location.origin}${window.location.pathname}`,
      uiLanguage: document.documentElement.lang,
      standalone: matches("(display-mode: standalone)") || browser.standalone === true,
    },
    browser: {
      userAgent: browser.userAgent,
      platform: browser.platform,
      language: browser.language,
      languages: [...browser.languages],
      online: browser.onLine,
      cookiesEnabled: browser.cookieEnabled,
      clientHints: hints
        ? { brands: hints.brands, mobile: hints.mobile, platform: hints.platform }
        : null,
    },
    display: {
      screen: screenMetrics(window),
      viewport: viewportSize(window),
      visualViewport: visualRect
        ? { width: visualRect.width, height: visualRect.height, scale: visualRect.scale }
        : null,
      devicePixelRatio: displayPixelRatio(window),
      prefersDarkColorScheme: matches("(prefers-color-scheme: dark)"),
    },
    input: {
      maxTouchPoints: browser.maxTouchPoints,
      coarsePointer: matches("(any-pointer: coarse)"),
      finePointer: matches("(any-pointer: fine)"),
      hover: matches("(any-hover: hover)"),
    },
  };
  const [clientHintVersions, storageEstimate, timeZone, serviceWorkerControlled] =
    await Promise.all([
      readOptionalDiagnosticValue(async () => {
        if (!hints) return null;
        const versions = await hints.getHighEntropyValues(CLIENT_HINT_FIELDS);
        return {
          platformVersion: versions.platformVersion ?? null,
          fullVersionList: versions.fullVersionList ?? null,
        };
      }),
      readOptionalDiagnosticValue(async () => {
        const estimate = await browser.storage?.estimate();
        return estimate ? { usage: estimate.usage, quota: estimate.quota } : null;
      }),
      readOptionalDiagnosticValue(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      readOptionalDiagnosticValue(() => Boolean(browser.serviceWorker?.controller)),
    ]);
  return {
    ...environment,
    application: { ...environment.application, serviceWorkerControlled },
    clientHintVersions,
    storageEstimate,
    timeZone,
    timeZoneOffsetMinutes: new Date().getTimezoneOffset(),
  };
}
