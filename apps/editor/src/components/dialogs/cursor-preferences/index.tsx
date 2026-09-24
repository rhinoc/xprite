import { Fragment } from "react";

import {
  PreferencesLabel,
  PreferencesCheckbox,
  usePreferencesDialogNarrowLayout,
} from "$/components/dialogs/preferences-dialog/preferences-dialog-layout";
import { EditorColorButton } from "$/components/tools/editor-color-button";
import { tUi } from "$/i18n";
import {
  CURSOR_SCALES,
  CursorScale,
  BrushPreviewMode,
  CursorColorType,
  PaintingCursorType,
  type CursorPreferences,
} from "$/managers/preferences/cursor-preferences";
import { Combobox, Divider, type SurfaceBounds } from "@xprite/ui";

export function CursorPreferencesSection({
  box,
  client,
  value,
  onChange,
  onColorClick,
}: {
  box: (x: number, y: number, width: number, height: number) => SurfaceBounds;
  client: SurfaceBounds;
  value: CursorPreferences;
  onChange?: (patch: Partial<CursorPreferences>) => void;
  onColorClick: (anchor: SurfaceBounds) => void;
}) {
  const narrow = usePreferencesDialogNarrowLayout();
  const previewOptions = [
    { value: BrushPreviewMode.None, label: tUi("ui.cursors.preview.none") },
    { value: BrushPreviewMode.Edges, label: tUi("ui.cursors.preview.edges") },
    { value: BrushPreviewMode.Full, label: tUi("ui.cursors.preview.full") },
    { value: BrushPreviewMode.FullAll, label: tUi("ui.cursors.preview.all") },
    { value: BrushPreviewMode.FullEdges, label: tUi("ui.cursors.preview.full-edges") },
  ];
  const rows = [
    {
      key: "paintingCursorType",
      label: tUi("ui.cursors.crosshair.type"),
      options: [
        { value: PaintingCursorType.Simple, label: tUi("ui.cursors.crosshair.simple") },
        { value: PaintingCursorType.Sprite, label: tUi("ui.cursors.crosshair.sprite") },
        { value: PaintingCursorType.SpriteUnscaled, label: tUi("ui.cursors.crosshair.unscaled") },
      ],
    },
    { key: "brushPreview", label: tUi("ui.cursors.brush.preview"), options: previewOptions },
    { key: "tilePreview", label: tUi("ui.cursors.tile.preview"), options: previewOptions },
    {
      key: "colorType",
      label: tUi("ui.cursors.color.type"),
      options: [
        { value: CursorColorType.Negative, label: tUi("ui.cursors.color.negative") },
        { value: CursorColorType.Specific, label: tUi("ui.cursors.color.specific") },
      ],
    },
  ] as const;
  const rowY = (index: number) => (narrow ? 210 + index * 44 : 185 + index * 20);
  const colorY = narrow ? 390 : 265;
  const snapY =
    value.colorType === CursorColorType.Specific ? colorY + 26 : rowY(3) + (narrow ? 44 : 24);
  const colorBounds = box(narrow ? 358 : 490, colorY, narrow ? 333 : 201, 18);
  return (
    <>
      <PreferencesCheckbox
        bounds={box(358, 120, 333, 17)}
        relativeTo={client}
        label={tUi("ui.cursors.native")}
        checked={value.useNativeCursor}
        disabled={!onChange}
        onCheckedChange={(useNativeCursor) => onChange?.({ useNativeCursor })}
      />
      <PreferencesLabel
        bounds={box(358, 141, narrow ? 333 : 94, 16)}
        relativeTo={client}
        text={tUi("ui.cursors.scale")}
      />
      <Combobox
        bounds={box(narrow ? 358 : 452, narrow ? 161 : 141, narrow ? 333 : 48, 16)}
        relativeTo={client}
        options={CURSOR_SCALES.map((scale) => ({ value: String(scale), label: `${scale * 100}%` }))}
        value={String(value.cursorScale)}
        disabled={!onChange || value.useNativeCursor}
        onValueChange={(scale) => onChange?.({ cursorScale: Number(scale) as CursorScale })}
        aria-label={tUi("ui.cursors.scale")}
      />
      <Divider
        bounds={box(358, narrow ? 193 : 163, 333, 11)}
        relativeTo={client}
        text={tUi("ui.cursors.painting")}
      />
      {rows.map((row, index) => (
        <Fragment key={row.key}>
          <PreferencesLabel
            bounds={box(358, rowY(index), narrow ? 333 : 132, 16)}
            relativeTo={client}
            text={row.label}
          />
          <Combobox
            bounds={box(
              narrow ? 358 : 490,
              rowY(index) + (narrow ? 19 : 0),
              narrow ? 333 : 201,
              16,
            )}
            relativeTo={client}
            options={row.options}
            value={value[row.key]}
            disabled={!onChange}
            onValueChange={(next) => onChange?.({ [row.key]: next } as Partial<CursorPreferences>)}
            aria-label={row.label}
          />
        </Fragment>
      ))}
      {value.colorType === CursorColorType.Specific && (
        <EditorColorButton
          bounds={colorBounds}
          relativeTo={client}
          value={value.color}
          aria-label={tUi("ui.cursors.color.specific")}
          disabled={!onChange}
          onClick={() => onColorClick(colorBounds)}
        />
      )}
      <PreferencesCheckbox
        bounds={box(358, snapY, 333, 17)}
        relativeTo={client}
        label={tUi("ui.cursors.snap")}
        checked={value.snapToGrid}
        disabled={!onChange}
        onCheckedChange={(snapToGrid) => onChange?.({ snapToGrid })}
      />
    </>
  );
}
