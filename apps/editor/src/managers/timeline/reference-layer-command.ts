import { useCallback, useEffect, useRef } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { useTimelineManager } from "$/managers/timeline/timeline-manager";

/** File selection may finish after a different document or workspace becomes active. */
export function useReferenceLayerCommand(enabled: boolean, onError?: (message: string) => void) {
  const { identity, getSnapshot, commands } = useTimelineManager();
  const files = useEditorPlatformPorts()?.files;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  return useCallback(() => {
    const snapshot = getSnapshot();
    if (!enabled || !snapshot?.document || !files?.selectReferenceImage) return;
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    const documentId = snapshot.document.id;
    void files
      .selectReferenceImage(request.signal)
      .then((pixels) => {
        if (
          !pixels ||
          request.signal.aborted ||
          currentIdentity.current !== identity ||
          getSnapshot()?.document?.id !== documentId
        )
          return;
        commands.addReferenceLayer(pixels);
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted)
          onError?.(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (pending.current === request) pending.current = null;
      });
  }, [identity, getSnapshot, commands, files, enabled, onError]);
}
