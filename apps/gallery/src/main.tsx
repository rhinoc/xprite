import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { browserIconClipboard } from "$/adapters/icon-clipboard";
import Gallery from "$/Gallery";
import { UIProvider } from "@xprite/ui";
import { CursorProvider } from "@xprite/ui/cursor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CursorProvider>
      <UIProvider>
        <Gallery iconClipboard={browserIconClipboard} />
      </UIProvider>
    </CursorProvider>
  </StrictMode>,
);
