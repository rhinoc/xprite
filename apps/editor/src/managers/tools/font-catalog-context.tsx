import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { tUi, useUiLanguage } from "$/i18n";
import { FontCatalogManager, LocalFontCatalogStatus } from "$/managers/tools/font-catalog-manager";

const FontCatalogContext = createContext<FontCatalogManager | null>(null);
const BITMAP_METADATA_READ_DELAY_MS = 150;

export function FontCatalogProvider({
  manager,
  children,
}: {
  manager: FontCatalogManager;
  children: ReactNode;
}) {
  return <FontCatalogContext.Provider value={manager}>{children}</FontCatalogContext.Provider>;
}

export function useFontCatalog(family?: string) {
  const suppliedManager = useContext(FontCatalogContext);
  const manager = useMemo(() => suppliedManager ?? new FontCatalogManager(), [suppliedManager]);
  const language = useUiLanguage();
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);
  useEffect(() => {
    if (!family) return;
    const timeout = setTimeout(
      () => manager.readBitmapSizes(family),
      BITMAP_METADATA_READ_DELAY_MS,
    );
    return () => clearTimeout(timeout);
  }, [manager, family, state.status, state.bitmapSizes]);
  const options = useMemo(() => {
    const families = state.families.map((family) => ({ value: family, label: family }));
    const statusLabel = localFontStatusLabel(state.status);
    return statusLabel
      ? [...families, { value: state.status, label: statusLabel, disabled: true }]
      : families;
  }, [state, language]);
  return {
    options,
    requestLocalFonts: manager.requestLocalFonts,
    bitmapSizes: state.bitmapSizes.get(family?.trim().toLowerCase() ?? "") ?? [],
  };
}

function localFontStatusLabel(status: LocalFontCatalogStatus): string | null {
  switch (status) {
    case LocalFontCatalogStatus.Unavailable:
      return tUi("ui.local.font.listing.unavailable");
    case LocalFontCatalogStatus.PermissionRequired:
      return tUi("ui.allow.local.font.access");
    case LocalFontCatalogStatus.Loading:
      return tUi("ui.loading.local.fonts");
    case LocalFontCatalogStatus.Failed:
      return tUi("ui.could.not.load.local.fonts");
    case LocalFontCatalogStatus.Ready:
      return null;
  }
}
