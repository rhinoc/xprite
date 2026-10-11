import { FormDialog } from "$/components/dialogs/form-dialog";
import { tUi } from "$/i18n";
import {
  PaletteGenerationMode,
  PaletteGenerationAlgorithm,
  paletteSizeValue,
  type PaletteGenerationDraft,
} from "$/managers/palette/palette-actions-model";
import { Checkbox, CheckboxMode, Input, Combobox, Text, TextVariant, Divider } from "@xprite/ui";
import { measureUiText } from "@xprite/ui/assets";

interface Props {
  open: boolean;
  value: PaletteGenerationDraft;
  onChange(value: PaletteGenerationDraft): void;
  onOpenChange(open: boolean): void;
  paletteCount: number;
  selectedCount: number;
  onGenerate(): void;
}
const ROW_HEIGHT = 28;
const INPUT_WIDTH = 90;
const FIELD_HEIGHT = 30;
export function PaletteGenerationDialog({
  open,
  value,
  onChange,
  onOpenChange,
  paletteCount,
  selectedCount,
  onGenerate,
}: Props) {
  const update = (patch: Partial<PaletteGenerationDraft>) => onChange({ ...value, ...patch });
  const choices = [
    { target: PaletteGenerationMode.New, label: tUi("ui.palette.generate.new"), disabled: false },
    {
      target: PaletteGenerationMode.Current,
      label: tUi("ui.palette.generate.current", { count: paletteCount }),
      disabled: false,
    },
    {
      target: PaletteGenerationMode.Selected,
      label: tUi("ui.palette.generate.selected", { count: selectedCount }),
      disabled: selectedCount < 2,
    },
  ];
  const rowWidth = Math.max(...choices.map((choice) => measureUiText(choice.label) + 32));
  const width = Math.max(420, rowWidth + INPUT_WIDTH + 32);
  const extra = value.advanced ? 40 : 0;
  const height = 280 + extra;
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Palette from Sprite"
      fields={[]}
      selectInitialInput
      width={width}
      layout={{
        height,
        fields: {},
        actions: {
          OK: { x: width - 268, y: 186 + extra, width: 120, height: 36 },
          Cancel: { x: width - 140, y: 186 + extra, width: 120, height: 36 },
        },
      }}
      actions={[
        {
          label: "OK",
          disabled:
            paletteSizeValue(value.expression) === null ||
            (value.target === PaletteGenerationMode.Selected && selectedCount < 2),
          onClick: onGenerate,
        },
        { label: "Cancel", onClick: () => onOpenChange(false) },
      ]}
      content={(client) => (
        <>
          <div role="radiogroup" aria-label={tUi("ui.palette.generate.destination")}>
            {choices.map((choice, index) => (
              <Checkbox
                key={choice.target}
                label={choice.label}
                mode={CheckboxMode.Radio}
                checked={value.target === choice.target}
                disabled={choice.disabled}
                tabIndex={value.target === choice.target ? 0 : -1}
                bounds={{
                  x: client.x,
                  y: client.y + index * ROW_HEIGHT,
                  width: rowWidth,
                  height: ROW_HEIGHT,
                }}
                relativeTo={client}
                onCheckedChange={() => update({ target: choice.target })}
                onKeyDown={(event) => {
                  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key))
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  const direction = event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1;
                  let next = index;
                  do {
                    next = (next + direction + choices.length) % choices.length;
                  } while (choices[next]!.disabled);
                  update({ target: choices[next]!.target });
                  event.currentTarget
                    .closest('[role="radiogroup"]')
                    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                    [next]?.focus();
                }}
              />
            ))}
          </div>
          <Input
            aria-label={tUi("ui.palette.number.of.colors")}
            value={value.expression}
            onValueChange={(expression) => update({ expression })}
            bounds={{
              x: client.x + rowWidth + 8,
              y: client.y,
              width: INPUT_WIDTH,
              height: FIELD_HEIGHT,
            }}
            relativeTo={client}
          />
          <Divider
            bounds={{ x: client.x, y: client.y + 88, width: client.width, height: 12 }}
            relativeTo={client}
          />
          <Checkbox
            label={tUi("ui.palette.generate.alpha")}
            checked={value.alpha}
            onCheckedChange={(alpha) => update({ alpha })}
            bounds={{ x: client.x, y: client.y + 106, width: client.width, height: ROW_HEIGHT }}
            relativeTo={client}
          />
          <Checkbox
            label={tUi("ui.advanced.options")}
            checked={value.advanced}
            onCheckedChange={(advanced) => update({ advanced })}
            bounds={{ x: client.x, y: client.y + 134, width: client.width, height: ROW_HEIGHT }}
            relativeTo={client}
          />
          {value.advanced && (
            <>
              <Text
                variant={TextVariant.Control}
                text={tUi("ui.palette.generate.algorithm")}
                bounds={{ x: client.x, y: client.y + 168, width: 110, height: FIELD_HEIGHT }}
                relativeTo={client}
              />
              <Combobox
                aria-label={tUi("ui.palette.generate.algorithm")}
                value={value.algorithm}
                onValueChange={(algorithm) =>
                  update({ algorithm: algorithm as PaletteGenerationDraft["algorithm"] })
                }
                options={[
                  {
                    value: PaletteGenerationAlgorithm.Default,
                    label: tUi("ui.palette.generate.algorithm.default"),
                  },
                  {
                    value: PaletteGenerationAlgorithm.Rgb5a3,
                    label: tUi("ui.palette.generate.algorithm.rgb5a3"),
                  },
                  {
                    value: PaletteGenerationAlgorithm.Octree,
                    label: tUi("ui.palette.generate.algorithm.octree"),
                  },
                ]}
                bounds={{
                  x: client.x + 118,
                  y: client.y + 164,
                  width: client.width - 118,
                  height: FIELD_HEIGHT,
                }}
                relativeTo={client}
              />
            </>
          )}
          <Divider
            bounds={{ x: client.x, y: client.y + 166 + extra, width: client.width, height: 12 }}
            relativeTo={client}
          />
        </>
      )}
    />
  );
}
