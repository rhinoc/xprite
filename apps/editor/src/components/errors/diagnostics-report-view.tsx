import { useId, useRef } from "react";

import { currentUiLanguage, tUi, tUiSource } from "$/i18n";
import { useDiagnosticsReport } from "$/managers/diagnostics/diagnostics-report-context";
import {
  useModalFocus,
  Button,
  Panel,
  Text,
  TextArea,
  TextAreaPresentation,
  TextInk,
  TextVariant,
  UIProvider,
  UiColorScheme,
} from "@xprite/ui";

import styles from "$/components/errors/diagnostics-report-view.module.css";

const FOCUSABLE_CONTROLS = "button:not(:disabled), textarea:not(:disabled)";

function ReportView({ report, onClose }: { report: string; onClose(): void }) {
  const host = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  useModalFocus({
    open: true,
    rootRef: host,
    initialFocus: (root) => root.focus({ preventScroll: true }),
    focusableSelector: FOCUSABLE_CONTROLS,
    onKeyDown: (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
  });
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
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Panel
          className={styles.panel}
          title={
            <span id={titleId}>
              <Text variant={TextVariant.Inline} inkTone={TextInk.Light} scale={2}>
                {tUi("ui.diagnostics.view.button")}
              </Text>
            </span>
          }
        >
          <Text variant={TextVariant.Inline} inkTone={TextInk.Light} scale={2} wrap>
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
      colorScheme={UiColorScheme.Dark}
      language={currentUiLanguage()}
      translateKey={(key) => tUi(key as Parameters<typeof tUi>[0])}
      translateSource={tUiSource}
    >
      <ReportView report={controller.report} onClose={controller.close} />
    </UIProvider>
  );
}
