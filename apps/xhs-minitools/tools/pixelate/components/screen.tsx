import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { MiniToolOutcome, MiniToolTarget } from "$/shared/bridge/output";
import { composeLayout, EXPORT_RATIOS, ExportFrame } from "$/shared/frames/layout";
import { Button, cx, Segmented } from "$/shared/ui/controls";
import { ExportSheet } from "$/shared/ui/export-sheet";
import { Icon } from "$/shared/ui/icons";
import { PhoneScreen, useToast, type PhoneTab } from "$/shared/ui/phone-screen";
import { useText } from "$/tools/pixelate/components/context";
import {
  ComparePanel,
  FramePanel,
  PixelPanel,
  RatioIcon,
} from "$/tools/pixelate/components/panels";
import { SceneCanvas, SplitPreview } from "$/tools/pixelate/components/preview";
import type { MiniToolEditor } from "$/tools/pixelate/managers/editor";
import type { MiniToolScene } from "$/tools/pixelate/managers/ports";
import { ExportContent } from "$/tools/pixelate/managers/scene";
import { miniToolError, type MiniToolTextKey } from "$/tools/pixelate/managers/text";
import iconUrl from "@xprite/site-assets/favicon-32.png?url";

import ui from "$/shared/ui/ui.module.css";
import styles from "$/tools/pixelate/components/pixelate.module.css";

enum Tab {
  Pixel = "pixel",
  Compare = "compare",
  Layout = "layout",
}

const TABS: readonly (Omit<PhoneTab<Tab>, "label"> & { label: MiniToolTextKey })[] = [
  { id: Tab.Pixel, label: "tab.pixel", icon: "grid" },
  { id: Tab.Compare, label: "tab.compare", icon: "split" },
  { id: Tab.Layout, label: "tab.layout", icon: "layout" },
];
const SHEET_PREVIEW = { width: 300, height: 272 };

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
  const [toast, setToast] = useToast();
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
            name: pixels.name,
            title: state.title,
            labels: { original: t("label.original"), pixels: t("label.pixels") },
          }
        : null,
    [composition, pixels.source, pixels.name, state.shown, state.split, state.title, t],
  );
  useEffect(() => {
    if (pixels.error) setToast(t(miniToolError(pixels.error)));
  }, [pixels.error, t, setToast]);
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
  const frame = state.layout.frame;
  return (
    <PhoneScreen
      ready={!!scene}
      canExport={!!scene && !!pixels.result}
      tabs={TABS.map((item) => ({ ...item, label: t(item.label) }))}
      tab={tab}
      toast={toast}
      onPhoto={(file) => {
        setTab(Tab.Pixel);
        void editor.pixelation.open(file);
      }}
      onExport={() => setSheet(true)}
      onTab={(id) => {
        setTab(id);
        setRatioMenu(false);
      }}
      sheet={
        sheet &&
        scene && (
          <ExportSheet
            preview={
              <SceneCanvas
                scene={{ ...scene, content: state.content }}
                width={SHEET_PREVIEW.width}
                height={SHEET_PREVIEW.height}
                label={t("export.title")}
              />
            }
            meta={[
              `${scene.composition.size.width} × ${scene.composition.size.height}`,
              "PNG",
              t(frame === ExportFrame.MacOS8 ? "frame.mac-os-8-long" : `frame.${frame}`),
            ]}
            note={t("export.note")}
            exporting={state.exporting}
            onClose={() => setSheet(false)}
            onOutput={output}
          >
            <Segmented
              value={state.content}
              label={t("export.title")}
              options={[
                { value: ExportContent.Split, icon: "splitImage", label: t("export.split") },
                { value: ExportContent.Pixels, icon: "pixelImage", label: t("export.pixels") },
              ]}
              onChange={(content) => editor.setContent(content)}
            />
          </ExportSheet>
        )
      }
    >
      {(pickPhoto) => (
        <>
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
                      <Button className={cx(ui.pill, ui.primary)} onClick={pickPhoto}>
                        <Icon name="image" />
                        {t("empty.choose")}
                      </Button>
                      <Button
                        className={ui.pill}
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
                {t("canvas.ratio")} <span className={ui.pix}>{state.layout.ratio}</span>
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
                    <span className={ui.pix}>{ratio}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div
            className={cx(styles.panel, disabled && styles.disabled)}
            role="tabpanel"
            data-tab={tab}
          >
            {tab === Tab.Pixel && <PixelPanel editor={editor} state={state} pixels={pixels} />}
            {tab === Tab.Compare && (
              <ComparePanel editor={editor} state={state} visible={composition?.visible ?? null} />
            )}
            {tab === Tab.Layout && <FramePanel editor={editor} state={state} scene={scene} />}
          </div>
        </>
      )}
    </PhoneScreen>
  );
}
