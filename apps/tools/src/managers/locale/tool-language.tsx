import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { PublicLanguage } from "@xprite/growth-content/language";
import { translateToolText } from "@xprite/growth-content/tools";

interface ToolLanguageState {
  language: PublicLanguage;
  setLanguage(language: PublicLanguage): void;
  translate(source: string): string;
}

const ToolLanguageContext = createContext<ToolLanguageState>({
  language: PublicLanguage.English,
  setLanguage: () => {},
  translate: (source) => source,
});

/** Language belongs to the page, so switching it keeps the loaded tool and its settings. */
export function ToolLanguageProvider({
  language: initialLanguage,
  onChange,
  children,
}: {
  language: PublicLanguage;
  onChange?: (language: PublicLanguage) => void;
  children: ReactNode;
}) {
  const [language, updateLanguage] = useState(initialLanguage);
  const setLanguage = useCallback(
    (next: PublicLanguage) => {
      updateLanguage(next);
      onChange?.(next);
    },
    [onChange],
  );
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      translate: (source: string) => translateToolText(source, language),
    }),
    [language, setLanguage],
  );
  return <ToolLanguageContext.Provider value={value}>{children}</ToolLanguageContext.Provider>;
}

export function useToolLanguage() {
  return useContext(ToolLanguageContext);
}

export function useToolTranslation() {
  return useToolLanguage().translate;
}
