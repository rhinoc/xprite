import type { ButtonVariantDefinition } from "$/components/button/variants/types";

import styles from "$/components/button/variants/flat-icon/flat-icon.module.css";

export const flatIconButtonVariant: ButtonVariantDefinition = {
  defaultPart: "button_normal",
  themeArtwork: true,
  flatIcon: true,
  className: styles.flatIcon,
};
