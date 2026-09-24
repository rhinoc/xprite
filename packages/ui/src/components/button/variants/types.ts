import type { AtlasPartName } from "$/base/theme/theme-part";

export interface ButtonVariantDefinition {
  defaultPart: AtlasPartName;
  themeArtwork?: boolean;
  flatIcon?: boolean;
  color?: boolean;
  tool?: boolean;
  className?: string;
  contentSkinClassName?: string;
  contentIconClassName?: string;
  contentLabelClassName?: string;
}
