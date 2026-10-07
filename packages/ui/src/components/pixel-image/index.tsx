import { useLayoutEffect, useEffect, useRef, useState, type CSSProperties } from "react";

import {
  observeElementSize,
  snapLocalToPixels,
  type GeometryPoint,
} from "$/base/utils/dom-geometry";
import { pixelImageLayout, PIXEL_IMAGE_DEFAULT_BOX } from "$/components/pixel-image/geometry";

import styles from "$/components/pixel-image/pixel-image.module.css";

export enum PixelImageFit {
  Pixel = "pixel",
  Contain = "contain",
}

export interface PixelImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  initialBox?: { width: number; height: number };
  /** Responsive static-page previews can fit with CSS before hydration. */
  fit?: PixelImageFit;
  checker?: boolean;
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Alpha preview only. Source image bytes remain transparent and unmodified. */
export function PixelImage({
  src,
  alt,
  width,
  height,
  className,
  initialBox = PIXEL_IMAGE_DEFAULT_BOX,
  fit = PixelImageFit.Pixel,
  checker = true,
}: PixelImageProps) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(initialBox);
  useClientLayoutEffect(() => {
    if (fit === PixelImageFit.Contain) return;
    if (host.current) return observeElementSize(host.current, setBox);
  }, [fit]);
  const layout = pixelImageLayout(width, height, box);
  const [origin, setOrigin] = useState<GeometryPoint | null>(null);
  useClientLayoutEffect(() => {
    if (fit === PixelImageFit.Contain) return;
    const element = host.current;
    if (!element) return;
    const update = () => {
      const next = snapLocalToPixels(element, {
        x: Math.max(0, Math.floor((box.width - layout.width) / 2)),
        y: Math.max(0, Math.floor((box.height - layout.height) / 2)),
      });
      setOrigin((previous) => (previous?.x === next.x && previous?.y === next.y ? previous : next));
    };
    update();
    const view = element.ownerDocument.defaultView;
    element.ownerDocument.addEventListener("scroll", update, true);
    view?.addEventListener("resize", update);
    return () => {
      element.ownerDocument.removeEventListener("scroll", update, true);
      view?.removeEventListener("resize", update);
    };
  }, [fit, box.width, box.height, layout.width, layout.height]);
  const variables = {
    ...(origin
      ? { "--pixel-image-left": `${origin.x}px`, "--pixel-image-top": `${origin.y}px` }
      : {}),
    "--pixel-image-width": `${layout.width}px`,
    "--pixel-image-height": `${layout.height}px`,
    "--pixel-image-checker": `${layout.checkerSize}px`,
  } as CSSProperties;
  return (
    <div
      ref={host}
      className={`${styles.root} ${fit === PixelImageFit.Contain ? styles.contain : ""} ${className ?? ""}`.trim()}
      style={variables}
      data-slot="pixel-image"
      data-checker={checker}
    >
      <div className={styles.surface}>
        <img src={src} alt={alt} width={width} height={height} />
      </div>
    </div>
  );
}
