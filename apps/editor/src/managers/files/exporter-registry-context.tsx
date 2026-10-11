import { createContext, useContext, type ReactNode } from "react";

import type { ExporterRegistry } from "$/managers/files/exporter-registry";

const Context = createContext<ExporterRegistry | null>(null);

export function ExporterRegistryProvider({
  registry,
  children,
}: {
  registry: ExporterRegistry;
  children: ReactNode;
}) {
  return <Context.Provider value={registry}>{children}</Context.Provider>;
}

export function useExporterRegistry() {
  const registry = useContext(Context);
  if (!registry) throw new Error("Exporter registry is missing.");
  return registry;
}
