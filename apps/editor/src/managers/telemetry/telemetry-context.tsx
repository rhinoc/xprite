import { createContext, useContext, type ReactNode } from "react";

import { TelemetryManager } from "$/managers/telemetry/telemetry-manager";

const disabledTelemetry = new TelemetryManager({
  enabled: false,
  capture: () => {},
  captureException: () => {},
});
const TelemetryContext = createContext(disabledTelemetry);

export function TelemetryProvider({
  manager,
  children,
}: {
  manager: TelemetryManager;
  children: ReactNode;
}) {
  return <TelemetryContext.Provider value={manager}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry(): TelemetryManager {
  return useContext(TelemetryContext);
}
