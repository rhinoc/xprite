import { Button, ButtonVariant, type ButtonProps } from "@xprite/ui";

// Keep the recording action compact; the active theme aligns its glyph.
const CONTROL_PIXEL_SIZE = { width: 15, height: 15 };

type ReplayStopButtonProps = Pick<ButtonProps, "disabled" | "onClick"> & {
  label: string;
};

export function ReplayStopButton({ label, ...props }: ReplayStopButtonProps) {
  return (
    <Button
      {...props}
      variant={ButtonVariant.Icon}
      icon="ani_stop"
      pixelSize={CONTROL_PIXEL_SIZE}
      insetContent={false}
      aria-label={label}
      title={label}
    />
  );
}
