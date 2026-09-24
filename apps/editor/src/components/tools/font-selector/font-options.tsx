import { useId, useState } from "react";

import { tUiSource } from "$/i18n";
import { Button, Checkbox, Divider, Popover, type SurfaceBounds } from "@xprite/ui";

export interface FontOptionsProps {
  bounds: SurfaceBounds;
  relativeTo?: { x: number; y: number };
  antialias: boolean;
  onAntialiasChange: (value: boolean) => void;
  disabled?: boolean;
}

export function FontOptions({
  bounds,
  relativeTo,
  antialias,
  onAntialiasChange,
  disabled,
}: FontOptionsProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <Button
        text="..."
        font="mini"
        aria-label="More Font Options"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        bounds={bounds}
        relativeTo={relativeTo}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div id={id}>
          <Popover
            open
            onOpenChange={setOpen}
            label="More Font Options"
            bounds={{ x: bounds.x, y: bounds.y + bounds.height, width: 240, height: 128 }}
            relativeTo={relativeTo}
            showCloseButton={false}
          >
            {({ clientBounds }) => (
              <>
                <Checkbox
                  label="Antialias"
                  checked={antialias}
                  onCheckedChange={onAntialiasChange}
                  bounds={{
                    x: clientBounds.x,
                    y: clientBounds.y,
                    width: clientBounds.width,
                    height: 30,
                  }}
                  relativeTo={clientBounds}
                />
                <Checkbox
                  label="Hinting"
                  checked={false}
                  onCheckedChange={() => {}}
                  disabled
                  title={tUiSource("The browser does not expose font hinting control")}
                  bounds={{
                    x: clientBounds.x,
                    y: clientBounds.y + 30,
                    width: clientBounds.width,
                    height: 30,
                  }}
                  relativeTo={clientBounds}
                />
                <Divider
                  bounds={{
                    x: clientBounds.x,
                    y: clientBounds.y + 62,
                    width: clientBounds.width,
                    height: 8,
                  }}
                  relativeTo={clientBounds}
                />
                <Checkbox
                  label="Ligatures"
                  checked={false}
                  onCheckedChange={() => {}}
                  disabled
                  title={tUiSource("Ligature shaping is not supported by this text renderer")}
                  bounds={{
                    x: clientBounds.x,
                    y: clientBounds.y + 72,
                    width: clientBounds.width,
                    height: 30,
                  }}
                  relativeTo={clientBounds}
                />
              </>
            )}
          </Popover>
        </div>
      )}
    </>
  );
}
