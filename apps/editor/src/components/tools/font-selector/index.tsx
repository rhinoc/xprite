import { FontOptions } from "$/components/tools/font-selector/font-options";
import { tUiSource } from "$/i18n";
import {
  bitmapTextFontSize,
  normalizeTextFontSize,
  textFontSizeOptions,
  TextFontFamily,
} from "$/managers/tools/text-font";
import {
  Button,
  Combobox,
  ControlFlowItem,
  Input,
  InputTouchActivation,
  Text,
  TextVariant,
  useUi,
  type SurfaceBounds,
} from "@xprite/ui";
import { centerUiPixel, measureUiText } from "@xprite/ui/assets";
import { surfaceLayout } from "@xprite/ui/canvas";

const FONT_FAMILIES = [
  TextFontFamily.Aseprite,
  TextFontFamily.AsepriteMini,
  TextFontFamily.FusionPixel,
  "Arial",
  "Arial Black",
  "Courier New",
  "Georgia",
  "Helvetica",
  "monospace",
  "sans-serif",
  "serif",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
] as const;
export const FONT_FAMILY_OPTIONS = FONT_FAMILIES.map((name) => ({ value: name, label: name }));

export interface FontSelectorProps {
  origin: { x: number; y: number };
  relativeTo?: { x: number; y: number };
  fontName: string;
  fontSize: number;
  antialias: boolean;
  bold: boolean;
  italic: boolean;
  fill: boolean;
  strokeWidth: number;
  onFontChange: (fontName: string) => void;
  onSizeChange: (size: number) => void;
  onAntialiasChange: (antialias: boolean) => void;
  onBoldChange: (bold: boolean) => void;
  onItalicChange: (italic: boolean) => void;
  onFillChange: (fill: boolean) => void;
  onStrokeWidthChange: (strokeWidth: number) => void;
  disabled?: boolean;
}

/** Editable bitmap-text controls backed by the browser font rasterizer. */
export function FontSelector({
  origin,
  relativeTo = { x: 0, y: 0 },
  fontName,
  fontSize,
  antialias,
  bold,
  italic,
  fill,
  strokeWidth,
  onFontChange,
  onSizeChange,
  onAntialiasChange,
  onBoldChange,
  onItalicChange,
  onFillChange,
  onStrokeWidthChange,
  disabled,
}: FontSelectorProps) {
  const face: SurfaceBounds = { ...origin, width: 256, height: 32 };
  return (
    <>
      <ControlFlowItem>
        <Combobox
          editable
          touchActivation={InputTouchActivation.DoubleTap}
          aria-label="Text font family"
          buttonLabel="Text font family options"
          title="Choose an installed font or type a font family name"
          disabled={disabled}
          bounds={face}
          relativeTo={relativeTo}
          value={fontName}
          options={FONT_FAMILY_OPTIONS}
          onValueChange={(value) => onFontChange(value.trim() || "Aseprite")}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <Combobox
          editable
          touchActivation={InputTouchActivation.DoubleTap}
          aria-label="Text font size"
          buttonLabel="Text font size options"
          inputMode="numeric"
          disabled={disabled}
          bounds={{ x: origin.x + 264, y: origin.y, width: 86, height: 32 }}
          relativeTo={relativeTo}
          value={String(fontSize)}
          options={textFontSizeOptions(fontName)}
          onValueChange={(value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) onSizeChange(normalizeTextFontSize(parsed));
          }}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <FontStyleButton
          aria-label="Text bold"
          selected={bold}
          disabled={disabled || !!bitmapTextFontSize(fontName)}
          label="B"
          onClick={() => onBoldChange(!bold)}
          bounds={{ x: origin.x + 358, y: origin.y, width: 28, height: 32 }}
          relativeTo={relativeTo}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <FontStyleButton
          aria-label="Text italic"
          selected={italic}
          disabled={disabled}
          label="I"
          onClick={() => onItalicChange(!italic)}
          bounds={{ x: origin.x + 384, y: origin.y, width: 28, height: 32 }}
          relativeTo={relativeTo}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <FontOptions
          disabled={disabled}
          antialias={antialias}
          onAntialiasChange={onAntialiasChange}
          bounds={{ x: origin.x + 410, y: origin.y, width: 28, height: 32 }}
          relativeTo={relativeTo}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <Button
          aria-label="Text fill"
          aria-pressed={fill}
          selected={fill}
          disabled={disabled}
          icon="tool_filled_rectangle"
          bounds={{ x: origin.x + 446, y: origin.y, width: 30, height: 32 }}
          relativeTo={relativeTo}
          onClick={() => onFillChange(true)}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <Button
          aria-label="Text stroke"
          aria-pressed={!fill}
          selected={!fill}
          disabled={disabled}
          icon="tool_rectangle"
          bounds={{ x: origin.x + 474, y: origin.y, width: 30, height: 32 }}
          relativeTo={relativeTo}
          onClick={() => {
            onFillChange(false);
            if (strokeWidth === 0) onStrokeWidthChange(1);
          }}
        />
      </ControlFlowItem>
      <ControlFlowItem>
        <Input
          touchActivation={InputTouchActivation.DoubleTap}
          aria-label="Text stroke width"
          disabled={disabled}
          type="number"
          min={0}
          max={10}
          step={0.1}
          inputMode="decimal"
          size={4}
          value={String(strokeWidth)}
          suffix="pt"
          bounds={{ x: origin.x + 512, y: origin.y, width: 62, height: 32 }}
          relativeTo={relativeTo}
          onCommit={(value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) onStrokeWidthChange(Math.max(0, Math.min(10, parsed)));
          }}
        />
      </ControlFlowItem>
    </>
  );
}

/** Paint the Aseprite B/I glyph while keeping the button's selected state interactive. */
function FontStyleButton({
  label,
  bounds,
  relativeTo,
  selected,
  onClick,
  disabled,
  ...props
}: {
  label: string;
  bounds: SurfaceBounds;
  relativeTo: { x: number; y: number };
  selected: boolean;
  onClick?: () => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  const { style: uiStyle } = useUi();
  const text = tUiSource(label),
    layout = surfaceLayout(bounds),
    parent = surfaceLayout({ ...relativeTo, width: 1, height: 1 });
  const textX =
    centerUiPixel(bounds.x + 6, bounds.width - 12, measureUiText(text, "mini")) - bounds.x;
  const shadowY = centerUiPixel(bounds.y + 6, bounds.height - 16, 10) - bounds.y;
  return (
    <>
      <Button
        {...props}
        selected={selected}
        disabled={disabled}
        bounds={bounds}
        relativeTo={relativeTo}
        onClick={onClick}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: layout.left - parent.left,
          top: layout.top - parent.top,
          width: layout.width,
          height: layout.height,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <Text
          variant={TextVariant.PositionedPixel}
          text={text}
          x={textX + 2}
          y={shadowY + 2}
          font="mini"
          color={uiStyle.colors.background}
        />
        <Text
          variant={TextVariant.PositionedPixel}
          text={text}
          x={textX}
          y={8}
          font="mini"
          color={disabled ? uiStyle.colors.disabled : uiStyle.colors.text}
        />
      </span>
    </>
  );
}
