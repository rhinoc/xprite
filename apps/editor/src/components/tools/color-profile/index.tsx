import { createContext, useContext, type ReactNode } from "react";

import type { EditorColorProfile as AsepriteColorProfile } from "$/managers/tools/color-control";
/** Scene-level working color space. Only paint code consumes this context;
 * document values, channel math, captions, indices and callbacks keep source values.
 * React portals inherit it, including menus and color-picker popups. */
const ColorProfileContext = createContext<AsepriteColorProfile | undefined>(undefined);
export function ColorProfileProvider({
  profile,
  children,
}: {
  profile?: AsepriteColorProfile;
  children: ReactNode;
}) {
  return <ColorProfileContext.Provider value={profile}>{children}</ColorProfileContext.Provider>;
}
export const useColorProfile = () => useContext(ColorProfileContext);
