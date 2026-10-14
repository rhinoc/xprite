import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

import type { FilesManager, FilesSnapshot } from "$/managers/files/files-manager";
import { filesText, type FilesText } from "$/managers/locale/files-text";
import { useToolLanguage } from "$/managers/locale/tool-language";

const FilesContext = createContext<FilesManager | null>(null);

/** Static pages render without Files; the browser root supplies the manager. */
export function FilesProvider({
  manager,
  children,
}: {
  manager?: FilesManager;
  children: ReactNode;
}) {
  return <FilesContext.Provider value={manager ?? null}>{children}</FilesContext.Provider>;
}

export function useFilesManager(): FilesManager | null {
  return useContext(FilesContext);
}

const noSubscription = () => () => {};

export function useFilesSnapshot(manager: FilesManager | null): FilesSnapshot | null {
  return useSyncExternalStore(
    manager?.subscribe ?? noSubscription,
    () => manager?.getSnapshot() ?? null,
    () => null,
  );
}

export function useFilesText(): FilesText {
  const { language } = useToolLanguage();
  return useMemo(() => filesText(language), [language]);
}
