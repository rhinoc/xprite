import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, cx, useSharedText } from "$/shared/ui/controls";
import { Icon, type IconName } from "$/shared/ui/icons";
import iconUrl from "@xprite/site-assets/favicon-32.png?url";

import styles from "$/shared/ui/ui.module.css";

const TOAST_MS = 2400;

export interface PhoneTab<T extends string> {
  id: T;
  label: string;
  icon: IconName;
}

/** A short message at the bottom of the screen; `show` replaces the current one. */
export function useToast(): [string | null, (message: string | null) => void] {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  return [toast, setToast];
}

/**
 * The phone screen every mini tool shares: the top row (换照片, the Xprite lockup, 导出), the
 * tool's own content, the bottom tab bar, an optional sheet and the toast.
 * A picked photo goes to `onPhoto`.
 */
export function PhoneScreen<T extends string>({
  ready,
  canExport,
  tabs,
  tab,
  toast,
  sheet,
  children,
  onPhoto,
  onExport,
  onTab,
}: {
  ready: boolean;
  canExport: boolean;
  tabs: readonly PhoneTab<T>[];
  tab: T;
  toast: string | null;
  sheet?: ReactNode;
  /** The tool's content; `pickPhoto` opens the same picker as 换照片. */
  children(pickPhoto: () => void): ReactNode;
  onPhoto(file: File): void;
  onExport(): void;
  onTab(tab: T): void;
}) {
  const t = useSharedText();
  const input = useRef<HTMLInputElement>(null);
  const pickPhoto = () => input.current?.click();
  return (
    <div className={styles.app} data-minitool-ready={ready ? "" : undefined}>
      <input
        ref={input}
        className={styles.hidden}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onPhoto(file);
        }}
      />
      <div className={styles.actions}>
        <Button className={styles.pill} onClick={pickPhoto}>
          <Icon name="image" />
          {t("top.photo")}
        </Button>
        {/* The site's logo lockup: the X-p mark followed by "rite". */}
        <span className={styles.wordmark} aria-hidden="true">
          <img src={iconUrl} alt="" />
          rite
        </span>
        <Button
          className={cx(styles.pill, styles.primary)}
          disabled={!canExport}
          onClick={onExport}
        >
          <Icon name="export" />
          {t("top.export")}
        </Button>
      </div>
      {children(pickPhoto)}
      <div className={styles.tabbar}>
        <div className={styles.tabs} role="tablist">
          {tabs.map(({ id, label, icon }) => (
            <Button
              key={id}
              className={styles.tab}
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTab(id)}
            >
              <Icon name={icon} />
              {label}
            </Button>
          ))}
        </div>
      </div>
      {sheet}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
