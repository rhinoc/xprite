import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import type { ColorSamplingPoint } from "$/managers/ports/color-sampling";
import { convertPixelsBetweenProfiles, rgbaToHex, type Rgba } from "@xprite/editor-core";
import type { AsepriteColorProfile } from "@xprite/editor-core/import-export";

export interface SampledColor {
  color: Rgba;
  profile?: AsepriteColorProfile;
  paletteIndex?: number;
}

type ColorReader = (point: ColorSamplingPoint, hit: Element) => SampledColor | null;

function createColorSources() {
  const readers = new Map<Element, ColorReader>();
  return {
    register(element: Element, read: ColorReader) {
      readers.set(element, read);
      return () => {
        readers.delete(element);
      };
    },
    sample(point: ColorSamplingPoint, hit: Element | null): SampledColor | null {
      if (!hit) return null;
      for (let element: Element | null = hit; element; element = element.parentElement) {
        const read = readers.get(element);
        if (read) return read(point, hit);
      }
      return null;
    },
  };
}

const ColorSourcesContext = createContext<ReturnType<typeof createColorSources> | null>(null);

export function ColorSourcesProvider({ children }: { children: ReactNode }) {
  const [sources] = useState(createColorSources);
  return <ColorSourcesContext.Provider value={sources}>{children}</ColorSourcesContext.Provider>;
}

export function useColorSources() {
  return useContext(ColorSourcesContext);
}

/** Register a semantic color source without sampling its rendered checkerboard or text. */
export function useColorSource<T extends HTMLElement>(ref: RefObject<T | null>, read: ColorReader) {
  const sources = useColorSources();
  const latest = useRef(read);
  latest.current = read;
  // Controls can mount/unmount as a dock resizes; inspect the committed ref on every render.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!sources || !element) return;
    return sources.register(element, (point, hit) => latest.current(point, hit));
  });
}

export function sampledColorInProfile(
  sample: SampledColor,
  profile?: AsepriteColorProfile,
): string {
  const converted = convertPixelsBetweenProfiles(
    { width: 1, height: 1, data: new Uint8ClampedArray(sample.color) },
    sample.profile,
    profile,
  );
  return rgbaToHex(Array.from(converted.data));
}
