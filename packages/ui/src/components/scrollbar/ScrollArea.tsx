import { forwardRef } from "react";

import { DocumentScrollArea } from "$/components/scrollbar/document-scroll-area";
import { ElementScrollArea } from "$/components/scrollbar/element-scroll-area";
import { ScrollAreaTarget, type ScrollAreaProps } from "$/components/scrollbar/scroll-area-types";

/** Local or document scrolling with the active theme's scrollbar chrome. */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  function ScrollArea(props, ref) {
    if (props.target === ScrollAreaTarget.Page) {
      const { target: _target, ...pageProps } = props;
      return <DocumentScrollArea {...pageProps} ref={ref} />;
    }
    const { target: _target, ...elementProps } = props;
    return <ElementScrollArea {...elementProps} ref={ref} />;
  },
);
