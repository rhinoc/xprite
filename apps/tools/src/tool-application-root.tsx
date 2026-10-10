import { useEffect, type ReactNode } from "react";

import { ToolArtworkProvider } from "$/components/shared/tool-artwork";
import { ToolLanguageProvider } from "$/managers/locale/tool-language";
import { PublicLanguage } from "@xprite/growth-content/language";

/** The marker changes only after React has attached events to the generated DOM. */
export function ToolApplicationRoot({
  rootId,
  children,
  artwork,
  language,
  onLanguageChange,
}: {
  rootId: string;
  children: ReactNode;
  artwork: Readonly<Record<string, string>>;
  language: PublicLanguage;
  onLanguageChange?: (language: PublicLanguage) => void;
}) {
  useEffect(() => {
    const root = document.getElementById(rootId)!;
    delete root.dataset.toolStartupView;
    root.dataset.toolReady = "";
  }, [rootId]);
  return (
    <ToolLanguageProvider language={language} onChange={onLanguageChange}>
      <ToolArtworkProvider urls={artwork}>{children}</ToolArtworkProvider>
    </ToolLanguageProvider>
  );
}
