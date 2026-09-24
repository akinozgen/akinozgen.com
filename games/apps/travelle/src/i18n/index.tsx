import { readJson, writeJson } from "@travelle/core";
import { LANGUAGES, type Language } from "@travelle/geo";
import { createContext, Fragment, useCallback, useContext, useMemo, useState } from "react";
import { graph } from "../game/puzzle.ts";
import { STRINGS, type StringKey } from "./strings.ts";

const KEY = "travle:language:v1";

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
  /** A region's name in the current language. */
  name: (regionId: string) => string;
}

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [language, setLanguageState] = useState<Language>(detect);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeJson(KEY, next);
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<Locale>(() => {
    const dict = STRINGS[language];
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
      name: (regionId) => graph.region(regionId).names[language],
    };
  }, [language, setLanguage]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useLocale used outside LocaleProvider");
  return locale;
}

/**
 * A translated string with React nodes dropped into its placeholders, so a
 * sentence can put the country names wherever that language needs them
 * without the markup being rebuilt per language.
 */
export function Trans({
  k,
  values,
}: {
  k: StringKey;
  values: Record<string, React.ReactNode>;
}): React.ReactElement {
  const { t } = useLocale();
  const parts = t(k).split(/(\{\w+\})/);
  return (
    <>
      {parts.map((part, index) => {
        const match = /^\{(\w+)\}$/.exec(part);
        return match ? <Fragment key={index}>{values[match[1]]}</Fragment> : part;
      })}
    </>
  );
}

/** Plural picker for the handful of counted strings. */
export function plural(
  t: Translate,
  n: number,
  one: StringKey,
  many: StringKey,
): string {
  return t(n === 1 ? one : many, { n });
}
