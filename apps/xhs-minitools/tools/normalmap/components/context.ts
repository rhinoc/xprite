import { createContext, useContext } from "react";

import type { MiniToolText } from "$/tools/normalmap/managers/text";

export const NormalTextContext = createContext<MiniToolText>((key) => key);
export const useText = () => useContext(NormalTextContext);
