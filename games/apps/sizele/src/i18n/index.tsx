import { readJson, writeJson } from "@travelle/core";
import { LANGUAGES, type Language } from "@sizele/data/client";
import names from "@sizele/data/data/names.json";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STRINGS, type StringKey } from "./strings.ts";

const KEY = "sizele:language:v1";

const NAMES = names as Record<string, Record<Language, string>>;

function detect(): Language {
  const saved = readJson<Language>(KEY);
  if (saved && LANGUAGES.includes(saved)) return saved;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.slice(0, 2).toLowerCase() as Language;
    if (LANGUAGES.includes(base)) return base;
  }
  return "en";
}

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

interface Locale {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
  /** A country's name in the current language. */
  name: (id: string) => string;
}

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [language, setLanguageState] = useState<Language>(detect);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeJson(KEY, next);
  }, []);

  const value = useMemo<Locale>(() => {
    const dict = STRINGS[language];
    return {
      language,
      setLanguage,
      t: (key, vars) => {
        const text = dict[key];
        if (!vars) return text;
        return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
      },
      name: (id) => NAMES[id]?.[language] ?? NAMES[id]?.en ?? id,
    };
  }, [language, setLanguage]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useLocale used outside LocaleProvider");
  return locale;
}
