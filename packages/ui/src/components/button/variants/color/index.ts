import type { ButtonVariantDefinition } from "$/components/button/variants/types";

import styles from "$/components/button/variants/color/color.module.css";

export const colorButtonVariant: ButtonVariantDefinition = {
  defaultPart: "button_normal",
  color: true,
  className: styles.color,
};
