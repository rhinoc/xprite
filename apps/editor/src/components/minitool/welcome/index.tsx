import { useEffect, useId, useRef, type CSSProperties } from "react";

import { currentUiLanguage, tUi, useUiLanguage } from "$/i18n";
import { Button, Panel, Text, TextVariant, UIProvider, useUi } from "@xprite/ui";
import { isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/minitool/welcome/welcome.module.css";

interface MiniToolWelcomeDialogProps {
  saving: boolean;
  onDismiss(): Promise<void>;
}

function WelcomeDialog({ saving, onDismiss }: MiniToolWelcomeDialogProps) {
  useUiLanguage();
  const copy = {
    title: tUi("ui.minitool.welcome.title"),
    description: tUi("ui.minitool.welcome.description"),
    saving: tUi("ui.minitool.welcome.saving"),
    links: tUi("ui.minitool.welcome.links"),
    close: tUi("ui.minitool.welcome.close"),
    opening: tUi("ui.minitool.welcome.opening"),
  };
  const { style: uiStyle } = useUi();
  const titleId = useId();
  const host = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    host.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className={`${styles.screen} xse-safe-area xse-global`}
      style={
        {
          "--xse-safe-area-chrome": uiStyle.colors.window_face,
          "--xse-safe-area-workspace": uiStyle.colors.workspace,
          "--xprite-welcome-face": uiStyle.colors.window_face,
          "--xprite-welcome-text": uiStyle.colors.text,
        } as CSSProperties
      }
    >
      <div
        ref={host}
        className={styles.workarea}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (isImeKeyboardEvent(event.nativeEvent)) return;
          if (event.key === "Escape" && !saving) {
            event.preventDefault();
            void onDismiss();
          } else if (event.key === "Tab") {
            event.preventDefault();
            if (!saving) close.current?.focus({ preventScroll: true });
          }
        }}
      >
        <Panel
          className={styles.panel}
          title={
            <span id={titleId}>
              <Text variant={TextVariant.Inline} scale={2} ink={uiStyle.colors.text}>
                {copy.title}
              </Text>
            </span>
          }
        >
          <div className={styles.description}>
            {[copy.description, copy.saving, copy.links].map((text) => (
              <Text
                key={text}
                variant={TextVariant.Inline}
                scale={2}
                ink={uiStyle.colors.text}
                wrap
              >
                {text}
              </Text>
            ))}
          </div>
          <div className={styles.actions}>
            <Button
              ref={close}
              text={saving ? copy.opening : copy.close}
              disabled={saving}
              onClick={() => void onDismiss()}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Imported exclusively by the mini tool entry; the editor starts after dismissal. */
export function MiniToolWelcomeDialog(props: MiniToolWelcomeDialogProps) {
  return (
    <UIProvider appearance="light" language={currentUiLanguage()}>
      <WelcomeDialog {...props} />
    </UIProvider>
  );
}
