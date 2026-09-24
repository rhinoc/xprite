import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { AlertDialog as PrimitiveAlertDialog } from "@xprite/ui";
import type { AlertDialogProps } from "@xprite/ui";

export type { AlertDialogProps } from "@xprite/ui";

/** Supplies the editor's available scene extent to the reusable alert primitive. */
export function Alert(props: AlertDialogProps) {
  const sceneBounds = useSceneBounds();
  return <PrimitiveAlertDialog {...props} sceneBounds={props.sceneBounds ?? sceneBounds} />;
}
