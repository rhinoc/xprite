import type { ButtonVariantDefinition } from "$/components/button/variants/types";

import styles from "$/components/button/variants/tool/tool.module.css";

export const toolButtonVariant: ButtonVariantDefinition = {
  defaultPart: "toolbutton_normal",
  tool: true,
  className: styles.tool,
  contentSkinClassName: styles.toolSkin,
  contentIconClassName: styles.toolIcon,
  contentLabelClassName: styles.toolLabel,
};
