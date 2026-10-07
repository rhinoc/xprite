import { useEffect, useId, useRef } from "react";

import { currentUiLanguage, tUi, tUiSource } from "$/i18n";
import { useDiagnosticsReport } from "$/managers/diagnostics/diagnostics-report-context";
import {
  Button,
  Panel,
  Text,
  TextArea,
  TextAreaPresentation,
  TextVariant,
  UIProvider,
} from "@xprite/ui";
import { isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/errors/diagnostics-report-view.module.css";

const FOCUSABLE_CONTROLS = "button:not(:disabled), textarea:not(:disabled)";

function ReportView({ report, onClose }: { report: string; onClose(): void }) {
  const host = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = host.current;
    root?.focus({ preventScroll: true });
    const keepFocus = (event: FocusEvent) => {
      if (!root?.contains(event.target as Node)) root?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className={`${styles.screen} xse-safe-area xse-global`} data-popup>
      <div
        ref={host}
        className={styles.workarea}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (isImeKeyboardEvent(event.nativeEvent)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Tab") {
            const controls = [
              ...(host.current?.querySelectorAll<HTMLElement>(FOCUSABLE_CONTROLS) ?? []),
            ];
            const index = controls.indexOf(document.activeElement as HTMLElement);
            if (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
              event.preventDefault();
              controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
            }
          }
        }}
      >
        <Panel
          className={styles.panel}
          title={
            <span id={titleId}>
              <Text variant={TextVariant.Inline} color="light" scale={2}>
                {tUi("ui.diagnostics.view.button")}
              </Text>
            </span>
          }
        >
          <Text variant={TextVariant.Inline} color="light" scale={2} wrap>
            {tUi("ui.diagnostics.view.description")}
          </Text>
          <TextArea
            presentation={TextAreaPresentation.Code}
            ref={text}
            className={styles.report}
            aria-label={tUi("ui.diagnostics.view.content")}
            value={report}
            readOnly
            spellCheck={false}
          />
          <div className={styles.actions}>
            <Button
              text={tUi("ui.diagnostics.view.select-all")}
              onClick={() => {
                text.current?.focus();
                text.current?.select();
              }}
            />
            <Button text={tUi("ui.close")} onClick={onClose} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Kept beside the editor boundary so rendering failures cannot remove the report viewer. */
export default function DiagnosticsReportView() {
  const controller = useDiagnosticsReport();
  if (controller?.report === null || !controller) return null;
  return (
    <UIProvider
      appearance="dark"
      language={currentUiLanguage()}
      translateKey={(key) => tUi(key as Parameters<typeof tUi>[0])}
      translateSource={tUiSource}
    >
      <ReportView report={controller.report} onClose={controller.close} />
    </UIProvider>
  );
}
