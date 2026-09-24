import { CheckboxVariant } from "$/components/checkbox/types";
import { checkboxVariantStyle } from "$/components/checkbox/variants/checkbox";
import { radioVariantStyle } from "$/components/checkbox/variants/radio";
import type { CheckboxVariantStyle } from "$/components/checkbox/variants/types";

export const checkboxVariants = {
  [CheckboxVariant.Checkbox]: checkboxVariantStyle,
  [CheckboxVariant.Radio]: radioVariantStyle,
} satisfies Record<CheckboxVariant, CheckboxVariantStyle>;
