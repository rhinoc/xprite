import "$/components/palette/palette-toolbar/palette-toolbar.module.css";
import { PaletteActions } from "$/components/palette/palette-actions";
import type { PaletteToolbarModel } from "$/managers/palette/palette-toolbar-model";
import { PaletteMenuOperation as PaletteOperation } from "$/managers/tools/tool-options";
import { Button, Menu } from "@xprite/ui";

export function PaletteToolbar({ model }: { model: PaletteToolbarModel }) {
  return (
    <div className="xse-palette-toolbar">
      <Button
        tintDisabledIcon
        pixelSize={{ width: 15, height: 16 }}
        icon={
          model.paletteEditable ? "timeline_open_padlock_normal" : "timeline_closed_padlock_normal"
        }
        aria-label="Palette edit lock"
        aria-pressed={!model.paletteEditable}
        onClick={() => model.setPaletteEditable((value) => !value)}
      />
      <Menu
        label="Sort and Gradients"
        onExpandedChange={(open) => {
          if (open) model.capturePaletteMenuSelection();
        }}
        renderTrigger={(props) => (
          <Button
            tintDisabledIcon
            {...props}
            pixelSize={{ width: 15, height: 16 }}
            icon="pal_sort"
          />
        )}
        items={[
          {
            label: "Reverse Colors",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Reverse),
          },
          {
            label: "Gradient",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Gradient),
          },
          {
            label: "Gradient by Hue",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.HueGradient),
          },
          {
            label: "Sort by Hue",
            separator: true,
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Hue),
          },
          {
            label: "Sort by Saturation",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Saturation),
          },
          {
            label: "Sort by Brightness",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Brightness),
          },
          {
            label: "Sort by Luminance",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Luminance),
          },
          {
            label: "Sort by Red",
            separator: true,
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Red),
          },
          {
            label: "Sort by Green",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Green),
          },
          {
            label: "Sort by Blue",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Blue),
          },
          {
            label: "Sort by Alpha",
            onSelect: () => model.applyPaletteOperation(PaletteOperation.Alpha),
          },
          {
            label: "Ascending",
            separator: true,
            checked: model.paletteAscending,
            onSelect: () => model.setPaletteAscending(true),
          },
          {
            label: "Descending",
            checked: !model.paletteAscending,
            onSelect: () => model.setPaletteAscending(false),
          },
        ]}
      />
      <PaletteActions />
    </div>
  );
}
