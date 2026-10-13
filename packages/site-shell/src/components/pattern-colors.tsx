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
import { siteText } from "../site-language";

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
  const text = (
    en: string,
    zh: string,
    ja: string,
    ko: string,
    ru: string,
    pt: string,
    es: string,
  ) => siteText(language, en, zh, ja, ko, ru, pt, es);
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
      title={text(
        "Pattern colors",
        "图案配色",
        "パターンの配色",
        "패턴 색상",
        "Цвета узора",
        "Cores do padrão",
        "Colores del patrón",
      )}
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
          pattern={pattern.id}
          preview
          foreground={validForeground ?? pattern.defaultForeground}
          background={validBackground ?? pattern.defaultBackground}
          className={styles.preview}
          aria-label={text(
            "Pattern preview",
            "图案预览",
            "パターンのプレビュー",
            "패턴 미리 보기",
            "Предпросмотр узора",
            "Pré-visualização do padrão",
            "Vista previa del patrón",
          )}
        />
        <div className={styles.fields}>
          <Field
            label={text(
              "Foreground",
              "前景色",
              "描画色",
              "전경색",
              "Передний план",
              "Primeiro plano",
              "Frontal",
            )}
          >
            <Input
              type="color"
              value={validForeground ?? pattern.defaultForeground!}
              disabled={!pattern.hasForeground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setForeground}
              aria-label={text(
                "Foreground color",
                "前景色颜色选择器",
                "描画色の選択",
                "전경색 선택기",
                "Выбор цвета переднего плана",
                "Seletor da cor de primeiro plano",
                "Selector del color frontal",
              )}
            />
          </Field>
          <Field label={text("Hex", "十六进制", "16進数", "16진수", "Hex", "Hex", "Hex")}>
            <Input
              value={foreground}
              disabled={!pattern.hasForeground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setForeground}
              aria-label={text(
                "Foreground hex",
                "前景色十六进制",
                "描画色の16進数",
                "전경색 16진수",
                "Hex переднего плана",
                "Hex do primeiro plano",
                "Hex del color frontal",
              )}
            />
          </Field>
          <Field label={text("Background", "背景色", "背景色", "배경색", "Фон", "Fundo", "Fondo")}>
            <Input
              type="color"
              value={validBackground ?? pattern.defaultBackground!}
              disabled={!pattern.hasBackground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setBackground}
              aria-label={text(
                "Background color",
                "背景色颜色选择器",
                "背景色の選択",
                "배경색 선택기",
                "Выбор цвета фона",
                "Seletor da cor de fundo",
                "Selector del color de fondo",
              )}
            />
          </Field>
          <Field label={text("Hex", "十六进制", "16進数", "16진수", "Hex", "Hex", "Hex")}>
            <Input
              value={background}
              disabled={!pattern.hasBackground}
              size={HEX_COLOR_CAPACITY}
              onValueChange={setBackground}
              aria-label={text(
                "Background hex",
                "背景色十六进制",
                "背景色の16進数",
                "배경색 16진수",
                "Hex фона",
                "Hex do fundo",
                "Hex del fondo",
              )}
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
            {text(
              "Swap colors",
              "交换颜色",
              "色を入れ替え",
              "색 바꾸기",
              "Поменять цвета",
              "Trocar cores",
              "Intercambiar colores",
            )}
          </Button>
          <Button
            onClick={() => {
              setForeground(pattern.defaultForeground!);
              setBackground(pattern.defaultBackground!);
            }}
            slots={{}}
          >
            {text(
              "Original colors",
              "原始配色",
              "元の配色",
              "원래 색상",
              "Исходные цвета",
              "Cores originais",
              "Colores originales",
            )}
          </Button>
          <Button onClick={onClose} slots={{}}>
            {text("Cancel", "取消", "キャンセル", "취소", "Отмена", "Cancelar", "Cancelar")}
          </Button>
          <Button type="submit" disabled={!validForeground || !validBackground} slots={{}}>
            {text("Apply", "应用", "適用", "적용", "Применить", "Aplicar", "Aplicar")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
