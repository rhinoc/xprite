import { useState } from "react";

import {
  Button,
  Dialog,
  Field,
  Input,
  OverlayContentLayout,
  Pattern,
  normalizePatternColor,
  type PatternDefinition,
} from "@xprite/ui";

import type { DesktopManager } from "../managers/desktop";

import styles from "./pattern-colors.module.css";

const COLOR_DIALOG_BOUNDS = { x: 0, y: 0, width: 440, height: 370 };
const COLOR_DIALOG_MINIMUM = { width: 300, height: 300 };
const HEX_COLOR_CAPACITY = 7;

/** Local draft and preview; Apply persists the pair, Cancel leaves the desktop unchanged. */
export function PatternColors({
  manager,
  pattern,
  language,
  onClose,
}: {
  manager: DesktopManager;
  pattern: PatternDefinition;
  language: string;
  onClose: () => void;
}) {
  const preferences = manager.getSnapshot();
  const [foreground, setForeground] = useState(
    preferences.patternForeground ?? pattern.defaultForeground!,
  );
  const [background, setBackground] = useState(
    preferences.patternBackground ?? pattern.defaultBackground!,
  );
  const validForeground = normalizePatternColor(foreground);
  const validBackground = normalizePatternColor(background);
  const chinese = language.startsWith("zh");
  const text = (en: string, zh: string) => (chinese ? zh : en);
  const apply = () => {
    if (validForeground && validBackground) {
      manager.setPatternColors(validForeground, validBackground);
      onClose();
    }
  };
  return (
    <Dialog
      portal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={text("Pattern colors", "图案配色")}
      defaultBounds={COLOR_DIALOG_BOUNDS}
      minSize={COLOR_DIALOG_MINIMUM}
      centerOnOpen
      constrainToViewport
      resizable={false}
      contentLayout={OverlayContentLayout.Flow}
    >
      <form
        className={styles.content}
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <Pattern
          variant={pattern.id}
          preview
          foreground={validForeground ?? pattern.defaultForeground}
          background={validBackground ?? pattern.defaultBackground}
          className={styles.preview}
          aria-label={text("Pattern preview", "图案预览")}
        />
        <div className={styles.fields}>
          <Field label={text("Foreground", "前景色")}>
            <Input
              type="color"
              value={validForeground ?? pattern.defaultForeground!}
              disabled={!pattern.hasForeground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setForeground}
              aria-label={text("Foreground color", "前景色颜色选择器")}
            />
          </Field>
          <Field label={text("Hex", "十六进制")}>
            <Input
              value={foreground}
              disabled={!pattern.hasForeground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setForeground}
              aria-label={text("Foreground hex", "前景色十六进制")}
            />
          </Field>
          <Field label={text("Background", "背景色")}>
            <Input
              type="color"
              value={validBackground ?? pattern.defaultBackground!}
              disabled={!pattern.hasBackground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setBackground}
              aria-label={text("Background color", "背景色颜色选择器")}
            />
          </Field>
          <Field label={text("Hex", "十六进制")}>
            <Input
              value={background}
              disabled={!pattern.hasBackground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setBackground}
              aria-label={text("Background hex", "背景色十六进制")}
            />
          </Field>
        </div>
        <div className={styles.actions}>
          <Button
            disabled={!pattern.hasForeground || !pattern.hasBackground}
            onClick={() => {
              setForeground(background);
              setBackground(foreground);
            }}
            slots={{}}
          >
            {text("Swap colors", "交换颜色")}
          </Button>
          <Button
            onClick={() => {
              setForeground(pattern.defaultForeground!);
              setBackground(pattern.defaultBackground!);
            }}
            slots={{}}
          >
            {text("Original colors", "原始配色")}
          </Button>
          <Button onClick={onClose} slots={{}}>
            {text("Cancel", "取消")}
          </Button>
          <Button type="submit" disabled={!validForeground || !validBackground} slots={{}}>
            {text("Apply", "应用")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
