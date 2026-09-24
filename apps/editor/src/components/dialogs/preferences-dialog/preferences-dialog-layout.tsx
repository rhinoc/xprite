import { createContext, useContext, type ReactNode } from "react";

import { Checkbox, Label, useUi, type CheckboxProps, type LabelProps } from "@xprite/ui";
import { measureUiText } from "@xprite/ui/assets";

const PreferencesDialogLayoutContext = createContext(false);
const PREFERENCES_CHECKBOX_LABEL_INSET = 32;
const PREFERENCES_WRAPPED_CONTROL_HEIGHT = 32;

export function PreferencesDialogLayoutProvider({
  narrowLayout,
  children,
}: {
  narrowLayout: boolean;
  children: ReactNode;
}) {
  return (
    <PreferencesDialogLayoutContext.Provider value={narrowLayout}>
      {children}
    </PreferencesDialogLayoutContext.Provider>
  );
}

export const usePreferencesDialogNarrowLayout = () => useContext(PreferencesDialogLayoutContext);

export function PreferencesCheckbox(props: CheckboxProps) {
  const narrow = usePreferencesDialogNarrowLayout();
  const { translateSource } = useUi();
  const wrapLabel =
    narrow &&
    !!props.bounds &&
    measureUiText(translateSource(props.label)) >
      props.bounds.width - PREFERENCES_CHECKBOX_LABEL_INSET;
  if (!wrapLabel || !props.bounds) return <Checkbox {...props} />;
  return (
    <Checkbox
      {...props}
      bounds={{
        ...props.bounds,
        height: Math.max(props.bounds.height, PREFERENCES_WRAPPED_CONTROL_HEIGHT),
      }}
      wrapLabel
    />
  );
}

export function PreferencesLabel(props: LabelProps) {
  const narrow = usePreferencesDialogNarrowLayout();
  const { translateSource } = useUi();
  const wrap =
    narrow &&
    !!props.bounds &&
    measureUiText(translateSource(props.text), props.font) > props.bounds.width;
  if (!wrap || !props.bounds) return <Label {...props} />;
  return (
    <Label
      {...props}
      bounds={{
        ...props.bounds,
        height: Math.max(props.bounds.height, PREFERENCES_WRAPPED_CONTROL_HEIGHT),
      }}
      wrap
    />
  );
}
