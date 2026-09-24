import { Button, ButtonVariant } from "@xprite/ui";
import type { ButtonProps, SurfaceBounds } from "@xprite/ui";

export function IconControl({
  bounds,
  relativeTo,
  icon,
  label,
  expanded,
  disabled,
  onClick,
}: {
  bounds: SurfaceBounds;
  relativeTo: { x: number; y: number };
  icon: NonNullable<ButtonProps["icon"]>;
  label: string;
  expanded?: boolean;
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
      title={label}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
