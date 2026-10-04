import { readJson, writeJson } from "@travelle/core";
import { UI_LANGUAGES as LANGUAGES, type UiLanguage as Language } from "@babelle/data/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { language as lang } from "../game/data.ts";
import { STRINGS, type StringKey } from "./strings.ts";

const KEY = "babelle:language:v1";

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
  /** A language's name in the current interface language. */
  name: (id: string) => string;
  /** A number written the way the current language writes it. */
  number: (n: number) => string;
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
    const format = new Intl.NumberFormat(language);
    return {
      language,
      setLanguage,
      t: (key, vars) => {
        const text = dict[key];
        if (!vars) return text;
        return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
          name in vars ? String(vars[name]) : whole,
        );
      },
      name: (id) => lang(id).names[language],
      number: (n) => format.format(n),
    };
  }, [language, setLanguage]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useLocale used outside LocaleProvider");
  return locale;
}
