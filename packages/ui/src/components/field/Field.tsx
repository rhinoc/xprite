import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "$/base/utils/cn";

import styles from "$/components/field/field.module.css";

export enum FieldLayout {
  Vertical = "vertical",
  Horizontal = "horizontal",
  Inline = "inline",
  Spread = "spread",
}
export interface FieldControlAttributes {
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: HTMLAttributes<HTMLElement>["aria-invalid"];
}
const FieldContext = createContext<FieldControlAttributes>({});
const LABELABLE_CONTROLS = "input:not([type=hidden]),textarea,select,button";
const LABELABLE_TAGS = new Set(["input", "textarea", "select", "button"]);

/** Explicit control IDs in fragments/layout wrappers remain native label targets during SSR. */
function descendantControlId(children: ReactNode): string | undefined {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ id?: string; type?: string; children?: ReactNode }>(child)) continue;
    const nested = descendantControlId(child.props.children);
    if (nested) return nested;
    const nativeControl =
      typeof child.type === "string" &&
      LABELABLE_TAGS.has(child.type) &&
      !(child.type === "input" && child.props.type === "hidden");
    if (child.props.id && (nativeControl || typeof child.type !== "string")) return child.props.id;
  }
  return undefined;
}
export function useFieldControl(attributes: FieldControlAttributes = {}): FieldControlAttributes {
  const field = useContext(FieldContext);
  return {
    id: attributes.id ?? field.id,
    "aria-labelledby": attributes["aria-labelledby"] ?? field["aria-labelledby"],
    "aria-describedby":
      [
        ...new Set(
          [field["aria-describedby"], attributes["aria-describedby"]]
            .filter(Boolean)
            .flatMap((value) => value!.split(" ")),
        ),
      ].join(" ") || undefined,
    "aria-invalid": attributes["aria-invalid"] ?? field["aria-invalid"],
  };
}
export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  layout?: FieldLayout;
  /** Native label target when an opaque child chooses its own ID internally. */
  controlId?: string;
}
/** Associates one control with its visible label, description and validation message. */
export function Field({
  label,
  children,
  description,
  error,
  layout = FieldLayout.Vertical,
  controlId,
  className,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const id = descendantControlId(children) ?? controlId ?? `${generatedId}-control`;
  const labelId = `${generatedId}-label`;
  const descriptionId = `${generatedId}-description`;
  const errorId = `${generatedId}-error`;
  const describedBy =
    [description ? descriptionId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div {...props} className={cn(styles.root, className)} data-slot="field" data-layout={layout}>
      <label
        id={labelId}
        htmlFor={id}
        className={styles.label}
        onClick={(event) => {
          if (event.defaultPrevented || event.currentTarget.control) return;
          // Opaque business components may choose their own ID internally. Their shared control
          // still receives the label through context, without changing that explicit ID.
          const field = event.currentTarget.parentElement;
          const controls = Array.from(
            field?.querySelectorAll<HTMLElement>(LABELABLE_CONTROLS) ?? [],
          );
          const target = controls.find((node) =>
            node.getAttribute("aria-labelledby")?.split(" ").includes(labelId),
          );
          if (target) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        {label}
      </label>
      <div className={styles.content}>
        <FieldContext.Provider
          value={{
            id,
            "aria-labelledby": labelId,
            "aria-describedby": describedBy,
            "aria-invalid": error ? true : undefined,
          }}
        >
          {children}
        </FieldContext.Provider>
        {description && (
          <div id={descriptionId} className={styles.description}>
            {description}
          </div>
        )}
        {error && (
          <div id={errorId} role="status" className={styles.error}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
