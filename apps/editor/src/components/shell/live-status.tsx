import { useLayoutEffect, useRef } from "react";

import { useWorkspaceLayoutConfiguration } from "$/components/shared/editor-layout-context";
import { ProfileColorPreview } from "$/components/shared/profile-color-preview";
import { tUiSource } from "$/i18n";
import type { CanvasQuickTool } from "$/managers/canvas/canvas-manager";
import { useLiveStatusManager } from "$/managers/shell/live-status-manager";
import { formatEditorColor, type EditorColor } from "$/managers/tools/color-control";
import { Text, TextVariant, useUi } from "@xprite/ui";
import { measureUiText } from "@xprite/ui/assets";
import { UiIcon } from "@xprite/ui/assets";
import type { UiPartName } from "@xprite/ui/assets";
import { UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";
import { UI_SCALE } from "@xprite/ui/canvas";

import styles from "$/components/shell/live-status.module.css";

const TEXT_WIDTH_SHRINK_RATIO = 2;

/** Pointer-frequency updates stay local to the source indicator row. */
export function FunctionalStatusText({
  active,
  quickTool,
  notice = "",
  buttonHoverColor = null,
  buttonHoverDescription,
  relativeTo,
}: {
  active: boolean;
  quickTool: CanvasQuickTool | null;
  notice?: string;
  buttonHoverColor?: EditorColor | null;
  buttonHoverDescription?: string;
  relativeTo: { x: number; y: number };
}) {
  const { style: uiStyle } = useUi();
  const workspaceLayoutConfiguration = useWorkspaceLayoutConfiguration();
  const {
    indicators: sourceIndicators,
    description,
    undoTooltip,
    colorProfile,
    documentName,
  } = useLiveStatusManager({
    active,
    quickTool,
    notice,
    buttonHoverColor,
    buttonHoverDescription,
  });
  const indicators =
    workspaceLayoutConfiguration.chrome.showDocumentNameInStatus || !documentName
      ? sourceIndicators
      : sourceIndicators.flatMap((indicator) => {
          if (!("text" in indicator) || !indicator.text.includes(documentName)) return [indicator];
          const text = indicator.text.replaceAll(documentName, "").replace(/\s+/g, " ").trim();
          return text ? [{ text }] : [];
        });
  const announcement =
    workspaceLayoutConfiguration.chrome.showDocumentNameInStatus || !documentName
      ? description
      : description.replaceAll(documentName, "").replace(/\s+/g, " ").trim();
  const previousTextWidths = useRef<readonly (number | null)[]>([]);
  const textWidths = indicators.map((indicator, index) => {
    if (!("text" in indicator)) return null;
    const measuredWidth = measureUiText(tUiSource(indicator.text));
    const previousWidth = previousTextWidths.current[index];
    // Mirrors .refs/aseprite/src/app/ui/status_bar.cpp's TextIndicator sizing.
    return previousWidth == null || previousWidth > measuredWidth * TEXT_WIDTH_SHRINK_RATIO
      ? measuredWidth
      : Math.max(previousWidth, measuredWidth);
  });
  useLayoutEffect(() => {
    previousTextWidths.current = textWidths;
  }, [textWidths]);
  const contentWidth = indicators.reduce(
    (width, indicator, index) =>
      width +
      ("text" in indicator
        ? (textWidths[index] ?? 0)
        : "color" in indicator
          ? 64
          : indicator.icon === "eyedropper"
            ? 32
            : 16) +
      8,
    0,
  );
  let cursor = 0;
  const artwork = indicators.map((indicator, index) => {
    const x = cursor;
    if ("text" in indicator) {
      const text = tUiSource(indicator.text);
      cursor += (textWidths[index] ?? 0) + 8;
      return (
        <Text
          variant={TextVariant.PositionedPixel}
          key={index}
          text={text}
          x={x}
          y={8}
          color={uiStyle.colors.status_bar_text}
        />
      );
    }
    if ("color" in indicator) {
      cursor += 72;
      return (
        <span key={index} style={{ position: "absolute", left: x, top: 0, width: 64, height: 30 }}>
          <ProfileColorPreview
            value={formatEditorColor(indicator.color)}
            width={64}
            height={30}
            mask={indicator.mask}
            colorProfile={colorProfile}
          />
        </span>
      );
    }
    const iconPart: UiPartName =
      indicator.icon === "eyedropper"
        ? "tool_eyedropper"
        : (("icon_" + indicator.icon) as UiPartName);
    const iconHeight = uiStyle.parts[iconPart]?.height ?? 0;
    const statusSceneHeight = 30 / UI_SCALE;
    const iconY = (Math.trunc(statusSceneHeight / 2) - Math.trunc(iconHeight / 2)) * UI_SCALE;
    cursor += (indicator.icon === "eyedropper" ? 32 : 16) + 8;
    return (
      <UiIcon
        key={index}
        part={iconPart}
        x={x}
        y={iconY}
        scale={2}
        color={indicator.icon === "eyedropper" ? undefined : uiStyle.colors.status_bar_text}
      />
    );
  });
  return (
    <span role="status" aria-live="polite" aria-atomic="true">
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: Math.floor(12 * sx) - Math.floor(relativeTo.x * sx),
          top: -Math.floor(relativeTo.y * sy),
          width: Math.max(2, contentWidth),
          height: 30,
          pointerEvents: "none",
        }}
      >
        {artwork}
      </span>
      <span className="xse-status-announcement">{announcement}</span>
      {undoTooltip && (
        <span
          role="tooltip"
          className={styles.undoTooltip}
          style={{
            background: uiStyle.colors.window_face,
            color: uiStyle.colors.text,
            border: `1px solid ${uiStyle.colors.window_titlebar_text}`,
          }}
        >
          {undoTooltip}
        </span>
      )}
    </span>
  );
}
