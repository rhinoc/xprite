import type { DocumentContentsManager } from "$/managers/public/document-contents-manager";
import {
  clientRect,
  clientToLocal,
  layoutSize,
  observeResize,
  scrollPosition,
  scrollSize,
} from "@xprite/ui/utils";

export const DOCUMENT_SECTION_INSET = 16;
const POSITION_TOLERANCE = 1;

/** Track headings in the reading viewport, including image and layout changes. */
export function observeDocumentContents(
  host: HTMLElement,
  viewport: HTMLElement,
  manager: DocumentContentsManager,
) {
  const sections = manager.hrefs.flatMap((href) => {
    let id: string;
    try {
      id = decodeURIComponent(new URL(href, location.href).hash.slice(1));
    } catch {
      return [];
    }
    const heading = document.getElementById(id);
    return heading && host.contains(heading) ? [{ href, heading }] : [];
  });
  if (!sections.length) return () => {};
  let frame: number | undefined;
  const update = () => {
    frame = undefined;
    const size = layoutSize(viewport);
    if (size.height <= 0) return;
    let active = sections[0];
    for (const section of sections) {
      const rect = clientRect(section.heading);
      const point = clientToLocal(viewport, { x: rect.left, y: rect.top });
      if (point.y > DOCUMENT_SECTION_INSET + POSITION_TOLERANCE) break;
      active = section;
    }
    const maximum = scrollSize(viewport).height - size.height;
    if (maximum > POSITION_TOLERANCE && maximum - scrollPosition(viewport).y <= POSITION_TOLERANCE)
      active = sections[sections.length - 1];
    manager.setActiveHref(active.href);
  };
  const schedule = () => {
    if (frame === undefined) frame = requestAnimationFrame(update);
  };
  viewport.addEventListener("scroll", schedule, { passive: true });
  host.addEventListener("load", schedule, true);
  const stopResize = observeResize([viewport, host], schedule);
  schedule();
  return () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    viewport.removeEventListener("scroll", schedule);
    host.removeEventListener("load", schedule, true);
    stopResize();
  };
}
