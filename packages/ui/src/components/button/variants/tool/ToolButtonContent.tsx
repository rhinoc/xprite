import type { ReactNode } from "react";

import { ThemeIcon, ThemePart, type AtlasPartName } from "$/base/theme/theme-part";
import { Text, TextVariant } from "$/components/text";

interface ToolButtonContentProps {
  part: AtlasPartName;
  icon?: AtlasPartName;
  leading?: ReactNode;
  label?: string;
  labelScale: number;
  selectedInk: string;
  iconInk?: string;
  skinClassName?: string;
  iconClassName?: string;
  labelClassName?: string;
}

export function ToolButtonContent({
  part,
  icon,
  leading,
  label,
  labelScale,
  selectedInk,
  iconInk,
  skinClassName,
  iconClassName,
  labelClassName,
}: ToolButtonContentProps) {
  return (
    <>
      <ThemePart part={part} scale={2} drawCenter aria-hidden="true" className={skinClassName} />
      {icon && <ThemeIcon part={icon} scale={2} color={iconInk} className={iconClassName} />}
      {leading}
      {label && (
        <Text
          variant={TextVariant.Inline}
          scale={labelScale}
          ink={selectedInk}
          className={labelClassName}
        >
          {label}
        </Text>
      )}
    </>
  );
}
