import { RecoveryView as PrimitiveRecoveryView } from "$/components/workspace/recovery-view-base";
import { tUi, tUiSource } from "$/i18n";
import type { RecoveryItem } from "$/managers/workspace/recovery-presentation";

export interface EditorRecoveryViewProps {
  items: readonly RecoveryItem[];
  selectedIds: readonly string[];
  onSelectionChange: (ids: readonly string[]) => void;
  loading?: boolean;
  busy?: boolean;
  onRecover: (ids: readonly string[]) => void;
  onRefresh: () => void;
  onDelete?: (ids: readonly string[]) => void;
}

/** Supplies editor copy while keeping recovery operations in the editor layer. */
export function EditorRecoveryView(props: EditorRecoveryViewProps) {
  return (
    <PrimitiveRecoveryView
      {...props}
      labels={{
        heading: tUi("ui.recover.files"),
        recover: (count) =>
          count > 1 ? tUi("ui.recover.count.sprites", { count }) : tUiSource("Recover Sprite"),
        refresh: tUi("ui.refresh"),
        delete: tUi("ui.delete"),
        loading: tUi("ui.loading.17b11033"),
        previousSessions: tUi("ui.recovery.previous.sessions"),
        rawFrames: tUi("ui.recovery.raw.frames"),
        rawLayers: tUi("ui.recovery.raw.layers"),
        recoveryOptions: tUi("ui.recovery.options"),
        rawUnavailable: tUi("ui.recovery.raw.unavailable"),
      }}
    />
  );
}
