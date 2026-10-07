import { useState } from "react";
import { createRoot } from "react-dom/client";

import { Button, Checkbox, UIProvider, CanvasScaleProvider } from "@xprite/ui";
import { preloadUiAssets } from "@xprite/ui/assets";
import { provideDomGeometry } from "@xprite/ui/utils";

export async function mountSharedControls(
  container: HTMLElement,
  geometry: { flush(): Promise<unknown>; provider: Parameters<typeof provideDomGeometry>[1] },
) {
  provideDomGeometry(container.ownerDocument, geometry.provider);
  (window as unknown as { __xpriteNativeLayout: () => Promise<unknown> }).__xpriteNativeLayout =
    () => geometry.flush();
  await preloadUiAssets("dark", "zh-CN");
  function Controls() {
    const [checked, setChecked] = useState(true);
    const [count, setCount] = useState(0);
    return (
      <UIProvider appearance="dark" language="zh-CN">
        <CanvasScaleProvider scale={1}>
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: 12,
              flexDirection: "column",
              background: "#202125",
            }}
          >
            <Button text={`确定 ${count}`} onClick={() => setCount((value) => value + 1)} />
            <Button text="取消" />
            <Checkbox label="像素对齐" checked={checked} onCheckedChange={setChecked} />
          </div>
        </CanvasScaleProvider>
      </UIProvider>
    );
  }
  const root = createRoot(container);
  root.render(<Controls />);
  return { unmount: () => root.unmount() };
}
