import { PUBLIC_IMAGE_DISPLAY_SCALE } from "$content/site/images";

import styles from "$/components/public/public-image.module.css";

export interface PublicImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  displayWidth?: number;
  animationSrc?: string;
  framed?: boolean;
}

/** Public screenshots share centering, display scale and responsive sizing. */
export function PublicImage({
  src,
  alt,
  width,
  height,
  displayWidth = width,
  animationSrc,
  framed = false,
}: PublicImageProps) {
  const scaledWidth = Math.min(displayWidth, width * PUBLIC_IMAGE_DISPLAY_SCALE);
  return (
    <span className={styles.root} data-framed={framed || undefined}>
      <picture className={styles.picture}>
        {animationSrc && <source media="(prefers-reduced-motion: reduce)" srcSet={src} />}
        <img
          className={styles.image}
          src={animationSrc ?? src}
          alt={alt}
          width={width}
          height={height}
          style={{ width: scaledWidth }}
          loading="lazy"
          decoding="async"
        />
      </picture>
    </span>
  );
}
