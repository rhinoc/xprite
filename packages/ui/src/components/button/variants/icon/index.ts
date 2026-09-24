import type { ButtonVariantDefinition } from "$/components/button/variants/types";

import styles from "$/components/button/variants/icon/icon.module.css";

export const iconButtonVariant: ButtonVariantDefinition = {
  defaultPart: "button_normal",
  themeArtwork: true,
  className: styles.icon,
};
