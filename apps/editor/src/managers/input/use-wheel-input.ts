import { useCallback, useEffect, useMemo, type RefObject } from "react";

import {
  EditorWheelSurface,
  resolveWheelDecision,
  projectWheelDelta,
} from "$/managers/input/policies/wheel";
import { useWheelDevice } from "$/managers/input/wheel-device-context";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import {
  EditorWheelAction,
  EditorWheelInputKind,
  type EditorWheelDecision,
} from "$/managers/ports/platform";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

export { EditorWheelAction, EditorWheelSurface };
export type { EditorWheelDecision };
export {
  wheelZoomSteps,
  wheelScalarDelta,
  brushSizeAfterWheel,
  wheelCellSizeDelta,
} from "$/managers/input/policies/wheel";

/** Every editor surface uses the same platform-owned event translator and detector. */
export function useWheelInput() {
  const platform = useEditorPlatformPorts();
  if (!platform) throw new Error("Wheel input requires editor platform ports");
  const runtime = useOptionalEditorRuntimeManagerContext();
  const workspace = runtime?.workspace;
  const { device, reportDetected } = useWheelDevice();
  const resolve = useCallback(
    (event: WheelEvent, surface: EditorWheelSurface): EditorWheelDecision => {
      const input = platform.wheelInput.read(
        event,
        device,
        workspace?.shortcuts.isControlPressed() ?? false,
      );
      if (input.kind === EditorWheelInputKind.Wheel) reportDetected(input.detected);
      const preferences = workspace?.getEditorPreferences() ?? {};
      return resolveWheelDecision(
        input,
        surface,
        preferences,
        workspace
          ? (input, fallback) => workspace.shortcuts.resolveWheel(input, fallback)
          : undefined,
      );
    },
    [platform, workspace, device, reportDetected],
  );
  return useMemo(
    () => ({
      resolve,
      connect: platform.wheelInput.connect,
      projectDelta: projectWheelDelta,
    }),
    [resolve, platform],
  );
}

/** Native child listeners run before ancestor listeners, including React's delegated handlers. */
export function useWheelInputHandler(
  target: RefObject<HTMLElement | null>,
  handler: (event: WheelEvent) => void,
) {
  const { connect } = useWheelInput();
  useEffect(() => {
    const node = target.current;
    if (node) return connect(node, handler);
  }, [target, handler, connect]);
}
