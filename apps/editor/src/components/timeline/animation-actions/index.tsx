import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { TimelineDockPosition } from "$/managers/preferences/timeline-dock-position";
import {
  defaultTimelineInteractionPreferences,
  type TimelineInteractionPreferences,
} from "$/managers/preferences/timeline-interaction-preferences";
import type {
  TimelinePanelPreferences,
  TimelinePanelPreferencesPatch,
} from "$/managers/preferences/timeline-panel-preferences";
import { useTimelineManager } from "$/managers/timeline/timeline-manager";
import { defaultOnionSkinSettings } from "$/managers/timeline/timeline-presentation";
const OnionSkinSettingsPanel = lazy(() =>
  import("$/components/timeline/animation-settings").then((m) => ({
    default: m.OnionSkinSettingsPanel,
  })),
);
const AnimationPreview = lazy(() =>
  import("$/components/timeline/animation-preview").then((m) => ({ default: m.AnimationPreview })),
);
interface Actions {
  openOnionSettings: () => void;
  playPreview: () => void;
}
interface Registry {
  actions: Actions | null;
  register: (value: Actions) => () => void;
}
const Context = createContext<Registry | null>(null);
export function AnimationActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Actions | null>(null);
  const register = useCallback((next: Actions) => {
    setActions(next);
    return () => setActions((old) => (old === next ? null : old));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAnimationActions = () => useContext(Context)?.actions ?? null;
/** The host wires editor primitives to a document; all presentation remains in them. */
export function AnimationDialogsHost({
  enabled = true,
  previewOpen,
  onPreviewOpenChange,
  timelinePosition = "bottom",
  onTimelinePositionChange,
  timelinePanelPreferences,
  onTimelinePanelPreferencesChange,
  onSetTimelinePanelPreferencesAsDefaults,
  timelineInteractionPreferences = defaultTimelineInteractionPreferences,
  onTimelineInteractionPreferencesChange,
}: {
  enabled?: boolean;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  timelinePosition?: TimelineDockPosition;
  onTimelinePositionChange?: (position: TimelineDockPosition) => void;
  timelinePanelPreferences?: TimelinePanelPreferences;
  onTimelinePanelPreferencesChange?: (patch: TimelinePanelPreferencesPatch) => void;
  onSetTimelinePanelPreferencesAsDefaults?: () => void;
  timelineInteractionPreferences?: TimelineInteractionPreferences;
  onTimelineInteractionPreferencesChange?: (value: TimelineInteractionPreferences) => void;
}) {
  const registry = useContext(Context);
  const timelineManager = useTimelineManager(true);
  const { commands } = timelineManager;
  const state = timelineManager.snapshot;
  const [onionOpen, setOnionOpen] = useState(false),
    [playRequest, setPlayRequest] = useState(0);
  useEffect(
    () =>
      registry?.register({
        openOnionSettings: () => {
          if (enabled && timelineManager.getSnapshot()?.document) setOnionOpen(true);
        },
        playPreview: () => {
          if (enabled && timelineManager.getSnapshot()?.document) {
            onPreviewOpenChange(true);
            setPlayRequest((n) => n + 1);
          }
        },
      }),
    [registry?.register, timelineManager.getSnapshot, enabled, onPreviewOpenChange],
  );
  useEffect(() => setOnionOpen(false), [timelineManager.identity, enabled, state?.document?.id]);
  if (!timelineManager.active || !enabled || !state?.document) return null;
  return (
    <Suspense fallback={null}>
      <OnionSkinSettingsPanel
        open={onionOpen}
        onOpenChange={setOnionOpen}
        value={
          state.view.onionSkin ?? timelinePanelPreferences?.onionSkin ?? defaultOnionSkinSettings
        }
        onChange={(value) => {
          commands.setOnionSkin(value);
          onTimelinePanelPreferencesChange?.({ onionSkin: value });
        }}
        timelinePosition={timelinePosition}
        onTimelinePositionChange={onTimelinePositionChange}
        timelinePanelPreferences={timelinePanelPreferences}
        onTimelinePanelPreferencesChange={onTimelinePanelPreferencesChange}
        firstFrame={timelinePanelPreferences?.firstFrame ?? 1}
        onFirstFrameChange={(value) => onTimelinePanelPreferencesChange?.({ firstFrame: value })}
        onSetAsDefaults={onSetTimelinePanelPreferencesAsDefaults}
      />
      <AnimationPreview
        snapshot={state}
        identity={timelineManager.identity ?? 0}
        open={previewOpen}
        onOpenChange={onPreviewOpenChange}
        playRequest={playRequest}
        rewindOnStop={timelineInteractionPreferences.rewindOnStop}
        onRewindOnStopChange={(rewindOnStop) =>
          onTimelineInteractionPreferencesChange?.({
            ...timelineInteractionPreferences,
            rewindOnStop,
          })
        }
      />
    </Suspense>
  );
}
