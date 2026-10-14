import { useEffect, type ReactNode } from "react";

import { FilesProvider } from "$/components/files/files-context";
import { ToolArtworkProvider } from "$/components/shared/tool-artwork";
import type { FilesManager } from "$/managers/files/files-manager";
import { ToolLanguageProvider } from "$/managers/locale/tool-language";
import { PublicLanguage } from "@xprite/growth-content/language";

/** The marker changes only after React has attached events to the generated DOM. */
export function ToolApplicationRoot({
  rootId,
  children,
  artwork,
  language,
  onLanguageChange,
  files,
}: {
  rootId: string;
  children: ReactNode;
  artwork: Readonly<Record<string, string>>;
  language: PublicLanguage;
  onLanguageChange?: (language: PublicLanguage) => void;
  /** Browser-only local Files library; static rendering omits it. */
  files?: FilesManager;
}) {
  useEffect(() => {
    const root = document.getElementById(rootId)!;
    delete root.dataset.toolStartupView;
    root.dataset.toolReady = "";
  }, [rootId]);
  return (
    <ToolLanguageProvider language={language} onChange={onLanguageChange}>
      <ToolArtworkProvider urls={artwork}>
        <FilesProvider manager={files}>{children}</FilesProvider>
      </ToolArtworkProvider>
    </ToolLanguageProvider>
  );
}
