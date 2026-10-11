import { CheckboxShape } from "$/components/checkbox/types";
import { checkboxVariantStyle } from "$/components/checkbox/variants/checkbox";
import { radioVariantStyle } from "$/components/checkbox/variants/radio";
import type { CheckboxStyle } from "$/components/checkbox/variants/types";

export const checkboxVariants = {
  [CheckboxShape.Square]: checkboxVariantStyle,
  [CheckboxShape.Round]: radioVariantStyle,
} satisfies Record<CheckboxShape, CheckboxStyle>;
