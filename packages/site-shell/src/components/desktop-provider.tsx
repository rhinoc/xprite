import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
  type Context,
} from "react";

import {
  UIProvider,
  UiColorScheme,
  macintoshTheme,
  useUi,
  useSystemColorScheme,
  type UiTheme,
} from "@xprite/ui";
import type { UiThemeSnapshot } from "@xprite/ui/assets";
import { CursorProvider } from "@xprite/ui/cursor";

import { DesktopAppearance, DesktopManager } from "../managers/desktop";

const DesktopContext: Context<DesktopManager | undefined> =
  import.meta.hot?.data.desktopContext ?? createContext<DesktopManager | undefined>(undefined);
if (import.meta.hot) import.meta.hot.data.desktopContext = DesktopContext;

export function useDesktop() {
  return useContext(DesktopContext);
}

function DocumentTheme({ manager }: { manager: DesktopManager }) {
  const { tokens, colorScheme, theme } = useUi();
  useEffect(
    () => manager.applyTheme(tokens, colorScheme, theme.id),
    [manager, tokens, colorScheme, theme],
  );
  return null;
}

export function DesktopProvider({
  manager,
  children,
  theme = macintoshTheme,
  language = "en",
  translateSource,
  translateKey,
  initialTheme,
  preloadArtwork = false,
  scope = true,
  documentTheme = false,
  cursorVariables = true,
}: {
  manager: DesktopManager;
  children: ReactNode;
  theme?: UiTheme;
  language?: string;
  translateSource?: (source: string) => string;
  translateKey?: (key: string) => string;
  initialTheme?: UiThemeSnapshot;
  preloadArtwork?: boolean;
  scope?: boolean;
  documentTheme?: boolean;
  /** False when a page stylesheet defines the cursor variables once for the whole document. */
  cursorVariables?: boolean;
}) {
  const preferences = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getServerSnapshot,
  );
  const system = useSystemColorScheme();
  const colorScheme =
    preferences.appearance === DesktopAppearance.System
      ? system
      : preferences.appearance === DesktopAppearance.Dark
        ? UiColorScheme.Dark
        : UiColorScheme.Light;
  return (
    <DesktopContext.Provider value={manager}>
      <UIProvider
        theme={theme}
        colorScheme={colorScheme}
        language={language}
        translateSource={translateSource}
        translateKey={translateKey}
        initialTheme={initialTheme}
        preloadArtwork={preloadArtwork}
        scope={scope}
      >
        <CursorProvider variables={cursorVariables}>
          {documentTheme && <DocumentTheme manager={manager} />}
          {children}
        </CursorProvider>
      </UIProvider>
    </DesktopContext.Provider>
  );
}
