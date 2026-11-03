import { tUi } from "$/i18n";
import type { ImportAction } from "$/managers/preferences/file-preferences";
import { Button, ControlFlow, FontRole, type ControlPlacement } from "@xprite/ui";

/** Import choice shared by a still image and a sequence of video frames. */
export function ImportMode({
  value,
  disabled,
  onChange,
  ...placement
}: {
  value: ImportAction;
  disabled?: boolean;
  onChange(value: ImportAction): void;
} & ControlPlacement) {
  const options: readonly { value: ImportAction; label: string }[] = [
    { value: "pixelate", label: tUi("import.dialog.pixelate") },
    { value: "import-as-is", label: tUi("import.dialog.import.as.is") },
  ];
  const buttons = options.map((option, index) => {
    const bounds = placement.bounds;
    const half = bounds ? Math.round(bounds.width / 2) : 0;
    return (
      <Button
        key={option.value}
        {...(bounds
          ? {
              bounds: {
                ...bounds,
                x: bounds.x + index * half,
                width: index ? bounds.width - half : half + 1,
              },
              relativeTo: placement.relativeTo,
            }
          : {
              pixelSize: placement.pixelSize
                ? { ...placement.pixelSize, width: placement.pixelSize.width / 2 }
                : undefined,
            })}
        text={option.label}
        aria-label={option.label}
        aria-pressed={value === option.value}
        selected={value === option.value}
        disabled={disabled}
        font={FontRole.Compact}
        part="buttonset_item_normal"
        hotPart="buttonset_item_hot"
        onClick={() => onChange(option.value)}
      />
    );
  });
  return placement.bounds ? (
    <>{buttons}</>
  ) : (
    <ControlFlow style={{ gap: 0, flexWrap: "nowrap" }}>{buttons}</ControlFlow>
  );
}
