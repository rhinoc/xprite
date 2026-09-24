import { ButtonVariant } from "$/components/button/types";
import { colorButtonVariant } from "$/components/button/variants/color";
import { flatIconButtonVariant } from "$/components/button/variants/flat-icon";
import { iconButtonVariant } from "$/components/button/variants/icon";
import { standardButtonVariant } from "$/components/button/variants/standard";
import { toolButtonVariant } from "$/components/button/variants/tool";

export const buttonVariants = {
  [ButtonVariant.Standard]: standardButtonVariant,
  [ButtonVariant.Icon]: iconButtonVariant,
  [ButtonVariant.FlatIcon]: flatIconButtonVariant,
  [ButtonVariant.Color]: colorButtonVariant,
  [ButtonVariant.Tool]: toolButtonVariant,
};
