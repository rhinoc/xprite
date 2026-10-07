import { useEffect, type ReactNode } from "react";

import { ToolArtworkProvider } from "$/components/shared/tool-artwork";

/** The marker changes only after React has attached events to the generated DOM. */
export function ToolApplicationRoot({
  rootId,
  children,
  artwork,
}: {
  rootId: string;
  children: ReactNode;
  artwork: Readonly<Record<string, string>>;
}) {
  useEffect(() => {
    const root = document.getElementById(rootId)!;
    delete root.dataset.toolStartupView;
    root.dataset.toolReady = "";
  }, [rootId]);
  return <ToolArtworkProvider urls={artwork}>{children}</ToolArtworkProvider>;
}
