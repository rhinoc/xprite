import { useEffect, useState, useSyncExternalStore } from "react";

import { MiniToolOutcome, MiniToolTarget } from "$/shared/bridge/output";
import { Button, cx, Segmented } from "$/shared/ui/controls";
import { ExportSheet } from "$/shared/ui/export-sheet";
import { Icon } from "$/shared/ui/icons";
import { PhoneScreen, useToast, type PhoneTab } from "$/shared/ui/phone-screen";
import { loadExample } from "$/tools/normalmap/adapters/example";
import { useText } from "$/tools/normalmap/components/context";
import { LightPanel, NormalPanel } from "$/tools/normalmap/components/panels";
import { PreviewCanvas } from "$/tools/normalmap/components/preview";
import { ExportContent, NormalToolEditor, View } from "$/tools/normalmap/managers/editor";
import { miniToolError, type MiniToolTextKey } from "$/tools/normalmap/managers/text";
import type { PixelBuffer } from "@xprite/editor-core/base";

import ui from "$/shared/ui/ui.module.css";
import styles from "$/tools/normalmap/components/normalmap.module.css";

enum Tab {
  Normal = "normal",
  Light = "light",
}

const TABS: readonly (Omit<PhoneTab<Tab>, "label"> & { label: MiniToolTextKey })[] = [
  { id: Tab.Normal, label: "tab.normal", icon: "grid" },
  { id: Tab.Light, label: "tab.light", icon: "sliders" },
];

function exportPreview(scene: {
  content: ExportContent;
  albedo: PixelBuffer;
  normals: PixelBuffer;
  lit: PixelBuffer;
}) {
  const images =
    scene.content === ExportContent.Trio
      ? [scene.albedo, scene.normals, scene.lit]
      : scene.content === ExportContent.Normal
        ? [scene.normals]
        : [scene.lit];
  const canvases = images.map((pixels) => {
    const element = document.createElement("canvas");
    element.width = pixels.width;
    element.height = pixels.height;
    element
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
    return element;
  });
  const strip = document.createElement("canvas");
  const gap = 6;
  const height = 120;
  const widths = canvases.map((c) => Math.round((c.width * height) / c.height));
  strip.width = widths.reduce((a, b) => a + b, 0) + gap * (canvases.length - 1);
  strip.height = height;
  const context = strip.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  let x = 0;
  canvases.forEach((c, i) => {
    context.drawImage(c, x, 0, widths[i], height);
    x += widths[i] + gap;
  });
  return (
    <img
      src={strip.toDataURL("image/png")}
      alt=""
      style={{ imageRendering: "pixelated", maxWidth: "100%", borderRadius: 8 }}
    />
  );
}

/** The normal-map tool laid out for a phone inside Xiaohongshu. */
export function MiniToolScreen({ editor }: { editor: NormalToolEditor }) {
  const t = useText();
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const [tab, setTab] = useState(Tab.Normal);
  const [sheet, setSheet] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast] = useToast();

  useEffect(() => {
    if (state.error) setToast(t(miniToolError(state.error)));
  }, [state.error, t, setToast]);

  const scene = editor.scene;
  const status = state.opening
    ? t("canvas.opening")
    : state.working && !state.ready
      ? t("canvas.working")
      : null;

  const output = (target: MiniToolTarget) => {
    void editor.output(target).then(
      (outcome) => {
        if (outcome === MiniToolOutcome.Downloaded) setToast(t("toast.downloaded"));
        else if (outcome === MiniToolOutcome.Done && target === MiniToolTarget.Album)
          setToast(t("toast.saved"));
      },
      (reason: unknown) =>
        setToast(t(miniToolError(reason instanceof Error ? reason.message : String(reason)))),
    );
  };

  const disabled = !scene;

  return (
    <PhoneScreen
      ready={!!scene}
      canExport={!!scene && state.ready}
      tabs={TABS.map((item) => ({ ...item, label: t(item.label) }))}
      tab={tab}
      toast={toast}
      onPhoto={(file) => void editor.open(file)}
      onExport={() => setSheet(true)}
      onTab={(id) => setTab(id)}
      sheet={
        sheet &&
        scene && (
          <ExportSheet
            preview={exportPreview(scene)}
            meta={[`${scene.cell.width} × ${scene.cell.height}`, "PNG"]}
            note={t("export.note")}
            exporting={state.exporting}
            onClose={() => setSheet(false)}
            onOutput={output}
          >
            <Segmented
              value={state.content}
              label={t("export.content")}
              options={[
                { value: ExportContent.Lit, icon: "pixelImage", label: t("export.lit") },
                { value: ExportContent.Normal, icon: "grid", label: t("export.normal") },
                { value: ExportContent.Trio, icon: "splitImage", label: t("export.trio") },
              ]}
              onChange={editor.setContent}
            />
          </ExportSheet>
        )
      }
    >
      {(pickPhoto) => (
        <>
          <div className={styles.card}>
            {scene ? (
              <PreviewCanvas editor={editor} state={state} status={status} />
            ) : (
              <div className={cx(styles.stage, styles.empty)}>
                {state.opening ? (
                  <span className={styles.emptyHint} role="status">
                    {t("canvas.opening")}
                  </span>
                ) : (
                  <>
                    <span className={styles.emptyTitle}>{t("empty.title")}</span>
                    <span className={styles.emptyHint}>{t("empty.hint")}</span>
                    <span className={styles.emptyActions}>
                      <Button className={cx(ui.pill, ui.primary)} onClick={pickPhoto}>
                        <Icon name="image" />
                        {t("empty.choose")}
                      </Button>
                      <Button
                        className={ui.pill}
                        onClick={() => void editor.openExample(loadExample)}
                      >
                        {t("empty.example")}
                      </Button>
                    </span>
                  </>
                )}
              </div>
            )}
            {scene && (
              <div className={styles.viewRow}>
                <Segmented
                  value={state.view}
                  label={t("canvas.preview")}
                  options={[
                    { value: View.Albedo, label: t("view.albedo") },
                    { value: View.Normal, label: t("view.normal") },
                    { value: View.Lit, label: t("view.lit") },
                  ]}
                  onChange={editor.setView}
                />
                <span className={styles.viewActions}>
                  <Button
                    className={styles.ghost}
                    disabled={!state.canUndo}
                    onClick={editor.undo}
                    aria-label={t("canvas.undo")}
                  >
                    <Icon name="undo" />
                  </Button>
                  <Button
                    className={styles.ghost}
                    disabled={!state.canRedo}
                    onClick={editor.redo}
                    aria-label={t("canvas.redo")}
                  >
                    <Icon name="redo" />
                  </Button>
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.panelToggle}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Icon name={collapsed ? "up" : "down"} />
          </button>
          <div
            className={cx(styles.panel, disabled && styles.disabled, collapsed && styles.collapsed)}
            role="tabpanel"
            data-tab={tab}
          >
            {tab === Tab.Normal && <NormalPanel editor={editor} state={state} />}
            {tab === Tab.Light && <LightPanel editor={editor} state={state} />}
          </div>
        </>
      )}
    </PhoneScreen>
  );
}
