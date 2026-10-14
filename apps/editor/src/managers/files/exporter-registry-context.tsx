import { createContext, useContext, type ReactNode } from "react";

import { tUi } from "$/i18n";
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
  if (!registry) throw new Error(tUi("ui.export.registry.missing"));
  return registry;
}
