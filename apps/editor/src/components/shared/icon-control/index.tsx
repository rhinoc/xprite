import { Button, ButtonVariant } from "@xprite/ui";
import type { ButtonProps, SurfaceBounds } from "@xprite/ui";

export function IconControl({
  bounds,
  relativeTo,
  icon,
  label,
  expanded,
  selected,
  style,
  disabled,
  onClick,
}: {
  bounds: SurfaceBounds;
  relativeTo: { x: number; y: number };
  icon: NonNullable<ButtonProps["icon"]>;
  label: string;
  expanded?: boolean;
  /** Pressed face while on, for toggles that show state (default: none, like user data). */
  selected?: boolean;
  style?: ButtonProps["style"];
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={ButtonVariant.FlatIcon}
      bounds={bounds}
      relativeTo={relativeTo}
      icon={icon}
      aria-label={label}
      aria-expanded={expanded}
      selected={selected}
      style={style}
      title={label}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
