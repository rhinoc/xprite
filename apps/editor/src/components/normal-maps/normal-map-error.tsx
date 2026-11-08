import { useEffect, useRef, useState } from "react";

import { Alert } from "$/components/dialogs/alert";
import { tUi } from "$/i18n";
import { createUiPortal } from "@xprite/ui";

export function NormalMapError({ error }: { error: string }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(anchor.current?.closest<HTMLElement>("[data-ui-scene]") ?? document.body);
  }, []);
  useEffect(() => {
    if (!error) setDismissed(null);
  }, [error]);
  return (
    <>
      <span ref={anchor} aria-hidden />
      {error && dismissed !== error && container
        ? createUiPortal(
            <Alert
              open
              title={tUi("normal.preview")}
              messageLines={[error]}
              onOpenChange={(open) => {
                if (!open) setDismissed(error);
              }}
              actions={[{ label: "OK", onClick: () => setDismissed(error) }]}
            />,
            container,
          )
        : null}
    </>
  );
}
