import { PreferencesLabel } from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { tUi } from "$/i18n";
import { Button } from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";

export interface AgentPreferencesProps {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  status?: {
    state: "connected" | "unavailable" | "disconnected";
    name?: string;
  } | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/** Agent tooling preferences: the user-granted directory previews are written to. */
export function AgentPreferences({
  box,
  client,
  status = null,
  onConnect,
  onDisconnect,
}: AgentPreferencesProps) {
  const assets = useUiAssets();
  const connected = status?.state === "connected";
  const statusText =
    status?.state === "connected"
      ? (status.name ?? tUi("ui.agent.preview.connected"))
      : status?.state === "unavailable"
        ? tUi("ui.agent.preview.unavailable")
        : tUi("ui.agent.preview.notConnected");
  return (
    <>
      <PreferencesLabel
        bounds={box(358, 123, 253, 16)}
        relativeTo={client}
        text={`${tUi("ui.agent.preview.directory")} ${statusText}`}
        color={connected ? undefined : assets?.style.colors.disabled}
      />
      <Button
        aria-label={
          connected ? tUi("ui.agent.preview.disconnect") : tUi("ui.agent.preview.connect")
        }
        text={connected ? tUi("ui.agent.preview.disconnect") : tUi("ui.agent.preview.connect")}
        bounds={box(617, 123, 74, 16)}
        relativeTo={client}
        disabled={
          status?.state === "unavailable" ||
          status === null ||
          (connected ? !onDisconnect : !onConnect)
        }
        onClick={connected ? onDisconnect : onConnect}
      />
    </>
  );
}
