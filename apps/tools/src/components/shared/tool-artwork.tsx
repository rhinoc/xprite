import { createContext, useContext, type Context, type ReactNode } from "react";

export enum ToolArtworkKind {
  Example = "example",
}
export const toolArtworkKey = (kind: ToolArtworkKind, path: string) => `${kind}:${path}`;
const ArtworkContext: Context<Readonly<Record<string, string>>> =
  import.meta.hot?.data.artworkContext ?? createContext<Readonly<Record<string, string>>>({});
if (import.meta.hot) import.meta.hot.data.artworkContext = ArtworkContext;

/** The initial page's asset URLs also belong to the first hydrated render. */
export function ToolArtworkProvider({
  urls,
  children,
}: {
  urls: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return <ArtworkContext.Provider value={urls}>{children}</ArtworkContext.Provider>;
}

export function useToolArtwork() {
  const urls = useContext(ArtworkContext);
  return (kind: ToolArtworkKind, path: string, source: string) =>
    urls[toolArtworkKey(kind, path)] ?? source;
}
