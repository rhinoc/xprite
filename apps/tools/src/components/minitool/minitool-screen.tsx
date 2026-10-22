import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button, cx, useText } from "$/components/minitool/minitool-controls";
import { ExportSheet } from "$/components/minitool/minitool-export-sheet";
import { Icon, type IconName } from "$/components/minitool/minitool-icons";
import {
  ComparePanel,
  FramePanel,
  PixelPanel,
  RatioIcon,
} from "$/components/minitool/minitool-panels";
import { SplitPreview } from "$/components/minitool/minitool-preview";
import { miniToolError, type MiniToolTextKey } from "$/managers/locale/minitool-text";
import { composeLayout, EXPORT_RATIOS, ExportContent } from "$/managers/minitool/composition";
import type { MiniToolEditor } from "$/managers/minitool/minitool-editor";
import { MiniToolOutcome, MiniToolTarget, type MiniToolScene } from "$/managers/ports/minitool";
import iconUrl from "@xprite/site-assets/favicon-32.png?url";

import styles from "$/components/minitool/minitool.module.css";

enum Tab {
  Pixel = "pixel",
  Compare = "compare",
  Layout = "layout",
}

const TABS: readonly [Tab, MiniToolTextKey, IconName][] = [
  [Tab.Pixel, "tab.pixel", "grid"],
  [Tab.Compare, "tab.compare", "split"],
  [Tab.Layout, "tab.layout", "layout"],
];
const TOAST_MS = 2400;

/** The pixelate tool laid out for a phone inside Xiaohongshu. */
export function MiniToolScreen({ editor }: { editor: MiniToolEditor }) {
  const t = useText();
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const pixels = useSyncExternalStore(
    editor.pixelation.subscribe,
    editor.pixelation.getSnapshot,
    editor.pixelation.getSnapshot,
  );
  const [tab, setTab] = useState(Tab.Pixel);
  const [sheet, setSheet] = useState(false);
  const [ratioMenu, setRatioMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const composition = useMemo(
    () => (state.shown ? composeLayout(state.layout, state.shown) : null),
    [state.layout, state.shown],
  );
  const scene = useMemo<MiniToolScene | null>(
    () =>
      pixels.source && state.shown && composition
        ? {
            composition,
            split: state.split,
            content: ExportContent.Split,
            original: pixels.source,
            pixels: state.shown,
            title: pixels.name,
            labels: { original: t("label.original"), pixels: t("label.pixels") },
          }
        : null,
    [composition, pixels.source, pixels.name, state.shown, state.split, t],
  );
  useEffect(() => {
    if (pixels.error) setToast(t(miniToolError(pixels.error)));
  }, [pixels.error, t]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const output = (target: MiniToolTarget) => {
    editor.output(target, scene?.labels ?? { original: "", pixels: "" }).then(
      (outcome) => {
        if (outcome === MiniToolOutcome.Downloaded) setToast(t("toast.downloaded"));
        else if (outcome === MiniToolOutcome.Done && target === MiniToolTarget.Album)
          setToast(t("toast.saved"));
      },
      (reason: unknown) =>
        setToast(t(miniToolError(reason instanceof Error ? reason.message : String(reason)))),
    );
  };
  const status = pixels.loading
    ? t("canvas.opening")
    : pixels.converting
      ? t("canvas.converting")
      : null;
  const disabled = !scene;
  return (
    <div className={styles.app} data-minitool-ready={scene ? "" : undefined}>
      <input
        ref={input}
        className={styles.hidden}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            setTab(Tab.Pixel);
            void editor.pixelation.open(file);
          }
        }}
      />
      <div className={styles.actions}>
        <Button className={styles.pill} onClick={() => input.current?.click()}>
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
          disabled={!scene || !pixels.result}
          onClick={() => setSheet(true)}
        >
          <Icon name="export" />
          {t("top.export")}
        </Button>
      </div>
      <div className={styles.card}>
        {scene ? (
          <SplitPreview
            editor={editor}
            scene={scene}
            status={status}
            move={tab !== Tab.Layout}
            rotate={tab === Tab.Compare}
          />
        ) : (
          <div className={cx(styles.stage, styles.empty)}>
            {pixels.loading ? (
              <span className={styles.emptyHint} role="status">
                {t("canvas.opening")}
              </span>
            ) : (
              <>
                <span className={styles.emptyIcon}>
                  <img src={iconUrl} alt="" />
                </span>
                <span className={styles.emptyTitle}>{t("empty.title")}</span>
                <span className={styles.emptyHint}>{t("empty.hint")}</span>
                <span className={styles.emptyActions}>
                  <Button
                    className={cx(styles.pill, styles.primary)}
                    onClick={() => input.current?.click()}
                  >
                    <Icon name="image" />
                    {t("empty.choose")}
                  </Button>
                  <Button
                    className={styles.pill}
                    data-open-example=""
                    onClick={() => void editor.pixelation.openExample()}
                  >
                    {t("empty.example")}
                  </Button>
                </span>
              </>
            )}
          </div>
        )}
        <div className={styles.canvasRow}>
          <Button className={styles.ghost} disabled={!state.canUndo} onClick={editor.undo}>
            <Icon name="undo" />
            {t("canvas.undo")}
          </Button>
          <Button
            className={styles.ghost}
            aria-haspopup="menu"
            aria-expanded={ratioMenu}
            disabled={disabled}
            onClick={() => setRatioMenu(!ratioMenu)}
          >
            <Icon name="ratio" />
            {t("canvas.ratio")} <span className={styles.pix}>{state.layout.ratio}</span>
            <Icon name="down" />
          </Button>
          <Button className={styles.ghost} disabled={disabled} onClick={editor.reset}>
            <Icon name="reset" />
            {t("canvas.reset")}
          </Button>
        </div>
        {ratioMenu && (
          <div className={styles.menu} role="menu">
            {EXPORT_RATIOS.map((ratio) => (
              <Button
                key={ratio}
                role="menuitemradio"
                aria-checked={state.layout.ratio === ratio}
                onClick={() => {
                  setRatioMenu(false);
                  editor.changeLayout({ ratio });
                }}
              >
                <RatioIcon ratio={ratio} />
                <span className={styles.pix}>{ratio}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className={cx(styles.panel, disabled && styles.disabled)} role="tabpanel" data-tab={tab}>
        {tab === Tab.Pixel && <PixelPanel editor={editor} state={state} pixels={pixels} />}
        {tab === Tab.Compare && (
          <ComparePanel editor={editor} state={state} visible={composition?.visible ?? null} />
        )}
        {tab === Tab.Layout && <FramePanel editor={editor} state={state} scene={scene} />}
      </div>
      <div className={styles.tabbar}>
        <div className={styles.tabs} role="tablist">
          {TABS.map(([id, label, icon]) => (
            <Button
              key={id}
              className={styles.tab}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setRatioMenu(false);
              }}
            >
              <Icon name={icon} />
              {t(label)}
            </Button>
          ))}
        </div>
      </div>
      {sheet && scene && (
        <ExportSheet
          editor={editor}
          state={state}
          scene={scene}
          onClose={() => setSheet(false)}
          onOutput={output}
        />
      )}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
