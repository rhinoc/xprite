import { EditorDialog } from "$/components/dialogs/overlay";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import { useUndoHistoryManager } from "$/managers/dialogs/undo-history-manager";
import { ScrollArea, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/dialogs/undo-history-window.module.css";

/** Aseprite-style chronological history, including alternate branches and the initial state. */
export function UndoHistoryWindow({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  useUiLanguage();
  const { history, moveToState } = useUndoHistoryManager();
  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Undo History"
      defaultBounds={{ x: 1190, y: 170, width: 320, height: 410 }}
      minSize={{ width: 220, height: 160 }}
      constrainToViewport
    >
      {({ clientBounds }) => (
        <ScrollArea
          viewportProps={{ role: "listbox", "aria-label": tUi("ui.undo.history.states") }}
          className={styles.root}
          scrollX={false}
        >
          {[
            {
              index: -1,
              label: "Initial State",
              current: history.currentIndex === -1,
              saved: history.initialSaved,
            },
            ...history.states,
          ].map((item) => (
            <button
              key={item.index}
              type="button"
              role="option"
              aria-selected={item.current}
              data-current={item.current ? "true" : undefined}
              aria-label={
                item.saved
                  ? tUi("ui.history.state.saved", { name: tUiSource(item.label) })
                  : tUiSource(item.label)
              }
              onClick={() => moveToState(item.index)}
              className={styles.state}
            >
              <span
                aria-hidden="true"
                className={styles.savedMarker}
                data-saved={item.saved ? "true" : undefined}
              />
              <Text
                variant={TextVariant.PositionedPixel}
                text={tUiSource(item.label)}
                x={16}
                y={7}
                color="currentColor"
                font="mini"
              />
            </button>
          ))}
          <span aria-live="polite" className={styles.screenReaderOnly}>
            {tUi("ui.history.current.summary", {
              count: history.states.length,
              name:
                history.currentIndex < 0
                  ? tUi("ui.initial.state")
                  : tUiSource(history.states[history.currentIndex]?.label ?? ""),
            })}
          </span>
          <div
            aria-hidden
            style={{ height: Math.max(0, clientBounds.height - (history.states.length + 1) * 24) }}
          />
        </ScrollArea>
      )}
    </EditorDialog>
  );
}
